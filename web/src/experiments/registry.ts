import type { Product } from "./types";

export const PRODUCTS: Product[] = [
  {
    slug: "baseline-room",
    number: "01",
    title: "The Room",
    tagline: "Put the brain in a room and see if it acts like a fly.",
    summary:
      "A small room with walls, a window, some furniture and a threat. The real connectome drives a body through it. No training, no scripted behaviour, no hand-written controller.",
    status: "live",
    claim:
      "The wiring alone should produce four known fly behaviours. Two do. One is unclear. One does not, and the page says why.",
    circuits: ["Eyes", "Motion cells", "Loom cells", "Giant Fiber", "Compass", "Steering neurons"],
    learning: "innate",
    references: [
      { label: "Shiu et al. 2024 — a whole-brain fly model", href: "https://www.nature.com/articles/s41586-024-07763-9" },
      { label: "Klapoetke et al. 2017 — how the fly sees things coming", href: "https://www.nature.com/articles/nature24626" },
      { label: "Seelig & Jayaraman 2015 — the fly's compass", href: "https://www.nature.com/articles/nature14446" },
    ],
  },
  {
    slug: "mahjong-lobby",
    number: "02",
    title: "Mahjong",
    tagline: "Teach the fly a game and let it play real people.",
    summary:
      "An online mahjong table where one seat is a fruit fly. Nothing in a fly's evolution prepared it for tile games, so the connections have to change. The place to do that is the mushroom body, the fly's real learning centre.",
    status: "planned",
    claim: "The mushroom body's 4,064 learning cells can pick up a playable strategy from wins and losses.",
    circuits: ["Mushroom body", "Reward neurons", "Steering neurons"],
    learning: "plastic",
  },
  {
    slug: "compass-bench",
    number: "03",
    title: "The Compass",
    tagline: "Watch 46 neurons hold a heading in the dark.",
    summary:
      "The fly has a ring of 46 cells that carries one bump of activity pointing the way it faces. Turn the world and the bump follows. Turn off the lights and it keeps going on its own.",
    status: "planned",
    claim: "The compass ring holds one stable bump and tracks turning without any visual input.",
    circuits: ["Compass ring", "Turn cells"],
    learning: "innate",
  },
  {
    slug: "odour-plume",
    number: "04",
    title: "The Smell",
    tagline: "Fifty-three kinds of smell receptor, one meal to find.",
    summary:
      "Real flies find fruit by zig-zagging across a plume of scent. The whole smell system is wired here, so the search strategy should appear on its own.",
    status: "planned",
    claim: "The smell circuits produce zig-zag plume tracking without a programmed search.",
    circuits: ["Smell receptors", "Antennal lobe", "Lateral horn"],
    learning: "innate",
  },
  {
    slug: "lesion-studio",
    number: "05",
    title: "Lesions",
    tagline: "Switch off any cell type. See what breaks.",
    summary:
      "Silence a group of neurons, run the same tests, and measure what changes. Cut the Giant Fiber and the escape should slow down, not vanish. Cut the motion cells and the fly should stop turning with the world but keep walking.",
    status: "planned",
    claim: "Switching off cell types in the model matches what happens when they are switched off in real flies.",
    circuits: ["Any of 11,852 cell types"],
    learning: "innate",
  },
  {
    slug: "silicon-retina",
    number: "06",
    title: "The Retina",
    tagline: "Point the fly's motion detector at your webcam.",
    summary:
      "The fly has 13,580 tiny motion detectors that work with no training. Take that part of the brain out, feed it video, and use it as a motion sensor.",
    status: "planned",
    claim: "The fly's motion circuit computes usable optical flow on real video.",
    circuits: ["Eyes", "Lamina", "Motion cells"],
    learning: "innate",
  },
  {
    slug: "atlas",
    number: "07",
    title: "The Atlas",
    tagline: "Every neuron, and the shortest path between any two.",
    summary:
      "A 3D map of all 139,000 cell bodies. Pick two neurons and get the chain of cells that connects them, with the number of synapses at each step.",
    status: "building",
    claim: "Whole-brain path queries answered in the browser, with no server.",
    circuits: ["All 163,997 neurons"],
    learning: "innate",
  },
];

export const PRODUCT_BY_SLUG = new Map(PRODUCTS.map((p) => [p.slug, p]));
