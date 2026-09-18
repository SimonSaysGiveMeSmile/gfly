/**
 * Placeholder until the animal rigs land: every animal is the fly for now.
 */
import { FlyRig, loadFlyRigData } from "./flyRig";
import type { Body, BodyKind } from "./body";
import { loadBody } from "./body";

export async function loadAnimalBody(kind: BodyKind): Promise<Body> {
  void FlyRig; void loadFlyRigData; void kind;
  return loadBody("fly");
}
