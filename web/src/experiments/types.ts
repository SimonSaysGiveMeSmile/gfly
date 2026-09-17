/**
 * Every use case on GFly is a self-contained product: its own page, its own
 * simulation setup, its own claims about what it demonstrates. The registry
 * holds metadata only, so the index page never pulls a single byte of an
 * experiment's runtime code.
 */

export type ProductStatus = "live" | "building" | "planned";

export interface Product {
  slug: string;
  /** Plate number in the field-guide conceit: I, II, III... */
  plate: string;
  title: string;
  /** One line, printed under the title on the card. */
  tagline: string;
  /** Two or three sentences for the product page header. */
  summary: string;
  status: ProductStatus;
  /** What this proves, if it works. */
  claim: string;
  /** Circuits the experiment actually exercises. */
  circuits: string[];
  /** Does the brain need to learn anything, or is the wiring enough? */
  learning: "innate" | "plastic" | "hybrid";
  /** Literature the expected result is checked against. */
  references?: { label: string; href: string }[];
}

export const LEARNING_COPY: Record<Product["learning"], string> = {
  innate:
    "No training. The behaviour has to fall out of the wiring diagram alone.",
  plastic:
    "Requires plasticity. The connectome supplies the circuit; the synapses have to change.",
  hybrid:
    "Innate circuitry doing the work, with plasticity only where the fly has it.",
};
