# GFly

A field guide to the [MaleCNS v1.0 connectome](https://male-cns.janelia.org/) —
the complete central nervous system of a male *Drosophila melanogaster*,
released under CC-BY 4.0 by Janelia Research Campus and Google Research in
June 2026.

**Live:** https://gfly.site

The whole thing runs in the browser. 163,997 neurons and 6,236,426 connections
are compiled into 21.7 MB of static assets, decompressed in a worker, and
stepped as a leaky integrate-and-fire network at interactive speed. There is no
backend, no API key, and no inference server.

## Why this is not obvious

The published dataset is 0.5–13 GB of Apache Arrow, and the bucket serves no
CORS headers, so a page cannot fetch any of it directly. `tools/build_connectome.py`
does the reduction once, offline:

| Threshold | Connections | Synapses kept | Gzipped |
|-----------|-------------|---------------|---------|
| ≥1 synapse  | 25,568,639 | 124,039,080 (100%) | 84 MB |
| **≥5 synapses** | **6,236,426** | **89,737,406 (72%)** | **20.0 MB** |
| ≥10 synapses | 2,749,558 | 67,175,216 (54%) | 9.0 MB |

Five synapses is the standard cut for whole-brain models. Measured performance,
single thread, plain JavaScript:

| Graph | Timestep | Speed |
|-------|----------|-------|
| 6.2M edges | 1.0 ms | 0.95× real time |
| 2.7M edges | 1.0 ms | 1.11× real time |
| 6.2M edges, embodied loop | 1.0 ms | 0.40× real time |

## Structure

```
GFly/
├─ web/                     Next.js app → Vercel
│  ├─ src/lib/sim/          connectome loader + LIF kernel (shared)
│  ├─ src/experiments/      one self-contained module per plate
│  └─ public/connectome/    the compiled binaries
├─ tools/                   offline preprocessing
└─ docs/
```

Every use case is a **plate**: its own world, its own worker, its own claim, and
its own way of being wrong. Shared infrastructure lives in `src/lib/sim`, so a
new plate starts from a working brain. Add an entry to
`src/experiments/registry.ts` and it appears in the catalogue.

## Running it

```bash
cd web
pnpm install
pnpm dev
```

The connectome binaries are committed, so this works from a fresh clone. To
rebuild them from the source release:

```bash
# ~560 MB of downloads, one time
B=https://storage.googleapis.com/flyem-male-cns/v1.0/connectome-data/flat-connectome
mkdir -p /tmp/malecns && cd /tmp/malecns
curl -O $B/connectome-weights-male-cns-v1.0-minconf-0.5-significant-only.feather
curl -O $B/body-annotations-male-cns-v1.0-minconf-0.5.feather
curl -O $B/body-neurotransmitters-male-cns-v1.0.feather

cd -
python3 -m venv .venv && . .venv/bin/activate && pip install pyarrow numpy
python3 tools/build_connectome.py --src /tmp/malecns --out web/public/connectome
```

## Three things the raw connectome gets wrong

A wiring diagram gives you connections and synapse counts, not biophysics.
Three corrections were needed before the model produced anything fly-like:

1. **Inhibition needs something to subtract from.** With every neuron at rest,
   the ON channel of the visual system is dead — it works by *disinhibiting*
   Mi1. Every neuron gets a standing depolarisation just below threshold.
2. **Membranes have a floor.** Current-based inhibition accumulates without
   limit; the Giant Fibre (35,000 input synapses) settled at −300 mV and could
   not be fired by anything. Clamped at the chloride reversal, −75 mV.
3. **Synapse counts are not conductances.** In-degree spans three orders of
   magnitude. Each neuron's total input is rescaled toward the population mean.

Together these took the Giant Fibre from permanently silent to a clean
0 → 75 Hz ramp as a loom expands.

## Results so far — Plate I, The Baseline Room

| Assay | Outcome |
|-------|---------|
| Looming escape | **Holds.** Silent at rest; 0 → 75 Hz under an expanding object, crossing threshold ~660 ms before contact. Fired on 7/7 consecutive looms in-browser. |
| ON/OFF pathway split | **Holds.** Darkness drives Mi1 3.3 → 0.0 Hz and Tm1/Tm2 1.7 → 9.2 Hz. |
| Wall following | **Inconclusive.** Stays 12–21 mm from surfaces, but explores too little to separate preference from low mobility. |
| Optomotor response | **Fails.** Does not reverse turning when the drum reverses. The steering read-out — left/right asymmetry across all 1,304 descending neurons — is almost certainly too crude. |

## Credit

The data is the work of the FlyEM team at Janelia, the Google Research
connectomics group, and everyone who proofread the reconstruction. This project
is independent of both and speaks for neither. Dataset licensed CC-BY 4.0.
