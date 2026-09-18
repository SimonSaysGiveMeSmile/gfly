/**
 * Every experiment is its own product: its own page, its own simulation, its
 * own claim. The registry holds only metadata, so the index page never loads
 * an experiment's runtime code.
 */

export type ProductStatus = "live" | "building" | "planned";

export interface Product {
  slug: string;
  number: string;
  title: string;
  /** One plain sentence. */
  tagline: string;
  /** Two or three plain sentences. */
  summary: string;
  status: ProductStatus;
  /** What it proves if it works. */
  claim: string;
  circuits: string[];
  /** Does the brain have to learn anything? */
  learning: "innate" | "plastic" | "hybrid";
  references?: { label: string; href: string }[];
  /** A still of the room itself, for its card. */
  preview?: string;
}

export const LEARNING_COPY: Record<Product["learning"], string> = {
  innate: "No training. The wiring has to do it on its own.",
  plastic: "Needs learning. The wiring supplies the circuit; the connections have to change.",
  hybrid: "Mostly built in, with learning only where the fly has it.",
};
