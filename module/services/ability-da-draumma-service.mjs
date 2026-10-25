import { CombatActionService } from "./combat-action-service.mjs";
import { canPayAbilityDaCost, payAbilityDaCost, combatantFor } from "./ability-da-resource-service.mjs";
import { applySilencedCondition } from "./combat-condition-service.mjs";
import { findSkillDefinition, compareSkillRolls } from "./skill-roll-service.mjs";
import { measureTokenReachDistance } from "./weapon-combat-state-service.mjs";
import { calculateCharacterDerivedData } from "./character-calculations.mjs";

const SYSTEM_ID = "contos-de-mar-e-terra";
export const DRAUMMA_STATE_FLAG = "draummaDa";
export const DRAUMMA_DAMAGE_TYPES = Object.freeze(["fogo", "frio", "raio", "veneno", "radiante", "necrotico"]);
const stateWrites = new Map();

const clone = (value) => globalThis.foundry?.utils?.deepClone ? foundry.utils.deepClone(value) : structuredClone(value);
const namespace = () => globalThis.game?.system?.id ?? SYSTEM_ID;
const clean = (value) => String(value ?? "").replace(/[^A-Za-z0-9_-]/g, "_");

function tokenOf(actor) {
  return actor?.token?.document ?? actor?.token ?? [...(globalThis.canvas?.tokens?.placeables ?? [])].find((t) => t.actor?.id === actor?.id)?.document ?? null;
}

export function draummaActorKey(actor) {
  const token = tokenOf(actor);
  if (token && (token.actorLink === false || token.isLinked === false)) return `token-${clean(token.parent?.id ?? token.scene?.id ?? "scene")}-${clean(token.id ?? token._id)}`;
  return actor?.id ? `actor-${clean(actor.id)}` : null;
}

function combatState(combat) {
  return clone(combat?.getFlag?.(namespace(), DRAUMMA_STATE_FLAG) ?? { casts: {}, hits: {}, modifiers: {} });
}

async function writeState(combat, next) {
  if (!combat?.setFlag) return next;
  const key = combat.uuid ?? combat.id ?? "combat";
  const previous = stateWrites.get(key) ?? Promise.resolve();
  const operation = previous.then(() => combat.setFlag(namespace(), DRAUMMA_STATE_FLAG, next));
  stateWrites.set(key, operation.catch(() => undefined));
  try { await operation; } finally { if (stateWrites.get(key) === operation) stateWrites.delete(key); }
  return next;
}

export function damageTypeFromD6(value) { return DRAUMMA_DAMAGE_TYPES[Math.min(6, Math.max(1, Number(value))) - 1] ?? null; }

export function rewriteSpellDamageType(spell, damageType) {
  if (!spell || !DRAUMMA_DAMAGE_TYPES.includes(damageType)) return null;
  const next = clone(spell);
  const system = next.system ?? (next.system = {});
  const originalType = system.damageType ?? system.damage?.type ?? null;
  if (Array.isArray(system.damage)) {
    system.damage = system.damage.map((part) => ({ ...part, type: damageType, types: Array.isArray(part.types) ? [damageType] : part.types }));
  } else if (system.damage && typeof system.damage === "object") {
    system.damage = { ...system.damage, type: damageType, types: Array.isArray(system.damage.types) ? [damageType] : system.damage.types };
  }
  system.damageType = damageType;
  return { spell: next, originalType, damageType };
}

export function calculateManaSiphonTransfer({ targetMana, draummaMana, draummaMaxMana, rolled }) {
  const amount = Math.max(0, Math.min(Number(rolled) || 0, Number(targetMana) || 0, Math.max(0, (Number(draummaMaxMana) || 0) - (Number(draummaMana) || 0))));
  return { amount, targetMana: Math.max(0, Number(targetMana) - amount), draummaMana: Number(draummaMana) + amount };
}

export function nextTrickModifier(modifier, skillKey, amount, dice = []) {
  return { source: "draumma-truque-de-mestre", skillKey, amount: Number(amount) || 0, dice: dice.map(Number).filter(Number.isFinite), active: true };
}

export function getDraummaSkillModifier(actor, skillKey) {
  return (actor?.getFlag?.(namespace(), "daModifiers") ?? [])
    .filter((entry) => entry.source === "draumma-truque-de-mestre" && entry.active !== false && entry.skillKey === skillKey)
    .reduce((total, entry) => total + (Number(entry.amount) || 0), 0);
}

export function getDraummaSkillModifierDetails(actor, skillKey) {
  return (actor?.getFlag?.(namespace(), "daModifiers") ?? [])
    .find((entry) => entry.source === "draumma-truque-de-mestre" && entry.active !== false && entry.skillKey === skillKey) ?? null;
}

export function getDraummaModifierSources(actor, skillKey) {
  const modifier = getDraummaSkillModifierDetails(actor, skillKey);
  if (!modifier) return [];
  const source = globalThis.game?.i18n?.localize?.("CMET.AbilityDa.Draumma.MasterTrick") ?? "Truque de Mestre";
  return [{ source, formula: "2d6", dice: modifier.dice ?? [], amount: Number(modifier.amount) || 0 }];
}

function extractD6Results(roll) {
  const die = roll?.dice?.find((term) => Number(term.faces) === 6 && Array.isArray(term.results));
  return die?.results?.map(({ result }) => Number(result)).filter(Number.isFinite) ?? [];
}

function turnKey(combat) { return combat ? `${combat.id}:${combat.round}:${combat.turn}` : null; }

function hitIsRelevantForTurn(hitTurnKey, combat) {
  const current = turnKey(combat)?.split(":");
  const hit = String(hitTurnKey ?? "").split(":");
  if (current?.length !== 3 || hit.length !== 3 || current[0] !== hit[0]) return false;
  const currentRound = Number(current[1]);
  const currentTurn = Number(current[2]);
  const hitRound = Number(hit[1]);
  const hitTurn = Number(hit[2]);
  return Number.isInteger(currentRound) && Number.isInteger(currentTurn)
    && Number.isInteger(hitRound) && Number.isInteger(hitTurn)
    && hitRound === currentRound && hitTurn <= currentTurn;
}

export async function recordDraummaSpellCast(combat, actor, { spellId = null, skillKey = null } = {}) {
  const key = draummaActorKey(actor); const currentTurn = turnKey(combat);
  if (!key || !currentTurn) return false;
  const state = combatState(combat);
  state.casts[key] = { turnKey: currentTurn, spellId, skillKey };
  await writeState(combat, state); return true;
}

export async function recordDraummaAttackHit(combat, actor, skillKey) {
  const key = draummaActorKey(actor); const currentTurn = turnKey(combat);
  if (!key || !currentTurn || !skillKey) return false;
  const state = combatState(combat);
  const existing = state.hits[key]?.turnKey === currentTurn ? state.hits[key].skills ?? [] : [];
  state.hits[key] = { turnKey: currentTurn, skills: [...new Set([...existing, skillKey])] };
  await writeState(combat, state); return true;
}

export function getDraummaHitSkills(combat, actor) {
  const entry = combatState(combat).hits[draummaActorKey(actor)];
  return hitIsRelevantForTurn(entry?.turnKey, combat) ? [...(entry.skills ?? [])] : [];
}

export async function activateDraummaAce({ actor, spell, rollD6 = () => new Roll("1d6").evaluate() } = {}) {
  if (!spell) return { valid: false, reason: "missingSpell" };
  const combatant = combatantFor(actor); const actionCost = { type: "actions", amount: 1 };
  const actionCheck = canPayAbilityDaCost(actor, actionCost); const manaCheck = canPayAbilityDaCost(actor, { type: "mana", amount: 5 });
  if (!actionCheck.valid || !manaCheck.valid) return { valid: false, reason: !actionCheck.valid ? actionCheck.reason : manaCheck.reason };
  await payAbilityDaCost(actor, actionCost); await payAbilityDaCost(actor, { type: "mana", amount: 5 });
  const roll = await rollD6(); const value = Number(roll?.total ?? roll); const damageType = damageTypeFromD6(value);
  return { valid: true, roll: value, damageType, ...rewriteSpellDamageType(spell, damageType), combatant };
}

export async function resolveDraummaMagicRedistribution({ defender, attacker, combatant, spell, attack, rollSkill } = {}) {
  const combat = combatant?.combat ?? globalThis.game?.combat;
  if (!combat?.started || !defender || !spell || !combatant) return { valid: false, reason: "missingMagicContext" };
  const ability = [...(defender.items?.contents ?? defender.items ?? [])].find((item) => item.type === "habilidadeDa" && item.name === "Redistribuição de Magia");
  if (!ability || CombatActionService.getState(combatant).reserved < 1) return { valid: false, reason: "noReaction" };
  const school = spell.system?.school ?? spell.system?.skillKey;
  if (!school || !findSkillDefinition(school)) return { valid: false, reason: "invalidMagicSkill" };
  await CombatActionService.spendReservedAction(combatant);
  const mana = Number(defender.system?.resources?.mana?.value ?? 0);
  const cost = Math.max(0, Number(spell.system?.manaCost ?? 0));
  await defender.update({ "system.resources.mana.value": Math.max(0, mana - Math.min(mana, cost)) });
  const result = await rollSkill?.({ actor: defender, skillKey: school, context: { type: "draummaRedistribuicao", spellName: spell.name } });
  const outcome = compareSkillRolls(result, attack);
  return { valid: true, result, outcome, redirected: outcome.winner === "attack", target: outcome.winner === "attack" ? attacker : defender, manaSpent: Math.min(mana, cost) };
}

export async function activateDraummaManaSiphon({ actor, targetActor, actorToken, targetToken, combat, rollFortitude, rollD6 = () => new Roll("1d6").evaluate() } = {}) {
  if (!combat?.started || !actor || !targetActor) return { valid: false, reason: "missingCombat" };
  const cast = combatState(combat).casts[draummaActorKey(targetActor)];
  if (!cast || cast.turnKey !== turnKey(combat)) return { valid: false, reason: "targetDidNotCast" };
  if (actorToken && targetToken && measureTokenReachDistance(actorToken, targetToken) > 1) return { valid: false, reason: "outOfRange" };
  const combatant = combatantFor(actor); if (!combatant || CombatActionService.getState(combatant).current < 1) return { valid: false, reason: "insufficientActions" };
  await CombatActionService.spendAction(combatant);
  const first = await rollFortitude?.(actor); if (!first?.success) return { valid: true, first, amount: 0, second: null };
  const roll = await rollD6();
  const targetMana = Number(targetActor.system?.resources?.mana?.value ?? 0);
  const draummaMana = Number(actor.system?.resources?.mana?.value ?? 0);
  const draummaMax = Number(actor.system?.resources?.mana?.max ?? calculateCharacterDerivedData(actor).manaMax ?? draummaMana);
  const transfer = calculateManaSiphonTransfer({ targetMana, draummaMana, draummaMaxMana: draummaMax, rolled: roll?.total ?? roll });
  await targetActor.update({ "system.resources.mana.value": transfer.targetMana });
  await actor.update({ "system.resources.mana.value": transfer.draummaMana });
  const second = await rollFortitude?.(targetActor);
  if (second && !second.success) await applySilencedCondition(targetActor, 2, "draumma-sifao-de-mana");
  return { valid: true, first, second, amount: transfer.amount, transfer };
}

export async function activateDraummaTrick({ actor, targetActor, combat, selectedSkillKey, roll2d6 = () => new Roll("2d6").evaluate() } = {}) {
  const skills = getDraummaHitSkills(combat, targetActor);
  if (!skills.length) return { valid: false, reason: "targetDidNotHit" };
  if (!selectedSkillKey && skills.length > 1) return { valid: false, reason: "requiresSkillSelection", skills };
  const skillKey = selectedSkillKey ?? skills[0]; if (!skills.includes(skillKey) || !findSkillDefinition(skillKey)) return { valid: false, reason: "invalidSkill" };
  const combatant = combatantFor(actor); if (!combatant || CombatActionService.getState(combatant).current < 1) return { valid: false, reason: "insufficientActions" };
  await CombatActionService.spendAction(combatant);
  const roll = await roll2d6(); const modifier = nextTrickModifier(null, skillKey, roll?.total ?? roll, extractD6Results(roll));
  const state = combatState(combat); const key = draummaActorKey(actor);
  state.modifiers[key] = modifier; await writeState(combat, state);
  const existingModifiers = actor.getFlag?.(namespace(), "daModifiers") ?? [];
  const retainedModifiers = existingModifiers.filter((entry) => entry.source !== "draumma-truque-de-mestre");
  await actor.setFlag(namespace(), "daModifiers", [...retainedModifiers, { ...modifier, targetId: "" }]);
  return { valid: true, skillKey, amount: modifier.amount, modifier, roll };
}

export async function resetDraummaCombatState(combat) {
  if (combat?.unsetFlag) await combat.unsetFlag(namespace(), DRAUMMA_STATE_FLAG);
  for (const actor of globalThis.game?.actors?.contents ?? []) {
    const modifiers = actor.getFlag?.(namespace(), "daModifiers") ?? [];
    const next = modifiers.filter((entry) => entry.source !== "draumma-truque-de-mestre");
    if (next.length !== modifiers.length) await actor.setFlag(namespace(), "daModifiers", next);
  }
}

export function registerDraummaAbilityHooks() {
  Hooks.on("deleteCombat", resetDraummaCombatState);
  Hooks.on("updateCombat", (combat, changes) => { if (changes.started === false) resetDraummaCombatState(combat); });
  Hooks.on("cmetActionSpent", async (actor, amount) => {
    const { consumeSilencedAction } = await import("./combat-condition-service.mjs");
    await consumeSilencedAction(actor, amount);
  });
}

export const DraummaAbilityService = Object.freeze({ activateDraummaAce, resolveDraummaMagicRedistribution, activateDraummaManaSiphon, activateDraummaTrick, recordDraummaSpellCast, recordDraummaAttackHit, getDraummaHitSkills, getDraummaSkillModifier, getDraummaSkillModifierDetails, getDraummaModifierSources, rewriteSpellDamageType });
