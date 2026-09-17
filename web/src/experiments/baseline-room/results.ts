/**
 * What happened when the tests were run. Measured with the same code the page
 * runs. The failures are listed as plainly as the successes.
 */
export interface Finding {
  title: string;
  outcome: "holds" | "partial" | "fails";
  measured: string;
  reading: string;
}

export const FINDINGS: Finding[] = [
  {
    title: "Dodging an object",
    outcome: "holds",
    measured:
      "With nothing coming, the Giant Fiber is silent. As a dark object grows, it goes from 0 to 75 spikes per second, about 660 ms before contact. In the browser it fired on 7 of 7 tries and the fly jumped each time.",
    reading: "The escape circuit works, and it only fires for the right reason.",
  },
  {
    title: "Telling light from dark",
    outcome: "holds",
    measured: "Darkness turns the ON cells down to 0 and the OFF cells up to 9 spikes per second.",
    reading:
      "The ON and OFF channels separate the way they do in the animal. This only works once you know the first cell in the ON path is inhibitory: brightness has to release it, not push it.",
  },
  {
    title: "Walking along walls",
    outcome: "partial",
    measured: "The fly stays 12 to 21 mm from the nearest surface in a room 800 mm across.",
    reading:
      "Real flies hug walls too. But this fly also barely explores, and a fly that hardly moves will sit near a wall whether it likes walls or not. Not counted as a pass.",
  },
  {
    title: "Following moving stripes",
    outcome: "fails",
    measured:
      "Spin the stripes one way and the fly turns at −0.04 rad/s. Spin them the other way and it turns at −0.12 rad/s. Same direction both times. Its motion cells are barely direction-selective: a score of 0.06 where a real fly scores 0.5 to 0.9.",
    reading: "The fly does not follow the stripes. The reason is below.",
  },
  {
    title: "Why the stripes test fails",
    outcome: "fails",
    measured:
      "The wiring is right. Across 6,707 motion cells, the fast inputs and the slow inputs sit in different columns, and the four cell types are offset in four opposite directions, exactly like a motion detector should be. Five fixes were tried: input gain, background level, slow synapses, stripe spacing, and graded instead of spiking cells. None got the score above 0.10.",
    reading:
      "Then the circuit was rebuilt from the same wiring with one change: inhibition divides the signal instead of subtracting from it. The score went from 0.09 to 0.52, in the real fly's range, with all four directions correct. The wiring diagram holds the connections. It does not hold the arithmetic. Circuits that add up their inputs work from wiring alone. Circuits that divide do not, until you add the division.",
  },
];
