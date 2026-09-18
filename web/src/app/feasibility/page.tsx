import Link from "next/link";

export const metadata = {
  title: "How it works",
  description: "How a complete fly brain fits in a browser tab, with the numbers.",
};

const THRESHOLDS = [
  { t: "1+", edges: "25,568,639", pct: "100%", gz: "84 MB", ship: false },
  { t: "5+", edges: "6,236,426", pct: "72%", gz: "20 MB", ship: true },
  { t: "10+", edges: "2,749,558", pct: "54%", gz: "9 MB", ship: true },
  { t: "20+", edges: "1,060,450", pct: "36%", gz: "3.5 MB", ship: false },
];

const PERF = [
  { g: "6.2M connections", dt: "1 ms", rt: "0.95× real time", best: true },
  { g: "6.2M connections, with the room", dt: "1 ms", rt: "0.35× real time" },
  { g: "2.7M connections", dt: "1 ms", rt: "1.11× real time" },
];

export default function HowItWorks() {
  return (
    <article className="mx-auto h-full max-w-[900px] px-6 py-8 lg:px-10 flex flex-col overflow-y-auto">
      <h1 className="t-large">How it works</h1>
      <p className="t-body mt-4">Short version: the whole brain fits in a tab and runs at close to real time. Here is how.</p>

      <Section title="1. The data is too big to load directly">
        <p>The release is up to 13 GB of tables in a Google Cloud bucket, and the bucket does not allow web pages to read it. So the work is done once, offline, and the result is shipped as ordinary files.</p>
      </Section>

      <Section title="2. Keep the connections that matter">
        <p>A connection is a count of synapses between two neurons. Weak ones are many and unreliable. Keeping only connections with 5 or more synapses drops three quarters of the list and keeps nearly three quarters of the synapses.</p>
        <Table head={["Synapses", "Connections", "Of all synapses", "Size"]} rows={THRESHOLDS.map((t) => [
          <b key="a" className={t.ship ? "text-green" : ""}>{t.t}</b>, t.edges, t.pct, t.gz,
        ])} />
        <p>Stored compactly, the brain is 20 MB. The brain shape, the fly model and the neuron list add 5 MB. The browser unpacks it in about 130 ms.</p>
      </Section>

      <Section title="3. It runs fast enough">
        <p>Each neuron is a simple integrate-and-fire unit with the settings from the published whole-brain model. Only neurons that fire touch their connections, and only neurons that are doing something get updated. One thread, plain JavaScript.</p>
        <Table head={["Brain", "Time step", "Speed"]} rows={PERF.map((p) => [p.g, p.dt, <b key="s" className={p.best ? "text-green" : ""}>{p.rt}</b>])} />
      </Section>

      <Section title="4. Three things the raw data gets wrong">
        <p>The wiring gives you connections and synapse counts, not how neurons behave. Three fixes were needed before anything fly-like happened.</p>
        <ul className="list-disc space-y-3 pl-5">
          <li><b>Inhibition needs something to inhibit.</b> A silent brain cannot be turned down. Every neuron is given a small standing push, just below firing.</li>
          <li><b>Cells have a floor.</b> Without one, the most-connected neurons drifted to −300 mV, which no cell can do, and could never fire. They now stop at −75 mV.</li>
          <li><b>Synapse counts are not strength.</b> Some cells get 35,000 inputs, most get a few hundred. Each cell&rsquo;s input is scaled toward the average.</li>
        </ul>
      </Section>

      <Section title="5. What you give up">
        <p>Dropping weak connections loses 28% of synapses. Every synapse is the same strength per count, and every neuron the same type, which is not true in the animal. The time step is 1 ms rather than the 0.1 ms a careful study would use. For behaviour on the scale of a turn or a jump, that is fine.</p>
      </Section>

      <div className="glass mt-8 p-6">
        <h2 className="t-title">Does it act like a fly?</h2>
        <p className="t-body mt-2">That is what The Room tests.</p>
        <Link href="/lab/baseline-room" className="btn-primary mt-4 inline-block">Open The Room</Link>
      </div>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="t-title">{title}</h2>
      <div className="t-body mt-3 space-y-3 [&_b]:text-label">{children}</div>
    </section>
  );
}

function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="glass overflow-x-auto p-2">
      <table className="w-full min-w-[480px] text-[15px]">
        <thead><tr>{head.map((h, i) => <th key={i} className="t-cap px-3 py-2 text-left font-medium">{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => <td key={j} className="num px-3 py-2.5">{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
