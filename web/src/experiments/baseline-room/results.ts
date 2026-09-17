/**
 * What actually happened when the battery was run, recorded honestly.
 *
 * These are findings from the headless harness against the same code the page
 * runs, not aspirations. A plate that only reported its successes would not be
 * worth publishing.
 */

export interface Finding {
  assay: string;
  outcome: "holds" | "partial" | "fails";
  measured: string;
  reading: string;
}

export const FINDINGS: Finding[] = [
  {
    assay: "Looming escape",
    outcome: "holds",
    measured:
      "The Giant Fibre is silent with no threat present (0.0-0.1 Hz). Under an expanding dark object it rises 0 → 2.5 → 5 → 32 → 75 Hz as the object grows, first crossing threshold about 660 ms before contact. Run live in a browser, it fired on 7 of 7 consecutive looms and the body committed to an escape each time.",
    reading:
      "The LPLC2 → DNp01 escape pathway works, and it is stimulus-specific rather than simply excitable. This is the clearest success in the battery.",
  },
  {
    assay: "ON/OFF pathway split",
    outcome: "holds",
    measured:
      "Driving the lamina with darkness suppresses Mi1 from 3.3 Hz to 0.0 Hz and drives Tm1/Tm2 from 1.7 Hz up to 9.2 Hz.",
    reading:
      "The ON and OFF channels separate correctly, and they do it for the right reason: L1 is glutamatergic and therefore inhibitory, so the ON channel is carried by disinhibition. Driving L1 with brightness instead - the intuitive reading - silences the ON channel entirely.",
  },
  {
    assay: "Wall following",
    outcome: "partial",
    measured:
      "The fly stays 12-21 mm from the nearest surface in an arena whose half-width is 400 mm.",
    reading:
      "Real walking flies do hug walls, so the number points the right way. But the fly also explores very little, and a fly that barely moves will sit near a wall whether or not it prefers one. The assay cannot currently separate wall-following from low mobility, so this is not counted as a success.",
  },
  {
    assay: "Optomotor response",
    outcome: "fails",
    measured:
      "Rotating the surround at +1.6 rad/s gives a mean turn of -0.038 rad/s; reversing it to -1.6 rad/s gives -0.120 rad/s. Both are negative, so the fly does not reverse its turning when the stimulus reverses.",
    reading:
      "The fly does not follow the drum. T4 and T5 are wired and do respond, but the direction-selective signal is not reaching the steering read-out with the right sign. The likeliest cause is the read-out itself: steering is taken as a left-right asymmetry across all 1,304 descending neurons, which is far cruder than the handful of cells that actually steer a fly.",
  },
];
