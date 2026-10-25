import { CombatActionService } from "./combat-action-service.mjs";
import { canPayAbilityDaCost, payAbilityDaCost } from "./ability-da-resource-service.mjs";
import { findSkillDefinition } from "./skill-roll-service.mjs";
import { SKILL_LABELS } from "../config/constants.mjs";
import { openSkillRollDialog } from "../dialogs/skill-roll-dialog.mjs";
import { measureTokenDistance, arePotentialAdversaries } from "./weapon-combat-state-service.mjs";
import { getActorUpdateAuthority } from "./combat-authority-service.mjs";

const SYSTEM_ID = "contos-de-mar-e-terra";
const STATE_FLAG = "marcoDa";
const AURA_FLAG = "marcoAuras";
const CONVERSION_VALUES = Object.freeze({ 2: 1, 4: 2, 6: 3, 8: 4 });
const pendingActorLifeUpdates = new WeakMap();
const pendingTokenLifeUpdates = new WeakMap();
const processedLifeUpdates = new WeakMap();
const marcoStateWrites = new Map();
let lifeTrackingHooksRegistered = false;

function combatOf(combat = globalThis.game?.combat) { return combat?.started ? combat : null; }
function actorToken(actor) {
  return [...(globalThis.canvas?.tokens?.placeables ?? [])].find((token) => token.actor === actor
    || token.actor?.uuid === actor?.uuid
    || token.actor?.id === actor?.id) ?? null;
}

function combatActors() {
  const actors = [
    ...(globalThis.game?.actors?.contents ?? []),
    ...(globalThis.canvas?.tokens?.placeables ?? []).map((token) => token.actor).filter(Boolean)
  ];
  return [...new Map(actors.map((actor) => [actor.uuid ?? actor.id, actor])).values()];
}

function stablePart(value) {
  return String(value ?? "").replace(/[^A-Za-z0-9_-]/g, "_");
}

function tokenDocument(actor) {
  return actor?.token?.document ?? actor?.token ?? actorToken(actor)?.document ?? actorToken(actor) ?? null;
}

export function actorKey(actor) {
  const token = actor?.isToken ? tokenDocument(actor) : null;
  const linked = token?.actorLink ?? token?.isLinked ?? null;
  if (token && linked === false) {
    const sceneId = token.parent?.id ?? token.scene?.id ?? "scene";
    return `token-${stablePart(sceneId)}-${stablePart(token.id ?? token._id)}`;
  }
  const actorId = actor?.id ?? String(actor?.uuid ?? "").split(".").pop();
  return actorId ? `actor-${stablePart(actorId)}` : null;
}

export function actorKeys(actor) { return actorKey(actor) ? [actorKey(actor)] : []; }

function legacyActorKeys(actor) {
  const token = actor?.isToken ? tokenDocument(actor) : null;
  return [...new Set([
    token?.uuid,
    actor?.uuid,
    actor?.id
  ].filter(Boolean))];
}

function readState(combat) { return combat?.getFlag?.(SYSTEM_ID, STATE_FLAG) ?? { actors: {} }; }

function readNested(object, path) {
  return path.split(".").reduce((value, part) => value?.[part], object);
}

function deleteNested(object, path) {
  const parts = path.split(".");
  const stack = [];
  let current = object;
  for (const part of parts) {
    if (!current || typeof current !== "object" || !Object.hasOwn(current, part)) return;
    stack.push([current, part]);
    current = current[part];
  }
  const [lastParent, lastPart] = stack.at(-1);
  delete lastParent[lastPart];
  for (let index = stack.length - 1; index >= 0; index -= 1) {
    const [parent, part] = stack[index];
    if (parent[part] && typeof parent[part] === "object" && !Object.keys(parent[part]).length) delete parent[part];
  }
}

function mergeMarcoActorStates(states) {
  const valid = states.filter(Boolean);
  if (!valid.length) return { lifeLost: 0, manifestationsUsed: 0, deathEvents: [] };
  return valid.reduce((merged, value) => ({
    ...merged,
    ...value,
    lifeLost: Math.max(Number(merged.lifeLost) || 0, Number(value.lifeLost) || 0),
    manifestationsUsed: Math.max(Number(merged.manifestationsUsed) || 0, Number(value.manifestationsUsed) || 0),
    deathEvents: [...new Set([
      ...(Array.isArray(merged.deathEvents) ? merged.deathEvents : []),
      ...(Array.isArray(value.deathEvents) ? value.deathEvents : [])
    ])]
  }), { lifeLost: 0, manifestationsUsed: 0, deathEvents: [] });
}

function normalizeMarcoState(state, actor) {
  const actors = state?.actors && typeof state.actors === "object" ? state.actors : {};
  const key = actorKey(actor);
  if (!key) return { state: { ...(state ?? {}), actors }, key: null, current: { lifeLost: 0, manifestationsUsed: 0, deathEvents: [] }, migrated: false };
  const legacyKeys = legacyActorKeys(actor);
  const legacyStates = legacyKeys.flatMap((legacyKey) => [actors[legacyKey], readNested(actors, legacyKey)]);
  const current = mergeMarcoActorStates([actors[key], ...legacyStates]);
  const migrated = !actors[key] && legacyStates.some(Boolean);
  const nextActors = globalThis.foundry?.utils?.deepClone
    ? globalThis.foundry.utils.deepClone(actors)
    : structuredClone(actors);
  nextActors[key] = current;
  for (const legacyKey of legacyKeys) {
    if (legacyKey !== key) {
      delete nextActors[legacyKey];
      deleteNested(nextActors, legacyKey);
    }
  }
  return { state: { ...(state ?? {}), actors: nextActors }, key, current, migrated };
}

function lifeState(combat, actor) {
  return normalizeMarcoState(readState(combat), actor).current;
}

function queueMarcoStateWrite(combat, actor, updater) {
  const key = actorKey(actor);
  const queueKey = `${combat.id ?? "combat"}:${key}`;
  const previous = marcoStateWrites.get(queueKey) ?? Promise.resolve();
  const write = previous.catch(() => undefined).then(async () => {
    const normalized = normalizeMarcoState(readState(combat), actor);
    const nextActor = await updater(normalized.current);
    const nextState = { ...normalized.state, actors: { ...normalized.state.actors, [normalized.key]: nextActor } };
    await combat.setFlag(SYSTEM_ID, STATE_FLAG, nextState);
    return nextActor;
  });
  marcoStateWrites.set(queueKey, write);
  return write.finally(() => {
    if (marcoStateWrites.get(queueKey) === write) marcoStateWrites.delete(queueKey);
  });
}
function clone(value) { return foundry.utils.deepClone(value); }

export function calculateMarcoLifeLoss(before, after) {
  const previous = Number(before);
  const current = Number(after);
  if (!Number.isFinite(previous) || !Number.isFinite(current)) return 0;
  return Math.max(0, Math.floor(previous - current));
}

export function getMarcoLifeLoss(actor, combat = globalThis.game?.combat) {
  const current = lifeState(combatOf(combat), actor);
  return { lifeLost: Number(current.lifeLost) || 0, manifestationsUsed: Number(current.manifestationsUsed) || 0 };
}

export function getManifestationStatus(actor, combat = globalThis.game?.combat) {
  const state = getMarcoLifeLoss(actor, combat);
  const reached = Math.floor(state.lifeLost / 10);
  return { ...state, reached, available: Math.max(0, reached - state.manifestationsUsed) };
}

export async function recordMarcoLifeLoss(actor, amount, { combat = globalThis.game?.combat, reason = "damage" } = {}) {
  const activeCombat = combatOf(combat);
  const normalized = Math.max(0, Math.floor(Number(amount) || 0));
  if (!activeCombat || !actorKey(actor) || normalized <= 0) return getMarcoLifeLoss(actor, activeCombat);
  const next = await queueMarcoStateWrite(activeCombat, actor, (current) => ({
    ...current,
    lifeLost: (Number(current.lifeLost) || 0) + normalized,
    lastReason: reason
  }));
  return { lifeLost: next.lifeLost, manifestationsUsed: Number(next.manifestationsUsed) || 0 };
}

export async function consumeManifestationThreshold(actor, combat = globalThis.game?.combat) {
  const activeCombat = combatOf(combat);
  if (!activeCombat) return { valid: false, reason: "combatRequired" };
  let unavailable = null;
  const next = await queueMarcoStateWrite(activeCombat, actor, (current) => {
    const available = Math.floor((Number(current.lifeLost) || 0) / 10) - (Number(current.manifestationsUsed) || 0);
    if (available < 1) {
      unavailable = { ...getManifestationStatus(actor, activeCombat), reason: "thresholdUnavailable" };
      return current;
    }
    return { ...current, manifestationsUsed: (Number(current.manifestationsUsed) || 0) + 1 };
  });
  if (unavailable) return { valid: false, ...unavailable };
  return { valid: true, ...getManifestationStatus(actor, activeCombat), threshold: next.manifestationsUsed * 10 };
}

export function calculateMarcoConversion(sacrifice) {
  const value = Number(sacrifice);
  return Number.isInteger(value) && Object.hasOwn(CONVERSION_VALUES, value) ? { valid: true, sacrifice: value, mana: CONVERSION_VALUES[value] } : { valid: false, sacrifice: value, mana: 0 };
}

export function calculateMarcoLifeAfterSacrifice(current, sacrifice) {
  const conversion = calculateMarcoConversion(sacrifice);
  const hp = Number(current);
  return { ...conversion, valid: conversion.valid && Number.isFinite(hp) && hp >= conversion.sacrifice, lifeAfter: conversion.valid && Number.isFinite(hp) ? Math.max(0, hp - conversion.sacrifice) : hp };
}

export function calculateMarcoRecovery(current, maximum, amount = 2) {
  const value = Number(current);
  const max = Number(maximum);
  const recovery = Math.max(0, Number(amount) || 0);
  if (!Number.isFinite(value) || !Number.isFinite(max)) return { valid: false, value };
  return { valid: true, value: Math.min(max, Math.max(0, value + recovery)), recovered: Math.min(recovery, Math.max(0, max - value)) };
}

export function isMarcoDeathEventDuplicate(events, eventId) {
  return Boolean(eventId) && Array.isArray(events) && events.includes(eventId);
}

async function chooseConversion(actor) {
  const { DialogV2 } = foundry.applications.api;
  return DialogV2.wait({
    window: { title: game.i18n.localize("CMET.AbilityDa.Marco.ProfaneConversion") },
    content: `<form><label>${game.i18n.localize("CMET.AbilityDa.Marco.LifeSacrifice")}<select name="sacrifice"><option value="2">2</option><option value="4">4</option><option value="6">6</option><option value="8">8</option></select></label></form>`,
    buttons: [
      { action: "confirm", label: game.i18n.localize("CMET.AbilityDa.Actions.Confirm"), type: "submit", callback: (_event, button) => Number(button.form.elements.sacrifice.value) },
      { action: "cancel", label: game.i18n.localize("CMET.Hotbar.Actions.Cancel"), type: "button", callback: () => null }
    ]
  });
}

export async function activateProfaneConversion(actor, cost = { type: "actions", amount: 1, timing: "activation" }) {
  const sacrifice = await chooseConversion(actor);
  const conversion = calculateMarcoLifeAfterSacrifice(actor?.system?.resources?.vida?.value, sacrifice);
  if (!conversion.valid) return { valid: false, reason: "invalidSacrifice" };
  const actionCheck = canPayAbilityDaCost(actor, cost);
  if (!actionCheck.valid) return { valid: false, reason: actionCheck.reason };
  const manaMax = 10 + Number(actor.system.attributes?.magia?.value || 0) + Number(actor.system.attributes?.mental?.value || 0);
  const manaBefore = Number(actor.system.resources?.mana?.value) || 0;
  if (manaBefore >= manaMax) return { valid: false, reason: "manaFull" };
  await payAbilityDaCost(actor, cost);
  await actor.update({ "system.resources.vida.value": conversion.lifeAfter, "system.resources.mana.value": Math.min(manaMax, manaBefore + conversion.mana) }, { cmetLifeLossReason: "profaneConversion" });
  return { valid: true, ...conversion, manaAfter: Math.min(manaMax, manaBefore + conversion.mana) };
}

function sourceToken(actor) { return globalThis.canvas?.tokens?.placeables?.find((token) => token.actor?.id === actor?.id || token.actor?.uuid === actor?.uuid) ?? null; }

export function isMarcoAuraInRange(distance, radius = 4) {
  return Number.isFinite(Number(distance)) && Number(distance) <= Number(radius) && Number(distance) >= 0;
}

function auraInRange(aura, sourceActor, targetActor) {
  const origin = sourceToken(sourceActor);
  const target = sourceToken(targetActor);
  return Boolean(origin && target && isMarcoAuraInRange(measureTokenDistance(origin, target), Number(aura.radius ?? 4)));
}

export function getMarcoAuraModifier({ attacker, defender, skillKey } = {}) {
  let modifier = 0;
  const sources = new Map(combatActors().map((actor) => [actor.uuid ?? actor.id, actor]));
  for (const source of [attacker, defender]) if (source) sources.set(source.uuid ?? source.id, source);
  for (const source of sources.values()) {
    for (const aura of source?.getFlag?.(SYSTEM_ID, AURA_FLAG) ?? []) {
      for (const targetActor of [attacker, defender]) {
        if (!targetActor || targetActor === source || !auraInRange(aura, source, targetActor)) continue;
        const enemy = arePotentialAdversaries(sourceToken(source), sourceToken(targetActor));
        if (!enemy && targetActor === defender && ["bloquear", "esquivar"].includes(skillKey)) modifier += 5;
        if (enemy && targetActor === attacker && skillKey !== "bloquear" && skillKey !== "esquivar") modifier -= 5;
      }
    }
  }
  if (defender && (defender.getFlag?.(SYSTEM_ID, AURA_FLAG) ?? []).some((aura) => auraInRange(aura, defender, defender)) && ["bloquear", "esquivar"].includes(skillKey)) modifier += 5;
  return modifier;
}

async function clearMarcoAura(actor, sourceId) {
  const current = actor?.getFlag?.(SYSTEM_ID, AURA_FLAG) ?? [];
  const next = current.filter((entry) => entry.source !== sourceId);
  if (next.length !== current.length) await actor.unsetFlag(SYSTEM_ID, AURA_FLAG);
  return next;
}

export async function activateManifestation(actor, effect, item, { originToken = null } = {}) {
  const actionCost = effect.costs?.find((cost) => cost.timing === "activation") ?? { type: "actions", amount: 1, timing: "activation" };
  const actionCheck = canPayAbilityDaCost(actor, actionCost);
  if (!actionCheck.valid) return actionCheck;
  const available = getManifestationStatus(actor).available;
  if (available < 1) return { valid: false, reason: "thresholdUnavailable", available };
  const threshold = await consumeManifestationThreshold(actor);
  if (!threshold.valid) return threshold;
  await payAbilityDaCost(actor, actionCost);
  const token = originToken ?? sourceToken(actor);
  const entry = {
    source: effect.id,
    item: item.uuid,
    tokenId: token?.document?.id ?? token?.id ?? null,
    sceneId: token?.document?.parent?.id ?? token?.scene?.id ?? globalThis.canvas?.scene?.id ?? null,
    radius: 4,
    turnsRemaining: 3,
    healPerTurn: 3
  };
  const current = actor.getFlag?.(SYSTEM_ID, AURA_FLAG) ?? [];
  await actor.setFlag(SYSTEM_ID, AURA_FLAG, [...current.filter((value) => value.source !== effect.id), entry]);
  return { valid: true, threshold, aura: entry };
}

function requestMarcoSkillRoll(actor, skillKey, context) {
  const definition = findSkillDefinition(skillKey);
  const baseValue = Number(actor?.system?.attributes?.[definition?.key]?.skills?.[skillKey]);
  if (!definition || !Number.isFinite(baseValue)) return Promise.resolve(null);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => { if (settled) return; settled = true; resolve(result ?? null); };
    openSkillRollDialog({ actor, skillKey, skillLabel: SKILL_LABELS[skillKey] ?? skillKey, baseValue, context, onResult: finish, onCancel: () => finish(null), onComplete: ({ status, result }) => status !== "completed" && finish(result) });
  });
}

export async function activateLastSpark(actor, item, effect, { targetToken = null } = {}) {
  const target = targetToken ?? [...(globalThis.game?.user?.targets ?? [])][0] ?? null;
  const targetActor = target?.actor ?? target?.document?.actor;
  const origin = sourceToken(actor);
  if (!targetActor || !origin || measureTokenDistance(origin, target) > 5) return { valid: false, reason: "invalidTarget" };
  const cost = (effect.costs ?? []).find((entry) => entry.timing === "activation") ?? { type: "actions", amount: 1, timing: "activation" };
  const check = canPayAbilityDaCost(actor, cost);
  if (!check.valid) return { valid: false, reason: check.reason };
  const roll = await requestMarcoSkillRoll(actor, "evocacao", { type: "abilityDa", itemName: item.name, effectName: effect.name });
  if (!roll) return { valid: false, reason: "cancelled" };
  await payAbilityDaCost(actor, cost);
  if (!roll.success) return { valid: true, roll, hit: false, damage: 0 };
  const damageRoll = new Roll("1d6");
  await damageRoll.evaluate();
  const authority = getActorUpdateAuthority(targetActor);
  if (authority?.id !== game.user.id) return { valid: true, roll, hit: true, damage: Number(damageRoll.total), manual: true, reason: "targetAuthority" };
  const hpBefore = Number(targetActor.system.resources?.vida?.value) || 0;
  const damage = Math.min(hpBefore, Number(damageRoll.total) || 0);
  await targetActor.update({ "system.resources.vida.value": Math.max(0, hpBefore - damage) });
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<article class="cmet-chat-card cmet-ability-da-card"><header>${foundry.utils.escapeHTML(item.name)} — ${game.i18n.localize("CMET.AbilityDa.Marco.LastSpark")}</header><p>${game.i18n.localize("CMET.AbilityDa.Marco.MagicImpactDamage")}: ${damage}</p></article>` });
  return { valid: true, roll, hit: true, damage };
}

export async function activateChildOfHel(actor, effect, item) {
  const { DialogV2 } = foundry.applications.api;
  const choice = await DialogV2.wait({
    window: { title: item.name },
    content: `<p>${game.i18n.localize("CMET.AbilityDa.Marco.DeathChoicePrompt")}</p>`,
    buttons: [
      { action: "coat", label: game.i18n.localize("CMET.AbilityDa.Marco.CorpseSkin"), type: "button", callback: () => "coat" },
      { action: "life", label: game.i18n.localize("CMET.AbilityDa.Marco.RevitalizeLife"), type: "button", callback: () => "life" },
      { action: "mana", label: game.i18n.localize("CMET.AbilityDa.Marco.RevitalizeMana"), type: "button", callback: () => "mana" }
    ]
  });
  if (!choice) return { valid: false, reason: "cancelled" };
  if (choice === "coat") {
    const current = actor.getFlag?.(SYSTEM_ID, "daArmor") ?? [];
    await actor.setFlag(SYSTEM_ID, "daArmor", [...current.filter((entry) => entry.source !== effect.id), { source: effect.id, key: "revestimentoNecrotico", amount: 4, duration: "combat" }]);
    return { valid: true, choice };
  }
  const resource = choice === "life" ? "vida" : "mana";
  const max = resource === "vida" ? 10 + Number(actor.system.attributes?.fisico?.value || 0) + Number(actor.system.attributes?.mental?.value || 0) : 10 + Number(actor.system.attributes?.magia?.value || 0) + Number(actor.system.attributes?.mental?.value || 0);
  const current = Number(actor.system.resources?.[resource]?.value) || 0;
  const recovery = calculateMarcoRecovery(current, max, 2);
  await actor.update({ [`system.resources.${resource}.value`]: recovery.value });
  return { valid: true, choice, amount: recovery.recovered };
}

export async function registerMarcoDeathChoice(actor, effect, item, { eventId } = {}) {
  const combat = combatOf();
  if (!combat || !eventId) return { valid: false, reason: "manualDeathConfirmationRequired" };
  let duplicate = false;
  await queueMarcoStateWrite(combat, actor, (latest) => ({
    ...latest,
    ...(isMarcoDeathEventDuplicate(latest.deathEvents, eventId)
      ? (duplicate = true, {})
      : { deathEvents: [...new Set([...(latest.deathEvents ?? []), eventId])] })
  }));
  if (duplicate) return { valid: false, reason: "duplicateDeathEvent" };
  return activateChildOfHel(actor, effect, item);
}

export async function endMarcoCombat(combat) {
  for (const actor of combatActors()) {
    if (actor.getFlag?.(SYSTEM_ID, AURA_FLAG)?.length) await actor.unsetFlag(SYSTEM_ID, AURA_FLAG);
    const armor = actor.getFlag?.(SYSTEM_ID, "daArmor") ?? [];
    const retained = armor.filter((entry) => entry.duration !== "combat");
    if (retained.length !== armor.length) await actor.setFlag(SYSTEM_ID, "daArmor", retained);
  }
  if (combat?.getFlag?.(SYSTEM_ID, STATE_FLAG)) await combat.unsetFlag(SYSTEM_ID, STATE_FLAG);
}

function changedVidaValue(changes, scope = "") {
  const flattened = changes?.[scope ? `${scope}.system.resources.vida.value` : "system.resources.vida.value"]
    ?? changes?.[scope ? `${scope}system.resources.vida.value` : ""];
  if (flattened !== undefined) return flattened;
  return (scope ? changes?.[scope] : changes)?.system?.resources?.vida?.value;
}

function tokenChangedVidaValue(changes) {
  return changedVidaValue(changes, "delta")
    ?? changedVidaValue(changes, "actorData")
    ?? changedVidaValue(changes);
}

async function recordObservedLifeLoss(actor, before, after, reason = "damage") {
  const loss = calculateMarcoLifeLoss(before, after);
  if (!actor || loss <= 0) return;
  const previous = processedLifeUpdates.get(actor);
  if (previous?.before === Number(before) && previous?.after === Number(after)) return;
  processedLifeUpdates.set(actor, { before: Number(before), after: Number(after) });
  await recordMarcoLifeLoss(actor, loss, { reason });
}

function registerLifeTrackingHooks() {
  if (lifeTrackingHooksRegistered) return;
  lifeTrackingHooksRegistered = true;
  Hooks.on("preUpdateActor", (actor, changes, options = {}) => {
    const after = changedVidaValue(changes);
    if (after === undefined) return;
    pendingActorLifeUpdates.set(actor, { before: Number(actor.system?.resources?.vida?.value), after: Number(after), reason: options.cmetLifeLossReason ?? "damage" });
  });
  Hooks.on("updateActor", async (actor) => {
    const pending = pendingActorLifeUpdates.get(actor);
    pendingActorLifeUpdates.delete(actor);
    if (!pending) return;
    await recordObservedLifeLoss(actor, pending.before, Number(actor.system?.resources?.vida?.value), pending.reason);
  });
  Hooks.on("preUpdateToken", (token, changes) => {
    const after = tokenChangedVidaValue(changes);
    const actor = token?.actor;
    if (after === undefined || !actor) return;
    pendingTokenLifeUpdates.set(token, { actor, before: Number(actor.system?.resources?.vida?.value), after: Number(after) });
  });
  Hooks.on("updateToken", async (token) => {
    const pending = pendingTokenLifeUpdates.get(token);
    pendingTokenLifeUpdates.delete(token);
    if (!pending) return;
    await recordObservedLifeLoss(pending.actor ?? token.actor, pending.before, Number(token.actor?.system?.resources?.vida?.value), "damage");
  });
}

export function registerMarcoAbilityHooks() {
  registerLifeTrackingHooks();
  Hooks.on("deleteCombat", endMarcoCombat);
  Hooks.on("updateCombat", async (combat, changes) => { if (changes.started === false) await endMarcoCombat(combat); });
  Hooks.on("combatTurnChange", async (combat) => {
    for (const actor of combatActors()) {
      const auras = actor.getFlag?.(SYSTEM_ID, AURA_FLAG) ?? [];
      if (!auras.length) continue;
      const next = [];
      for (const aura of auras) {
        const remaining = Number(aura.turnsRemaining) - 1;
        if (remaining > 0) { next.push({ ...aura, turnsRemaining: remaining }); if (aura.healPerTurn) await actor.update({ "system.resources.vida.value": Math.min(10 + Number(actor.system.attributes?.fisico?.value || 0) + Number(actor.system.attributes?.mental?.value || 0), Number(actor.system.resources.vida.value) + Number(aura.healPerTurn)) }); }
      }
      if (next.length) await actor.setFlag(SYSTEM_ID, AURA_FLAG, next); else await actor.unsetFlag(SYSTEM_ID, AURA_FLAG);
    }
  });
}

export const MarcoAbilityService = Object.freeze({ getMarcoLifeLoss, getManifestationStatus, recordMarcoLifeLoss, consumeManifestationThreshold, calculateMarcoLifeLoss, calculateMarcoConversion, calculateMarcoLifeAfterSacrifice, calculateMarcoRecovery, isMarcoDeathEventDuplicate, isMarcoAuraInRange, activateProfaneConversion, getMarcoAuraModifier, activateManifestation, activateLastSpark, activateChildOfHel, registerMarcoDeathChoice, endMarcoCombat, registerMarcoAbilityHooks });
