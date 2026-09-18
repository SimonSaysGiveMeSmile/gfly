"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BrainView } from "./BrainView";
import { RoomView, type ViewMode } from "./RoomView";
import { RetinaPanel } from "./RetinaPanel";
import { BodyView, type BodyMode } from "./BodyView";
import { FrameBus, type Ready } from "./bus";
import { LIMBS, loadFlyRigData } from "@/lib/three/flyRig";
import { FUNCTION_GROUPS } from "@/lib/sim/populations";
import type { AssayName, FromWorker, Telemetry, ToWorker } from "./protocol";

type Progress = { label: string; received: number; total: number };

const TESTS: { id: AssayName; name: string }[] = [
  { id: "optomotor", name: "Follow moving stripes" },
  { id: "looming", name: "Dodge an object" },
  { id: "wall", name: "Walk along walls" },
  { id: "compass", name: "Keep a heading" },
];

const LESIONS: { id: "t4t5" | "lplc2" | "giantFiber"; label: string }[] = [
  { id: "t4t5", label: "Silence motion cells" },
  { id: "lplc2", label: "Silence loom cells" },
  { id: "giantFiber", label: "Silence Giant Fiber" },
];

const VIEWS: { id: ViewMode; label: string }[] = [
  { id: "follow", label: "Follow" },
  { id: "orbit", label: "Room" },
  { id: "eye", label: "Fly's eye" },
];

const BODY_MODES: { id: BodyMode; label: string }[] = [
  { id: "live", label: "Live" },
  { id: "rest", label: "Still" },
  { id: "walk", label: "Walk" },
  { id: "fly", label: "Fly" },
];

/** Plain names for the joints a person is likely to reach for. */
const JOINT_LABEL: [RegExp, string][] = [
  [/^wing_yaw/, "Sweep"], [/^wing_roll/, "Raise"], [/^wing_pitch/, "Twist"],
  [/^coxa_abduct/, "Hip out"], [/^coxa_twist/, "Hip twist"], [/^coxa_/, "Hip"],
  [/^femur_twist/, "Thigh twist"], [/^femur_/, "Knee"], [/^tibia_/, "Shin"],
  [/^tarsus_/, "Foot"], [/^tarsus2/, "Toe 2"], [/^tarsus3/, "Toe 3"], [/^tarsus4/, "Toe 4"], [/^tarsus5/, "Claw"],
  [/^head_abduct/, "Turn"], [/^head_twist/, "Tilt"], [/^head$/, "Nod"],
  [/^antenna_abduct/, "Out"], [/^antenna_twist/, "Twist"], [/^antenna_/, "Down"],
  [/^rostrum/, "Rostrum"], [/^haustellum_abduct/, "Haustellum side"], [/^haustellum/, "Haustellum"], [/^labrum/, "Labrum"],
  [/^abdomen_abduct_?(\d?)/, "Side"], [/^abdomen_?(\d?)/, "Curl"], [/^haltere/, "Haltere"],
];
function jointLabel(name: string) {
  for (const [re, l] of JOINT_LABEL) if (re.test(name)) {
    const seg = name.match(/abdomen(?:_abduct)?_(\d)/)?.[1];
    return seg ? `${l} ${seg}` : l;
  }
  return name;
}

interface JointMeta { name: string; range: [number, number] }

export function Runner() {
  const bus = useMemo(() => new FrameBus(), []);
  const workerRef = useRef<Worker | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [ready, setReady] = useState<Ready | null>(null);
  const [slow, setSlow] = useState<Telemetry | null>(null);
  const [running, setRunning] = useState(false);
  const [assay, setAssay] = useState<AssayName | null>(null);
  const [lesion, setLesion] = useState<string | null>(null);
  const [enhanced, setEnhanced] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);

  // Body and camera.
  const [view, setView] = useState<ViewMode>("follow");
  const [bodyMode, setBodyMode] = useState<BodyMode>("live");
  const [limb, setLimb] = useState(LIMBS[3].id);
  const [joints, setJoints] = useState<JointMeta[]>([]);
  const [overrides, setOverrides] = useState<Map<string, number>>(() => new Map());
  const [pilot, setPilot] = useState(false);
  const keys = useRef(new Set<string>());

  const send = useCallback((m: ToWorker) => workerRef.current?.postMessage(m), []);

  const boot = useCallback(() => {
    if (workerRef.current) return;
    setStarted(true);
    const w = new Worker(new URL("./worker.ts", import.meta.url));
    workerRef.current = w;
    let lastSlow = 0;
    w.onmessage = (e: MessageEvent<FromWorker>) => {
      const m = e.data;
      if (m.type === "progress") setProgress({ label: m.label, received: m.received, total: m.total });
      else if (m.type === "ready") {
        bus.ready = m; setReady(m); setProgress(null);
        w.postMessage({ type: "run", running: true } satisfies ToWorker);
        setRunning(true);
      }
      else if (m.type === "telemetry") {
        bus.push(m);
        // A small read-only hook so the page can be checked from outside
        // (automated tests, or a curious person in the console).
        const w = window as unknown as { __gfly?: Record<string, unknown> };
        w.__gfly = { simMs: m.data.simMs, realtime: m.data.realtime, meanHz: m.data.meanHz, frames: ((w.__gfly?.frames as number) ?? 0) + 1, fly: m.data.fly, assay: m.data.assay?.verdict ?? null, prof: m.data.prof };
        // React only needs the numbers a few times a second.
        const now = performance.now();
        if (now - lastSlow > 250) { lastSlow = now; setSlow(m.data); }
      }
      else if (m.type === "error") setError(m.message);
    };
    w.postMessage({ type: "load", tier: 5 } satisfies ToWorker);
    loadFlyRigData().then((d) => {
      setJoints(d.header.bodies.flatMap((b) => b.joints.map((j) => ({ name: j.name, range: j.range }))));
    }).catch(() => {});
  }, [bus]);

  useEffect(() => () => { workerRef.current?.terminate(); workerRef.current = null; }, []);

  // Hands-on flight: W/S thrust, A/D turn, Space climbs, X sinks.
  useEffect(() => {
    if (!pilot) { send({ type: "pilot", active: false, thrust: 0, yaw: 0, lift: 0 }); return; }
    const push = () => {
      const k = keys.current;
      const thrust = (k.has("w") || k.has("arrowup") ? 1 : 0) - (k.has("s") || k.has("arrowdown") ? 1 : 0);
      const yaw = (k.has("d") || k.has("arrowright") ? 1 : 0) - (k.has("a") || k.has("arrowleft") ? 1 : 0);
      const lift = (k.has(" ") || k.has("shift") ? 1 : 0) - (k.has("x") || k.has("control") ? 1 : 0);
      send({ type: "pilot", active: true, thrust, yaw, lift });
    };
    const isKey = (e: KeyboardEvent) => /^(w|a|s|d|x| |shift|control|arrowup|arrowdown|arrowleft|arrowright)$/.test(e.key.toLowerCase());
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT" || !isKey(e)) return;
      e.preventDefault();
      keys.current.add(e.key.toLowerCase()); push();
    };
    const up = (e: KeyboardEvent) => { if (isKey(e)) { keys.current.delete(e.key.toLowerCase()); push(); } };
    const blur = () => { keys.current.clear(); push(); };
    window.addEventListener("keydown", down); window.addEventListener("keyup", up); window.addEventListener("blur", blur);
    push();
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); window.removeEventListener("blur", blur); };
  }, [pilot, send]);

  const toggleRun = () => { send({ type: "run", running: !running }); setRunning(!running); };
  const pickTest = (id: AssayName | null) => { setAssay(id); send({ type: "assay", name: id }); };
  const toggleLesion = (id: string) => {
    const next = lesion === id ? null : id;
    setLesion(next);
    send({ type: "lesion", population: next as never });
  };
  const toggleEnhance = () => {
    const next = !enhanced;
    setEnhanced(next);
    send({ type: "enhance", enabled: next });
  };
  const setJoint = (name: string, v: number | null) => {
    setOverrides((prev) => {
      const next = new Map(prev);
      if (v === null) next.delete(name); else next.set(name, v);
      return next;
    });
  };

  if (!started) return <StartCard onStart={boot} />;
  if (error) return <div className="glass p-8"><p className="t-head text-red">Something went wrong</p><p className="t-foot mt-2">{error}</p></div>;
  if (!ready) return <Loading progress={progress} />;

  const r = slow?.rates;
  const verdict = slow?.assay;
  const fly = slow?.fly;
  const limbDef = LIMBS.find((l) => l.id === limb)!;
  const limbJoints = joints.filter((j) => limbDef.match(j.name));

  return (
    <div className="space-y-2">
      {/* Views ------------------------------------------------------- */}
      <div className="grid gap-2 lg:grid-cols-3">
        <Card
          title="The room"
          hint={fly?.airborne ? `Flying, ${Math.round(fly.z)} mm up` : "Walking"}
          right={<Seg value={view} onChange={setView} options={VIEWS} />}
        >
          <RoomView bus={bus} view={view} overrides={overrides} className="glass-inner aspect-square w-full" />
        </Card>
        <Card
          title="The body"
          hint="Drag to turn"
          right={<Seg value={bodyMode} onChange={setBodyMode} options={BODY_MODES} />}
        >
          <BodyView bus={bus} mode={bodyMode} overrides={overrides} className="glass-inner aspect-square w-full" />
        </Card>
        <Card className="flex flex-col" title="The brain" hint="Each dot is a neuron, coloured by job">
          <BrainView bus={bus} className="glass-inner aspect-square w-full" />
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 px-1">
            {FUNCTION_GROUPS.map((g) => (
              <span key={g.id} className="flex items-center gap-1.5 t-cap">
                <i className="inline-block h-2 w-2 rounded-full" style={{ background: g.color }} />{g.label}
              </span>
            ))}
          </div>
        </Card>
      </div>

      {/* Controls Row ------------------------------------------------- */}
      <div className="grid gap-2 lg:grid-cols-12">
        <Card className="lg:col-span-3" title="Fly it">
          <div className="flex flex-wrap gap-1.5">
            <button onClick={toggleRun} className="btn-primary text-xs">{running ? "Pause" : "Run"}</button>
            <button onClick={() => send({ type: "reset" })} className="btn text-xs">Reset</button>
            <button onClick={() => send({ type: "threat" })} className="btn text-xs">Threat</button>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button onClick={() => send({ type: "takeoff" })} className="btn text-xs" disabled={pilot}>Take off</button>
            <button onClick={() => send({ type: "land" })} className="btn text-xs" disabled={pilot}>Land</button>
            <button onClick={() => { setPilot(!pilot); if (!pilot) setView("follow"); }} className={pilot ? "btn-on text-xs" : "btn text-xs"}>
              {pilot ? "Hands on" : "Take the controls"}
            </button>
          </div>
          {pilot ? (
            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5">
              <Key k="W / S" v="Forward, back" /><Key k="A / D" v="Turn" />
              <Key k="Space" v="Climb, take off" /><Key k="X" v="Sink, land" />
            </div>
          ) : (
            <p className="t-cap mt-2">The brain is driving. A Giant Fiber volley launches it.</p>
          )}
          <p className="t-cap mt-3 mb-1.5">Lesions</p>
          <div className="flex flex-wrap gap-1.5">
            {LESIONS.map((l) => (
              <button key={l.id} onClick={() => toggleLesion(l.id)} className={lesion === l.id ? "btn-danger text-xs" : "btn text-xs"}>
                {l.label}
              </button>
            ))}
            <button onClick={toggleEnhance} className={enhanced ? "btn-on text-xs" : "btn text-xs"}>
              {enhanced ? "Enhanced motor: on" : "Enhanced motor"}
            </button>
          </div>
        </Card>

        <Card className="lg:col-span-4" title="Move a limb" hint="Drag a slider; double-click it to let go" right={
          overrides.size > 0 ? <button onClick={() => setOverrides(new Map())} className="btn text-xs">Release all</button> : undefined
        }>
          <select value={limb} onChange={(e) => setLimb(e.target.value)} className="sel w-full">
            {LIMBS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select>
          <div className="mt-2 space-y-1">
            {limbJoints.map((j) => {
              const v = overrides.get(j.name);
              const held = v !== undefined;
              return (
                <label key={j.name} className="grid grid-cols-[5.5rem_1fr_3rem] items-center gap-2">
                  <span className={`t-foot truncate ${held ? "text-label" : ""}`}>{jointLabel(j.name)}</span>
                  <input
                    type="range" min={j.range[0]} max={j.range[1]} step={0.01}
                    value={v ?? 0}
                    onChange={(e) => setJoint(j.name, parseFloat(e.target.value))}
                    onDoubleClick={() => setJoint(j.name, null)}
                    className={held ? "rng rng-on" : "rng"}
                  />
                  <span className="t-cap num text-right">{held ? `${Math.round((v * 180) / Math.PI)}°` : "auto"}</span>
                </label>
              );
            })}
            {limbJoints.length === 0 && <p className="t-foot">Loading the rig…</p>}
          </div>
        </Card>

        <Card className="lg:col-span-5" title="The eyes" hint="What it sees">
          <div className="glass-inner p-2"><RetinaPanel bus={bus} /></div>
        </Card>
      </div>

      {/* Tests Row ---------------------------------------------------- */}
      <div className="grid gap-2 lg:grid-cols-12">
        <Card className="lg:col-span-5" title="Tests" hint="Pick one">
          <div className="grid grid-cols-2 gap-2">
            {TESTS.map((t) => (
              <button key={t.id} onClick={() => pickTest(assay === t.id ? null : t.id)} className={assay === t.id ? "btn-on text-sm" : "btn text-sm"} style={{ textAlign: "left" }}>
                {t.name}
              </button>
            ))}
          </div>
          {verdict && (
            <div className="mt-3 pt-2">
              <Verdict v={verdict.verdict} />
              <p className="t-foot mt-2">{verdict.detail}</p>
            </div>
          )}
        </Card>

        <Card className="lg:col-span-4" title="Activity">
          <div className="space-y-2">
            <Bar label="Steering L" hz={r?.descendingL} max={30} />
            <Bar label="Steering R" hz={r?.descendingR} max={30} />
            <Bar label="Motion" hz={r ? (r.t4 + r.t5) / 2 : 0} max={20} />
            <Bar label="Loom" hz={r ? (r.lplc2L + r.lplc2R) / 2 : 0} max={40} />
            <Bar label="Giant Fiber" hz={r?.giantFiber} max={40} accent />
          </div>
        </Card>

        <Card className="lg:col-span-3" title="Stats">
          <dl className="space-y-1.5">
            <Stat k="Neurons" v={ready.neurons.toLocaleString()} />
            <Stat k="Speed" v={slow && slow.realtime >= 0 ? `${slow.realtime.toFixed(2)}×` : "…"} hot={!!slow && slow.realtime > 0.8} />
            <Stat k="Rate" v={slow ? `${slow.meanHz.toFixed(1)} Hz` : "—"} />
            <Stat k="Body" v={fly ? `${Math.round(fly.speed)} mm/s` : "—"} />
            <Stat k="Height" v={fly ? `${Math.round(fly.z)} mm` : "—"} hot={!!fly?.airborne} />
          </dl>
        </Card>
      </div>
    </div>
  );
}

/* ---- parts ------------------------------------------------------------ */

function Card({ title, hint, right, className, children }: { title: string; hint?: string; right?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <section className={`glass p-2 ${className ?? ""}`}>
      <div className="mb-1.5 flex items-center justify-between gap-2 px-1 min-h-[1.75rem]">
        <div className="flex items-baseline gap-2 min-w-0">
          <h3 className="t-head text-sm whitespace-nowrap">{title}</h3>
          {hint && <p className="t-cap truncate">{hint}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

function Seg<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { id: T; label: string }[] }) {
  return (
    <div className="seg seg-sm">
      {options.map((o) => (
        <button key={o.id} aria-pressed={value === o.id} onClick={() => onChange(o.id)}>{o.label}</button>
      ))}
    </div>
  );
}

function Key({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline gap-1.5 min-w-0">
      <kbd className="kbd">{k}</kbd>
      <span className="t-cap truncate">{v}</span>
    </div>
  );
}

function StartCard({ onStart }: { onStart: () => void }) {
  return (
    <div className="glass p-10 text-center">
      <h3 className="t-title">Load the brain</h3>
      <p className="t-body mx-auto mt-3 max-w-md">
        This downloads 25 MB once: the connectome, the brain shape and the fly. After that everything runs on your device.
      </p>
      <button onClick={onStart} className="btn-primary mt-6">Load</button>
    </div>
  );
}

function Loading({ progress }: { progress: Progress | null }) {
  const pct = progress && progress.total ? Math.round((progress.received / progress.total) * 100) : 0;
  const label = progress?.label === "connectome" ? "Loading connections" : progress?.label === "neurons" ? "Loading neurons" : "Starting";
  return (
    <div className="glass p-10">
      <p className="t-head">{label}…</p>
      <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-blue transition-[width] duration-200" style={{ width: `${pct}%` }} />
      </div>
      <p className="t-foot num mt-2">
        {progress && progress.total ? `${(progress.received / 1e6).toFixed(1)} of ${(progress.total / 1e6).toFixed(1)} MB` : ""}
      </p>
    </div>
  );
}

function Stat({ k, v, hot }: { k: string; v: string; hot?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="t-foot">{k}</dt>
      <dd className={`num text-[15px] font-semibold ${hot ? "text-green" : ""}`}>{v}</dd>
    </div>
  );
}

function Bar({ label, hz, max, accent }: { label: string; hz?: number; max: number; accent?: boolean }) {
  const v = hz ?? 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="t-foot">{label}</span>
        <span className="num t-foot">{v.toFixed(1)} Hz</span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <div className={`h-full rounded-full transition-[width] duration-150 ${accent ? "bg-red" : "bg-green"}`} style={{ width: `${Math.min(100, (v / max) * 100)}%` }} />
      </div>
    </div>
  );
}

function Verdict({ v }: { v: "running" | "pass" | "fail" }) {
  if (v === "pass") return <span className="pill pill-green">Behaves like a fly</span>;
  if (v === "fail") return <span className="pill pill-red">Does not</span>;
  return <span className="pill pill-gray"><span className="live-dot" />Measuring</span>;
}
