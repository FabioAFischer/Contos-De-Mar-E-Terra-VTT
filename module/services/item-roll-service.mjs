import { ITEM_TYPES, SKILL_LABELS } from "../config/constants.mjs";
import { findSkillDefinition } from "./skill-roll-service.mjs";
import { openSkillRollDialog } from "../dialogs/skill-roll-dialog.mjs";
import { getDraummaModifierSources, getDraummaSkillModifier } from "./ability-da-draumma-service.mjs";

function getItemSkillKey(item) {
  if (!item?.system) return "";
  if (item.type === ITEM_TYPES.ARMA) return item.system.combatSkill ?? "";
  if (item.type === ITEM_TYPES.MAGIA) return item.system.school ?? "";
  if (item.type === ITEM_TYPES.HABILIDADE) return item.system.rollSkill ?? "";
  return "";
}

function getItemSkillLabel(item, skillKey) {
  if (item?.type === ITEM_TYPES.MAGIA) {
    return game.i18n.localize(`CMET.Spell.Schools.${skillKey}`);
  }
  return SKILL_LABELS[skillKey] ?? skillKey;
}

export function resolveItemRollSkill(item) {
  const skillKey = getItemSkillKey(item);
  if (!skillKey || !findSkillDefinition(skillKey)) return null;
  return { skillKey, skillLabel: getItemSkillLabel(item, skillKey) };
}

export function rollItemSkill({ actor, item } = {}) {
  const resolved = resolveItemRollSkill(item);
  if (!resolved) {
    ui.notifications.warn(game.i18n.localize("CMET.Rolling.InvalidItemSkill"));
    return null;
  }
  const definition = findSkillDefinition(resolved.skillKey);
  const baseValue = actor?.system?.attributes?.[definition.key]?.skills?.[resolved.skillKey];
  if (!Number.isFinite(Number(baseValue))) {
    ui.notifications.warn(game.i18n.localize("CMET.Rolling.InvalidItemSkill"));
    return null;
  }
  return openSkillRollDialog({ actor, skillKey: resolved.skillKey, skillLabel: resolved.skillLabel, baseValue, initialModifier: getDraummaSkillModifier(actor, resolved.skillKey), context: { modifierSources: getDraummaModifierSources(actor, resolved.skillKey) } });
}
