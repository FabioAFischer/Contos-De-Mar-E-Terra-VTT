import { CombatActionService } from "./combat-action-service.mjs";
import { canPayAbilityDaCost, payAbilityDaCost, getCustomResources } from "./ability-da-resource-service.mjs";
import { arePotentialAdversaries, measureTokenReachDistance } from "./weapon-combat-state-service.mjs";

const SYSTEM_ID = "contos-de-mar-e-terra";
export const NORIS_STATE_FLAG = "norisDa";
export const NORIS_FRENZY_ID = "noris-frenesi";
const NORIS_FRENZY_MAX = 50;
const NORIS_ABILITY_NAMES = new Set([
  "Frenesi do Lutador", "Punhos Abrasivos", "Chutes em Meia Lua",
  "Plumagem de um Pugilista", "Peso Pesado", "Armar Guarda"
]);
const actorWrites = new Map();

const clone = (value) => globalThis.foundry?.utils?.deepClone ? foundry.utils.deepClone(value) : structuredClone(value);
const namespace = () => globalThis.game?.system?.id ?? SYSTEM_ID;
const combatKey = (combat) => combat?.uuid ?? combat?.id ?? "combat";

export function isNorisActor(actor) {
  return [...(actor?.items?.contents ?? actor?.items ?? [])].some((item) => item.type === "habilidadeDa" && (item.system?.associatedCharacter === "Noris" || NORIS_ABILITY_NAMES.has(item.name)));
}

function state(actor) {
  return clone(actor?.getFlag?.(namespace(), NORIS_STATE_FLAG) ?? { active: {}, hits: {} });
}

export function getNorisState(actor) {
  return state(actor);
}

export function getNorisFrenzy(actor) {
  const resource = getCustomResources(actor).find((entry) => entry.id === NORIS_FRENZY_ID || entry.name === "Frenesi");
  return Math.max(0, Math.min(NORIS_FRENZY_MAX, Number(resource?.current) || 0));
}

export async function ensureNorisFrenzyResource(actor, { reset = false } = {}) {
  if (!actor || !isNorisActor(actor)) return null;
  const resources = clone(getCustomResources(actor));
  let resource = resources.find((entry) => entry.id === NORIS_FRENZY_ID);
  if (!resource) {
    resource = { id: NORIS_FRENZY_ID, name: "Frenesi", current: 0, initial: 0, max: NORIS_FRENZY_MAX, resetRule: "combatEnd", description: "Recurso de combate de Noris.", enabled: true };
    resources.push(resource);
  }
  resource.name = "Frenesi";
  resource.max = NORIS_FRENZY_MAX;
  resource.initial = 0;
  if (reset) resource.current = 0;
  else resource.current = Math.max(0, Math.min(NORIS_FRENZY_MAX, Number(resource.current) || 0));
  const current = actor.system?.resources?.custom ?? [];
  if (JSON.stringify(current) !== JSON.stringify(resources)) await actor.update({ "system.resources.custom": resources });
  return resource;
}

export async function addNorisFrenzy(actor, amount = 5) {
  const resource = await ensureNorisFrenzyResource(actor);
  if (!resource) return 0;
  const resources = clone(getCustomResources(actor));
  const entry = resources.find((candidate) => candidate.id === NORIS_FRENZY_ID);
  entry.current = Math.min(NORIS_FRENZY_MAX, Math.max(0, Number(entry.current) + Math.max(0, Number(amount) || 0)));
  await actor.update({ "system.resources.custom": resources });
  return entry.current;
}

export async function spendNorisFrenzy(actor, amount) {
  const required = Math.max(0, Number(amount) || 0);
  await ensureNorisFrenzyResource(actor);
  if (getNorisFrenzy(actor) < required) return { valid: false, reason: "insufficientFrenzy", amount: required, available: getNorisFrenzy(actor) };
  const resources = clone(getCustomResources(actor));
  const entry = resources.find((candidate) => candidate.id === NORIS_FRENZY_ID);
  entry.current -= required;
  await actor.update({ "system.resources.custom": resources });
  return { valid: true, amount: required, available: entry.current };
}

export async function recordNorisFrenzyHit(combat, actor, { attackId, melee = true } = {}) {
  if (!combat?.started || !actor || !melee || !isNorisActor(actor)) return { awarded: false, current: getNorisFrenzy(actor) };
  const key = String(attackId ?? `${combat.id}:${combat.round}:${combat.turn}`);
  const actorKey = actor.uuid ?? actor.id;
  const previous = actorWrites.get(actorKey) ?? Promise.resolve();
  const operation = previous.then(async () => {
    const next = state(actor);
    if (next.hits?.[combatKey(combat)]?.includes(key)) return { awarded: false, current: getNorisFrenzy(actor) };
    next.hits = { ...(next.hits ?? {}), [combatKey(combat)]: [...(next.hits?.[combatKey(combat)] ?? []), key] };
    await actor.setFlag(namespace(), NORIS_STATE_FLAG, next);
    return { awarded: true, current: await addNorisFrenzy(actor, 5) };
  });
  actorWrites.set(actorKey, operation.catch(() => undefined));
  try { return await operation; } finally { if (actorWrites.get(actorKey) === operation) actorWrites.delete(actorKey); }
}

function currentTurn(combat) { return { combatId: combat?.id, round: Number(combat?.round), turn: Number(combat?.turn) }; }

function activeFor(actor, key, combat) {
  const entry = state(actor).active?.[key];
  if (!entry || entry.combatId !== combat?.id) return false;
  if (key === "heavyWeight" && Number(combat.round) > Number(entry.endRound)) return false;
  if (key === "heavyWeight" && Number(combat.round) === Number(entry.endRound) && Number(combat.turn) > Number(entry.endTurn)) return false;
  return true;
}

export function isNorisFistsAmplified(actor, combat = globalThis.game?.combat) { return activeFor(actor, "abrasiveFists", combat); }
export function isNorisHeavyWeightActive(actor, combat = globalThis.game?.combat) { return activeFor(actor, "heavyWeight", combat); }
export function isNorisGuardActive(actor, combat = globalThis.game?.combat) { return activeFor(actor, "guard", combat); }

export async function breakNorisGuard(actor, reason = "offensiveAction") {
  if (!actor || !getNorisState(actor).active?.guard) return false;
  const next = state(actor);
  delete next.active.guard;
  next.active = { ...(next.active ?? {}), guardBreakReason: reason };
  await actor.setFlag(namespace(), NORIS_STATE_FLAG, next);
  return true;
}

export function getNorisUnarmedDamageModifiers(actor, combat = globalThis.game?.combat) {
  return {
    impact: isNorisHeavyWeightActive(actor, combat),
    abrasiveFists: isNorisFistsAmplified(actor, combat)
  };
}

async function writeActive(actor, key, value) {
  const next = state(actor);
  next.active = { ...(next.active ?? {}), [key]: value };
  await actor.setFlag(namespace(), NORIS_STATE_FLAG, next);
  return value;
}

async function payActivationCosts(actor, effect) {
  for (const cost of effect.costs ?? []) {
    if (cost.timing !== "activation") continue;
    const normalized = cost.type === "custom" && !cost.resourceId ? { ...cost, resourceId: NORIS_FRENZY_ID } : cost;
    const check = canPayAbilityDaCost(actor, normalized);
    if (!check.valid) return check;
  }
  for (const cost of effect.costs ?? []) if (cost.timing === "activation") await payAbilityDaCost(actor, cost.type === "custom" && !cost.resourceId ? { ...cost, resourceId: NORIS_FRENZY_ID } : cost);
  return { valid: true };
}

async function chooseArmorProtection(operation) {
  const { DialogV2 } = foundry.applications.api;
  const choices = [
    ["encouracado", "Encouraçado"],
    ["carapaca", "Carapaça"],
    ["selo", "Selo"],
    ["revestimento", "Revestimento"]
  ];
  const choice = await DialogV2.wait({
    window: { title: "Proteção adicional" },
    content: "<p>Escolha a proteção adicional de Plumagem de um Pugilista.</p>",
    buttons: choices.map(([action, label]) => ({ action, label, type: "button", callback: () => action }))
  });
  if (!choice) return null;
  let element = null;
  if (choice === "revestimento") {
    element = await DialogV2.wait({
      window: { title: "Elemento do revestimento" },
      content: "<p>Escolha o elemento do revestimento.</p>",
      buttons: ["fogo", "frio", "raio"].map((action) => ({ action, label: action[0].toUpperCase() + action.slice(1), type: "button", callback: () => action }))
    });
    if (!element) return null;
  }
  return { key: choice, element };
}

function actorToken(actor, combat) {
  return globalThis.canvas?.tokens?.placeables?.find((token) => token.actor?.id === actor?.id)
    ?? combat?.combatants?.find((combatant) => combatant.actor?.id === actor?.id)?.token?.object
    ?? null;
}

function halfMoonTargets(actor, primary, combat, expanded = false) {
  const origin = actorToken(actor, combat);
  if (!origin || !primary) return primary ? [primary] : [];
  const maximum = expanded ? 2 : 1;
  const candidates = (globalThis.canvas?.tokens?.placeables ?? [])
    .filter((token) => token !== origin && arePotentialAdversaries(origin, token))
    .filter((token) => measureTokenReachDistance(primary, token) <= maximum);
  return [primary, ...candidates].filter((token, index, all) => all.findIndex((candidate) => (candidate.document?.id ?? candidate.id) === (token.document?.id ?? token.id)) === index);
}

export async function activateNorisAbility({ actor, item, effect, operation, context = {} } = {}) {
  if (!actor || !item || !effect || !operation || !isNorisActor(actor)) return { valid: false, reason: "notNoris" };
  await ensureNorisFrenzyResource(actor);
  const combat = context.combat ?? globalThis.game?.combat;
  const turn = currentTurn(combat);
  if (operation.type === "norisArmorProtection") {
    if (activeFor(actor, "armorProtection", combat)) return { valid: false, reason: "alreadyActive" };
    const protection = await chooseArmorProtection(operation);
    if (!protection) return { valid: false, reason: "cancelled" };
    const costs = await payActivationCosts(actor, effect);
    if (!costs.valid) return { valid: false, reason: costs.reason, available: costs.available };
    return { valid: true, active: await writeActive(actor, "armorProtection", { ...turn, combatId: combat?.id, key: protection.key, element: protection.element }) };
  }
  const activeKeyByOperation = {
    norisFistsAmplification: "abrasiveFists",
    norisHalfMoonAmplification: "halfMoon",
    norisAbsorptionAmplification: "absorption",
    norisHeavyWeight: "heavyWeight",
    norisGuard: "guard"
  }[operation.type];
  if (activeKeyByOperation && activeFor(actor, activeKeyByOperation, combat)) {
    return { valid: false, reason: "alreadyActive" };
  }
  const costs = await payActivationCosts(actor, effect);
  if (!costs.valid) return { valid: false, reason: costs.reason, available: costs.available };
  if (operation.type === "norisFistsAttack") {
    const { startNorisUnarmedAttack } = await import("./combat-attack-service.mjs");
    return startNorisUnarmedAttack({ actor, double: true });
  }
  if (operation.type === "norisHalfMoonAttack") {
    const { startNorisUnarmedAttack } = await import("./combat-attack-service.mjs");
    const primary = context.targetToken ?? [...(globalThis.game?.user?.targets ?? [])][0];
    return startNorisUnarmedAttack({ actor, double: false, targetToken: primary, targetTokens: halfMoonTargets(actor, primary, combat, activeFor(actor, "halfMoon", combat)) });
  }
  if (operation.type === "norisFistsAmplification") return { valid: true, active: await writeActive(actor, "abrasiveFists", { ...turn, combatId: combat?.id }) };
  if (operation.type === "norisHalfMoonAmplification") return { valid: true, active: await writeActive(actor, "halfMoon", { ...turn, combatId: combat?.id }) };
  if (operation.type === "norisAbsorptionAmplification") return { valid: true, active: await writeActive(actor, "absorption", { ...turn, combatId: combat?.id }) };
  if (operation.type === "norisArmorProtection") return { valid: false, reason: "unsupportedOperation" };
  if (operation.type === "norisHeavyWeight") return { valid: true, active: await writeActive(actor, "heavyWeight", { ...turn, combatId: combat?.id, endRound: turn.round + 1, endTurn: turn.turn }) };
  if (operation.type === "norisGuard") return { valid: true, active: await writeActive(actor, "guard", { ...turn, combatId: combat?.id }) };
  return { valid: false, reason: "unsupportedOperation" };
}

export async function resetNorisCombatState(combat) {
  const actors = new Map();
  for (const actor of globalThis.game?.actors?.contents ?? []) actors.set(actor.uuid ?? actor.id, actor);
  for (const combatant of combat?.combatants ?? []) {
    const actor = combatant.actor;
    if (actor) actors.set(actor.uuid ?? actor.id, actor);
  }
  for (const token of globalThis.canvas?.tokens?.placeables ?? []) {
    const actor = token.actor;
    if (actor) actors.set(actor.uuid ?? actor.id, actor);
  }
  for (const actor of actors.values()) {
    if (!isNorisActor(actor)) continue;
    await ensureNorisFrenzyResource(actor, { reset: true });
    const current = state(actor);
    const next = { ...current, active: {}, hits: {} };
    await actor.setFlag(namespace(), NORIS_STATE_FLAG, next);
  }
}

export function registerNorisAbilityHooks() {
  Hooks.on("deleteCombat", resetNorisCombatState);
  Hooks.on("updateCombat", (combat, changes) => { if (changes.started === true || changes.started === false) resetNorisCombatState(combat); });
}

export const NorisAbilityService = Object.freeze({ isNorisActor, getNorisFrenzy, ensureNorisFrenzyResource, addNorisFrenzy, spendNorisFrenzy, recordNorisFrenzyHit, activateNorisAbility, isNorisFistsAmplified, isNorisHeavyWeightActive, isNorisGuardActive, breakNorisGuard, getNorisUnarmedDamageModifiers, resetNorisCombatState });
