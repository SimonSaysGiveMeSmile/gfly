import Link from "next/link";

export const metadata = {
  title: "About",
  description:
    "What GFly is, where the data comes from, and how to add a plate of your own.",
};

export default function About() {
  return (
    <article className="mx-auto max-w-[900px] px-6 py-16 lg:px-10">
      <p className="plate-label">Colophon</p>
      <h1 className="display mt-5 text-[clamp(2.5rem,7vw,5rem)] text-bone">
        A field guide, not a paper
      </h1>

      <div className="mt-10 space-y-6 text-[0.95rem] leading-relaxed text-bone-dim">
        <p>
          In June 2026 Janelia Research Campus and Google Research released
          MaleCNS v1.0: the complete central nervous system of a male{" "}
          <i>Drosophila melanogaster</i>, 166,000 neurons and 125 million
          synapses, reconstructed from electron microscopy and published under
          CC-BY 4.0. It is the largest connectome ever mapped by neuron count,
          and anyone can download all of it.
        </p>
        <p>
          Within days people had it playing Doom, walking around Minecraft and
          steering cars. That is a reasonable first reaction to a free brain.
          GFly is the slower second one: each plate here states something the
          wiring should be able to do, builds the smallest honest test of it,
          and reports whether it worked &mdash; including when it did not.
        </p>
        <p>
          Everything runs client-side. There is no API, no account, no
          inference server, and nothing about your session leaves your machine.
          That is a deliberate constraint rather than a boast: a demonstration
          you can open, fork and disprove is worth more than one that needs
          somebody&rsquo;s GPU budget to stay alive.{" "}
          <Link href="/feasibility" className="text-brass underline decoration-rule underline-offset-4">
            The measurements are here.
          </Link>
        </p>

        <h2 className="display pt-6 text-3xl text-bone">Adding a plate</h2>
        <p>
          Every use case is a self-contained module under{" "}
          <code className="readout text-brass">src/experiments/</code> with its
          own world, its own worker and its own claim. The connectome loader,
          the simulation kernel and the population lookups are shared, so a new
          plate starts from a working brain and only has to describe the
          experiment. Add an entry to the registry and it appears in the
          catalogue.
        </p>

        <h2 className="display pt-6 text-3xl text-bone">Credit and standing</h2>
        <p>
          The data is the work of the FlyEM team at Janelia, the Google
          Research connectomics group, and the many people who proofread it.
          This site is independent of both and speaks for neither. Where a
          plate checks itself against published results, the paper is cited on
          the plate. Where it is guessing, it says so.
        </p>
      </div>

      <div className="mt-12 flex flex-wrap gap-3 border-t border-rule pt-8">
        <a href="https://male-cns.janelia.org/" target="_blank" rel="noreferrer" className="btn">
          The dataset
        </a>
        <a href="https://github.com/gfly-site/gfly" target="_blank" rel="noreferrer" className="btn">
          Source
        </a>
        <Link href="/" className="btn">The catalogue</Link>
      </div>
    </article>
  );
}
