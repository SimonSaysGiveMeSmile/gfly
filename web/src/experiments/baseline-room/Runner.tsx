"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BrainView } from "./BrainView";
import { RoomView, type ViewMode } from "./RoomView";
import { RetinaPanel } from "./RetinaPanel";
import { BodyView, type BodyMode } from "./BodyView";
import { FrameBus, type Ready } from "./bus";
import { LIMBS, loadFlyRigData } from "@/lib/three/flyRig";
import { FUNCTION_GROUPS } from "@/lib/sim/populations";
import { TIERS, useTier } from "@/lib/sim/tier";
import type { AssayName, FromWorker, Telemetry, ToWorker } from "./protocol";
import { useT, type Key, type T } from "@/lib/i18n";

type Progress = { label: string; received: number; total: number };

const TESTS: { id: AssayName; key: Key }[] = [
  { id: "optomotor", key: "room.test.optomotor" },
  { id: "looming", key: "room.test.looming" },
  { id: "wall", key: "room.test.wall" },
  { id: "compass", key: "room.test.compass" },
];

const LESIONS: { id: "t4t5" | "lplc2" | "giantFiber"; key: Key }[] = [
  { id: "t4t5", key: "room.lesion.t4t5" },
  { id: "lplc2", key: "room.lesion.lplc2" },
  { id: "giantFiber", key: "room.lesion.gf" },
];

const VIEWS: { id: ViewMode; key: Key }[] = [
  { id: "follow", key: "room.view.follow" },
  { id: "orbit", key: "room.view.orbit" },
  { id: "eye", key: "room.view.eye" },
];

const BODY_MODES: { id: BodyMode; key: Key }[] = [
  { id: "live", key: "room.body.live" },
  { id: "rest", key: "room.body.rest" },
  { id: "walk", key: "room.body.walk" },
  { id: "fly", key: "room.body.fly" },
];

/** Plain names for the joints a person is likely to reach for. */
const JOINT_LABEL: [RegExp, Key][] = [
  [/^wing_yaw/, "joint.sweep"], [/^wing_roll/, "joint.raise"], [/^wing_pitch/, "joint.twist"],
  [/^coxa_abduct/, "joint.hipOut"], [/^coxa_twist/, "joint.hipTwist"], [/^coxa_/, "joint.hip"],
  [/^femur_twist/, "joint.thighTwist"], [/^femur_/, "joint.knee"], [/^tibia_/, "joint.shin"],
  [/^tarsus_/, "joint.foot"], [/^tarsus[234]/, "joint.toe"], [/^tarsus5/, "joint.claw"],
  [/^head_abduct/, "joint.turn"], [/^head_twist/, "joint.tilt"], [/^head$/, "joint.nod"],
  [/^antenna_abduct/, "joint.out"], [/^antenna_twist/, "joint.twist"], [/^antenna_/, "joint.down"],
  [/^rostrum/, "joint.rostrum"], [/^haustellum_abduct/, "joint.haustellumSide"], [/^haustellum/, "joint.haustellum"], [/^labrum/, "joint.labrum"],
  [/^abdomen_abduct_?(\d?)/, "joint.side"], [/^abdomen_?(\d?)/, "joint.curl"], [/^haltere/, "joint.haltere"],
];
function jointLabel(t: T, name: string) {
  for (const [re, k] of JOINT_LABEL) if (re.test(name)) {
    const n = name.match(/abdomen(?:_abduct)?_(\d)/)?.[1] ?? name.match(/^tarsus(\d)/)?.[1] ?? "";
    return t(k, { n });
  }
  return name;
}

interface JointMeta { name: string; range: [number, number] }

export function Runner() {
  const { t } = useT();
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
  const tier = useTier();
  const bootedTier = useRef<number | null>(null);

  const send = useCallback((m: ToWorker) => workerRef.current?.postMessage(m), []);

  const boot = useCallback(() => {
    if (workerRef.current) return;
    setStarted(true);
    bootedTier.current = tier;
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
    w.postMessage({ type: "load", tier } satisfies ToWorker);
    loadFlyRigData().then((d) => {
      setJoints(d.header.bodies.flatMap((b) => b.joints.map((j) => ({ name: j.name, range: j.range }))));
    }).catch(() => {});
  }, [bus, tier]);

  useEffect(() => () => { workerRef.current?.terminate(); workerRef.current = null; }, []);

  // A different brain size means a different brain: start over with it.
  useEffect(() => {
    if (!workerRef.current || bootedTier.current === tier) return;
    workerRef.current.terminate();
    workerRef.current = null;
    setReady(null); setSlow(null); setRunning(false); setAssay(null); setLesion(null); setPilot(false);
    boot();
  }, [tier, boot]);

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

  if (!started) return <StartCard onStart={boot} tier={tier} />;
  if (error) return <div className="glass p-8"><p className="t-head text-red">{t("room.error")}</p><p className="t-foot mt-2">{error}</p></div>;
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
          title={t("room.card.room")}
          hint={fly?.airborne ? t("room.flying", { n: Math.round(fly.z) }) : t("room.walking")}
          right={<Seg value={view} onChange={setView} options={VIEWS} t={t} />}
        >
          <RoomView bus={bus} view={view} overrides={overrides} className="glass-inner aspect-square w-full" />
        </Card>
        <Card
          title={t("room.card.body")}
          hint={t("room.dragToTurn")}
          right={<Seg value={bodyMode} onChange={setBodyMode} options={BODY_MODES} t={t} />}
        >
          <BodyView bus={bus} mode={bodyMode} overrides={overrides} className="glass-inner aspect-square w-full" />
        </Card>
        <Card className="flex flex-col" title={t("room.card.brain")} hint={t("room.brain.hint")}>
          <BrainView bus={bus} className="glass-inner aspect-square w-full" />
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 px-1">
            {FUNCTION_GROUPS.map((g) => (
              <span key={g.id} className="flex items-center gap-1.5 t-cap">
                <i className="inline-block h-2 w-2 rounded-full" style={{ background: g.color }} />{t(`group.${g.id}` as Key)}
              </span>
            ))}
          </div>
        </Card>
      </div>

      {/* Controls Row ------------------------------------------------- */}
      <div className="grid gap-2 lg:grid-cols-12">
        <Card className="lg:col-span-3" title={t("room.card.flyIt")}>
          <div className="flex flex-wrap gap-1.5">
            <button onClick={toggleRun} className="btn-primary text-xs">{running ? t("room.pause") : t("room.run")}</button>
            <button onClick={() => send({ type: "reset" })} className="btn text-xs">{t("room.reset")}</button>
            <button onClick={() => send({ type: "threat" })} className="btn text-xs">{t("room.threat")}</button>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button onClick={() => send({ type: "takeoff" })} className="btn text-xs" disabled={pilot}>{t("room.takeoff")}</button>
            <button onClick={() => send({ type: "land" })} className="btn text-xs" disabled={pilot}>{t("room.land")}</button>
            <button onClick={() => { setPilot(!pilot); if (!pilot) setView("follow"); }} className={pilot ? "btn-on text-xs" : "btn text-xs"}>
              {pilot ? t("room.pilot.on") : t("room.pilot.off")}
            </button>
          </div>
          {pilot ? (
            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5">
              <Key k="W / S" v={t("room.key.ws")} /><Key k="A / D" v={t("room.key.ad")} />
              <Key k="Space" v={t("room.key.space")} /><Key k="X" v={t("room.key.x")} />
            </div>
          ) : (
            <p className="t-cap mt-2">{t("room.brainDriving")}</p>
          )}
          <p className="t-cap mt-3 mb-1.5">{t("room.lesions")}</p>
          <div className="flex flex-wrap gap-1.5">
            {LESIONS.map((l) => (
              <button key={l.id} onClick={() => toggleLesion(l.id)} className={lesion === l.id ? "btn-danger text-xs" : "btn text-xs"}>
                {t(l.key)}
              </button>
            ))}
            <button onClick={toggleEnhance} className={enhanced ? "btn-on text-xs" : "btn text-xs"}>
              {enhanced ? t("room.enhanced.on") : t("room.enhanced.off")}
            </button>
          </div>
        </Card>

        <Card className="lg:col-span-4" title={t("room.card.limb")} hint={t("room.limb.hint")} right={
          overrides.size > 0 ? <button onClick={() => setOverrides(new Map())} className="btn text-xs">{t("room.limb.release")}</button> : undefined
        }>
          <select value={limb} onChange={(e) => setLimb(e.target.value)} className="sel w-full">
            {LIMBS.map((l) => <option key={l.id} value={l.id}>{t(`limb.${l.id}` as Key)}</option>)}
          </select>
          <div className="mt-2 space-y-1">
            {limbJoints.map((j) => {
              const v = overrides.get(j.name);
              const held = v !== undefined;
              return (
                <label key={j.name} className="grid grid-cols-[5.5rem_1fr_3rem] items-center gap-2">
                  <span className={`t-foot truncate ${held ? "text-label" : ""}`}>{jointLabel(t, j.name)}</span>
                  <input
                    type="range" min={j.range[0]} max={j.range[1]} step={0.01}
                    value={v ?? 0}
                    onChange={(e) => setJoint(j.name, parseFloat(e.target.value))}
                    onDoubleClick={() => setJoint(j.name, null)}
                    className={held ? "rng rng-on" : "rng"}
                  />
                  <span className="t-cap num text-right">{held ? `${Math.round((v * 180) / Math.PI)}°` : t("room.limb.auto")}</span>
                </label>
              );
            })}
            {limbJoints.length === 0 && <p className="t-foot">{t("room.limb.loading")}</p>}
          </div>
        </Card>

        <Card className="lg:col-span-5" title={t("room.card.eyes")} hint={t("room.eyes.hint")}>
          <div className="glass-inner p-2"><RetinaPanel bus={bus} /></div>
        </Card>
      </div>

      {/* Tests Row ---------------------------------------------------- */}
      <div className="grid gap-2 lg:grid-cols-12">
        <Card className="lg:col-span-5" title={t("room.card.tests")} hint={t("room.tests.hint")}>
          <div className="grid grid-cols-2 gap-2">
            {TESTS.map((x) => (
              <button key={x.id} onClick={() => pickTest(assay === x.id ? null : x.id)} className={assay === x.id ? "btn-on text-sm" : "btn text-sm"} style={{ textAlign: "left" }}>
                {t(x.key)}
              </button>
            ))}
          </div>
          {verdict && (
            <div className="mt-3 pt-2">
              <Verdict v={verdict.verdict} t={t} />
              <p className="t-foot mt-2">{verdict.detail}</p>
            </div>
          )}
        </Card>

        <Card className="lg:col-span-4" title={t("room.card.activity")}>
          <div className="space-y-2">
            <Bar label={t("room.bar.steerL")} hz={r?.descendingL} max={30} />
            <Bar label={t("room.bar.steerR")} hz={r?.descendingR} max={30} />
            <Bar label={t("room.bar.motion")} hz={r ? (r.t4 + r.t5) / 2 : 0} max={20} />
            <Bar label={t("room.bar.loom")} hz={r ? (r.lplc2L + r.lplc2R) / 2 : 0} max={40} />
            <Bar label={t("room.bar.gf")} hz={r?.giantFiber} max={40} accent />
          </div>
        </Card>

        <Card className="lg:col-span-3" title={t("room.card.stats")}>
          <dl className="space-y-1.5">
            <Stat k={t("room.stat.neurons")} v={ready.neurons.toLocaleString()} />
            <Stat k={t("room.stat.speed")} v={slow && slow.realtime >= 0 ? `${slow.realtime.toFixed(2)}×` : "…"} hot={!!slow && slow.realtime > 0.8} />
            <Stat k={t("room.stat.rate")} v={slow ? `${slow.meanHz.toFixed(1)} Hz` : "—"} />
            <Stat k={t("room.stat.body")} v={fly ? `${Math.round(fly.speed)} mm/s` : "—"} />
            <Stat k={t("room.stat.height")} v={fly ? `${Math.round(fly.z)} mm` : "—"} hot={!!fly?.airborne} />
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

function Seg<V extends string>({ value, onChange, options, t }: { value: V; onChange: (v: V) => void; options: { id: V; key: Key }[]; t: T }) {
  return (
    <div className="seg seg-sm">
      {options.map((o) => (
        <button key={o.id} aria-pressed={value === o.id} onClick={() => onChange(o.id)}>{t(o.key)}</button>
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

function StartCard({ onStart, tier }: { onStart: () => void; tier: number }) {
  const { t } = useT();
  const x = TIERS.find((y) => y.tier === tier)!;
  return (
    <div className="glass p-10 text-center">
      <h3 className="t-title">{t("room.start.title")}</h3>
      <p className="t-body mx-auto mt-3 max-w-md">
        {t("room.start.body", { tier: t(`tier.${x.id}` as Key), edges: t("tier.connections", { n: x.edges }), size: x.size })}
      </p>
      <button onClick={onStart} className="btn-primary mt-6">{t("room.start.load")}</button>
    </div>
  );
}

function Loading({ progress }: { progress: Progress | null }) {
  const { t } = useT();
  const pct = progress && progress.total ? Math.round((progress.received / progress.total) * 100) : 0;
  const label = progress?.label === "connectome" ? t("room.loading.connectome") : progress?.label === "neurons" ? t("room.loading.neurons") : t("room.loading.starting");
  return (
    <div className="glass p-10">
      <p className="t-head">{label}…</p>
      <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-blue transition-[width] duration-200" style={{ width: `${pct}%` }} />
      </div>
      <p className="t-foot num mt-2">
        {progress && progress.total ? t("room.loading.of", { a: (progress.received / 1e6).toFixed(1), b: (progress.total / 1e6).toFixed(1) }) : ""}
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

function Verdict({ v, t }: { v: "running" | "pass" | "fail"; t: T }) {
  if (v === "pass") return <span className="pill pill-green">{t("room.verdict.pass")}</span>;
  if (v === "fail") return <span className="pill pill-red">{t("room.verdict.fail")}</span>;
  return <span className="pill pill-gray"><span className="live-dot" />{t("room.verdict.running")}</span>;
}
