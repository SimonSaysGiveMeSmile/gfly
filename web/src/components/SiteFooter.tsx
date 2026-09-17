export function SiteFooter() {
  return (
    <footer className="mx-auto w-full max-w-[1400px] px-6 py-12 lg:px-10">
      <div className="t-foot flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p>
          Data: MaleCNS v1.0, Janelia Research Campus and Google Research, CC-BY 4.0.
          Fly model: flybody, Google DeepMind and HHMI Janelia, Apache-2.0.
        </p>
        <p>Independent project. Not affiliated with Janelia or Google.</p>
      </div>
    </footer>
  );
}
