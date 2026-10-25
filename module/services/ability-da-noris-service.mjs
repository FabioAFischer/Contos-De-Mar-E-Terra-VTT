export const FRENZY_ID = "noris-frenesi";
export const FRENZY_MAX = 50;
const NORIS_OPERATION_TYPES = new Set([
  "norisFrenzy", "norisFistsAttack", "norisFistsAmplification", "norisHalfMoonAttack",
  "norisHalfMoonAmplification", "norisAbsorption", "norisAbsorptionAmplification",
  "norisArmorProtection", "norisHeavyWeight", "norisGuard"
]);

function resources(actor) { return foundry.utils.deepClone(actor?.system?.resources?.custom ?? []); }

export function isNorisOperation(type) { return NORIS_OPERATION_TYPES.has(type); }

export async function ensureNorisFrenzy(actor) {
  if (!actor) return null;
  const current = resources(actor);
  const existing = current.filter((resource) => resource.id !== FRENZY_ID && resource.name !== "Frenesi");
  const resource = current.find((entry) => entry.id === FRENZY_ID) ?? {
    id: FRENZY_ID, name: "Frenesi", current: 0, initial: 0, max: FRENZY_MAX,
    resetRule: "combatEnd", description: "CMET.AbilityDa.Noris.FrenzyDescription", enabled: true
  };
  resource.id = FRENZY_ID;
  resource.name = resource.name || "Frenesi";
  resource.max = FRENZY_MAX;
  resource.current = Math.min(FRENZY_MAX, Math.max(0, Number(resource.current) || 0));
  const next = [...existing, resource];
  if (JSON.stringify(next) !== JSON.stringify(current)) await actor.update({ "system.resources.custom": next });
  return resource;
}

export const ensureNorisFrenzyResource = ensureNorisFrenzy;

export async function resetNorisFrenzy(actor) {
  const resource = await ensureNorisFrenzy(actor);
  if (resource?.current) await actor.update({ "system.resources.custom": resources(actor).map((entry) => entry.id === FRENZY_ID ? { ...entry, current: 0 } : entry) });
}

export async function clearNorisCombatEffects(actor) {
  if (!actor?.getFlag?.(game.system.id, "norisEffects")) return;
  await actor.unsetFlag(game.system.id, "norisEffects");
}

export async function changeNorisFrenzy(actor, amount) {
  const resource = await ensureNorisFrenzy(actor);
  const next = Math.min(FRENZY_MAX, Math.max(0, Number(resource.current) + Number(amount || 0)));
  if (next !== resource.current) await actor.update({ "system.resources.custom": resources(actor).map((entry) => entry.id === FRENZY_ID ? { ...entry, current: next } : entry) });
  return next;
}

export async function executeNorisOperation(operation, { actor, effect, item } = {}) {
  if (!actor || !isNorisOperation(operation?.type)) return null;
  if (operation.type === "norisFrenzy") return changeNorisFrenzy(actor, operation.amount || 5);
  const flagKey = "norisEffects";
  const active = foundry.utils.deepClone(actor.getFlag?.(game.system.id, flagKey) ?? {});
  const entry = { source: effect?.id, item: item?.uuid, amount: Number(operation.amount) || 0, formula: operation.formula || "", key: operation.conditionKey || "" };
  const key = operation.type;
  active[key] = entry;
  await actor.setFlag(game.system.id, flagKey, active);
  return entry;
}

export function getNorisEffects(actor) { return actor?.getFlag?.(game.system.id, "norisEffects") ?? {}; }

export const NorisAbilityService = Object.freeze({ ensureNorisFrenzy, ensureNorisFrenzyResource, resetNorisFrenzy, clearNorisCombatEffects, changeNorisFrenzy, executeNorisOperation, getNorisEffects, isNorisOperation, FRENZY_ID, FRENZY_MAX });
