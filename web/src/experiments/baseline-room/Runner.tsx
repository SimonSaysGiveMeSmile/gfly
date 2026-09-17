"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Arena } from "./Arena";
import type { AssayName, FromWorker, Telemetry, ToWorker } from "./protocol";

type Ready = Extract<FromWorker, { type: "ready" }>;
type Progress = { label: string; received: number; total: number };

const ASSAYS: { id: AssayName; name: string; blurb: string }[] = [
  { id: "optomotor", name: "Optomotor", blurb: "Rotate the surround and see if the fly follows." },
  { id: "looming", name: "Looming escape", blurb: "Expand a dark object and watch the Giant Fibre." },
  { id: "wall", name: "Wall following", blurb: "Leave it alone and see where it walks." },
  { id: "compass", name: "Heading compass", blurb: "Track the bump in the ellipsoid body." },
];

const LESIONS: { id: "t4t5" | "lplc2" | "giantFiber"; label: string }[] = [
  { id: "t4t5", label: "Cut T4/T5" },
  { id: "lplc2", label: "Cut LPLC2" },
  { id: "giantFiber", label: "Cut DNp01" },
];

export function Runner() {
  const workerRef = useRef<Worker | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [ready, setReady] = useState<Ready | null>(null);
  const [telemetry, setTelemetry] = useState<Telemetry | null>(null);
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
    w.onmessage = (e: MessageEvent<FromWorker>) => {
      const m = e.data;
      if (m.type === "progress") setProgress({ label: m.label, received: m.received, total: m.total });
      else if (m.type === "ready") { setReady(m); setProgress(null); }
      else if (m.type === "telemetry") setTelemetry(m.data);
      else if (m.type === "error") setError(m.message);
    };
    w.postMessage({ type: "load", tier: 5 } satisfies ToWorker);
  }, []);

  useEffect(() => () => { workerRef.current?.terminate(); workerRef.current = null; }, []);

  // Start stepping as soon as the connectome is in memory.
  useEffect(() => {
    if (ready && !running) { send({ type: "run", running: true }); setRunning(true); }
     
  }, [ready]);

  const toggleRun = () => { send({ type: "run", running: !running }); setRunning(!running); };
  const pickAssay = (id: AssayName | null) => { setAssay(id); send({ type: "assay", name: id }); };
  const toggleLesion = (id: string) => {
    const next = lesion === id ? null : id;
    setLesion(next);
    send({ type: "lesion", population: next as never });
  };

  if (!started) return <StartCard onStart={boot} />;
  if (error) return <Panel title="Error">{error}</Panel>;
  if (!ready) return <Loading progress={progress} />;

  const r = telemetry?.rates;
  const verdict = telemetry?.assay;

  return (
    <div className="grid gap-5 lg:grid-cols-12">
      {/* Arena ------------------------------------------------------- */}
      <div className="lg:col-span-8">
        <div className="plate p-4">
          <div className="mb-3 flex items-center justify-between gap-4">
            <span className="plate-label">Fig. 1 — the room, 1200 × 800 mm</span>
            <span className="readout text-[0.65rem] text-bone-faint">
              {telemetry ? `t = ${(telemetry.simMs / 1000).toFixed(1)} s` : "—"}
            </span>
          </div>
          <Arena telemetry={telemetry ?? null} />

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button onClick={toggleRun} className="btn-primary">
              {running ? "Pause" : "Run"}
            </button>
            <button onClick={() => send({ type: "reset" })} className="btn">Reset</button>
            <button onClick={() => send({ type: "threat" })} className="btn">
              Swat at it
            </button>
            <div className="ml-auto flex flex-wrap gap-2">
              {LESIONS.map((l) => (
                <button
                  key={l.id}
                  onClick={() => toggleLesion(l.id)}
                  className={lesion === l.id ? "btn-danger" : "btn"}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Assays --------------------------------------------------- */}
        <div className="plate mt-5 p-5">
          <span className="plate-label">Fig. 2 — behavioural battery</span>
          <div className="mt-4 grid gap-2 sm:grid-cols-4">
            {ASSAYS.map((a) => (
              <button
                key={a.id}
                onClick={() => pickAssay(assay === a.id ? null : a.id)}
                className={`plate border p-3 text-left transition-colors ${
                  assay === a.id
                    ? "border-carmine text-bone"
                    : "border-rule text-bone-dim hover:border-rule-bright"
                }`}
              >
                <span className="readout text-xs">{a.name}</span>
                <span className="mt-1.5 block text-[0.7rem] leading-snug text-bone-faint">
                  {a.blurb}
                </span>
              </button>
            ))}
          </div>

          {verdict && (
            <div className="mt-5 border-t border-rule pt-5">
              <div className="flex flex-wrap items-baseline gap-3">
                <VerdictChip verdict={verdict.verdict} />
                <span className="readout text-xs text-bone-dim">{verdict.detail}</span>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-bone-faint">
                <span className="text-brass">Expected · </span>
                {verdict.expected}
              </p>
              <Trace series={verdict.series} labels={verdict.labels} />
            </div>
          )}
        </div>
      </div>

      {/* Instruments -------------------------------------------------- */}
      <div className="space-y-5 lg:col-span-4">
        <div className="plate p-5">
          <span className="plate-label">Fig. 3 — the machine</span>
          <dl className="mt-4 space-y-2.5">
            <Stat k="Neurons" v={ready.neurons.toLocaleString()} />
            <Stat k="Connections" v={ready.edges.toLocaleString()} />
            <Stat k="Load time" v={`${(ready.loadMs / 1000).toFixed(1)} s`} />
            <Stat
              k="Speed"
              v={telemetry ? `${telemetry.realtime.toFixed(2)}× real time` : "—"}
              hot={!!telemetry && telemetry.realtime > 0.8}
            />
            <Stat k="Mean rate" v={telemetry ? `${telemetry.meanHz.toFixed(2)} Hz` : "—"} />
            <Stat k="Integrating" v={telemetry ? telemetry.activeSet.toLocaleString() : "—"} />
          </dl>
        </div>

        <div className="plate p-5">
          <span className="plate-label">Fig. 4 — population rates</span>
          <div className="mt-4 space-y-2.5">
            <Bar label="Descending L" hz={r?.descendingL} max={30} />
            <Bar label="Descending R" hz={r?.descendingR} max={30} />
            <Bar label="T4 (motion ON)" hz={r?.t4} max={30} />
            <Bar label="T5 (motion OFF)" hz={r?.t5} max={30} />
            <Bar label="LPLC2 L (loom)" hz={r?.lplc2L} max={40} />
            <Bar label="LPLC2 R (loom)" hz={r?.lplc2R} max={40} />
            <Bar label="DNp01 Giant Fibre" hz={r?.giantFiber} max={20} accent />
          </div>
        </div>

        <div className="plate p-5">
          <span className="plate-label">Fig. 5 — ellipsoid body</span>
          <p className="mt-2 text-xs leading-relaxed text-bone-faint">
            Forty-six EPG cells arranged as a ring. A single bump here is the
            fly&rsquo;s sense of which way it is pointing.
          </p>
          <Bump values={telemetry?.epgBump ?? []} heading={telemetry?.fly.heading ?? 0} />
        </div>

        <div className="plate p-5">
          <span className="plate-label">Fig. 6 — wired populations</span>
          <dl className="mt-4 space-y-2">
            {Object.entries(ready.populations).map(([k, v]) => (
              <Stat key={k} k={k} v={v.toLocaleString()} />
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
}

/* ---- small parts -------------------------------------------------- */

function StartCard({ onStart }: { onStart: () => void }) {
  return (
    <div className="plate p-10 text-center">
      <p className="plate-label">Ready when you are</p>
      <h3 className="display mt-4 text-4xl text-bone">
        21.7 MB, then no server ever again
      </h3>
      <p className="mx-auto mt-4 max-w-lg text-sm leading-relaxed text-bone-dim">
        Starting the experiment downloads the whole connectome into this tab:
        163,997 neurons and 6,236,426 connections. Everything after that runs
        on your own machine.
      </p>
      <button onClick={onStart} className="btn-primary mt-7">
        Load the brain
      </button>
    </div>
  );
}

function Loading({ progress }: { progress: Progress | null }) {
  const pct = progress && progress.total
    ? Math.round((progress.received / progress.total) * 100)
    : 0;
  return (
    <div className="plate p-10">
      <p className="plate-label">Loading · {progress?.label ?? "starting"}</p>
      <div className="mt-5 h-px w-full bg-rule">
        <div
          className="h-px bg-carmine transition-[width] duration-200"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="readout mt-3 text-xs text-bone-faint">
        {progress && progress.total
          ? `${(progress.received / 1e6).toFixed(1)} / ${(progress.total / 1e6).toFixed(1)} MB`
          : "contacting static assets"}
      </p>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="plate p-8">
      <p className="plate-label">{title}</p>
      <p className="readout mt-3 text-sm text-carmine">{children}</p>
    </div>
  );
}

function Stat({ k, v, hot }: { k: string; v: string; hot?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs text-bone-faint">{k}</dt>
      <dd className={`readout text-sm ${hot ? "text-phosphor" : "text-bone"}`}>{v}</dd>
    </div>
  );
}

function Bar({ label, hz, max, accent }: { label: string; hz?: number; max: number; accent?: boolean }) {
  const v = hz ?? 0;
  const pct = Math.min(100, (v / max) * 100);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[0.7rem] text-bone-faint">{label}</span>
        <span className="readout text-[0.7rem] text-bone-dim">{v.toFixed(1)} Hz</span>
      </div>
      <div className="mt-1 h-1.5 w-full bg-ink">
        <div
          className={`h-1.5 transition-[width] duration-100 ${accent ? "bg-carmine" : "bg-phosphor"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function VerdictChip({ verdict }: { verdict: "running" | "pass" | "fail" }) {
  const map = {
    running: ["Collecting", "border-rule text-bone-faint"],
    pass: ["Matches the animal", "border-phosphor/50 text-phosphor"],
    fail: ["Does not match", "border-carmine/60 text-carmine"],
  } as const;
  const [label, cls] = map[verdict];
  return <span className={`plate-label border px-2 py-1 ${cls}`}>{label}</span>;
}

function Trace({ series, labels }: { series: { t: number; a: number; b: number }[]; labels: [string, string] }) {
  if (series.length < 2) return null;
  const w = 520, h = 90;
  const xs = series.map((s) => s.t);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const all = series.flatMap((s) => [s.a, s.b]);
  const y0 = Math.min(...all), y1 = Math.max(...all);
  const px = (t: number) => ((t - x0) / Math.max(1e-6, x1 - x0)) * w;
  const py = (v: number) => h - ((v - y0) / Math.max(1e-6, y1 - y0)) * h;
  const path = (key: "a" | "b") =>
    series.map((s, i) => `${i ? "L" : "M"}${px(s.t).toFixed(1)},${py(s[key]).toFixed(1)}`).join("");

  return (
    <figure className="mt-4">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label="assay trace">
        <path d={path("a")} fill="none" stroke="#c9a94e" strokeWidth="1.5" />
        <path d={path("b")} fill="none" stroke="#63e0b4" strokeWidth="1.5" />
      </svg>
      <figcaption className="readout mt-2 flex gap-5 text-[0.65rem] text-bone-faint">
        <span><i className="mr-1.5 inline-block h-px w-3 bg-brass align-middle" />{labels[0]}</span>
        <span><i className="mr-1.5 inline-block h-px w-3 bg-phosphor align-middle" />{labels[1]}</span>
      </figcaption>
    </figure>
  );
}

function Bump({ values, heading }: { values: number[]; heading: number }) {
  const R = 52, C = 68;
  return (
    <svg viewBox="0 0 136 136" className="mx-auto mt-4 w-40" role="img" aria-label="EPG activity ring">
      <circle cx={C} cy={C} r={R} fill="none" stroke="#2c3326" strokeWidth="1" />
      {values.map((v, i) => {
        const a = (i / Math.max(1, values.length)) * Math.PI * 2 - Math.PI / 2;
        const r1 = R - 12, r2 = R - 12 + v * 20;
        return (
          <line
            key={i}
            x1={C + Math.cos(a) * r1} y1={C + Math.sin(a) * r1}
            x2={C + Math.cos(a) * r2} y2={C + Math.sin(a) * r2}
            stroke="#63e0b4" strokeWidth="2.5" opacity={0.25 + v * 0.75}
          />
        );
      })}
      <line
        x1={C} y1={C}
        x2={C + Math.cos(heading - Math.PI / 2) * (R - 16)}
        y2={C + Math.sin(heading - Math.PI / 2) * (R - 16)}
        stroke="#d8402c" strokeWidth="1.5"
      />
      <circle cx={C} cy={C} r="2" fill="#d8402c" />
    </svg>
  );
}
