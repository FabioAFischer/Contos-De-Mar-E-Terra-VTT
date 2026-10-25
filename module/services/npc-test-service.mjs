import { NPC_DEFENSE_ATTRIBUTES, NPC_SPELL_ATTRIBUTE, NPC_WEAPON_ATTRIBUTES } from "../config/npc-config.mjs";

export function isNpc(actor) {
  return actor?.type === "npc";
}

export function resolveNpcAttributeKey(attributeKey, { context = "generic" } = {}) {
  if (context === "defense") return NPC_DEFENSE_ATTRIBUTES[attributeKey] ?? attributeKey;
  return NPC_WEAPON_ATTRIBUTES[attributeKey] ?? attributeKey;
}

export function resolveActorTestValue(actor, key, { context = "generic" } = {}) {
  if (!isNpc(actor)) return Number(actor?.system?.attributes?.[key]?.skills?.[key]);
  const attributeKey = resolveNpcAttributeKey(key, { context });
  return Number(actor.system?.attributes?.[attributeKey]?.value);
}

export function resolveNpcSpellAttribute(actor) {
  return isNpc(actor) ? NPC_SPELL_ATTRIBUTE : null;
}
