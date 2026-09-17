/**
 * Leaky integrate-and-fire kernel over the MaleCNS connectome.
 *
 * Parameters follow Shiu et al. 2024 (A Drosophila computational brain model),
 * the published whole-brain LIF treatment of a fly connectome. Everything here
 * is a physiological constant except `mvPerSynapse`, the global scale that
 * turns a synapse count into a postsynaptic voltage step, and which is the one
 * knob the model is actually fitted on.
 *
 * Two things keep this real-time in a browser tab:
 *
 *  - Propagation is event-driven. Only neurons that fired this step walk their
 *    edge list, so cost tracks firing rate, not the 164k-neuron brain size.
 *  - Integration is restricted to an active set. A fly brain at rest is almost
 *    entirely quiet, and a neuron sitting at V_rest with no synaptic drive has
 *    no dynamics worth computing, so it is dropped from the sweep until
 *    something reaches it. Without this the O(n) sweep alone costs ~0.6 ms per
 *    step and caps the whole simulation below real-time no matter how sparse
 *    the spiking is.
 */

export interface LifParams {
  /** Membrane time constant (ms). */
  tauM: number;
  /** Synaptic current decay (ms). */
  tauS: number;
  /** Resting potential (mV). */
  vRest: number;
  /** Spike threshold (mV). */
  vThreshold: number;
  /** Post-spike reset potential (mV). */
  vReset: number;
  /** Absolute refractory period (ms). */
  refractory: number;
  /**
   * Inhibitory reversal potential (mV) - the floor a membrane cannot be
   * pushed below however much inhibition arrives.
   *
   * Without it a current-based model lets inhibition accumulate without
   * limit, and neurons with very large in-degree end up at physically
   * impossible potentials. The Giant Fibre, with 35,000 input synapses, sits
   * near -300 mV without this clamp and can never be fired by anything.
   */
  vFloor: number;
  /** Postsynaptic voltage contributed by one synapse (mV). */
  mvPerSynapse: number;
  /**
   * Standing depolarisation applied to every neuron (mV).
   *
   * Real neurons are not silent at rest, and that matters for more than
   * realism: roughly half the connectome is inhibitory, and inhibition can
   * only do anything to a cell that would otherwise be firing. With no
   * baseline an inhibitory synapse is a no-op and whole pathways - the ON
   * channel of the visual system among them, which works by disinhibiting
   * Mi1 - simply cannot function.
   */
  tonic: number;
}

export const DEFAULT_PARAMS: LifParams = {
  tauM: 20,
  tauS: 5,
  vRest: -52,
  vThreshold: -45,
  vReset: -55,
  refractory: 2.2,
  vFloor: -75,
  mvPerSynapse: 0.275,
  tonic: 5.0,
};

/** Below these, a neuron is indistinguishable from rest and leaves the sweep. */
const SYN_EPSILON = 1e-3;   // mV
const V_EPSILON = 1e-2;     // mV

export interface Connectome {
  neurons: number;
  offsets: Uint32Array;
  targets: Uint32Array;
  weights: Uint16Array;
  /** +1 excitatory, -1 inhibitory, 0 unknown - indexed by source neuron. */
  sign: Int8Array;
}

export class BrainSim {
  readonly n: number;
  params: LifParams;

  private readonly offsets: Uint32Array;
  private readonly targets: Uint32Array;
  private readonly weights: Uint16Array;
  private readonly sign: Int8Array;

  /** Membrane potential, mV. */
  readonly v: Float32Array;
  /** Synaptic drive, mV. Decays toward zero with tauS. */
  readonly syn: Float32Array;
  /**
   * Sustained input, mV, held until changed. Sensory receptors deliver a
   * standing current for as long as the stimulus is there, so a decaying
   * synaptic pulse is the wrong shape for them: a bright edge that stays
   * bright should keep its lamina cell depolarised, not let it sag back to
   * rest between sensory updates.
   */
  readonly bias: Float32Array;
  private readonly refrac: Float32Array;

  /**
   * Per-neuron input scaling, homeostatic.
   *
   * Synapse counts vary over three orders of magnitude between cells: a
   * typical neuron here receives a few hundred synapses, the Giant Fibre
   * receives 35,000. Injecting all of that as raw current puts high in-degree
   * cells hundreds of millivolts from rest and makes them unfireable. Real
   * neurons do not work that way - conductance-based synapses saturate, and
   * synaptic scaling normalises total drive - so each neuron's input is
   * rescaled toward the population mean.
   */
  private readonly inScale: Float32Array;

  /** Neurons currently worth integrating. */
  private readonly active: Uint32Array;
  private readonly isActive: Uint8Array;
  private activeCount = 0;

  /** Indices that spiked on the most recent step. */
  readonly spikes: Uint32Array;
  spikeCount = 0;
  /** Simulated time, ms. */
  t = 0;

  private decayM = 0;
  private decayS = 0;
  private lastDt = -1;

  constructor(c: Connectome, params: LifParams = DEFAULT_PARAMS) {
    this.n = c.neurons;
    this.params = { ...params };
    this.offsets = c.offsets;
    this.targets = c.targets;
    this.weights = c.weights;
    this.sign = c.sign;

    this.v = new Float32Array(this.n).fill(params.vRest);
    this.syn = new Float32Array(this.n);
    this.bias = new Float32Array(this.n);
    this.refrac = new Float32Array(this.n);
    this.active = new Uint32Array(this.n);
    this.isActive = new Uint8Array(this.n);
    this.spikes = new Uint32Array(this.n);

    // Total incoming synapses per neuron, then the scale that maps it to the
    // population mean. Clamped so the correction never becomes extreme.
    const totalIn = new Float64Array(this.n);
    for (let e = 0; e < c.targets.length; e++) totalIn[c.targets[e]] += c.weights[e];
    let sum = 0, counted = 0;
    for (let i = 0; i < this.n; i++) if (totalIn[i] > 0) { sum += totalIn[i]; counted++; }
    const meanIn = counted ? sum / counted : 1;
    this.inScale = new Float32Array(this.n);
    for (let i = 0; i < this.n; i++) {
      const t = totalIn[i];
      this.inScale[i] = t > 0 ? Math.min(4, Math.max(0.1, meanIn / t)) : 1;
    }
  }

  reset() {
    this.v.fill(this.params.vRest);
    this.syn.fill(0);
    this.bias.fill(0);
    this.refrac.fill(0);
    this.isActive.fill(0);
    this.activeCount = 0;
    this.spikeCount = 0;
    this.t = 0;
  }

  /** How many neurons are being integrated this step. */
  get activeSize() { return this.activeCount; }

  private wake(i: number) {
    if (this.isActive[i] === 0) {
      this.isActive[i] = 1;
      this.active[this.activeCount++] = i;
    }
  }

  /**
   * Add synaptic drive to a population, in mV. This is how the world gets in:
   * photoreceptors, olfactory receptors, mechanosensors all enter here.
   */
  inject(indices: ArrayLike<number>, mv: number) {
    for (let k = 0; k < indices.length; k++) {
      const i = indices[k];
      this.syn[i] += mv;
      this.wake(i);
    }
  }

  /** Add drive to a single neuron, in mV. */
  injectOne(i: number, mv: number) {
    this.syn[i] += mv;
    this.wake(i);
  }

  /**
   * Set a neuron's sustained input, in mV. Roughly 7 mV separates rest from
   * threshold, so a value above that fires the cell continuously and values
   * below it shift how readily synaptic input will.
   */
  setBias(i: number, mv: number) {
    this.bias[i] = mv;
    if (mv !== 0) this.wake(i);
  }

  /** Clear every stimulus-driven input, leaving the tonic level intact. */
  clearBias() {
    this.bias.fill(0);
  }

  /**
   * Put every neuron into the sweep. Needed once a tonic drive is applied,
   * since under it no neuron is ever truly at rest.
   */
  wakeAll() {
    for (let i = 0; i < this.n; i++) {
      this.active[i] = i;
      this.isActive[i] = 1;
    }
    this.activeCount = this.n;
  }

  /** Advance one timestep. Returns the number of neurons that fired. */
  step(dt: number): number {
    const p = this.params;
    const { v, syn, bias, refrac, offsets, targets, weights, sign, spikes, active, isActive, inScale } = this;
    const { vRest, vThreshold, vReset, refractory, mvPerSynapse, tonic, vFloor } = p;

    if (dt !== this.lastDt) {
      this.decayM = Math.exp(-dt / p.tauM);
      this.decayS = Math.exp(-dt / p.tauS);
      this.lastDt = dt;
    }
    const dm = this.decayM;
    const ds = this.decayS;

    let count = 0;
    let write = 0;
    const n = this.activeCount;

    // Integrate the active set, compacting it in place as neurons fall silent.
    for (let k = 0; k < n; k++) {
      const i = active[k];
      let s = syn[i];

      if (refrac[i] > 0) {
        refrac[i] -= dt;
        v[i] = vReset;
      } else {
        // Exponential Euler toward the drive-shifted resting point. Stable at
        // the coarse dt an interactive framerate needs.
        const target = vRest + s + bias[i] + tonic;
        let nv = target + (v[i] - target) * dm;
        if (nv < vFloor) nv = vFloor;
        v[i] = nv;
        if (v[i] >= vThreshold) {
          v[i] = vReset;
          refrac[i] = refractory;
          spikes[count++] = i;
        }
      }

      s *= ds;
      syn[i] = s;

      // Keep it in the sweep only while it still has dynamics left.
      if (tonic !== 0 ||
          s > SYN_EPSILON || s < -SYN_EPSILON ||
          bias[i] !== 0 ||
          refrac[i] > 0 ||
          v[i] > vRest + V_EPSILON || v[i] < vRest - V_EPSILON) {
        active[write++] = i;
      } else {
        v[i] = vRest;
        isActive[i] = 0;
      }
    }
    this.activeCount = write;

    // Propagate. Only neurons that fired touch the edge list.
    for (let k = 0; k < count; k++) {
      const src = spikes[k];
      const sg = sign[src];
      if (sg === 0) continue;
      const scale = sg * mvPerSynapse;
      const end = offsets[src + 1];
      for (let e = offsets[src]; e < end; e++) {
        const tgt = targets[e];
        syn[tgt] += weights[e] * scale * inScale[tgt];
        if (isActive[tgt] === 0) {
          isActive[tgt] = 1;
          active[this.activeCount++] = tgt;
        }
      }
    }

    this.spikeCount = count;
    this.t += dt;
    return count;
  }
}
