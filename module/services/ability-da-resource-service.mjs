import { CombatActionService } from "./combat-action-service.mjs";

const STANDARD_RESOURCES = new Set(["vida", "mana", "sanidade"]);

export function combatantFor(actor) {
  const combat = globalThis.game?.combat;
  if (!combat?.started) return null;
  const combatant = combat.combatants?.find((entry) => entry.actor === actor
    || entry.actor?.id && entry.actor.id === actor?.id
    || entry.actor?.uuid && entry.actor.uuid === actor?.uuid) ?? null;
  if (!combatant || combatant.actor?.system?.actions) return combatant;
  return Object.create(combatant, { actor: { value: actor, enumerable: true } });
}

export function getCustomResources(actor) {
  return Array.isArray(actor?.system?.resources?.custom) ? actor.system.resources.custom : [];
}

export function findCustomResource(actor, resourceId) {
  return getCustomResources(actor).find((resource) => resource.id === resourceId) ?? null;
}

export function getCostValue(cost) {
  const amount = Number(cost?.amount ?? 0);
  return Number.isFinite(amount) && Number.isInteger(amount) && amount >= 0 ? amount : null;
}

export function canPayAbilityDaCost(actor, cost, { outsideCombat = !globalThis.game?.combat?.started } = {}) {
  const amount = getCostValue(cost);
  if (amount === null) return { valid: false, reason: "invalidAmount" };
  if (amount === 0) return { valid: true, amount };
  if (["actions", "reservedActions"].includes(cost.type)) {
    if (outsideCombat) return { valid: true, skipped: true, amount };
    const combatant = combatantFor(actor);
    if (!combatant) return { valid: false, reason: "missingCombatant" };
    if (globalThis.game?.combat?.combatant?.id !== combatant.id) return { valid: false, reason: "notActiveTurn", amount };
    const state = CombatActionService.getState(combatant);
    const available = cost.type === "actions" ? state.current : state.reserved;
    const reason = available >= amount ? null : cost.type === "actions" ? "insufficientActions" : "insufficientReservedActions";
    return { valid: reason === null, reason, amount, available };
  }
  if (STANDARD_RESOURCES.has(cost.type)) {
    const raw = actor?.system?.resources?.[cost.type]?.value;
    const current = Number(raw);
    if (!Number.isFinite(current)) return { valid: false, reason: "missingResource", amount, available: null, resourceType: cost.type };
    return { valid: current >= amount, reason: current >= amount ? null : "insufficientResource", amount, available: current, resourceType: cost.type };
  }
  if (cost.type === "custom") {
    const resource = findCustomResource(actor, cost.resourceId);
    const current = Number(resource?.current);
    return { valid: Boolean(resource) && Number.isFinite(current) && current >= amount, reason: resource ? (current >= amount ? null : "insufficientResource") : "missingResource", amount, available: Number.isFinite(current) ? current : null, resourceType: cost.resourceId };
  }
  return { valid: false, reason: "unsupportedCost" };
}

export async function payAbilityDaCost(actor, cost) {
  const check = canPayAbilityDaCost(actor, cost);
  if (!check.valid) throw new Error(`CMET | Custo de habilidade DA indisponível: ${check.reason}`);
  if (check.skipped || check.amount === 0) return { ...check, applied: false };
  if (["actions", "reservedActions"].includes(cost.type)) {
    const combatant = combatantFor(actor);
    if (cost.type === "actions") await CombatActionService.spendAction(combatant, check.amount);
    else await CombatActionService.spendReservedAction(combatant, check.amount);
    return { ...check, applied: true };
  }
  const path = cost.type === "custom" ? "system.resources.custom" : `system.resources.${cost.type}.value`;
  if (cost.type === "custom") {
    const resources = foundry.utils.deepClone(getCustomResources(actor));
    const resource = resources.find((entry) => entry.id === cost.resourceId);
    resource.current = Math.max(0, Number(resource.current) - check.amount);
    await actor.update({ "system.resources.custom": resources });
  } else {
    await actor.update({ [path]: Math.max(0, Number(actor.system.resources[cost.type].value) - check.amount) });
  }
  return { ...check, applied: true };
}

export async function resetCustomResources(actor, resetRule) {
  const resources = getCustomResources(actor);
  const next = resources.map((resource) => resource.resetRule === resetRule ? { ...resource, current: Math.max(0, Number(resource.initial ?? 0)) } : resource);
  if (next.some((resource, index) => resource.current !== resources[index].current)) await actor.update({ "system.resources.custom": next });
  return next;
}
