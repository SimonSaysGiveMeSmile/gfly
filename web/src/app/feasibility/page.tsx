import Link from "next/link";

export const metadata = {
  title: "Can a whole fly brain run in a browser?",
  description:
    "Measured answer: yes. 163,997 neurons and 6.2 million connections at 0.95x real time in one worker thread, from 21.7 MB of static assets.",
};

const SIZES = [
  { file: "syn-points", what: "Every synapse, with coordinates", size: "13.1 GB", verdict: "no" },
  { file: "syn-partners", what: "Synapse-level partner table", size: "6.8 GB", verdict: "no" },
  { file: "body-stats", what: "Per-neuron statistics", size: "778 MB", verdict: "no" },
  { file: "connectome-weights", what: "Connection weights, significant only", size: "502 MB", verdict: "source" },
  { file: "body-annotations", what: "Cell types, soma positions, columns", size: "14 MB", verdict: "source" },
];

const THRESHOLDS = [
  { t: "≥1", edges: "25,568,639", syn: "124,039,080", pct: "100%", gz: "84 MB", ship: false },
  { t: "≥2", edges: "15,273,176", syn: "113,743,617", pct: "92%", gz: "50 MB", ship: false },
  { t: "≥5", edges: "6,236,426", syn: "89,737,406", pct: "72%", gz: "20.0 MB", ship: true },
  { t: "≥10", edges: "2,749,558", syn: "67,175,216", pct: "54%", gz: "9.0 MB", ship: true },
  { t: "≥20", edges: "1,060,450", syn: "44,729,169", pct: "36%", gz: "3.5 MB", ship: false },
];

const PERF = [
  { tier: "6.2M edges", dt: "0.5 ms", rt: "0.57×", hz: "1.41" },
  { tier: "6.2M edges", dt: "1.0 ms", rt: "0.95×", hz: "1.21", best: true },
  { tier: "6.2M edges", dt: "2.0 ms", rt: "1.57×", hz: "2.86" },
  { tier: "2.7M edges", dt: "1.0 ms", rt: "1.11×", hz: "3.43" },
  { tier: "2.7M edges", dt: "2.0 ms", rt: "2.31×", hz: "2.54" },
];

export default function Feasibility() {
  return (
    <article className="mx-auto max-w-[1000px] px-6 py-16 lg:px-10">
      <p className="plate-label">Note I</p>
      <h1 className="display mt-5 text-[clamp(2.5rem,7vw,5.5rem)] text-bone">
        Can the whole thing
        <br />
        run in a browser?
      </h1>

      <p className="readout mt-8 text-2xl text-phosphor">Yes. Measured, not estimated.</p>

      <p className="mt-6 max-w-2xl text-lg leading-relaxed text-bone-dim">
        The question that decides every other question on this site. If the
        connectome only runs on a workstation, GFly is a gallery of videos. If
        it runs in a tab, every visitor gets their own fly. It runs in a tab.
      </p>

      {/* ---- 1. The obstacle ---------------------------------------- */}
      <Section n="1" title="Two things stop you doing this naively">
        <p>
          The MaleCNS release is published as Apache Arrow tables in a public
          Google Cloud bucket. The useful ones are enormous, and the bucket
          sends no <code className="readout text-brass">access-control-allow-origin</code>{" "}
          header at all, so a web page cannot fetch any of it directly &mdash;
          not even the small files. Both problems have the same fix: do the
          work once, offline, and ship the result as ordinary static assets.
        </p>
        <Table
          head={["File", "Contents", "Size", ""]}
          rows={SIZES.map((s) => [
            <span key="f" className="readout text-bone-dim">{s.file}</span>,
            s.what,
            <span key="s" className="readout">{s.size}</span>,
            s.verdict === "source"
              ? <span key="v" className="readout text-phosphor">used</span>
              : <span key="v" className="readout text-bone-faint">too large</span>,
          ])}
        />
      </Section>

      {/* ---- 2. Compression ------------------------------------------ */}
      <Section n="2" title="6.2 million connections, 20 MB">
        <p>
          A connection in this dataset is a count of synapses between two
          neurons. Weak connections are both numerous and unreliable, so
          whole-brain models threshold them; the standard cut is five synapses.
          That one decision throws away three quarters of the edges while
          keeping nearly three quarters of the actual synaptic weight.
        </p>
        <Table
          head={["Threshold", "Connections", "Synapses kept", "of total", "Gzipped"]}
          rows={THRESHOLDS.map((t) => [
            <span key="t" className={`readout ${t.ship ? "text-phosphor" : "text-bone-dim"}`}>{t.t}</span>,
            <span key="e" className="readout">{t.edges}</span>,
            <span key="s" className="readout text-bone-dim">{t.syn}</span>,
            <span key="p" className="readout text-bone-dim">{t.pct}</span>,
            <span key="g" className={`readout ${t.ship ? "text-bone" : "text-bone-faint"}`}>{t.gz}</span>,
          ])}
        />
        <p>
          Stored as a sparse adjacency structure &mdash; 32-bit targets, 16-bit
          synapse counts, one offset per neuron &mdash; the whole brain is
          20.0&nbsp;MB gzipped. Neuron metadata adds 1.7&nbsp;MB. The page
          decompresses both with the browser&rsquo;s own{" "}
          <code className="readout text-brass">DecompressionStream</code> and
          maps every array as a zero-copy view, which takes about 130&nbsp;ms.
        </p>
      </Section>

      {/* ---- 3. Speed ------------------------------------------------- */}
      <Section n="3" title="And it keeps up with the animal">
        <p>
          The model is leaky integrate-and-fire with the parameters from Shiu
          et&nbsp;al.&nbsp;2024. Two things make it fast enough. Propagation is
          event-driven, so only neurons that actually fired walk their edge
          list. And integration is restricted to an active set, because a
          neuron resting at its equilibrium with no input has no dynamics worth
          computing &mdash; without that, the sweep over 164,000 neurons alone
          costs 0.6&nbsp;ms per step and caps the simulation below real time no
          matter how quiet the brain is.
        </p>
        <Table
          head={["Graph", "Timestep", "Speed", "Mean rate"]}
          rows={PERF.map((p) => [
            <span key="a" className="readout text-bone-dim">{p.tier}</span>,
            <span key="b" className="readout">{p.dt}</span>,
            <span key="c" className={`readout ${p.best ? "text-phosphor" : ""}`}>{p.rt} real time</span>,
            <span key="d" className="readout text-bone-dim">{p.hz} Hz</span>,
          ])}
        />
        <p>
          Single thread, plain JavaScript, no WebGPU and no WASM. A fly brain at
          rest fires at a few hertz on average, and the model lands there on its
          own at the published synaptic gain &mdash; which is the first sign
          that the numbers are being used correctly rather than merely quickly.
        </p>
        <p>
          Those figures are the brain stepping on its own. The embodied loop in
          Plate&nbsp;I is slower, at <span className="readout text-bone">0.40&times; real time</span>,
          for a specific reason: it holds every neuron slightly depolarised so
          that inhibition has something to act on, which puts all 164,000 of
          them in the sweep on every step instead of only the ones with
          something happening. That is a modelling choice rather than a browser
          limit, and it is the single place where more speed is available if a
          plate needs it.
        </p>
      </Section>

      {/* ---- 4. What it costs --------------------------------------- */}
      <Section n="4" title="Three things the raw model gets wrong">
        <p>
          A connectome gives you wiring and synapse counts. It does not give you
          biophysics, and the gap shows up fast. Three corrections were needed
          before the model produced anything fly-like, and all three are
          physiological rather than cosmetic.
        </p>
        <p>
          <span className="text-brass">Inhibition needs something to subtract from.</span>{" "}
          A silent brain cannot be inhibited, and roughly a third of this one is
          inhibitory. With every neuron at rest the entire ON channel of the
          visual system is dead, because it works by disinhibiting Mi1. Giving
          every neuron a standing depolarisation just below threshold fixes it.
        </p>
        <p>
          <span className="text-brass">Membranes have a floor.</span> A
          current-based model lets inhibition accumulate without limit. The
          Giant Fibre, which receives 35,000 input synapses, settled at{" "}
          <span className="readout">-300 mV</span> &mdash; not a potential any
          cell can reach &mdash; and could not be fired by anything. Clamping at
          the chloride reversal potential of -75 mV is both correct and
          necessary.
        </p>
        <p>
          <span className="text-brass">Synapse counts are not conductances.</span>{" "}
          In-degree spans three orders of magnitude across this dataset. Feeding
          raw counts in as current means high in-degree cells drown; real
          neurons normalise their total drive. Rescaling each neuron&rsquo;s
          input toward the population mean is what finally made the escape
          circuit work, taking the Giant Fibre from permanently silent to a
          clean 0 → 75 Hz ramp as a loom expands.
        </p>
      </Section>

      <Section n="5" title="What you give up">
        <p>
          Thresholding at five synapses discards 28% of the synaptic weight, and
          weak connections are not nothing &mdash; a neuron with a thousand weak
          inputs really does hear them. The dataset also gives synapse counts,
          not conductances, so a single global scale factor stands in for every
          difference in synaptic strength. Neuron biophysics are uniform when
          real ones are not. Neuromodulation is absent entirely.
        </p>
        <p>
          None of that is hidden by running in a browser; it would be just as
          true on a cluster. What the browser costs you specifically is
          precision in the timestep: 1&nbsp;ms rather than the 0.1&nbsp;ms a
          careful offline study would use. For behaviour on the scale of a
          turn or an escape, that is well inside the margin.
        </p>
      </Section>

      <div className="mt-16 border-t border-rule pt-10">
        <p className="plate-label">Next</p>
        <h2 className="display mt-3 text-4xl text-bone">
          So: does the wiring behave like a fly?
        </h2>
        <p className="mt-4 max-w-xl text-bone-dim">
          That is Plate&nbsp;I. A room, a body, no training, and four
          measurements that either match the animal or do not.
        </p>
        <Link href="/lab/baseline-room" className="btn-primary mt-7 inline-block">
          Open the Baseline Room
        </Link>
      </div>
    </article>
  );
}

function Section({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section className="mt-16 border-t border-rule pt-10">
      <div className="flex gap-5">
        <span className="display shrink-0 text-4xl text-carmine">{n}</span>
        <div className="min-w-0 flex-1">
          <h2 className="display text-3xl text-bone">{title}</h2>
          <div className="mt-5 space-y-5 text-[0.95rem] leading-relaxed text-bone-dim [&_p]:max-w-2xl">
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}

function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="-mx-1 overflow-x-auto">
      <table className="w-full min-w-[540px] border-collapse text-sm">
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={i} className="plate-label border-b border-rule px-1 py-2.5 text-left font-normal">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-rule/50">
              {r.map((c, j) => (
                <td key={j} className="px-1 py-2.5 align-top text-bone-dim">{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
