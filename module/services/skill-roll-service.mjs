import { ATTRIBUTE_DEFINITIONS, SKILL_LABELS } from "../config/constants.mjs";

export const SKILL_ROLL_MODES = Object.freeze({
  NORMAL: "normal",
  ADVANTAGE: "advantage",
  DISADVANTAGE: "disadvantage"
});

export const SKILL_ROLL_DEGREES = Object.freeze({
  CRITICAL_SUCCESS: "criticalSuccess",
  OPTIMAL_SUCCESS: "optimalSuccess",
  GOOD_SUCCESS: "goodSuccess",
  NORMAL_SUCCESS: "normalSuccess",
  NORMAL_FAILURE: "normalFailure",
  GRAVE_FAILURE: "graveFailure",
  SEVERE_FAILURE: "severeFailure",
  CRITICAL_FAILURE: "criticalFailure"
});

const SUCCESS_RANK = Object.freeze({
  [SKILL_ROLL_DEGREES.NORMAL_SUCCESS]: 1,
  [SKILL_ROLL_DEGREES.GOOD_SUCCESS]: 2,
  [SKILL_ROLL_DEGREES.OPTIMAL_SUCCESS]: 3,
  [SKILL_ROLL_DEGREES.CRITICAL_SUCCESS]: 4
});

export function compareSkillRolls(attack, defense) {
  if (!attack?.success) return { winner: "defense", reason: "attackFailure" };
  if (!defense) return { winner: "attack", reason: "noDefense" };
  if (!defense.success) return { winner: "attack", reason: "defenseFailure" };
  const attackRank = SUCCESS_RANK[attack.degree] ?? 0;
  const defenseRank = SUCCESS_RANK[defense.degree] ?? 0;
  if (attackRank > defenseRank) return { winner: "attack", reason: "degree" };
  if (defenseRank > attackRank) return { winner: "defense", reason: "degree" };
  if (attack.selectedRoll < defense.selectedRoll) return { winner: "attack", reason: "roll" };
  if (defense.selectedRoll < attack.selectedRoll) return { winner: "defense", reason: "roll" };
  return { winner: "defense", reason: "absoluteTie" };
}

const SUCCESS_DEGREES = new Set([
  SKILL_ROLL_DEGREES.CRITICAL_SUCCESS,
  SKILL_ROLL_DEGREES.OPTIMAL_SUCCESS,
  SKILL_ROLL_DEGREES.GOOD_SUCCESS,
  SKILL_ROLL_DEGREES.NORMAL_SUCCESS
]);

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function findSkillDefinition(skillKey) {
  return ATTRIBUTE_DEFINITIONS.find(({ skills }) => skills.includes(skillKey));
}

export function calculateEffectiveTarget(baseValue, modifier = 0) {
  const base = Number(baseValue);
  const adjustment = Number(modifier);
  if (!Number.isFinite(base) || !Number.isFinite(adjustment)) throw new TypeError("CMET | Valores inválidos para o teste de perícia.");
  const rawTarget = base + adjustment;
  return { rawTarget, effectiveTarget: clamp(rawTarget, 1, 99) };
}

export function calculateThresholds(effectiveTarget) {
  const target = clamp(Number(effectiveTarget), 1, 99);
  const failureRange = 100 - target;
  return {
    criticalSuccess: 1,
    optimalMax: Math.floor(target / 5),
    goodMax: Math.floor(target / 2),
    successMax: target,
    normalFailureMax: Math.floor(target + failureRange / 2),
    graveFailureMax: Math.floor(target + (failureRange * 4) / 5),
    severeFailureMax: 99,
    criticalFailure: 100
  };
}

export function classifySkillRoll(roll, effectiveTarget) {
  const result = Number(roll);
  const thresholds = calculateThresholds(effectiveTarget);
  if (!Number.isInteger(result) || result < 1 || result > 100) throw new RangeError("CMET | Resultado de d100 inválido.");
  if (result === thresholds.criticalSuccess) return SKILL_ROLL_DEGREES.CRITICAL_SUCCESS;
  if (result <= thresholds.optimalMax) return SKILL_ROLL_DEGREES.OPTIMAL_SUCCESS;
  if (result <= thresholds.goodMax) return SKILL_ROLL_DEGREES.GOOD_SUCCESS;
  if (result <= thresholds.successMax) return SKILL_ROLL_DEGREES.NORMAL_SUCCESS;
  if (result === thresholds.criticalFailure) return SKILL_ROLL_DEGREES.CRITICAL_FAILURE;
  if (result <= thresholds.normalFailureMax) return SKILL_ROLL_DEGREES.NORMAL_FAILURE;
  if (result <= thresholds.graveFailureMax) return SKILL_ROLL_DEGREES.GRAVE_FAILURE;
  return SKILL_ROLL_DEGREES.SEVERE_FAILURE;
}

function getRollCount(rollMode) {
  if (!Object.values(SKILL_ROLL_MODES).includes(rollMode)) throw new RangeError("CMET | Tipo de rolagem inválido.");
  return rollMode === SKILL_ROLL_MODES.NORMAL ? 1 : 2;
}

function getRollFormula(rollMode) {
  getRollCount(rollMode);
  if (rollMode === SKILL_ROLL_MODES.ADVANTAGE) return "2d100kl";
  if (rollMode === SKILL_ROLL_MODES.DISADVANTAGE) return "2d100kh";
  return "1d100";
}

export function extractRollData(roll) {
  const die = roll.dice?.find((term) => Array.isArray(term.results));
  if (!die || !die.results.length) throw new Error("CMET | Não foi possível extrair os resultados do d100.");
  const rollResults = die.results.map(({ result, active, discarded }) => ({
    value: result,
    active: active !== false,
    discarded: Boolean(discarded)
  }));
  const selectedResults = rollResults.filter(({ active }) => active);
  if (selectedResults.length !== 1 || !Number.isInteger(roll.total)) throw new Error("CMET | O Roll não possui um resultado selecionado válido.");
  return {
    rolls: rollResults.map(({ value }) => value),
    rollResults,
    selectedRoll: roll.total
  };
}

export async function rollSkill({ actor, skillKey, modifier = 0, rollMode = SKILL_ROLL_MODES.NORMAL, rollClass, beforeRoll, context } = {}) {
  const definition = findSkillDefinition(skillKey);
  const baseValue = definition && Number(actor?.system?.attributes?.[definition.key]?.skills?.[skillKey]);
  if (!definition || !Number.isFinite(baseValue)) throw new TypeError("CMET | Perícia inválida para rolagem.");

  const adjustment = modifier === "" || modifier === null || modifier === undefined ? 0 : Number(modifier);
  if (!Number.isInteger(adjustment)) throw new TypeError("CMET | O modificador deve ser um número inteiro.");
  const { rawTarget, effectiveTarget } = calculateEffectiveTarget(baseValue, adjustment);
  const formula = getRollFormula(rollMode);
  if (beforeRoll && (await beforeRoll()) === false) return null;
  const DiceRoll = rollClass ?? Roll;
  const roll = new DiceRoll(formula);
  await roll.evaluate();
  const rollData = extractRollData(roll);
  const { rolls, selectedRoll } = rollData;
  const degree = classifySkillRoll(selectedRoll, effectiveTarget);
  return {
    actorId: actor.id,
    actorName: actor.name,
    skillKey,
    skillLabel: SKILL_LABELS[skillKey] ?? skillKey,
    baseValue,
    modifier: adjustment,
    rawTarget,
    effectiveTarget,
    rollMode,
    formula,
    rolls,
    rollResults: rollData.rollResults,
    selectedRoll,
    thresholds: calculateThresholds(effectiveTarget),
    degree,
    success: SUCCESS_DEGREES.has(degree),
    context,
    roll
  };
}

function getContextTitle(context) {
  if (context?.type === "abilityDa") {
    return [context.itemName, context.effectName].filter(Boolean).join(" — ");
  }
  if (context?.type === "attack") {
    return `${context.attackerName} ${game.i18n.localize("CMET.CombatAttack.Attacked")} ${context.defenderName}`;
  }
  if (context?.type === "defense") {
    return `${context.defenderName} ${game.i18n.localize("CMET.CombatAttack.Defended")}`;
  }
  return "";
}

export async function sendSkillRollToChat(result, { context: rollContext = result.context, actor: explicitActor = null } = {}) {
  const localize = (key) => game.i18n.localize(`CMET.Rolling.${key}`);
  const rollModeLabel = result.rollMode === SKILL_ROLL_MODES.ADVANTAGE ? localize("Advantage") : result.rollMode === SKILL_ROLL_MODES.DISADVANTAGE ? localize("Disadvantage") : "";
  const { roll: nativeRoll, ...presentationResult } = result;
  const presentationContext = {
    ...presentationResult,
    modifier: presentationResult.modifier === 0 ? "0" : `${presentationResult.modifier > 0 ? "+" : ""}${presentationResult.modifier}`,
    degreeLabel: localize(presentationResult.degree),
    rollModeLabel,
    showRollMode: Boolean(rollModeLabel),
    rolls: presentationResult.rollResults.map(({ value, active, discarded }) => ({ value, selected: active, discarded })),
    contextTitle: getContextTitle(rollContext),
    contextWeapon: rollContext?.type === "attack" ? rollContext.weaponName : ""
  };
  const { renderTemplate } = foundry.applications.handlebars;
  const content = await renderTemplate("systems/contos-de-mar-e-terra/templates/chat/skill-roll-card.hbs", presentationContext);
  const actor = explicitActor ?? presentationResult.actor ?? (presentationResult.actorId ? game.actors.get(presentationResult.actorId) : null);
  const speaker = ChatMessage.getSpeaker({ actor });
  const chatData = await nativeRoll.toMessage({ speaker, content }, { create: false });
  return ChatMessage.create(chatData);
}

export async function updateSkillRollMessage(message, outcomeKey) {
  if (!message || !["AttackHit", "AttackMiss", "AttackDefended"].includes(outcomeKey)) return message;
  if (message.content?.includes("data-cmet-combat-outcome")) return message;
  const outcomeLabel = game.i18n.localize(`CMET.CombatAttack.${outcomeKey}`);
  const footer = `<footer class="cmet-roll-outcome" data-cmet-combat-outcome="${outcomeKey}"><strong>${foundry.utils.escapeHTML(outcomeLabel)}</strong></footer>`;
  const closingTag = "</article>";
  const index = message.content?.lastIndexOf(closingTag) ?? -1;
  if (index < 0) return message;
  const content = `${message.content.slice(0, index)}${footer}${message.content.slice(index)}`;
  await message.update({ content });
  return message;
}
