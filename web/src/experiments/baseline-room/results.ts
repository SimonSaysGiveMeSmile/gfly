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
      "The substrate is in the data. Measured across 6,707 T4 cells, the column offset between the fast input arm (Mi1, Tm3) and the slow one (Mi9, Mi4, CT1) is subtype-specific and opposed: T4a (+0.07, -0.20) against T4b (-0.10, +0.11), T4c (-0.36, -0.29) against T4d (+0.23, +0.36). Pooled over all four it cancels to 0.04, exactly as a four-direction detector should. Yet the whole-brain model gives every T4 and T5 subtype a direction-selectivity index between -0.02 and +0.06, against roughly 0.5-0.9 in the animal.",
    reading:
      "Five explanations were tried and four were wrong, which is worth recording because each one sounded right. Lamina gain across four levels: T4 peaks at 0.43 Hz. A higher baseline across five levels: worse, not better - Mi1's dynamic range fell from 1.39 to 0.60 Hz as the brain went from 7 to 37 Hz. Explicit slow synaptic kinetics on the delay-line cells, which is the textbook account of where the delay comes from: peak DSI 0.10. Spatial frequency from 24 columns per cycle down to 2.1: no better anywhere. Graded rather than spiking units, so that inhibition has room to push a cell below baseline: it doubled DSI to 0.099 and no more.",
  },
  {
    assay: "What was actually missing",
    outcome: "holds",
    measured:
      "Rebuilding the T4 microcircuit from the real connectome - same weights, same column offsets, same signs - and changing only the arithmetic. An additive model, the kind a current-based LIF is, reaches DSI 0.088. Replacing the subtractive inhibitory arm with a shunting one, where inhibition divides the excitatory arm instead of subtracting from it, gives 0.325 at moderate strength and 0.515 at strong, with the preferred directions still correctly opposed: T4a 315 degrees against T4b 135, T4c 225 against T4d 45.",
    reading:
      "Direction selectivity is latent in the wiring diagram, and one specific operation is needed to get it out. The connectome supplies the column offsets and the transmitter signs; what it cannot supply is that the inhibition is divisive rather than subtractive, because that is a property of a chloride conductance and not of a graph. This also unifies the rest of the battery. The escape pathway is spatial summation onto a threshold, which is additive, and it reproduces perfectly. The Giant Fibre needed its input normalised by in-degree before it would fire at all - another division. Direction selectivity needs a division and does not get one, so it fails. The connectome gives you the graph; the arithmetic is not in the graph.",
  },
];
