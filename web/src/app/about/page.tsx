import Link from "next/link";

export const metadata = { title: "About", description: "What GFly is and where the data comes from." };

export default function About() {
  return (
    <article className="mx-auto h-full max-w-[900px] px-6 py-8 lg:px-10 flex flex-col overflow-y-auto">
      <h1 className="t-large">About</h1>
      <div className="t-body mt-4 space-y-4">
        <p>
          In 2026, Janelia Research Campus and Google Research released the complete nervous system of a male fruit fly: 166,000 neurons and 125 million synapses, mapped from electron microscope images and free for anyone to use.
        </p>
        <p>
          Within days people had it playing Doom and steering cars. GFly is the slower second look. Each experiment says what the wiring should be able to do, tests it, and reports what happened, including when it did not work.
        </p>
        <p>
          Everything runs on your device. There is no server, no account, and nothing leaves your machine.{" "}
          <Link href="/feasibility" className="text-blue">Here is how.</Link>
        </p>

        <h2 className="t-title pt-3 text-label">What is real here</h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>The neurons, their positions and their connections are the released data.</li>
          <li>The brain shape is Janelia&rsquo;s own outline of the brain and nerve cord.</li>
          <li>The fly body is the flybody model from Google DeepMind and HHMI Janelia.</li>
          <li>The room, the lighting and the eye simulation are ours.</li>
        </ul>

        <h2 className="t-title pt-3 text-label">Adding an experiment</h2>
        <p>
          Each experiment is a folder under <code className="text-label">src/experiments/</code> with its own world, its own worker and its own claim. The brain loader and simulator are shared. Add it to the registry and it appears on the front page.
        </p>

        <h2 className="t-title pt-3 text-label">Credit</h2>
        <p>
          Data: the FlyEM team at Janelia and the Google Research connectomics group, CC-BY 4.0. Fly model: flybody, Apache-2.0. The live brain panels take their layout from Haltere by Artem Skulimovskiy, MIT. This site is independent of all of them.
        </p>
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        <a href="https://male-cns.janelia.org/" target="_blank" rel="noreferrer" className="btn">The dataset</a>
        <a href="https://github.com/TuragaLab/flybody" target="_blank" rel="noreferrer" className="btn">flybody</a>
        <a href="https://github.com/SimonSaysGiveMeSmile/gfly" target="_blank" rel="noreferrer" className="btn">GitHub</a>
      </div>
    </article>
  );
}
