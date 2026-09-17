import type { Product } from "./types";

/**
 * The catalogue. Order is the order they appear on the index page, and the
 * plate numbers are stable once published - they get cited.
 */
export const PRODUCTS: Product[] = [
  {
    slug: "baseline-room",
    plate: "I",
    title: "The Baseline Room",
    tagline: "Put the brain in a room and see whether it behaves like a fly.",
    summary:
      "An indoor arena with walls, a window, a lamp and a moving threat. The connectome drives a body through it with nothing added: no training, no scripted behaviour, no hand-written controller. Either the wiring produces a fly or it does not.",
    status: "live",
    claim:
      "The wiring diagram alone should reproduce four measured Drosophila behaviours. Two of them survive contact with the model, one is ambiguous, and one fails outright - which is the result, not a bug in the write-up.",
    circuits: ["R1-R6", "L1-L5", "T4/T5", "LPLC2", "DNp01", "EPG", "descending neurons"],
    learning: "innate",
    references: [
      {
        label: "Shiu et al. 2024 — a Drosophila computational brain model",
        href: "https://www.nature.com/articles/s41586-024-07763-9",
      },
      {
        label: "Klapoetke et al. 2017 — LPLC2 loom detection",
        href: "https://www.nature.com/articles/nature24626",
      },
      {
        label: "Seelig & Jayaraman 2015 — the heading compass",
        href: "https://www.nature.com/articles/nature14446",
      },
    ],
  },
  {
    slug: "mahjong-lobby",
    plate: "II",
    title: "The Mahjong Lobby",
    tagline: "Teach the fly a game no fly has ever played, against real people.",
    summary:
      "An online mahjong table where one seat is a fruit fly. Nothing in 400 million years of insect evolution prepared this brain for tile games, so the wiring cannot supply the answer - the synapses have to change. The honest place to put that change is the mushroom body, which is the fly's actual reinforcement-learning organ.",
    status: "planned",
    claim:
      "A 4,064-cell Kenyon-cell layer with reward-gated KC to MBON plasticity can learn a discard policy well enough to play a real hand.",
    circuits: ["KC (4,064)", "MBON (97)", "PAM/PPL1 dopaminergic", "descending neurons"],
    learning: "plastic",
  },
  {
    slug: "compass-bench",
    plate: "III",
    title: "The Compass Bench",
    tagline: "Watch a ring attractor hold a heading in the dark.",
    summary:
      "Forty-six EPG neurons in the ellipsoid body carry a single bump of activity that tracks which way the fly is pointing. Rotate the world and the bump follows; turn the lights off and it keeps going on self-motion alone. This is dead reckoning, in a circuit small enough to watch neuron by neuron.",
    status: "planned",
    claim:
      "The EPG/PEN loop sustains a single activity bump and integrates turning velocity without visual input.",
    circuits: ["EPG (46)", "PEN_a/PEN_b (42)", "PEG", "Delta7"],
    learning: "innate",
  },
  {
    slug: "odour-plume",
    plate: "IV",
    title: "The Odour Plume",
    tagline: "Fifty-three receptor channels, one meal to find.",
    summary:
      "Real flies find fruit by casting across a turbulent plume, surging upwind on contact and casting again when they lose it. The antennal lobe and lateral horn are fully wired here, so the strategy should emerge rather than be programmed.",
    status: "planned",
    claim:
      "ORN to projection-neuron to lateral-horn wiring produces cast-and-surge plume tracking without a search heuristic.",
    circuits: ["ORN (53 types)", "antennal lobe PNs", "lateral horn", "MB calyx"],
    learning: "innate",
  },
  {
    slug: "lesion-studio",
    plate: "V",
    title: "The Lesion Studio",
    tagline: "Delete any cell type. Find out what it was for.",
    summary:
      "The experiment a connectome makes cheap: silence a population, rerun the same behavioural battery, and measure exactly what breaks. Cut the Giant Fiber and escape should get slower, not vanish. Cut T4 and the fly should stop turning with the world but keep walking.",
    status: "planned",
    claim:
      "In-silico ablation reproduces the behavioural deficits reported from genetic silencing experiments.",
    circuits: ["any of 11,852 annotated cell types"],
    learning: "innate",
  },
  {
    slug: "silicon-retina",
    plate: "VI",
    title: "The Silicon Retina",
    tagline: "Borrow the fly's motion detector and point it at your webcam.",
    summary:
      "T4 and T5 are 13,580 elementary motion detectors that solved optical flow long before anyone wrote a paper about it. Lift that subcircuit out of the brain, feed it any video, and use it as a motion estimator that costs no training data at all.",
    status: "planned",
    claim:
      "The extracted T4/T5 subnetwork computes a dense optical-flow field competitive with classical estimators on natural video.",
    circuits: ["R1-R6", "L1-L5", "Mi1/Tm3", "T4a-d", "T5a-d"],
    learning: "innate",
  },
  {
    slug: "atlas",
    plate: "VII",
    title: "The Atlas",
    tagline: "139,000 cell bodies, and the shortest path between any two.",
    summary:
      "A spatial browser over every soma in the volume, with connectivity queries on top: pick two neurons and get the actual chain of cells that links them, hop by hop, with synapse counts on every step.",
    status: "building",
    claim:
      "Whole-brain spatial and path queries answered client-side, with no backend and no API key.",
    circuits: ["all 163,997 neurons in the graph"],
    learning: "innate",
  },
];

export const PRODUCT_BY_SLUG = new Map(PRODUCTS.map((p) => [p.slug, p]));
