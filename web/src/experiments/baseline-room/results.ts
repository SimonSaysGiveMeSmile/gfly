/**
 * What actually happened when the battery was run, recorded honestly.
 *
 * These are findings from the headless harness against the same code the page
 * runs, not aspirations. A plate that only reported its successes would not be
 * worth publishing.
 */

export interface Finding {
  /** Heading on the card. Not always literally an assay - the last entry is a
   *  post-mortem on the one that failed, which is the most useful thing here. */
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
      "Rotating the surround at +1.6 rad/s gives a mean turn of -0.038 rad/s; reversing it to -1.6 rad/s gives -0.120 rad/s. Both are negative, so the fly does not reverse its turning when the stimulus reverses. Presenting a drifting grating directly to the retinotopic columns, the direction-selectivity index of every T4 and T5 subtype sits between -0.02 and +0.06, against roughly 0.5-0.9 in the animal.",
    reading:
      "The fly does not follow the drum, and the cause is neither the wiring nor the read-out. It is that a spiking model cannot carry the ON channel. See the note below - this is the most informative failure in the battery.",
  },
  {
    assay: "Why the optomotor response fails",
    outcome: "fails",
    measured:
      "The substrate is present in the data: measured across 6,707 T4 cells, the column offset between the fast input arm (Mi1, Tm3) and the slow one (Mi9, Mi4, CT1) is subtype-specific and opposed - T4a (+0.07, -0.20) against T4b (-0.10, +0.11), T4c (-0.36, -0.29) against T4d (+0.23, +0.36). Pooled over all four it cancels to 0.04, which is exactly what a four-direction detector should do. But T4 fires at 0.03-0.20 Hz however it is driven, while T5 on the OFF side reaches 4-7 Hz.",
    reading:
      "The ON channel works by disinhibition: L1 is glutamatergic, so a bright scene has to RELEASE Mi1 rather than drive it. In a spiking model a released cell can only rise as far as the baseline supports - Mi1 spans 1.4 Hz - while the OFF channel, a plain excitatory chain through L2 and Tm2, spans 15 Hz. Ten times less range, and T4 never fires enough to compute anything. Four fixes were tried and all failed: coarser and finer lamina gain (four levels), higher baseline (five levels, which made it worse - Mi1's range fell from 1.39 to 0.60 Hz as the brain went from 7 to 37 Hz), explicit slow synaptic kinetics on the delay-line cells (two time constants), and spatial frequencies from 24 down to 3.6 columns per cycle. In the animal none of these cells spike at all: L1, Mi1, T4 and T5 signal with graded potentials, and a graded cell can be pushed below its baseline as easily as above it. That symmetry is what the ON channel needs and what a rate-coded spiking model cannot provide. It also explains the pattern of the whole battery - the escape pathway is spiking and excitatory end to end, LPLC2 onto DNp01, and it reproduces perfectly.",
  },
];
