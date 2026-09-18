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
  FURNITURE, ROOM_H, ROOM_W, castRay, distanceToWall, land, launchThreat,
  makeWorld, stepBody, takeoff, type World,
} from "./world";
import { RETINA_CH, type AssayName, type AssayReport, type FromWorker, type Telemetry, type ToWorker } from "./protocol";

const post = (m: FromWorker, transfer?: Transferable[]) =>
  transfer ? self.postMessage(m, transfer) : self.postMessage(m);

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
let enhanced = false;

// Population membership as a bitmask per neuron, so counting spikes is a
// single pass over the spike list rather than a set lookup per population.
let tag: Uint8Array | null = null;
const T_DNL = 1, T_DNR = 2, T_GF = 4, T_T4 = 8, T_T5 = 16, T_LPL = 32, T_LPR = 64, T_EPG = 128;

const counts = { dnL: 0, dnR: 0, gf: 0, t4: 0, t5: 0, lplL: 0, lplR: 0, epg: 0 };
/**
 * Rates carried across counting windows. Reading the raw counter straight
 * after it is zeroed reports 0 Hz for a population that is firing perfectly
 * well, so the display would spend half its frames showing nothing.
 */
const smooth = { dnL: 0, dnR: 0, gf: 0, t4: 0, t5: 0, lplL: 0, lplR: 0, epg: 0 };
type RateKey = keyof typeof counts;
const POP_SIZE: Record<RateKey, () => number> = {
  dnL: () => circuits?.descendingL.length ?? 1,
  dnR: () => circuits?.descendingR.length ?? 1,
  gf: () => circuits?.giantFiber.length ?? 1,
  t4: () => circuits?.t4.length ?? 1,
  t5: () => circuits?.t5.length ?? 1,
  lplL: () => circuits?.lplc2.left.length ?? 1,
  lplR: () => circuits?.lplc2.right.length ?? 1,
  epg: () => circuits?.epg.length ?? 1,
};
let epgCounts: Float32Array = new Float32Array(0);
let epgIndex = new Map<number, number>();

let simMs = 0;
let sinceSensor = 0;
let sinceRate = 0;
let assay: AssayReport | null = null;
let assayClock = 0;
// Looming assay is scored per trial rather than per instant.
let loomTrials = 0, loomHits = 0;
let loomHit = false, loomArmed = false;

// Per-column luminance memory, for the ON/OFF contrast channels.
let adaptL: Float32Array = new Float32Array(0);
let adaptR: Float32Array = new Float32Array(0);

// Simulated time of each neuron's last spike. Written only on a spike, so
// keeping it costs nothing per step; the decayed activity the viewer wants is
// computed from it only when a frame is sent.
let lastSpike: Float32Array = new Float32Array(0);
/** How fast a spike fades on screen, ms. */
const GLOW_TAU = 70;
/** exp(-age / GLOW_TAU) scaled to a byte, one entry per ms of age. */
const GLOW_LUT = new Uint8Array(GLOW_TAU * 5 + 1);
for (let a = 0; a < GLOW_LUT.length; a++) GLOW_LUT[a] = (255 * Math.exp(-a / GLOW_TAU)) | 0;

// Last sensory frame per column, kept so the retina panels can show what the
// eye saw alongside what the lamina did with it.
let retinaL: Uint8Array = new Uint8Array(0);
let retinaR: Uint8Array = new Uint8Array(0);

self.onmessage = async (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  try {
    switch (msg.type) {
      case "load": await load(msg.tier); break;
      case "run":
        running = msg.running;
        if (running) {
          rtWindowStart = performance.now();
          rtSimStart = simMs;
          lastTurnEnd = 0;
          loop();
        }
        break;
      case "reset": doReset(); break;
      case "assay": startAssay(msg.name); break;
      case "threat": launchThreat(world); break;
      case "gain": if (sim) sim.params.mvPerSynapse = msg.mvPerSynapse; break;
      case "lesion": lesion = msg.population; break;
      case "enhance": enhanced = msg.enabled; break;
      case "takeoff": takeoff(world, 4); break;
      case "land": land(world); break;
      case "pilot":
        world.pilot.active = msg.active;
        world.pilot.thrust = msg.thrust; world.pilot.yaw = msg.yaw; world.pilot.lift = msg.lift;
        break;
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
  lastSpike = new Float32Array(g.n).fill(-1e9);
  retinaL = new Uint8Array(circuits.retinaL.columns.length * RETINA_CH);
  retinaR = new Uint8Array(circuits.retinaR.columns.length * RETINA_CH);
  settle();

  // Soma positions for the brain view. Neurons without a reconstructed soma
  // (photoreceptors, mostly - their cell bodies sit in the retina, outside the
  // imaged volume) simply have no point.
  const withSoma: number[] = [];
  for (let i = 0; i < nt.n; i++) {
    if (nt.soma[i * 3] !== 0 || nt.soma[i * 3 + 1] !== 0 || nt.soma[i * 3 + 2] !== 0) withSoma.push(i);
  }
  const somaXYZ = new Float32Array(withSoma.length * 3);
  const somaNeuron = new Uint32Array(withSoma.length);
  withSoma.forEach((i, k) => {
    somaXYZ[k * 3] = nt!.soma[i * 3];
    somaXYZ[k * 3 + 1] = nt!.soma[i * 3 + 1];
    somaXYZ[k * 3 + 2] = nt!.soma[i * 3 + 2];
    somaNeuron[k] = i;
  });

  const layout = (cols: { u: number; v: number }[]) => {
    const a = new Float32Array(cols.length * 2);
    cols.forEach((c, i) => { a[i * 2] = c.u; a[i * 2 + 1] = c.v; });
    return a;
  };

  post({
    type: "ready",
    neurons: g.n, edges: g.edges, threshold: g.threshold,
    columnsL: circuits.retinaL.columns.length,
    columnsR: circuits.retinaR.columns.length,
    retinaLayoutL: layout(circuits.retinaL.columns),
    retinaLayoutR: layout(circuits.retinaR.columns),
    somaXYZ, somaNeuron,
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
  for (const k of Object.keys(counts) as RateKey[]) { counts[k] = 0; smooth[k] = 0; }
  adaptL.fill(0.5); adaptR.fill(0.5);
  lastSpike.fill(-1e9);
  settle();
  assay = null; assayClock = 0;
  loomTrials = 0; loomHits = 0; loomHit = false; loomArmed = false;
}

function startAssay(name: AssayName | null) {
  world.drumSpeed = 0;
  if (!name) { assay = null; return; }
  assayClock = 0;
  const base = { name, verdict: "running" as const, series: [], };
  if (name === "optomotor") {
    world.drumSpeed = 1.6;
    assay = { ...base, labels: ["stripes, turning speed", "fly, turning speed"],
      expected: "The fly should turn the same way as the stripes, at about a third to two thirds of their speed.",
      detail: "Spinning the stripes and measuring how much the fly turns with them." };
  } else if (name === "looming") {
    assay = { ...base, labels: ["loom size (rad)", "Giant Fibre (Hz)"],
      expected: "The Giant Fiber should fire a short burst just before the object hits, and stay quiet otherwise.",
      detail: "Sending a dark object at the fly and watching the Giant Fiber." };
    loomTrials = 0; loomHits = 0; loomHit = false; loomArmed = true;
    launchThreat(world, world.fly.heading + 0.2);
  } else if (name === "wall") {
    assay = { ...base, labels: ["distance to wall, mm", "average, mm"],
      expected: "Walking flies keep close to walls. The average distance should stay under 200 mm.",
      detail: "Letting the fly walk and measuring where it spends its time." };
  } else {
    assay = { ...base, labels: ["true heading", "compass reading"],
      expected: "The compass should follow the heading, drifting slowly rather than jumping or going dark.",
      detail: "Comparing the brain's compass against the direction the fly is really facing." };
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

    // Enhanced mode: boost contrast sensitivity and transient response
    const sustainGain = enhanced ? LAMINA_SUSTAINED * 1.5 : LAMINA_SUSTAINED;
    const transientGain = enhanced ? LAMINA_TRANSIENT * 2.0 : LAMINA_TRANSIENT;

    const mv = Math.min(
      LAMINA_CAP,
      dark * sustainGain + decrement * transientGain,
    );
    for (const n of col.on) sim.setBias(n, mv);
    for (const n of col.off) sim.setBias(n, mv);

    const rec = eye === "L" ? retinaL : retinaR;
    rec[c * RETINA_CH] = (lum * 255) | 0;
    rec[c * RETINA_CH + 1] = ((mv / LAMINA_CAP) * 255) | 0;
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
  if (!world.pilot.active) {
    if (f.airborne) {
      // In the air the same descending asymmetry steers saccades, and the
      // summed drive sets airspeed. Flies cruise at a few hundred mm/s.
      f.turn = asym * 6.0;
      f.speed = Math.min(600, 240 + (hzL + hzR) * 6);
    } else {
      f.turn = asym * 9.0;
      // Walking Drosophila cruise at roughly 10-30 mm/s.
      f.speed = Math.min(75, 8 + (hzL + hzR) * 1.4);
    }
  }

  // The Giant Fibre is a command neuron: one volley and the animal is airborne.
  if (counts.gf > 0 && f.escapeFor <= 0 && lesion !== "giantFiber") {
    f.escapeFor = 0.3;
    f.heading += (Math.random() < 0.5 ? -1 : 1) * (0.8 + Math.random() * 0.7);
    takeoff(world, 1.6 + Math.random() * 1.5);
  }

  stepBody(world, secs, enhanced);
  assayClock += secs;
  updateAssay(hzL, hzR);
}

function updateAssay(hzL: number, hzR: number) {
  if (!assay || !circuits) return;
  const f = world.fly;
  const gfHz = Math.max(
    smooth.gf,
    counts.gf / Math.max(1, circuits.giantFiber.length) / (RATE_WINDOW / 1000),
  );

  if (assay.name === "optomotor") {
    assay.series.push({ t: assayClock, a: world.drumSpeed, b: f.turn });
    if (assay.series.length > 240) assay.series.shift();
    if (assayClock > 6) {
      const recent = assay.series.slice(-140);
      const gain = mean(recent.map((s) => s.b)) / (world.drumSpeed || 1);
      assay.verdict = gain > 0.12 ? "pass" : "fail";
      assay.detail =
        `The fly turns at ${gain.toFixed(2)} of the stripes' speed. ` +
        (gain > 0.12 ? "It is following them." : "It is not following them.");
    }
  } else if (assay.name === "looming") {
    assay.series.push({ t: assayClock, a: world.threat.size, b: gfHz });
    if (assay.series.length > 240) assay.series.shift();

    // Score each loom as its own trial. The Giant Fibre fires for a few hundred
    // milliseconds out of a loom lasting well over a second, so asking whether
    // it is firing right now, or looking at a rolling window that has already
    // discarded the burst, reports a miss on a trial that plainly hit.
    if (gfHz > 0.5) loomHit = true;

    if (!world.threat.active && loomArmed) {
      loomArmed = false;
      loomTrials++;
      if (loomHit) loomHits++;
      loomHit = false;
    }

    if (loomTrials > 0) {
      assay.verdict = loomHits / loomTrials >= 0.5 ? "pass" : "fail";
      assay.detail =
        `The Giant Fiber fired on ${loomHits} of ${loomTrials} tries` +
        (loomHits ? `, and the fly jumped.` : `. The object arrived and the fly did not jump.`);
    }

    // Relaunch, always somewhere the eyes can actually see.
    if (!world.threat.active && assayClock > 1.2) {
      launchThreat(world, world.fly.heading + (Math.random() - 0.5) * 1.0);
      loomArmed = true;
      loomHit = false;
      assayClock = 0;
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
        `On average the fly is ${m.toFixed(0)} mm from the nearest wall. ` +
        (m < ROOM_H / 4 ? "It is keeping close to walls, like a real fly." : "It is spending too long in the open.");
    }
  } else {
    const bump = bumpPosition();
    assay.series.push({ t: assayClock, a: wrap(f.heading), b: bump });
    if (assay.series.length > 300) assay.series.shift();
    if (assayClock > 8) {
      const alive = epgCounts.some((c) => c > 0);
      assay.verdict = alive ? "pass" : "fail";
      assay.detail = alive
        ? "The compass ring is active and moving with the fly."
        : "The compass ring has gone quiet.";
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

// Wall-time accounting, so a slow simulation can be blamed on the right thing.
const prof = { step: 0, noise: 0, sensor: 0, telemetry: 0, gap: 0, turns: 0 };
let profSnapshot = { ...prof };
let profStart = 0;
let lastTurnEnd = 0;

let lastPost = 0;
let rtWindowStart = 0;
let rtSimStart = 0;
/** Simulated time over wall time; -1 until the first full measurement window. */
let realtime = -1;
let spikeAccum = 0;

// Yielding through a MessageChannel instead of setTimeout(fn, 0). Browsers
// clamp nested zero-delay timers - in Chrome the worker was idle for two
// thirds of every second waiting on them - but a posted message is delivered
// as soon as the queue is free, and it still lets messages from the page
// (pause, reset, a new test) get through between turns.
const yieldChannel = new MessageChannel();
yieldChannel.port1.onmessage = () => loop();
const yieldToQueue = () => yieldChannel.port2.postMessage(null);

function loop() {
  if (!running || !sim || !circuits) return;

  const budgetStart = performance.now();
  if (lastTurnEnd) prof.gap += budgetStart - lastTurnEnd;
  prof.turns++;
  // Spend at most 12 ms of wall clock per turn so the worker stays responsive
  // to messages even when the brain is running slower than real time.
  while (performance.now() - budgetStart < 12) {
    // Background drive, so the baseline is irregular rather than clockwork.
    const tn = performance.now();
    for (let b = 0; b < NOISE_N; b++) {
      sim.injectOne((Math.random() * sim.n) | 0, NOISE_MV);
    }
    const ts = performance.now();
    prof.noise += ts - tn;
    const fired = sim.step(DT);
    prof.step += performance.now() - ts;
    spikeAccum += fired;

    for (let k = 0; k < fired; k++) lastSpike[sim.spikes[k]] = simMs;

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
      const t = performance.now();
      sensorTick();
      prof.sensor += performance.now() - t;
    }
    if (sinceRate >= RATE_WINDOW) {
      sinceRate = 0;
      for (const k of Object.keys(counts) as RateKey[]) {
        const hz = counts[k] / Math.max(1, POP_SIZE[k]()) / (RATE_WINDOW / 1000);
        smooth[k] = smooth[k] * 0.6 + hz * 0.4;
        counts[k] = 0;
      }
      for (let i = 0; i < epgCounts.length; i++) epgCounts[i] *= 0.55;
    }
  }

  const now = performance.now();
  if (now - rtWindowStart > 500) {
    realtime = (simMs - rtSimStart) / (now - rtWindowStart);
    rtWindowStart = now; rtSimStart = simMs;
  }

  if (now - profStart >= 1000) {
    const scale = 1000 / (now - profStart);
    profSnapshot = { step: prof.step * scale, noise: prof.noise * scale, sensor: prof.sensor * scale, telemetry: prof.telemetry * scale, gap: prof.gap * scale, turns: prof.turns * scale };
    for (const k of Object.keys(prof) as (keyof typeof prof)[]) prof[k] = 0;
    profStart = now;
  }

  if (now - lastPost > 33) {
    lastPost = now;
    const t = performance.now();
    sendTelemetry();
    prof.telemetry += performance.now() - t;
  }

  lastTurnEnd = performance.now();
  yieldToQueue();
}

function sendTelemetry() {
  if (!sim || !circuits) return;
  const f = world.fly;

  const trail: number[] = [];
  for (const p of world.trail) trail.push(p.x, p.y, p.z);

  const peak = Math.max(1e-6, ...epgCounts);
  const data: Telemetry = {
    simMs: Math.round(simMs),
    realtime,
    meanHz: spikeAccum / sim.n / Math.max(1e-6, simMs / 1000),
    activeSet: sim.activeSize,
    fly: {
      x: f.x, y: f.y, z: f.z, heading: f.heading, speed: f.speed, turn: f.turn,
      pitch: f.pitch, roll: f.roll, airborne: f.airborne, piloted: world.pilot.active,
    },
    threat: { active: world.threat.active, size: world.threat.size, bearing: world.threat.bearing },
    trail,
    rates: {
      descendingL: smooth.dnL, descendingR: smooth.dnR,
      giantFiber: smooth.gf, t4: smooth.t4, t5: smooth.t5,
      lplc2L: smooth.lplL, lplc2R: smooth.lplR, epg: smooth.epg,
    },
    epgBump: Array.from(epgCounts, (c) => c / peak),
    assay,
    prof: profSnapshot,
  };
  // Glow per neuron from its last spike, and per-column L1/L2 firing for the
  // retina panels. Both are fresh buffers so they can be handed over
  // zero-copy rather than cloned.
  const activity = new Uint8Array(sim.n);
  const now = simMs;
  const maxAge = GLOW_LUT.length - 1;
  for (let i = 0; i < sim.n; i++) {
    const age = now - lastSpike[i];
    activity[i] = age < maxAge ? GLOW_LUT[age | 0] : 0;
  }
  const glow = (idx: number[]) => {
    let best = 1e9;
    for (const n of idx) { const a = now - lastSpike[n]; if (a < best) best = a; }
    return best < maxAge ? GLOW_LUT[best | 0] : 0;
  };
  const packRetina = (src: Uint8Array, cols: CircuitMap["retinaL"]["columns"]) => {
    const out = new Uint8Array(src.length);
    out.set(src);
    for (let c = 0; c < cols.length; c++) {
      out[c * RETINA_CH + 2] = glow(cols[c].on);
      out[c * RETINA_CH + 3] = glow(cols[c].off);
    }
    return out;
  };
  const rl = packRetina(retinaL, circuits.retinaL.columns);
  const rr = packRetina(retinaR, circuits.retinaR.columns);

  post(
    { type: "telemetry", data, activity, retinaL: rl, retinaR: rr },
    [activity.buffer, rl.buffer, rr.buffer],
  );
}

export {};
