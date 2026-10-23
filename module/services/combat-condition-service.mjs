import { SYSTEM_ID } from "../config/constants.mjs";

const CONDITION_FLAG = "conditions";
const namespace = () => globalThis.game?.system?.id ?? SYSTEM_ID;

export function getDazed(actor) { return actor?.getFlag?.(namespace(), CONDITION_FLAG)?.desnorteado ?? null; }
export function isDazed(actor) { return Boolean(getDazed(actor)?.active); }
export function getAvailableActionPenalty(actor) { return isDazed(actor) ? 2 : 0; }
export function calculateConditionMovement(movement, actor) { return isDazed(actor) ? Math.floor(Number(movement) / 2) : Number(movement); }

export async function applyDazedCondition(actor, combat) {
  if (!actor?.setFlag || isDazed(actor)) return false;
  const combatant = combat?.combatants?.find((entry) => entry.actor?.id === actor.id);
  const index = combatant ? combat.turns.findIndex((entry) => entry.id === combatant.id) : -1;
  const activeIndex = combat?.turns?.findIndex((entry) => entry.id === combat.combatant?.id) ?? -1;
  const nextRound = index >= 0 && activeIndex >= 0 && index <= activeIndex ? Number(combat.round) + 1 : Number(combat.round);
  const expires = combatant ? { round: nextRound, combatantId: combatant.id } : null;
  await actor.setFlag(namespace(), CONDITION_FLAG, { desnorteado: { active: true, expires } });
  return true;
}

export async function clearDazedCondition(actor) {
  if (!actor?.unsetFlag) return false;
  await actor.unsetFlag(namespace(), `${CONDITION_FLAG}.desnorteado`);
  return true;
}

export async function expireDazedConditions(combat, prior) {
  const previous = prior?.combatantId ? combat.combatants.get(prior.combatantId) : null;
  const condition = getDazed(previous?.actor);
  if (!condition?.active || condition.expires?.combatantId !== previous.id) return;
  if (Number(prior.round) === Number(condition.expires.round)) await clearDazedCondition(previous.actor);
}

export const CombatConditionService = Object.freeze({ getDazed, isDazed, getAvailableActionPenalty, calculateConditionMovement, applyDazedCondition, clearDazedCondition, expireDazedConditions });
