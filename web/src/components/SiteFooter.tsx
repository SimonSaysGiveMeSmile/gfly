export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-rule">
      <div className="mx-auto max-w-[1400px] px-6 py-10 lg:px-10">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-md">
            <p className="display text-2xl text-bone">GFly</p>
            <p className="mt-2 text-sm leading-relaxed text-bone-dim">
              Built on the MaleCNS v1.0 connectome, released under CC-BY 4.0 by
              Janelia Research Campus and Google Research. This site is an
              independent project and is not affiliated with either.
            </p>
          </div>

          <dl className="readout grid grid-cols-2 gap-x-10 gap-y-2 text-xs text-bone-faint">
            <dt>Dataset</dt>
            <dd className="text-bone-dim">
              <a
                className="hover:text-brass"
                href="https://male-cns.janelia.org/"
                target="_blank"
                rel="noreferrer"
              >
                male-cns.janelia.org
              </a>
            </dd>
            <dt>Neurons</dt>
            <dd className="text-bone-dim">163,997</dd>
            <dt>Connections</dt>
            <dd className="text-bone-dim">6,236,426</dd>
            <dt>Backend</dt>
            <dd className="text-bone-dim">none</dd>
          </dl>
        </div>
      </div>
    </footer>
  );
}
