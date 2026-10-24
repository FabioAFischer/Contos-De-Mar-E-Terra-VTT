import { calculateCharacterDerivedData } from "./character-calculations.mjs";
import { calculateConditionMovement } from "./combat-condition-service.mjs";
import { compareCreatureSizes } from "./creature-size-service.mjs";

export function getEffectiveMovement(actor) {
  const baseMovement = calculateCharacterDerivedData(actor?.system).movimento;
  return calculateConditionMovement(baseMovement, actor);
}

export function calculateInvestidaBrutalDistance(actor) {
  return Math.max(0, Math.floor(getEffectiveMovement(actor) / 2));
}

export function getHrodnarBranch(sourceActor, targetActor, { equalUsesSmaller = false } = {}) {
  const relation = compareCreatureSizes(sourceActor, targetActor).relation;
  if (relation === "menor" || equalUsesSmaller && relation === "igual") return "menorOuIgual";
  return relation === "maior" ? "maior" : "igual";
}

export const AbilityDaCombatService = Object.freeze({ getEffectiveMovement, calculateInvestidaBrutalDistance, getHrodnarBranch });
