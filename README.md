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
| Optomotor response | **Fails.** Does not reverse turning when the drum reverses; direction-selectivity index of every T4/T5 subtype is between −0.02 and +0.06, against ~0.5–0.9 in the animal. See below — it is the most informative result here. |

## Why the optomotor response fails

This took four refuted hypotheses to pin down, so it is worth stating plainly.

**The wiring is not the problem.** Measured across 6,707 T4 cells, the column
offset between the fast input arm (Mi1, Tm3) and the slow one (Mi9, Mi4, CT1)
is subtype-specific and opposed:

| Subtype | Offset (hex1, hex2) |
|---------|---------------------|
| T4a | (+0.07, −0.20) |
| T4b | (−0.10, +0.11) |
| T4c | (−0.36, −0.29) |
| T4d | (+0.23, +0.36) |

T4a opposes T4b, T4c opposes T4d, and pooled over all four the offset cancels
to 0.04 — exactly what a four-direction motion detector should look like. The
substrate for direction selectivity is in the data.

**The problem is that the ON channel cannot be carried by spikes.** L1 is
glutamatergic, so a bright scene must *release* Mi1 from inhibition rather than
drive it. In a spiking model a released cell can only rise as far as the
baseline supports — Mi1 spans **1.4 Hz** — whereas the OFF channel, a plain
excitatory chain through L2 and Tm2, spans **15 Hz**. With ten times less range,
T4 never exceeds 0.2 Hz and has nothing to compute with.

Everything tried, and its result:

| Attempted fix | Result |
|---|---|
| Lamina gain, 4 levels | T4 peaks at 0.43 Hz |
| Higher baseline, 5 levels | Worse — Mi1 range 1.39 → 0.60 Hz as the brain went 7 → 37 Hz |
| Explicit slow synaptic kinetics on delay-line cells | Peak DSI 0.10 |
| Spatial frequency, 24 → 3.6 columns/cycle | Peak DSI 0.08 |

In the animal none of these cells spike: L1, Mi1, T4 and T5 signal with graded
potentials, and a graded cell can be pushed below baseline as easily as above
it. That symmetry is precisely what the ON channel needs and what a rate-coded
spiking model cannot provide. It also explains the pattern of the whole
battery — the escape pathway is spiking and excitatory end to end, LPLC2 onto
DNp01, and it reproduces perfectly.

The honest conclusion: **a connectome plus uniform LIF dynamics reproduces
spiking, excitatory, spatial-summation circuits, and fails on graded ones.**
That is a statement about the model class, not about the data.

## Credit

The data is the work of the FlyEM team at Janelia, the Google Research
connectomics group, and everyone who proofread the reconstruction. This project
is independent of both and speaks for neither. Dataset licensed CC-BY 4.0.
