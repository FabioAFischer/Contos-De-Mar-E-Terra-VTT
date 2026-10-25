import { SYSTEM_ID } from "../config/constants.mjs";

const CONDITION_FLAG = "conditions";
const namespace = () => globalThis.game?.system?.id ?? SYSTEM_ID;

export function getDazed(actor) { return actor?.getFlag?.(namespace(), CONDITION_FLAG)?.desnorteado ?? null; }
export function getNamedCondition(actor, key) { return actor?.getFlag?.(namespace(), CONDITION_FLAG)?.[key] ?? null; }
export async function applyNamedCondition(actor, key, data = {}) {
  if (!actor?.setFlag || !key) return false;
  const current = actor.getFlag?.(namespace(), CONDITION_FLAG) ?? {};
  if (current[key]?.active) return false;
  await actor.setFlag(namespace(), CONDITION_FLAG, { ...current, [key]: { ...data, active: true } });
  return true;
}
export async function clearNamedCondition(actor, key) {
  if (!actor?.unsetFlag || !key) return false;
  await actor.unsetFlag(namespace(), `${CONDITION_FLAG}.${key}`);
  return true;
}
export function isDazed(actor) { return Boolean(getDazed(actor)?.active); }
export function getAvailableActionPenalty(actor) { return isDazed(actor) ? 2 : 0; }
export function calculateConditionMovement(movement, actor) { return isDazed(actor) ? Math.floor(Number(movement) / 2) : Number(movement); }

export async function applySilencedCondition(actor, actions = 2, source = "") {
  if (!actor?.setFlag) return false;
  const current = getNamedCondition(actor, "silenciado");
  await actor.setFlag(namespace(), CONDITION_FLAG, { ...(actor.getFlag?.(namespace(), CONDITION_FLAG) ?? {}), silenciado: { active: true, remainingActions: Math.max(Number(current?.remainingActions ?? 0), Number(actions) || 0), source } });
  return true;
}

export async function consumeSilencedAction(actor, amount = 1) {
  const current = getNamedCondition(actor, "silenciado");
  if (!current?.active) return false;
  const remaining = Number(current.remainingActions ?? 0) - Math.max(0, Number(amount) || 0);
  if (remaining <= 0) return clearNamedCondition(actor, "silenciado");
  await actor.setFlag(namespace(), CONDITION_FLAG, { ...(actor.getFlag?.(namespace(), CONDITION_FLAG) ?? {}), silenciado: { ...current, remainingActions: remaining } });
  return true;
}

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

export const CombatConditionService = Object.freeze({ getDazed, getNamedCondition, applyNamedCondition, clearNamedCondition, applySilencedCondition, consumeSilencedAction, isDazed, getAvailableActionPenalty, calculateConditionMovement, applyDazedCondition, clearDazedCondition, expireDazedConditions });
