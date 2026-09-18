"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BrainView } from "./BrainView";
import { RoomView } from "./RoomView";
import { RetinaPanel } from "./RetinaPanel";
import { AnatomyView } from "./AnatomyView";
import { FrameBus, type Ready } from "./bus";
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

export function Runner() {
  const bus = useMemo(() => new FrameBus(), []);
  const workerRef = useRef<Worker | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [ready, setReady] = useState<Ready | null>(null);
  const [slow, setSlow] = useState<Telemetry | null>(null);
  const [running, setRunning] = useState(false);
  const [assay, setAssay] = useState<AssayName | null>(null);
  const [lesion, setLesion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);

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
      else if (m.type === "ready") { bus.ready = m; setReady(m); setProgress(null); }
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
  }, [bus]);

  useEffect(() => () => { workerRef.current?.terminate(); workerRef.current = null; }, []);
  useEffect(() => {
    if (ready && !running) { send({ type: "run", running: true }); setRunning(true); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const toggleRun = () => { send({ type: "run", running: !running }); setRunning(!running); };
  const pickTest = (id: AssayName | null) => { setAssay(id); send({ type: "assay", name: id }); };
  const toggleLesion = (id: string) => {
    const next = lesion === id ? null : id;
    setLesion(next);
    send({ type: "lesion", population: next as never });
  };

  if (!started) return <StartCard onStart={boot} />;
  if (error) return <div className="glass p-8"><p className="t-head text-red">Something went wrong</p><p className="t-foot mt-2">{error}</p></div>;
  if (!ready) return <Loading progress={progress} />;

  const r = slow?.rates;
  const verdict = slow?.assay;

  return (
    <div className="space-y-3">
      {/* Views ------------------------------------------------------- */}
      <div className="grid gap-3 lg:grid-cols-3">
        <Card title="The room" hint="Drag to look around. The fly is shown about 60× life size.">
          <RoomView bus={bus} className="glass-inner aspect-square w-full" />
        </Card>
        <Card className="flex flex-col" title="The brain" hint="Each dot is a real neuron. It lights up when it fires.">
          <BrainView bus={bus} className="glass-inner aspect-square w-full" />
        </Card>
        <Card className="flex flex-col" title="The anatomy" hint="Drag to rotate. The body mesh from Google's flybody model.">
          <AnatomyView className="glass-inner aspect-square w-full" />
        </Card>
      </div>

      <Card title="The eyes" hint="Left and right eye, about 880 columns each. What it sees, and what the first cells do with it.">
        <div className="glass-inner p-2"><RetinaPanel bus={bus} /></div>
      </Card>

      {/* Controls ---------------------------------------------------- */}
      <div className="grid gap-3 lg:grid-cols-12">
        <Card className="lg:col-span-4" title="Controls">
          <div className="flex flex-wrap gap-2">
            <button onClick={toggleRun} className="btn-primary">{running ? "Pause" : "Run"}</button>
            <button onClick={() => send({ type: "reset" })} className="btn">Reset</button>
            <button onClick={() => send({ type: "threat" })} className="btn">Swat at it</button>
          </div>
          <p className="t-cap mt-5 mb-2">Turn off part of the brain</p>
          <div className="flex flex-wrap gap-2">
            {LESIONS.map((l) => (
              <button key={l.id} onClick={() => toggleLesion(l.id)} className={lesion === l.id ? "btn-danger" : "btn"}>
                {l.label}
              </button>
            ))}
          </div>
        </Card>

        <Card className="lg:col-span-5" title="Tests" hint="Pick one. It runs until you pick another.">
          <div className="grid grid-cols-2 gap-2">
            {TESTS.map((t) => (
              <button key={t.id} onClick={() => pickTest(assay === t.id ? null : t.id)} className={assay === t.id ? "btn-on" : "btn"} style={{ textAlign: "left" }}>
                {t.name}
              </button>
            ))}
          </div>
          {verdict && (
            <div className="mt-4 border-t border-line pt-4">
              <Verdict v={verdict.verdict} />
              <p className="t-foot mt-2">{verdict.detail}</p>
              <p className="t-cap mt-2">Expected: {verdict.expected}</p>
              <Trace series={verdict.series} labels={verdict.labels} />
            </div>
          )}
        </Card>

        <Card className="lg:col-span-3" title="Numbers">
          <dl className="space-y-2">
            <Stat k="Neurons" v={ready.neurons.toLocaleString()} />
            <Stat k="Connections" v={ready.edges.toLocaleString()} />
            <Stat k="Loaded in" v={`${(ready.loadMs / 1000).toFixed(1)} s`} />
            <Stat k="Speed" v={slow && slow.realtime >= 0 ? `${slow.realtime.toFixed(2)}× real time` : "measuring…"} hot={!!slow && slow.realtime > 0.8} />
            <Stat k="Average rate" v={slow ? `${slow.meanHz.toFixed(1)} Hz` : "—"} />
          </dl>
          <p className="t-cap mt-5 mb-2">Firing, by group</p>
          <div className="space-y-2">
            <Bar label="Steering, left" hz={r?.descendingL} max={30} />
            <Bar label="Steering, right" hz={r?.descendingR} max={30} />
            <Bar label="Motion cells" hz={r ? (r.t4 + r.t5) / 2 : 0} max={20} />
            <Bar label="Loom cells" hz={r ? (r.lplc2L + r.lplc2R) / 2 : 0} max={40} />
            <Bar label="Giant Fiber" hz={r?.giantFiber} max={40} accent />
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ---- parts ------------------------------------------------------------ */

function Card({ title, hint, className, children }: { title: string; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <section className={`glass p-3 ${className ?? ""}`}>
      <div className="mb-2 flex items-baseline justify-between gap-3 px-1">
        <h3 className="t-head">{title}</h3>
        {hint && <p className="t-cap hidden text-right sm:block">{hint}</p>}
      </div>
      {children}
    </section>
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

function Trace({ series, labels }: { series: { t: number; a: number; b: number }[]; labels: [string, string] }) {
  if (series.length < 2) return null;
  const w = 520, h = 80;
  const xs = series.map((s) => s.t), all = series.flatMap((s) => [s.a, s.b]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...all), y1 = Math.max(...all);
  const px = (t: number) => ((t - x0) / Math.max(1e-6, x1 - x0)) * w;
  const py = (v: number) => h - ((v - y0) / Math.max(1e-6, y1 - y0)) * (h - 4) - 2;
  const path = (k: "a" | "b") => series.map((s, i) => `${i ? "L" : "M"}${px(s.t).toFixed(1)},${py(s[k]).toFixed(1)}`).join("");
  return (
    <figure className="mt-3">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label="test trace">
        <path d={path("a")} fill="none" stroke="#ff9f0a" strokeWidth="1.6" />
        <path d={path("b")} fill="none" stroke="#30d158" strokeWidth="1.6" />
      </svg>
      <figcaption className="t-cap mt-1 flex gap-4">
        <span><i className="mr-1.5 inline-block h-0.5 w-3 bg-orange align-middle" />{labels[0]}</span>
        <span><i className="mr-1.5 inline-block h-0.5 w-3 bg-green align-middle" />{labels[1]}</span>
      </figcaption>
    </figure>
  );
}
