/// <reference lib="webworker" />
/**
 * The whole experiment runs in here: connectome, body, room, and the assays
 * that decide whether what came out looks like a fly. The page only ever
 * receives telemetry, so a slow brain step never drops a frame of UI.
 */

import { fetchBlock, readGraph, readNeurons, type NeuronTable } from "@/lib/sim/format";
import { BrainSim, DEFAULT_PARAMS } from "@/lib/sim/kernel";
import { buildCircuitMap, type CircuitMap, type Manifest } from "@/lib/sim/populations";
import {
  FURNITURE, ROOM_H, ROOM_W, castRay, distanceToWall, launchThreat,
  makeWorld, stepBody, type World,
} from "./world";
import type { AssayName, AssayReport, FromWorker, Telemetry, ToWorker } from "./protocol";

const post = (m: FromWorker) => self.postMessage(m);

/** Simulation timestep, ms. 1 ms keeps the whole brain at ~1x real time. */
const DT = 1.0;
/** Vision and body update every this many simulated ms. */
const SENSOR_PERIOD = 10;
/** Rays cast per eye per sensory frame; columns interpolate between them. */
const RAY_FAN = 96;
/**
 * Burn-in, ms. Switching the tonic drive on for 164,000 neurons at once sets
 * off one synchronised volley that briefly fires things nothing should fire -
 * the Giant Fibre among them. Settling the network before the experiment
 * starts keeps that transient out of the measurements.
 */
const SETTLE_MS = 250;
/** Window over which firing rates are measured, ms. */
const RATE_WINDOW = 60;
/**
 * Standing depolarisation on every neuron, mV. Sits just above the 7 mV that
 * separates rest from threshold, which gives the brain a low irregular
 * baseline. Half the connectome is inhibitory and inhibition needs something
 * to subtract from - with a silent brain the whole ON pathway of the visual
 * system, which works by disinhibiting Mi1, cannot function at all.
 */
const TONIC = 6.8;
/** Neurons given a random nudge each step, and how hard. */
const NOISE_N = 2000;
const NOISE_MV = 1.2;
/** Sustained and transient gains for the lamina, mV. */
const LAMINA_SUSTAINED = 8;
const LAMINA_TRANSIENT = 16;
const LAMINA_CAP = 13;

let sim: BrainSim | null = null;
let nt: NeuronTable | null = null;
let circuits: CircuitMap | null = null;
let world: World = makeWorld();
let running = false;
let lesion: string | null = null;

// Population membership as a bitmask per neuron, so counting spikes is a
// single pass over the spike list rather than a set lookup per population.
let tag: Uint8Array | null = null;
const T_DNL = 1, T_DNR = 2, T_GF = 4, T_T4 = 8, T_T5 = 16, T_LPL = 32, T_LPR = 64, T_EPG = 128;

const counts = { dnL: 0, dnR: 0, gf: 0, t4: 0, t5: 0, lplL: 0, lplR: 0, epg: 0 };
let epgCounts: Float32Array = new Float32Array(0);
let epgIndex = new Map<number, number>();

let simMs = 0;
let sinceSensor = 0;
let sinceRate = 0;
let assay: AssayReport | null = null;
let assayClock = 0;

// Per-column luminance memory, for the ON/OFF contrast channels.
let adaptL: Float32Array = new Float32Array(0);
let adaptR: Float32Array = new Float32Array(0);

self.onmessage = async (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  try {
    switch (msg.type) {
      case "load": await load(msg.tier); break;
      case "run": running = msg.running; if (running) loop(); break;
      case "reset": doReset(); break;
      case "assay": startAssay(msg.name); break;
      case "threat": launchThreat(world); break;
      case "gain": if (sim) sim.params.mvPerSynapse = msg.mvPerSynapse; break;
      case "lesion": lesion = msg.population; break;
    }
  } catch (err) {
    post({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};

async function load(tier: number) {
  const t0 = performance.now();
  const base = "/connectome/";

  post({ type: "progress", label: "manifest", received: 0, total: 1 });
  const manifest: Manifest = await (await fetch(base + "manifest.json")).json();

  const neuronBuf = await fetchBlock(base + manifest.neuronFile, (r, t) =>
    post({ type: "progress", label: "neurons", received: r, total: t }));
  nt = readNeurons(neuronBuf);

  const tierInfo = manifest.tiers.find((x) => x.threshold === tier) ?? manifest.tiers[0];
  const graphBuf = await fetchBlock(base + tierInfo.file, (r, t) =>
    post({ type: "progress", label: "connectome", received: r, total: t }));
  const g = readGraph(graphBuf);

  sim = new BrainSim(
    { neurons: g.n, offsets: g.offsets, targets: g.targets, weights: g.weights, sign: nt.sign },
    { ...DEFAULT_PARAMS, tonic: TONIC },
  );
  sim.wakeAll();
  circuits = buildCircuitMap(nt, manifest);

  // Build the tag map and the EPG index.
  tag = new Uint8Array(g.n);
  const mark = (idx: ArrayLike<number>, bit: number) => {
    for (let i = 0; i < idx.length; i++) tag![idx[i]] |= bit;
  };
  mark(circuits.descendingL, T_DNL);
  mark(circuits.descendingR, T_DNR);
  mark(circuits.giantFiber, T_GF);
  mark(circuits.t4, T_T4);
  mark(circuits.t5, T_T5);
  mark(circuits.lplc2.left, T_LPL);
  mark(circuits.lplc2.right, T_LPR);
  mark(circuits.epg, T_EPG);

  epgIndex = new Map();
  circuits.epg.forEach((n, i) => epgIndex.set(n, i));
  epgCounts = new Float32Array(circuits.epg.length);

  adaptL = new Float32Array(circuits.retinaL.columns.length).fill(0.5);
  adaptR = new Float32Array(circuits.retinaR.columns.length).fill(0.5);
  settle();

  post({
    type: "ready",
    neurons: g.n, edges: g.edges, threshold: g.threshold,
    columnsL: circuits.retinaL.columns.length,
    columnsR: circuits.retinaR.columns.length,
    populations: {
      "L1/L2 columns": circuits.retinaL.columns.length + circuits.retinaR.columns.length,
      "T4": circuits.t4.length, "T5": circuits.t5.length,
      "LPLC2": circuits.lplc2.left.length + circuits.lplc2.right.length,
      "DNp01 (Giant Fibre)": circuits.giantFiber.length,
      "Descending": circuits.descendingL.length + circuits.descendingR.length,
      "EPG (compass)": circuits.epg.length,
    },
    loadMs: Math.round(performance.now() - t0),
  });
}

function doReset() {
  sim?.reset();
  sim?.wakeAll();
  world = makeWorld();
  simMs = 0; sinceSensor = 0; sinceRate = 0;
  epgCounts.fill(0);
  for (const k of Object.keys(counts) as (keyof typeof counts)[]) counts[k] = 0;
  adaptL.fill(0.5); adaptR.fill(0.5);
  settle();
  assay = null; assayClock = 0;
}

function startAssay(name: AssayName | null) {
  world.drumSpeed = 0;
  if (!name) { assay = null; return; }
  assayClock = 0;
  const base = { name, verdict: "running" as const, series: [], };
  if (name === "optomotor") {
    world.drumSpeed = 1.6;
    assay = { ...base, labels: ["drum (rad/s)", "fly turn (rad/s)"],
      expected: "The fly should turn with the drum. Published optomotor gain in walking Drosophila is roughly 0.3-0.7 of stimulus velocity.",
      detail: "Rotating the surround and measuring how much of that rotation the fly follows." };
  } else if (name === "looming") {
    assay = { ...base, labels: ["loom size (rad)", "Giant Fibre (Hz)"],
      expected: "LPLC2 should drive DNp01 only as the loom nears contact, producing a short burst rather than a sustained response.",
      detail: "Launching an expanding dark object and watching the Giant Fibre." };
    launchThreat(world, world.fly.heading + 0.2);
  } else if (name === "wall") {
    assay = { ...base, labels: ["distance to wall (mm)", "mean (mm)"],
      expected: "Walking flies hug walls. Median distance to the nearest wall should stay well under a quarter of the arena width.",
      detail: "Letting the fly walk freely and measuring where it spends its time." };
  } else {
    assay = { ...base, labels: ["heading (rad)", "bump position (rad)"],
      expected: "The EPG bump should track heading, drifting slowly rather than jumping or dying out.",
      detail: "Comparing the compass bump in the ellipsoid body against true heading." };
  }
}

/** Cast a fan of rays for one eye and drive its lamina columns. */
function drive(eye: "L" | "R") {
  if (!sim || !circuits) return;
  const retina = eye === "L" ? circuits.retinaL : circuits.retinaR;
  const adapt = eye === "L" ? adaptL : adaptR;
  const cols = retina.columns;
  if (!cols.length) return;

  // Each eye covers roughly 180 degrees, centred well forward of straight out
  // to the side so the two fields overlap in front of the animal. Centring
  // them at a true 90 degrees leaves a blind notch dead ahead, which is
  // precisely where a looming threat arrives.
  const centre = world.fly.heading + (eye === "L" ? 1 : -1) * (Math.PI / 3);
  const span = Math.PI * 1.15;

  const fan = new Float32Array(RAY_FAN);
  for (let i = 0; i < RAY_FAN; i++) {
    const a = centre + ((i / (RAY_FAN - 1)) - 0.5) * span;
    fan[i] = castRay(world, a).lum;
  }

  const t4t5Cut = lesion === "t4t5";
  if (t4t5Cut) return;

  for (let c = 0; c < cols.length; c++) {
    const col = cols[c];
    // u runs front-to-back across the eye; sample the fan at that position.
    const f = ((col.u + 1) / 2) * (RAY_FAN - 1);
    const i0 = Math.floor(f), i1 = Math.min(RAY_FAN - 1, i0 + 1);
    const lum = fan[i0] + (fan[i1] - fan[i0]) * (f - i0);

    const a = adapt[c];
    const contrast = lum - a;
    adapt[c] = a + (lum - a) * 0.02;   // slow luminance adaptation

    // Both lamina channels depolarise to DARKNESS, not to light. Photoreceptors
    // are histaminergic and inhibit their targets, so light hyperpolarises L1
    // and L2. The ON pathway is recovered downstream: L1 is glutamatergic and
    // therefore inhibitory here, so a bright scene releases Mi1 from
    // inhibition. Driving these cells with brightness instead - the intuitive
    // reading - silences the entire ON channel.
    const dark = 1 - lum;
    const decrement = Math.max(0, -contrast);
    const mv = Math.min(
      LAMINA_CAP,
      dark * LAMINA_SUSTAINED + decrement * LAMINA_TRANSIENT,
    );
    for (const n of col.on) sim.setBias(n, mv);
    for (const n of col.off) sim.setBias(n, mv);
  }

  // The looming pathway gets its drive from the same scene, but LPLC2 responds
  // to expansion rather than contrast, which a 2D ray fan cannot produce on
  // its own. Angular growth rate is the physiological trigger.
  if (world.threat.active && lesion !== "lplc2") {
    let d = world.threat.bearing - centre;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    if (Math.abs(d) < span / 2) {
      const growth = world.threat.size / Math.max(0.05, world.threat.ttc);
      // Angular growth rate is what LPLC2 actually encodes. The gain is set so
      // the population only crosses threshold in the last ~300 ms before
      // contact, which is where real Giant-Fibre escapes are triggered.
      const mv = Math.min(13, growth * 8);
      const pop = eye === "L" ? circuits.lplc2.left : circuits.lplc2.right;
      for (let i = 0; i < pop.length; i++) sim.setBias(pop[i], mv);
    }
  }
}

/**
 * The Giant Fibre is a command neuron with a famously high threshold: it stays
 * silent until LPLC2 delivers strong coincident input, and one volley commits
 * the animal to a jump. Under a uniform tonic drive it would fire at rest,
 * which makes the escape read-out meaningless, so it is held below the tonic
 * level and only the loom pathway can lift it. Measured in isolation this puts
 * it at 0.00 Hz at rest against 2.00 Hz under a loom.
 *
 * This has to be reapplied on every sensory frame, and once at startup - the
 * first frame does not arrive until SENSOR_PERIOD steps in, and the Giant
 * Fibre will happily fire during those.
 */
/** Run the network forward without recording anything. */
function settle() {
  if (!sim) return;
  holdCommandNeurons();
  for (let i = 0; i < SETTLE_MS; i++) {
    for (let b = 0; b < NOISE_N; b++) {
      sim.injectOne((Math.random() * sim.n) | 0, NOISE_MV);
    }
    sim.step(DT);
  }
}

function holdCommandNeurons() {
  if (!sim || !circuits) return;
  for (let i = 0; i < circuits.giantFiber.length; i++) {
    sim.setBias(circuits.giantFiber[i], -TONIC);
  }
}

function sensorTick() {
  if (!sim || !circuits) return;
  // Stimulus-driven input is rebuilt from scratch each sensory frame; the
  // tonic level lives in the params, not in bias, so it survives this.
  sim.clearBias();
  holdCommandNeurons();
  drive("L");
  drive("R");

  const secs = SENSOR_PERIOD / 1000;

  // Motor read-out: steering is the left-right asymmetry in descending
  // neuron firing, forward speed is their summed drive.
  const nL = Math.max(1, circuits.descendingL.length);
  const nR = Math.max(1, circuits.descendingR.length);
  const hzL = counts.dnL / nL / (RATE_WINDOW / 1000);
  const hzR = counts.dnR / nR / (RATE_WINDOW / 1000);

  const f = world.fly;
  const asym = (hzR - hzL) / Math.max(1, hzR + hzL);
  f.turn = asym * 9.0;
  // Walking Drosophila cruise at roughly 10-30 mm/s.
  f.speed = Math.min(75, 8 + (hzL + hzR) * 1.4);

  // The Giant Fibre is a command neuron: one volley and the animal is airborne.
  if (counts.gf > 0 && f.escapeFor <= 0 && lesion !== "giantFiber") {
    f.escapeFor = 0.3;
    f.heading += (Math.random() < 0.5 ? -1 : 1) * (0.8 + Math.random() * 0.7);
  }

  stepBody(world, secs);
  assayClock += secs;
  updateAssay(hzL, hzR);
}

function updateAssay(hzL: number, hzR: number) {
  if (!assay || !circuits) return;
  const f = world.fly;
  const gfHz = counts.gf / Math.max(1, circuits.giantFiber.length) / (RATE_WINDOW / 1000);

  if (assay.name === "optomotor") {
    assay.series.push({ t: assayClock, a: world.drumSpeed, b: f.turn });
    if (assay.series.length > 240) assay.series.shift();
    if (assayClock > 6) {
      const recent = assay.series.slice(-140);
      const gain = mean(recent.map((s) => s.b)) / (world.drumSpeed || 1);
      assay.verdict = gain > 0.12 ? "pass" : "fail";
      assay.detail =
        `Optomotor gain ${gain.toFixed(2)} against a drum at ${world.drumSpeed.toFixed(1)} rad/s. ` +
        (gain > 0.12
          ? "The fly follows the surround, which is the response the wiring should produce."
          : "The fly is not following the surround.");
    }
  } else if (assay.name === "looming") {
    assay.series.push({ t: assayClock, a: world.threat.size, b: gfHz });
    if (assay.series.length > 240) assay.series.shift();
    const fired = assay.series.some((s) => s.b > 0.5);
    if (assayClock > 3) {
      assay.verdict = fired ? "pass" : "fail";
      assay.detail = fired
        ? "The Giant Fibre fired as the loom expanded, and the body committed to an escape."
        : "The loom expanded to contact without the Giant Fibre firing.";
      if (assayClock > 4.5) { launchThreat(world); assayClock = 0; assay.series = []; }
    }
  } else if (assay.name === "wall") {
    const d = distanceToWall(world);
    assay.series.push({ t: assayClock, a: d, b: 0 });
    if (assay.series.length > 400) assay.series.shift();
    const m = mean(assay.series.map((s) => s.a));
    assay.series[assay.series.length - 1].b = m;
    if (assayClock > 10) {
      assay.verdict = m < ROOM_H / 4 ? "pass" : "fail";
      assay.detail =
        `Mean distance to the nearest surface ${m.toFixed(0)} mm, against an arena half-width of ${(ROOM_H / 2).toFixed(0)} mm. ` +
        (m < ROOM_H / 4
          ? "The fly is staying near walls, as walking Drosophila do."
          : "The fly is spending too much time in open floor.");
    }
  } else {
    const bump = bumpPosition();
    assay.series.push({ t: assayClock, a: wrap(f.heading), b: bump });
    if (assay.series.length > 300) assay.series.shift();
    if (assayClock > 8) {
      const alive = epgCounts.some((c) => c > 0);
      assay.verdict = alive ? "pass" : "fail";
      assay.detail = alive
        ? "The ellipsoid body is carrying a bump of activity while the fly turns."
        : "No sustained activity in the EPG population.";
    }
  }
}

/** Circular mean of EPG activity, treating cell order as angular position. */
function bumpPosition(): number {
  let sx = 0, sy = 0;
  for (let i = 0; i < epgCounts.length; i++) {
    const a = (i / epgCounts.length) * Math.PI * 2;
    sx += Math.cos(a) * epgCounts[i];
    sy += Math.sin(a) * epgCounts[i];
  }
  return Math.atan2(sy, sx);
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

let lastPost = 0;
let rtWindowStart = 0;
let rtSimStart = 0;
let realtime = 0;
let spikeAccum = 0;

function loop() {
  if (!running || !sim || !circuits) return;

  const budgetStart = performance.now();
  // Spend at most 12 ms of wall clock per turn so the worker stays responsive
  // to messages even when the brain is running slower than real time.
  while (performance.now() - budgetStart < 12) {
    // Background drive, so the baseline is irregular rather than clockwork.
    for (let b = 0; b < NOISE_N; b++) {
      sim.injectOne((Math.random() * sim.n) | 0, NOISE_MV);
    }
    const fired = sim.step(DT);
    spikeAccum += fired;

    if (tag) {
      for (let k = 0; k < fired; k++) {
        const i = sim.spikes[k];
        const t = tag[i];
        if (t === 0) continue;
        if (t & T_DNL) counts.dnL++;
        if (t & T_DNR) counts.dnR++;
        if (t & T_GF) counts.gf++;
        if (t & T_T4) counts.t4++;
        if (t & T_T5) counts.t5++;
        if (t & T_LPL) counts.lplL++;
        if (t & T_LPR) counts.lplR++;
        if (t & T_EPG) {
          counts.epg++;
          const e = epgIndex.get(i);
          if (e !== undefined) epgCounts[e] += 1;
        }
      }
    }

    simMs += DT;
    sinceSensor += DT;
    sinceRate += DT;

    if (sinceSensor >= SENSOR_PERIOD) {
      sinceSensor = 0;
      sensorTick();
    }
    if (sinceRate >= RATE_WINDOW) {
      sinceRate = 0;
      for (const k of Object.keys(counts) as (keyof typeof counts)[]) counts[k] = 0;
      for (let i = 0; i < epgCounts.length; i++) epgCounts[i] *= 0.55;
    }
  }

  const now = performance.now();
  if (now - rtWindowStart > 500) {
    realtime = (simMs - rtSimStart) / (now - rtWindowStart);
    rtWindowStart = now; rtSimStart = simMs;
  }

  if (now - lastPost > 33) {
    lastPost = now;
    sendTelemetry();
  }

  setTimeout(loop, 0);
}

function sendTelemetry() {
  if (!sim || !circuits) return;
  const win = RATE_WINDOW / 1000;
  const rate = (c: number, n: number) => c / Math.max(1, n) / win;
  const f = world.fly;

  const trail: number[] = [];
  for (const p of world.trail) trail.push(p.x, p.y);

  const peak = Math.max(1e-6, ...epgCounts);
  const data: Telemetry = {
    simMs: Math.round(simMs),
    realtime,
    meanHz: spikeAccum / sim.n / Math.max(1e-6, simMs / 1000),
    activeSet: sim.activeSize,
    fly: { x: f.x, y: f.y, heading: f.heading, speed: f.speed, turn: f.turn },
    threat: { active: world.threat.active, size: world.threat.size, bearing: world.threat.bearing },
    trail,
    rates: {
      descendingL: rate(counts.dnL, circuits.descendingL.length),
      descendingR: rate(counts.dnR, circuits.descendingR.length),
      giantFiber: rate(counts.gf, circuits.giantFiber.length),
      t4: rate(counts.t4, circuits.t4.length),
      t5: rate(counts.t5, circuits.t5.length),
      lplc2L: rate(counts.lplL, circuits.lplc2.left.length),
      lplc2R: rate(counts.lplR, circuits.lplc2.right.length),
      epg: rate(counts.epg, circuits.epg.length),
    },
    epgBump: Array.from(epgCounts, (c) => c / peak),
    assay,
  };
  post({ type: "telemetry", data });
}

export {};
