import { SKILL_LABELS, SYSTEM_ID } from "../config/constants.mjs";
import { DAMAGE_TYPES } from "../config/weapon-config.mjs";
import { CombatActionError, CombatActionService } from "./combat-action-service.mjs";
import { compareSkillRolls, findSkillDefinition, SKILL_ROLL_DEGREES, updateSkillRollMessage } from "./skill-roll-service.mjs";
import { openSkillRollDialog } from "../dialogs/skill-roll-dialog.mjs";
import { DamageRollService } from "./damage-roll-service.mjs";
import { DamageReductionService } from "./damage-reduction-service.mjs";
import { DamageApplicationService } from "./damage-application-service.mjs";
import { getActorUpdateAuthority } from "./combat-authority-service.mjs";
import { applyRetaliar, canFire, characteristicEnabled, shouldUnloadAfterShot, canThrow } from "./weapon-characteristics-service.mjs";
import { arePotentialAdversaries, getLateralEnemies, getSequentialBonusCount, pointWeakBonusState, recordImpactOutcome, recordPointWeakAttack, recordSequentialOutcome, impactSequenceBonusState, isAtMaximumWeaponRange, measureTokenDistanceAtPosition, measureTokenDistance, measureTokenReachDistance, didCrossWeaponReach, isAttackerBehindDefender, getTargetPositionRelativeToAttacker, canApplyManeuverWeaponBonus } from "./weapon-combat-state-service.mjs";
import { applyDazedCondition } from "./combat-condition-service.mjs";
import { isForcedPullMovement, processPullMovementRequest, recordPullMovementConfirmation, requestPullMovement, resolvePullMovementResponse } from "./weapon-pull-service.mjs";
import { getEffectiveWeaponCharacteristics, resolveEffectiveWeaponWielding, validateCombinedWeaponAttack } from "./weapon-wielding-service.mjs";
import { applyConditionalAbilityDaEffects } from "./ability-da-service.mjs";
import { getMarcoAuraModifier } from "./ability-da-marco-service.mjs";

export const SUCCESS_RANK = Object.freeze({
  [SKILL_ROLL_DEGREES.NORMAL_SUCCESS]: 1,
  [SKILL_ROLL_DEGREES.GOOD_SUCCESS]: 2,
  [SKILL_ROLL_DEGREES.OPTIMAL_SUCCESS]: 3,
  [SKILL_ROLL_DEGREES.CRITICAL_SUCCESS]: 4
});

const SOCKET_CHANNEL = `system.${SYSTEM_ID}`;
let pendingAttack = null;
let hooksRegistered = false;
const reactionRequests = new Set();
const pendingReactionRequests = new Map();
const activeReactionDialogs = new Map();
const DEBUG_POLEARM_REACTION = false;

function debugPolearm(message, data = {}) {
  if (DEBUG_POLEARM_REACTION) console.debug(`[HASTE] ${message}`, data);
}

function notify(key, data = {}) {
  const message = Object.keys(data).length
    ? game.i18n.format(`CMET.CombatAttack.Notifications.${key}`, data)
    : game.i18n.localize(`CMET.CombatAttack.Notifications.${key}`);
  ui.notifications.warn(message);
}

function getMarcoAttackModifier(attacker, defender, skillKey) {
  try { return getMarcoAuraModifier({ attacker, defender, skillKey }); } catch { return 0; }
}

function getCombatantForToken(combat, token) {
  const tokenId = token?.document?.id ?? token?.id;
  return combat?.combatants.find((combatant) => combatant.tokenId === tokenId) ?? null;
}

function getAttackerToken(actor, combat) {
  const controlled = globalThis.canvas?.tokens?.controlled?.find((token) => token.actor?.id === actor.id);
  if (controlled) return controlled;
  const matching = combat?.combatants.find((combatant) => combatant.actor?.id === actor.id);
  return matching?.token?.object ?? null;
}

function getSingleTarget() {
  const targets = Array.from(game.user.targets ?? []);
  return targets.length === 1 ? targets[0] : null;
}

export function validateRearStrikeTargets({ actor, item, attackerToken, combat, targetTokens }) {
  if (!characteristicEnabled(item, "golpeDeRetaguarda")) return { valid: false, reason: "RearStrikeUnavailable" };
  if (!Array.isArray(targetTokens) || targetTokens.length !== 2) return { valid: false, reason: "RearStrikeRequiresTwoTargets" };
  const ids = targetTokens.map((token) => token?.document?.id ?? token?.id);
  if (ids.some((id, index) => !id || ids.indexOf(id) !== index)) return { valid: false, reason: "RearStrikeRequiresTwoTargets" };
  const attackerId = attackerToken?.document?.id ?? attackerToken?.id;
  if (targetTokens.some((token) => (token?.document?.id ?? token?.id) === attackerId)) return { valid: false, reason: "CannotTargetSelf" };
  if (targetTokens.some((token) => !arePotentialAdversaries(attackerToken, token))) return { valid: false, reason: "RearStrikeInvalidTarget" };
  const actorIds = targetTokens.map((token) => token?.actor?.id).filter(Boolean);
  if (actorIds.length === 2 && actorIds[0] === actorIds[1]) return { valid: false, reason: "RearStrikeInvalidTarget" };
  const combatants = targetTokens.map((token) => getCombatantForToken(combat, token));
  if (combatants.some((combatant) => !combatant?.actor)) return { valid: false, reason: "TargetNotInCombat" };
  const range = item.system.characteristics?.alcance;
  if (range?.enabled === true) {
    const maximum = Number(range.spaces);
    if (!Number.isInteger(maximum) || maximum <= 0 || targetTokens.some((token) => measureTokenReachDistance(attackerToken, token) > maximum)) {
      return { valid: false, reason: "WeaponRangeExceeded" };
    }
  }
  const polearm = item.system.characteristics?.armaDeHaste;
  if (polearm?.enabled === true) {
    const maximum = Number(polearm.spaces);
    if (Number.isFinite(maximum) && maximum > 0 && targetTokens.some((token) => measureTokenDistance(attackerToken, token) > maximum)) {
      return { valid: false, reason: "WeaponRangeExceeded" };
    }
  }
  const positions = targetTokens.map((token) => getTargetPositionRelativeToAttacker(attackerToken, token));
  if (positions.includes(null) || positions.filter((position) => position === "frente").length !== 1 || positions.filter((position) => position === "costas").length !== 1) {
    return { valid: false, reason: "RearStrikeInvalidPosition" };
  }
  const orderedTargets = targetTokens
    .map((token, index) => ({ token, position: positions[index] }))
    .sort((first, second) => Number(second.position === "frente") - Number(first.position === "frente"));
  return {
    valid: true,
    targetTokens: orderedTargets.map(({ token }) => token),
    positions
  };
}

function notifyInfo(key) {
  ui.notifications.info(game.i18n.localize(`CMET.CombatAttack.${key}`));
}

function isValidPullConfiguration(item) {
  const spaces = Number(item?.system?.characteristics?.puxar?.spaces);
  return characteristicEnabled(item, "puxar") && Number.isInteger(spaces) && spaces > 0;
}

function notifyPullConfiguration(item) {
  return notify("InvalidPullSpaces", { weapon: item?.name ?? "" });
}

function escapeChatText(value) {
  return foundry.utils.escapeHTML?.(String(value ?? "")) ?? String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
}

async function sendPullOutcomeToChat({ actor, attackerName, defenderName, weaponName, attack, outcome = null, movement = null }) {
  if (!attack?.success || outcome?.winner !== "attack") return null;

  const movedSpaces = Number(movement?.movedSpaces) || 0;
  if (movedSpaces > 0) return null;

  let key;
  if (movement?.failureReason === "noSpace") key = "PullResultBlocked";
  else key = "PullResultMovementFailed";
  const content = game.i18n.format(`CMET.CombatAttack.${key}`, {
    attackerName: escapeChatText(attackerName),
    defenderName: escapeChatText(defenderName),
    weaponName: escapeChatText(weaponName),
    movedSpaces
  });
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<p class="cmet-pull-result">${content}</p>`
  });
}

function clearPendingAttack() {
  pendingAttack = null;
}

function queuePendingAttack(actor, item, combat, attackMode = "normal") {
  pendingAttack = {
    actorId: actor.id,
    itemId: item.id,
    combatId: combat.id,
    attackMode
  };
  notifyInfo("SelectTargetToContinue");
}

function resolveAttackSkill(actor, item) {
  const skillKey = item?.system?.combatSkill;
  const definition = findSkillDefinition(skillKey);
  const baseValue = definition && actor.system.attributes[definition.key]?.skills?.[skillKey];
  if (!skillKey || !definition || !Number.isFinite(Number(baseValue))) {
    notify("InvalidWeaponSkill");
    return null;
  }
  return { skillKey, definition, baseValue };
}

function serializableRollResult(result) {
  const { roll: _roll, context: _context, ...serializable } = result;
  return serializable;
}

function combatantDisplayName(combatant, actor) {
  return combatant?.name ?? combatant?.token?.name ?? actor?.name ?? "";
}

function isPhysicalProjectileAttack(item, { thrownAttack = false } = {}) {
  if (thrownAttack) return true;
  if (item?.system?.combatSkill !== "arcos") return false;
  return (item.system.damage ?? []).some((part) => part.nature === "physical");
}

function hasEmpunhedCutterWeapon(actor) {
  const hands = actor?.system?.hands ?? {};
  return [hands.mainHand, hands.offHand].filter(Boolean).some((id) => {
    const item = actor.items.get(id);
    return item?.type === "arma" && item.system?.equipped === true && item.system?.characteristics?.cortarProjeteis?.enabled === true;
  });
}

function getWeaponHand(actor, item) {
  const hands = actor?.system?.hands ?? {};
  if (hands.mainHand === item?.id) return "mainHand";
  if (hands.offHand === item?.id) return "offHand";
  return null;
}

function isEffectivelyWielded(actor, item) {
  const hand = getWeaponHand(actor, item);
  if (!hand) return item?.system?.equipped === true && !item?.system?.characteristics?.duasMaos?.enabled;
  return getEffectiveWeaponCharacteristics(actor, item, hand).wielding.canWield;
}

function isEligiblePolearmWeapon(actor, item) {
  return item?.type === "arma"
    && item.system?.equipped === true
    && characteristicEnabled(item, "armaDeHaste")
    && isEffectivelyWielded(actor, item);
}

async function chooseVersatileSelections(item) {
  const parts = Array.isArray(item?.system?.damage) ? item.system.damage : [];
  const selections = {};
  for (const [index, part] of parts.entries()) {
    const options = Array.isArray(part.availableTypes) ? part.availableTypes : [];
    if (options.length < 2) continue;
    const { DialogV2 } = foundry.applications.api;
    const buttons = options.map((key) => ({ action: key, label: game.i18n.localize(DAMAGE_TYPES.find((entry) => entry.key === key)?.label ?? key), type: "button", callback: () => key }));
    const choice = await DialogV2.wait({
      window: { title: game.i18n.localize("CMET.CombatAttack.ChooseDamageType") },
      content: `<p>${game.i18n.localize("CMET.CombatAttack.ChooseDamageType")}</p>`,
      buttons
    });
    if (choice) selections[index] = choice;
  }
  return selections;
}


export function compareAttackAndDefense(attack, defense) {
  return compareSkillRolls(attack, defense);
}

function outcomeKey(outcome) {
  return outcome.winner === "attack" ? "AttackHit"
    : outcome.reason === "attackFailure" ? "AttackMiss" : "AttackDefended";
}

async function updateDefenseOutcome({ messageId, responsibleId, outcome }) {
  if (!messageId || !responsibleId) return;
  const key = outcomeKey(outcome);
  if (responsibleId === game.user.id) {
    await updateSkillRollMessage(game.messages.get(messageId), key);
    return;
  }
  game.socket.emit(SOCKET_CHANNEL, {
    type: "combat-defense-outcome",
    targetUserId: responsibleId,
    messageId,
    outcomeKey: key
  });
}

function getDaDefenseModifier(defender, attacker, skillKey) {
  if (!["bloquear", "esquivar"].includes(skillKey)) return 0;
  const modifiers = defender?.getFlag?.(game.system.id, "daModifiers") ?? [];
  return modifiers
    .filter((modifier) => modifier.skillKey === skillKey && modifier.targetId === attacker?.id)
    .reduce((total, modifier) => total + (Number(modifier.amount) || 0), 0) + getMarcoAttackModifier(attacker, defender, skillKey);
}

function openDefenseChoice({ defender, attacker, combatant, respond, allowBlock = true }) {
  const { DialogV2 } = foundry.applications.api;
  const localize = (key) => game.i18n.localize(`CMET.CombatAttack.${key}`);
  let answered = false;
  let choiceStarted = false;
  const answer = (payload) => {
    if (answered) return;
    answered = true;
    respond(payload);
  };
  const dialog = new DialogV2({
    window: { title: localize("ChooseDefense") },
    content: `<p>${localize("ChooseDefense")}</p>`,
    buttons: [
      { action: "dodge", label: localize("Dodge"), type: "button", callback: () => "dodge" },
      ...(allowBlock ? [{ action: "block", label: localize("Block"), type: "button", callback: () => "block" }] : []),
      { action: "none", label: localize("NoDefense"), type: "button", callback: () => "none" }
    ],
    submit: async (choice) => {
      if (choice === "dodge" || choice === "block") {
        choiceStarted = true;
        const skillKey = choice === "dodge" ? "esquivar" : "bloquear";
        const definition = findSkillDefinition(skillKey);
        const baseValue = defender.system.attributes[definition.key].skills[skillKey];
        return openSkillRollDialog({
          actor: defender,
          skillKey,
          skillLabel: SKILL_LABELS[skillKey],
            baseValue,
            initialModifier: getDaDefenseModifier(defender, attacker, skillKey),
          titleKey: "DefenseRoll",
          context: {
            type: "defense",
            defenderName: combatantDisplayName(combatant, defender)
          },
          beforeRoll: async () => {
            try {
              await CombatActionService.spendReservedAction(combatant);
              return true;
            } catch (error) {
              if (error instanceof CombatActionError) notify(error.code === "insufficientReserved" ? "ReservedActionInsufficient" : "InvalidActionState");
              return false;
            }
          },
          onResult: async (result, message) => answer({ choice, rollResult: serializableRollResult(result), messageId: message?.id }),
          onCancel: () => answer({ choice: "none" })
        });
      }
      return answer({ choice: "none" });
    }
  });
  dialog.addEventListener("close", () => {
    if (!choiceStarted) answer({ choice: "none" });
  }, { once: true });
  return dialog.render({ force: true });
}

async function requestDefense({ combatantId, defenderId, requestId, projectile = false }) {
  return new Promise((resolve) => {
    const handler = (message) => {
      if (message?.type !== "combat-defense-response" || message.requestId !== requestId) return;
      Hooks.off("cmetCombatDefenseResponse", handler);
      resolve(message);
    };
    Hooks.on("cmetCombatDefenseResponse", handler);
    game.socket.emit(SOCKET_CHANNEL, { type: "combat-defense-request", requestId, combatantId, defenderId, requesterId: game.user.id, projectile });
    setTimeout(() => {
      Hooks.off("cmetCombatDefenseResponse", handler);
      resolve({ choice: "none" });
    }, 120000);
  });
}

async function resolveDefense({ targetCombatant, targetActor, attacker, item, attack, projectile = false }) {
  const state = CombatActionService.getState(targetCombatant);
  if (state.reserved <= 0) return { defense: null, reason: "noReserved" };
  const requestId = foundry.utils.randomID();
  const responsible = getActorUpdateAuthority(targetActor);
  if (!responsible) return { defense: null, reason: "noReserved" };
  const respond = (payload) => game.socket.emit(SOCKET_CHANNEL, { type: "combat-defense-response", requestId, requesterId: game.user.id, ...payload });
  let response;
  if (responsible.id === game.user.id) {
    openDefenseChoice({ defender: targetActor, attacker, combatant: targetCombatant, allowBlock: !projectile || hasEmpunhedCutterWeapon(targetActor), respond: (payload) => { response = payload; } });
    response = await new Promise((resolve) => {
      const check = () => response ? resolve(response) : setTimeout(check, 50);
      check();
    });
  } else {
    response = await requestDefense({ combatantId: targetCombatant.id, defenderId: targetActor.id, requestId, projectile });
  }
  return {
    defense: response.rollResult ?? null,
    reason: response.choice === "none" ? "noDefense" : "defense",
    messageId: response.messageId ?? null,
    responsibleId: responsible.id
  };
}

async function prepareWeaponAttack({ actor, item, targetToken, targetTokens = null, combat, reaction = false, thrownAttack = false, attackMode = "normal", combinedAttack = false, actionGate = null, disableCharacteristics = false, unarmed = false, ignoreSequentialState = false, attackerToken: providedAttackerToken = null, attackerCombatant: providedAttackerCombatant = null, onComplete = null }) {
  const fail = (key, data = {}) => {
    const result = notify(key, data);
    onComplete?.({ status: "failed" });
    return result;
  };
  if (attackMode === "golpeDeRetaguarda" && (disableCharacteristics || reaction || thrownAttack)) return fail("RearStrikeUnavailable");
  if (attackMode === "pull" && !isValidPullConfiguration(item)) return fail("InvalidPullSpaces");
  if (!disableCharacteristics && !unarmed && !canFire(item)) return fail("WeaponNotLoaded");
  if (!disableCharacteristics && !unarmed && !thrownAttack && !isEffectivelyWielded(actor, item)) return fail("WeaponNotWielded");
  const attackerToken = providedAttackerToken ?? getAttackerToken(actor, combat);
  const attackerCombatant = providedAttackerCombatant ?? getCombatantForToken(combat, attackerToken);
  if (!attackerCombatant) return fail("AttackerNotInCombat");
  if (!reaction && combat.combatant?.id !== attackerCombatant.id) return fail("NotActiveTurn");
  if (!reaction && !actionGate && CombatActionService.getState(attackerCombatant).current < 1) return fail("ActionInsufficient");
  if (reaction && CombatActionService.getState(attackerCombatant).reserved < 1) return fail("ReservedActionInsufficient");
  const targetCombatant = getCombatantForToken(combat, targetToken);
  if (!targetCombatant) return fail("TargetNotInCombat");
  const hasAbilityDa = [...(actor.items?.contents ?? actor.items ?? [])].some((entry) => entry.type === "habilidadeDa");
  if (hasAbilityDa) await applyConditionalAbilityDaEffects({ actor, targetActor: targetCombatant.actor, context: { targetToken, originToken: attackerToken } });
  const selectedTargets = targetTokens ?? [targetToken];
  if (!disableCharacteristics && characteristicEnabled(item, "alcance")) {
    const maximum = Number(item.system.characteristics.alcance?.spaces);
    if (!Number.isInteger(maximum) || maximum <= 0) return fail("WeaponRangeExceeded");
    for (const candidateToken of selectedTargets) {
      if (measureTokenReachDistance(attackerToken, candidateToken) > maximum) return fail("WeaponRangeExceeded");
    }
  }
  if (!disableCharacteristics && characteristicEnabled(item, "armaDeHaste") && !reaction) {
    const maximum = Number(item.system.characteristics.armaDeHaste?.spaces);
    if (Number.isFinite(maximum) && maximum > 0 && measureTokenDistance(attackerToken, targetToken) > maximum) return fail("WeaponRangeExceeded");
  }
  const attackerTokenId = attackerToken?.document?.id ?? attackerToken?.id;
  const targetTokenId = targetToken?.document?.id ?? targetToken?.id;
  if (targetCombatant.id === attackerCombatant.id || attackerTokenId === targetTokenId) return fail("CannotTargetSelf");
  const skill = thrownAttack ? resolveAttackSkill(actor, { ...item, system: { ...item.system, combatSkill: "arremessar" } }) : resolveAttackSkill(actor, item);
  if (!skill) {
    onComplete?.({ status: "failed" });
    return;
  }
  const attackerName = combatantDisplayName(attackerCombatant, actor);
  const defenderName = combatantDisplayName(targetCombatant, targetCombatant.actor);
  clearPendingAttack();
  const specialCharacteristicsDisabled = disableCharacteristics || attackMode === "pull";
  const maneuverWeapon = !specialCharacteristicsDisabled
    && !thrownAttack
    && !combinedAttack
    && canApplyManeuverWeaponBonus(actor, item);
  const apunhalharEligible = new Map(selectedTargets.map((candidateToken) => [
    candidateToken,
    !specialCharacteristicsDisabled
      && characteristicEnabled(item, "apunhalhar")
      && Boolean(item.system.characteristics.apunhalhar.damageFormula?.trim())
      && isAttackerBehindDefender(attackerToken, candidateToken)
  ]));
  const versatileSelections = specialCharacteristicsDisabled ? {} : await chooseVersatileSelections(item);
  return openSkillRollDialog({
    actor,
    skillKey: skill.skillKey,
    skillLabel: SKILL_LABELS[skill.skillKey],
    baseValue: skill.baseValue,
    initialModifier: getMarcoAttackModifier(actor, targetCombatant.actor, skill.skillKey),
    titleKey: "AttackRoll",
    context: {
      type: "attack",
      attackerName,
      defenderName,
      weaponName: item.name
    },
    onComplete,
    beforeRoll: async () => {
      try {
        if (actionGate?.spent) return true;
        if (reaction) await CombatActionService.spendReservedAction(attackerCombatant);
        else await CombatActionService.spendAction(attackerCombatant);
        if (actionGate) actionGate.spent = true;
        return true;
      } catch (error) {
        if (error instanceof CombatActionError) notify(error.code === "insufficientActions" ? "ActionInsufficient" : "InvalidActionState");
        return false;
      }
    },
    onResult: async (rawAttack, attackMessage) => {
      const sequentialCount = ignoreSequentialState ? 0 : getSequentialBonusCount(combat, actor, item);
      const pointWeakByTarget = new Map(selectedTargets.map((candidateToken) => [
        candidateToken,
        specialCharacteristicsDisabled ? false : pointWeakBonusState(combat, actor, item, attackerToken, candidateToken)
      ]));
      const impactSequenceByTarget = new Map(selectedTargets.map((candidateToken) => [
        candidateToken,
        specialCharacteristicsDisabled ? false : impactSequenceBonusState(combat, actor, item, candidateToken)
      ]));
      const attack = specialCharacteristicsDisabled ? rawAttack : applyRetaliar(rawAttack, item);
      if (!disableCharacteristics && shouldUnloadAfterShot(item)) await item.update({ "system.loaded": false });
      if (thrownAttack) await item.update({ "system.thrown": true });
      if (!attack.success) {
        if (!ignoreSequentialState) await recordSequentialOutcome(combat, actor, item, { effectiveHit: false });
        if (!disableCharacteristics) {
          for (const candidateToken of selectedTargets) {
            await recordImpactOutcome(combat, actor, item, candidateToken, { effectiveHit: false });
            if (characteristicEnabled(item, "pontoFraco")) await recordPointWeakAttack(combat, actor, item, attackerToken, candidateToken);
          }
        }
        await updateSkillRollMessage(attackMessage, "AttackMiss");
        if (attackMode === "pull") await sendPullOutcomeToChat({ actor, attackerName, defenderName, weaponName: item.name, attack });
        return;
      }
      let anyHit = false;
      const effectiveHitTargets = new Set();
      let sharedDamage = null;
      let sharedBaseDamage = null;
      const multiTargetAttack = selectedTargets.length > 1;
      for (const currentTargetToken of selectedTargets) {
        const currentTargetCombatant = getCombatantForToken(combat, currentTargetToken);
        if (!currentTargetCombatant?.actor) continue;
        const defenseResult = await resolveDefense({ targetCombatant: currentTargetCombatant, targetActor: currentTargetCombatant.actor, attacker: actor, item, attack, projectile: isPhysicalProjectileAttack(item, { thrownAttack }) });
        const { defense, reason } = defenseResult;
        const outcome = compareAttackAndDefense(attack, defense);
        const finalOutcome = { ...outcome, reason: defense ? outcome.reason : reason };
        if (defense) await updateDefenseOutcome({ ...defenseResult, outcome: finalOutcome });
        else if (!multiTargetAttack) await updateSkillRollMessage(attackMessage, outcomeKey(finalOutcome));
        const effectiveHit = finalOutcome.winner === "attack";
        if (!effectiveHit) {
          if (!specialCharacteristicsDisabled) {
            await recordImpactOutcome(combat, actor, item, currentTargetToken, { effectiveHit: false });
            if (characteristicEnabled(item, "pontoFraco")) await recordPointWeakAttack(combat, actor, item, attackerToken, currentTargetToken);
          }
          if (attackMode === "pull") await sendPullOutcomeToChat({ actor, attackerName, defenderName: combatantDisplayName(currentTargetCombatant, currentTargetCombatant.actor), weaponName: item.name, attack, outcome: finalOutcome });
          continue;
        }
        anyHit = true;
        effectiveHitTargets.add(currentTargetToken);
        if (!specialCharacteristicsDisabled) {
          await recordImpactOutcome(combat, actor, item, currentTargetToken, { effectiveHit: true });
          if (characteristicEnabled(item, "pontoFraco")) await recordPointWeakAttack(combat, actor, item, attackerToken, currentTargetToken);
        }
        if (attackMode === "pull") {
          const movement = await requestPullMovement({ attackerToken, targetToken: currentTargetToken, spaces: item.system.characteristics.puxar.spaces, combatId: combat.id });
          await sendPullOutcomeToChat({ actor, attackerName, defenderName: combatantDisplayName(currentTargetCombatant, currentTargetCombatant.actor), weaponName: item.name, attack, outcome: finalOutcome, movement });
          continue;
        }
        const critical = attack.degree === SKILL_ROLL_DEGREES.CRITICAL_SUCCESS;
        const polearm = !reaction && characteristicEnabled(item, "armaDeHaste") && isAtMaximumWeaponRange(item, attackerToken, currentTargetToken);
        const reachDistance = !disableCharacteristics && characteristicEnabled(item, "alcance")
          ? measureTokenReachDistance(attackerToken, currentTargetToken)
          : null;
        const damageItem = disableCharacteristics ? { ...item, system: { ...item.system, characteristics: Object.fromEntries(Object.entries(item.system.characteristics ?? {}).map(([key, value]) => [key, { ...value, enabled: false }])) } } : item;
        const rearStrike = attackMode === "golpeDeRetaguarda";
        const apunhalharVariesByTarget = selectedTargets.length > 1
          && selectedTargets.some((candidateToken) => apunhalharEligible.get(candidateToken) !== apunhalharEligible.get(targetToken));
        const pointWeakVariesByTarget = selectedTargets.length > 1
          && selectedTargets.some((candidateToken) => pointWeakByTarget.get(candidateToken) !== pointWeakByTarget.get(targetToken));
        const distanceDamage = (!specialCharacteristicsDisabled && characteristicEnabled(item, "alcance")) || apunhalharVariesByTarget || pointWeakVariesByTarget;
        let damage = distanceDamage || rearStrike ? null : sharedDamage;
        if (!damage) {
          let baseComponents = null;
          if (rearStrike || apunhalharVariesByTarget) {
            if (!sharedBaseDamage) {
              sharedBaseDamage = await DamageRollService.rollWeaponBaseDamage(damageItem, { critical, versatileSelections });
              if (!sharedBaseDamage) continue;
            }
            baseComponents = sharedBaseDamage;
          }
          damage = await DamageRollService.rollWeaponDamage(damageItem, { attacker: attackerCombatant, target: currentTargetCombatant, critical, versatileSelections, sequentialCount, pointWeak: pointWeakByTarget.get(currentTargetToken) === true, apunhalhar: apunhalharEligible.get(currentTargetToken) === true, maneuverWeapon, polearm: specialCharacteristicsDisabled ? false : polearm, reachDistance, baseComponents });
          if (selectedTargets.length > 1 && !distanceDamage && !rearStrike) sharedDamage = damage;
        }
        if (!damage) continue;
        const resolvedDamage = DamageReductionService.resolveDamageReduction({ groups: damage.groups, actor: currentTargetCombatant.actor });
        const damageApplication = await DamageApplicationService.applyDamage({ actor: currentTargetCombatant.actor, combatant: currentTargetCombatant, amount: resolvedDamage.totalFinalDamage });
        await DamageRollService.sendDamageToChat({ ...damage, ...resolvedDamage }, { attackerName, defenderName: combatantDisplayName(currentTargetCombatant, currentTargetCombatant.actor), item, damageApplication });
      }
      // A single attack may resolve against several targets. Record one
      // sequence outcome for the attack, never one outcome per target.
      if (!ignoreSequentialState) await recordSequentialOutcome(combat, actor, item, { effectiveHit: anyHit });
      if (multiTargetAttack) await updateSkillRollMessage(attackMessage, anyHit ? "AttackHit" : "AttackDefended");
      if (anyHit) Hooks.callAll("cmetAttackResolved", {
        actor,
        item,
        hit: true,
        melee: !thrownAttack && !["arcos", "arremessar"].includes(item.system?.combatSkill),
        eventId: `attack:${combat.id}:${attackerCombatant.id}:${foundry.utils.randomID()}`
      });
      if (!specialCharacteristicsDisabled && characteristicEnabled(item, "impacto") && (attack.degree === SKILL_ROLL_DEGREES.OPTIMAL_SUCCESS || [...effectiveHitTargets].some((token) => impactSequenceByTarget.get(token)))) {
        for (const currentTargetToken of selectedTargets) {
          const currentTargetCombatant = getCombatantForToken(combat, currentTargetToken);
          if (!currentTargetCombatant?.actor || !effectiveHitTargets.has(currentTargetToken) || (attack.degree !== SKILL_ROLL_DEGREES.OPTIMAL_SUCCESS && !impactSequenceByTarget.get(currentTargetToken))) continue;
          const authority = getActorUpdateAuthority(currentTargetCombatant.actor);
          if (authority?.id === game.user.id) await applyDazedCondition(currentTargetCombatant.actor, combat);
          else if (authority) game.socket.emit(SOCKET_CHANNEL, { type: "combat-condition-apply", targetUserId: authority.id, actorId: currentTargetCombatant.actor.id, combatId: combat.id });
          await recordImpactOutcome(combat, actor, item, currentTargetToken, { effectiveHit: false });
        }
      }
    }
  });
}

export async function startReactiveWeaponAttack({ actor, item, targetToken, reactorCombatant = null, reactorToken = null }) {
  const combat = game.combat;
  if (!combat?.started || !isEligiblePolearmWeapon(actor, item)) return;
  return prepareWeaponAttack({ actor, item, targetToken, combat, reaction: true, attackerCombatant: reactorCombatant, attackerToken: reactorToken });
}

export async function startThrownWeaponAttack({ actor, item }) {
  const combat = game.combat;
  if (!combat?.started || !canThrow(item)) return notify("WeaponNotThrowable");
  if (!isEffectivelyWielded(actor, item)) return notify("WeaponNotWielded");
  const attackerToken = getAttackerToken(actor, combat);
  const targetToken = getSingleTarget();
  if (!targetToken) return notify("SelectTarget");
  const maximum = Number(item.system.characteristics.arremessavel?.throwRange);
  if (!Number.isFinite(maximum) || maximum <= 0 || measureTokenDistance(attackerToken, targetToken) > maximum) return notify("ThrowRangeExceeded");
  return prepareWeaponAttack({ actor, item, targetToken, combat, thrownAttack: true });
}

function chooseCombinedAttackMode(item) {
  if (!isValidPullConfiguration(item)) return "normal";
  const { DialogV2 } = foundry.applications.api;
  return DialogV2.wait({
    window: { title: game.i18n.localize("CMET.CombatAttack.CombinedModeTitle") },
    content: `<p>${game.i18n.localize("CMET.CombatAttack.CombinedModePrompt")}</p>`,
    buttons: [
      { action: "normal", label: game.i18n.localize("CMET.CombatAttack.CombinedModeNormal"), type: "button", callback: () => "normal" },
      { action: "pull", label: game.i18n.localize("CMET.CombatAttack.CombinedModePull"), type: "button", callback: () => "pull" }
    ]
  });
}

export async function startCombinedWeaponAttack({ actor, attackMode = null }) {
  const combat = game.combat;
  if (!combat?.started) return notify("CombatRequired");
  if (attackMode === "golpeDeRetaguarda") return notify("RearStrikeUnavailable");
  const hands = actor.system.hands ?? {};
  const main = actor.items.get(hands.mainHand);
  const off = actor.items.get(hands.offHand);
  const targetToken = getSingleTarget();
  const validation = validateCombinedWeaponAttack({ actor, main, off });
  if (globalThis.CONFIG?.debug?.system && !validation.valid) console.debug("CMET | Ataque combinado rejeitado", { reasons: validation.reasons, main: validation.mainWielding, off: validation.offWielding });
  if (!targetToken || !validation.valid) return notify("InvalidTwoWeaponAttack");
  if (!resolveAttackSkill(actor, main) || !resolveAttackSkill(actor, off)) return;
  const attackerToken = getAttackerToken(actor, combat);
  const combatant = getCombatantForToken(combat, attackerToken);
  if (!combatant || combat.combatant?.id !== combatant.id) return notify("NotActiveTurn");
  if (CombatActionService.getState(combatant).current < 1) return notify("ActionInsufficient");
  const modeChoice = attackMode ?? chooseCombinedAttackMode(main);
  const selectedAttackMode = modeChoice instanceof Promise ? await modeChoice : modeChoice;
  if (!selectedAttackMode) return { status: "cancelled" };
  if (selectedAttackMode === "pull" && !isValidPullConfiguration(main)) return notifyPullConfiguration(main);
  const actionGate = { spent: false };
  const waitForAttack = (item, options = {}) => new Promise((resolve) => {
    prepareWeaponAttack({ actor, item, targetToken, combat, actionGate, combinedAttack: true, ...options, onComplete: resolve })
      .catch((error) => resolve({ status: "failed", error }));
  });
  const firstResult = await waitForAttack(main, { attackMode: selectedAttackMode });
  if (firstResult?.status !== "completed") return firstResult;
  return waitForAttack(off, { disableCharacteristics: true, ignoreSequentialState: true });
}

export async function startWeaponAttack({ actor, item, attackMode = "normal" }) {
  clearPendingAttack();
  const combat = game.combat;
  if (!combat?.started) return notify("CombatRequired");
  const attackerToken = getAttackerToken(actor, combat);
  const attackerCombatant = getCombatantForToken(combat, attackerToken);
  if (!attackerCombatant) return notify("AttackerNotInCombat");
  if (combat.combatant?.id !== attackerCombatant.id) return notify("NotActiveTurn");
  if (CombatActionService.getState(attackerCombatant).current < 1) return notify("ActionInsufficient");
  if (!resolveAttackSkill(actor, item)) return;
  if (attackMode === "pull" && !isValidPullConfiguration(item)) return notifyPullConfiguration(item);
  if (!canFire(item)) return notify("WeaponNotLoaded");
  if (!isEffectivelyWielded(actor, item)) return notify("WeaponNotWielded");
  if (attackMode === "golpeDeRetaguarda") {
    const validation = validateRearStrikeTargets({ actor, item, attackerToken, combat, targetTokens: Array.from(game.user.targets ?? []) });
    if (!validation.valid) return notify(validation.reason);
    return prepareWeaponAttack({ actor, item, targetToken: validation.targetTokens[0], targetTokens: validation.targetTokens, combat, attackMode });
  }
  const targetCount = Array.from(game.user.targets ?? []).length;
  if (targetCount > 1) return notify("SelectOnlyOneTarget");
  const targetToken = getSingleTarget();
  if (!targetToken) {
    queuePendingAttack(actor, item, combat, attackMode);
    return;
  }
  const targetTokens = attackMode === "pull"
    ? [targetToken]
    : resolveEffectiveWeaponWielding({ actor, item, hand: getWeaponHand(actor, item) ?? "mainHand" }).usesTwoHands && !characteristicEnabled(item, "armaDeHaste")
    ? [targetToken, ...getLateralEnemies(targetToken)].filter((token, index, tokens) => tokens.findIndex((candidate) => (candidate.document?.id ?? candidate.id) === (token.document?.id ?? token.id)) === index)
    : [targetToken];
  return prepareWeaponAttack({ actor, item, targetToken, targetTokens, combat, attackMode });
}

function createNorisUnarmedItem(actor, { formula = "1d6", impact = false, bonusFormula = "" } = {}) {
  const characteristics = Object.fromEntries(Object.keys(actor?.system?.norisUnarmedCharacteristics ?? {}).map((key) => [key, { enabled: false }]));
  characteristics.impacto = { enabled: impact };
  return {
    id: `noris-unarmed-${foundry.utils.randomID()}`,
    name: "Punhos desarmados",
    type: "arma",
    parent: actor,
    system: {
      combatSkill: "corpoACorpo",
      equipped: true,
      loaded: true,
      thrown: false,
      damage: [
        { formula, nature: "physical", type: "impacto", source: "base" },
        ...(bonusFormula ? [{ formula: bonusFormula, nature: "physical", type: "impacto", source: "norisFistsAmplification" }] : [])
      ],
      characteristics
    }
  };
}

function getNorisUnarmedBonus(actor) {
  return actor?.getFlag?.(game.system.id, "norisEffects")?.norisFistsAmplification?.formula ?? "";
}

export async function startNorisUnarmedAttack({ actor, style = "fists" } = {}) {
  clearPendingAttack();
  const combat = game.combat;
  if (!combat?.started) return notify("CombatRequired");
  const attackerToken = getAttackerToken(actor, combat);
  const attackerCombatant = getCombatantForToken(combat, attackerToken);
  if (!attackerCombatant) return notify("AttackerNotInCombat");
  if (combat.combatant?.id !== attackerCombatant.id) return notify("NotActiveTurn");
  const targetToken = getSingleTarget();
  if (!targetToken) return notify("SelectTarget");
  const targetCombatant = getCombatantForToken(combat, targetToken);
  if (!targetCombatant || targetCombatant.id === attackerCombatant.id || !arePotentialAdversaries(attackerToken, targetToken)) return notify("TargetNotInCombat");
  const impact = Boolean(actor.getFlag?.(game.system.id, "norisEffects")?.norisHeavyWeight);
  const item = createNorisUnarmedItem(actor, { impact, bonusFormula: getNorisUnarmedBonus(actor) });
  const actionGate = {};
  const runAttack = (options) => new Promise((resolve) => {
    Promise.resolve(prepareWeaponAttack({ ...options, onComplete: resolve }))
      .catch((error) => resolve({ status: "failed", error }));
  });
  if (style === "halfMoon") {
    const amplification = Number(actor.getFlag?.(game.system.id, "norisEffects")?.norisHalfMoonAmplification?.amount) || 0;
    const range = 1 + Math.max(0, amplification);
    const areaTargets = (globalThis.canvas?.tokens?.placeables ?? []).filter((token) => token === targetToken || measureTokenDistance(targetToken, token) <= range);
    const targets = [targetToken, ...areaTargets, ...getLateralEnemies(targetToken)]
      .filter((token, index, all) => all.findIndex((candidate) => (candidate.document?.id ?? candidate.id) === (token.document?.id ?? token.id)) === index)
      .filter((token) => token !== attackerToken && arePotentialAdversaries(attackerToken, token) && getCombatantForToken(combat, token)?.actor);
    return runAttack({ actor, item, targetToken, targetTokens: targets, combat, actionGate, unarmed: true });
  }
  let result = await runAttack({ actor, item, targetToken, combat, actionGate, unarmed: true });
  if (result?.status !== "completed") return result;
  return runAttack({ actor, item, targetToken, combat, actionGate, unarmed: true, ignoreSequentialState: true });
}

async function continuePendingAttack(targetToken = null) {
  if (!pendingAttack) return;
  const current = pendingAttack;
  const targets = Array.from(game.user.targets ?? []);
  if (targets.length > 1) {
    notify("SelectOnlyOneTarget");
    return;
  }
  const candidateTarget = targetToken ?? (targets.length === 1 ? targets[0] : null);
  if (!candidateTarget) return;
  const combat = game.combat;
  const actor = game.actors.get(current.actorId);
  const item = actor?.items.get(current.itemId);
  if (!combat?.started || combat.id !== current.combatId || !actor || !item) {
    clearPendingAttack();
    return notify("AttackNoLongerValid");
  }
  return prepareWeaponAttack({ actor, item, targetToken: candidateTarget, combat, attackMode: current.attackMode ?? "normal" });
}

export async function handleTargetToken(user, token, targeted) {
  if (user?.id !== game.user.id || !targeted) return;
  if (!pendingAttack) return;
  return continuePendingAttack(token);
}

export function registerCombatAttackHooks() {
  if (hooksRegistered) return;
  hooksRegistered = true;
  Hooks.on("targetToken", handleTargetToken);
  Hooks.on("combatTurnChange", () => clearPendingAttack());
  Hooks.on("moveToken", handlePolearmMovement);
  Hooks.on("deleteCombat", (combat) => {
    if (pendingAttack?.combatId === combat.id) clearPendingAttack();
    for (const dialog of activeReactionDialogs.values()) dialog.close();
    activeReactionDialogs.clear();
    pendingReactionRequests.clear();
    reactionRequests.clear();
  });
}

function movementPoint(value) {
  const point = value?.position ?? value;
  const x = Number(point?.x);
  const y = Number(point?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function movementDescriptors(movement) {
  return [
    movement,
    movement?.measureOptions,
    movement?.constrainOptions,
    movement?.terrainOptions,
    ...(Array.isArray(movement?.segments) ? movement.segments : []),
    ...(Array.isArray(movement?.passed?.waypoints) ? movement.passed.waypoints : [])
  ]
    .filter((entry) => entry && typeof entry === "object");
}

function movementHasFlag(movement, names) {
  return movementDescriptors(movement).some((entry) => names.some((name) => entry[name] === true)
    || names.includes("teleport") && entry.actionConfig?.teleport === true);
}

function movementMethod(movement) {
  return movementDescriptors(movement)
    .map((entry) => String(entry.method ?? entry.type ?? entry.mode ?? "").toLowerCase())
    .filter(Boolean);
}

function isVoluntaryMovement(movement, token = null) {
  if (isForcedPullMovement(token, movement)) return false;
  const methods = movementMethod(movement);
  const forced = movementHasFlag(movement, ["forced", "isForced", "forcedMovement"])
    || methods.some((method) => method === "forced" || method === "forcedmovement");
  const teleport = movementHasFlag(movement, ["teleport", "teleporting", "isTeleport"])
    || methods.some((method) => method === "teleport" || method === "teleporting");
  return !forced && !teleport;
}

function getMovementPath(tokenDocument, movement) {
  const origin = movementPoint(movement?.origin);
  const destination = movementPoint(movement?.destination) ?? movementPoint(tokenDocument);
  if (!origin || !destination) return [];

  const points = [origin];
  const segments = Array.isArray(movement?.segments) ? movement.segments : [];
  for (const segment of segments) {
    const point = movementPoint(segment?.destination)
      ?? movementPoint(segment?.to)
      ?? movementPoint(segment?.end)
      ?? movementPoint(segment?.position)
      ?? movementPoint(segment);
    if (point) points.push(point);
  }
  const waypoints = movement?.passed?.waypoints
    ?? movement?.history?.waypoints
    ?? movement?.waypoints
    ?? movement?.path
    ?? [];
  for (const waypoint of waypoints) {
    const point = movementPoint(waypoint);
    if (point) points.push(point);
  }
  points.push(destination);
  return points.filter((point, index, all) => index === 0 || point.x !== all[index - 1].x || point.y !== all[index - 1].y);
}

function waitForPolearmReaction({ enemyName, weaponName, movementDirection, reservedActions, requestId }) {
  const { DialogV2 } = foundry.applications.api;
  const movementDirectionKey = movementDirection === "entering" ? "ReactionEntering" : "ReactionLeaving";
  const movementDirectionLabel = game.i18n.localize(`CMET.CombatAttack.${movementDirectionKey}`);
  const promptKey = reservedActions === 1 ? "ReactionPromptSingular" : "ReactionPromptPlural";
  const content = game.i18n.format(`CMET.CombatAttack.${promptKey}`, {
    enemyName,
    movementDirection: movementDirectionLabel,
    weaponName,
    reservedActions
  });
  return new Promise((resolve) => {
    let settled = false;
    let timeoutId;
    const finish = (choice) => {
      if (settled) return;
      settled = true;
      if (timeoutId) clearTimeout(timeoutId);
      activeReactionDialogs.delete(requestId);
      resolve(choice);
    };
    const dialog = new DialogV2({
      window: { title: game.i18n.localize("CMET.CombatAttack.ReactionTitle") },
      classes: ["cmet-polearm-reaction-dialog"],
      position: { width: 360 },
      content: `<div class="cmet-polearm-reaction-content">${content.split("\n\n").map((paragraph) => `<p>${paragraph}</p>`).join("")}</div>`,
      buttons: [
        { action: "react", label: game.i18n.localize("CMET.CombatAttack.React"), type: "button", callback: () => "react" },
        { action: "ignore", label: game.i18n.localize("CMET.CombatAttack.Ignore"), type: "button", callback: () => "ignore" }
      ],
      submit: (choice) => finish(choice),
    });
    activeReactionDialogs.set(requestId, dialog);
    dialog.addEventListener("render", () => debugPolearm("Popup renderizado", { requestId, enemyName, weaponName, reservedActions }), { once: true });
    dialog.addEventListener("close", () => finish("ignore"), { once: true });
    dialog.render({ force: true });
    timeoutId = setTimeout(() => {
      if (settled) return;
      dialog.close();
      finish("ignore");
    }, 30000);
    timeoutId?.unref?.();
  });
}

function getCombatantById(combat, combatantId) {
  return combat?.combatants?.get?.(combatantId)
    ?? combat?.combatants?.find?.((combatant) => combatant.id === combatantId)
    ?? null;
}

function getSceneId(document) {
  return document?.parent?.id ?? document?.scene?.id ?? null;
}

function getTokenObject(tokenId, sceneId = null) {
  if (sceneId && globalThis.canvas?.scene?.id && globalThis.canvas.scene.id !== sceneId) return null;
  return globalThis.canvas?.tokens?.get(tokenId)
    ?? globalThis.canvas?.tokens?.placeables?.find((token) => (token.document?.id ?? token.id) === tokenId)
    ?? null;
}

function sendPolearmReactionResponse(message, choice) {
  game.socket.emit(SOCKET_CHANNEL, {
    type: "combat-polearm-reaction-response",
    requesterId: message.requesterId,
    requestId: message.requestId,
    choice
  });
  debugPolearm("Resposta de reação enviada", { requestId: message.requestId, requesterId: message.requesterId, choice });
}

function reactionDisplayName(value, fallback) {
  const name = typeof value === "string" ? value.trim() : "";
  return name || fallback;
}

export async function processPolearmReactionRequest(message) {
  if (message?.targetUserId !== game.user.id) return;
  if (reactionRequests.has(message.requestId)) {
    debugPolearm("Solicitação duplicada ignorada", { requestId: message.requestId });
    return;
  }
  debugPolearm("Solicitação recebida", { requestId: message?.requestId, actorId: message?.actorId, targetTokenId: message?.targetTokenId });
  if (game.combat?.id !== message.combatId) {
    debugPolearm("Reação rejeitada: combate diferente", { requestId: message.requestId });
    sendPolearmReactionResponse(message, "ignore");
    return;
  }
  const combat = game.combat;
  const reactorCombatant = getCombatantById(combat, message.reactorCombatantId);
  const reactorActor = reactorCombatant?.actor ?? null;
  const reactorToken = reactorCombatant?.token?.object ?? getTokenObject(message.reactorTokenId, message.sceneId);
  const targetToken = getTokenObject(message.targetTokenId, message.sceneId);
  const item = reactorActor?.items?.get?.(message.weaponId) ?? reactorActor?.items?.find?.((entry) => entry.id === message.weaponId) ?? null;
  const enemyName = reactionDisplayName(message.enemyName || targetToken?.name || targetToken?.document?.name, game.i18n.localize("CMET.CombatAttack.UnknownEnemy"));
  const weaponName = reactionDisplayName(message.weaponName || item?.name, game.i18n.localize("CMET.CombatAttack.UnknownWeapon"));
  const responsible = reactorActor && getActorUpdateAuthority(reactorActor);
  const combatantTokenId = reactorCombatant?.tokenId ?? reactorCombatant?.token?.id ?? reactorToken?.document?.id ?? reactorToken?.id;
  const reservedActions = reactorCombatant ? CombatActionService.getState(reactorCombatant).reserved : 0;
  if (!reactorCombatant || !reactorActor || !reactorToken || !targetToken || !item
    || (message.reactorTokenId && combatantTokenId !== message.reactorTokenId)
    || responsible?.id !== game.user.id
    || !isEligiblePolearmWeapon(reactorActor, item)
    || reservedActions < 1) {
    debugPolearm("Reação rejeitada: dados ou autoridade inválidos", {
      requestId: message.requestId,
      reactorCombatantId: message.reactorCombatantId,
      reactorTokenId: message.reactorTokenId,
      actorId: reactorActor?.id,
      responsibleUserId: responsible?.id,
      reservedActions
    });
    sendPolearmReactionResponse(message, "ignore");
    return;
  }

  reactionRequests.add(message.requestId);
  try {
    const choice = await waitForPolearmReaction({ enemyName, weaponName, movementDirection: message.movementDirection, reservedActions, requestId: message.requestId });
    sendPolearmReactionResponse(message, choice);
    if (choice === "react") await startReactiveWeaponAttack({ actor: reactorActor, item, targetToken, reactorCombatant, reactorToken });
  } finally {
    reactionRequests.delete(message.requestId);
  }
}

function shouldProcessPolearmMovement(tokenDocument, user) {
  const movementUserId = typeof user === "string" ? user : user?.id;
  const movementSceneId = getSceneId(tokenDocument);
  const currentSceneId = globalThis.canvas?.scene?.id;
  if (movementSceneId && currentSceneId && movementSceneId !== currentSceneId) {
    debugPolearm("Movimento ignorado: cliente está em outra cena", { movementSceneId, currentSceneId, tokenId: tokenDocument?.id });
    return false;
  }
  return Boolean(movementUserId && movementUserId === game.user.id);
}

export async function handlePolearmMovement(tokenDocument, movement, _operation, user = null) {
  // Foundry v14 supplies movement.origin/destination/waypoints and the requesting user here.
  // Movement classification must come from this API object, not legacy operation flags.
  recordPullMovementConfirmation(tokenDocument, movement);
  const combat = game.combat;
  if (!combat?.started) {
    debugPolearm("Movimento ignorado: combate inativo", { tokenId: tokenDocument?.id });
    return;
  }
  if (!movement) {
    debugPolearm("Movimento ignorado: dados ausentes", { tokenId: tokenDocument?.id });
    return;
  }
  if (!isVoluntaryMovement(movement, tokenDocument)) {
    debugPolearm("Movimento ignorado: forçado ou teleporte", { tokenId: tokenDocument?.id, movementId: movement.id });
    return;
  }
  if (!shouldProcessPolearmMovement(tokenDocument, user)) {
    debugPolearm("Movimento ignorado: cliente sem autoridade de processamento", { tokenId: tokenDocument?.id, movementId: movement.id });
    return;
  }
  debugPolearm("Movimento detectado", { tokenId: tokenDocument.id, userId: typeof user === "string" ? user : user?.id, movementId: movement.id });
  const movingToken = tokenDocument.object ?? tokenDocument;
  const path = getMovementPath(tokenDocument, movement);
  if (path.length < 2) {
    debugPolearm("Movimento ignorado: trajetória sem origem e destino", { tokenId: tokenDocument.id, movementId: movement.id });
    return;
  }
  const origin = path[0];
  const destination = path[path.length - 1];
  const movingCombatant = combat.combatants.find((combatant) => combatant.tokenId === tokenDocument.id || combatant.token?.object === movingToken);
  if (!movingCombatant) {
    debugPolearm("Movimento ignorado: token não está no combate", { tokenId: tokenDocument.id, movementId: movement.id });
    return;
  }
  const processedActors = new Set();
  for (const reactorCombatant of combat.combatants) {
    const reactorActor = reactorCombatant.actor;
    if (processedActors.has(reactorActor?.id)) continue;
    const reactorToken = reactorCombatant.token?.object;
    if (!reactorActor || !reactorToken || !arePotentialAdversaries(reactorCombatant, movingCombatant) || reactorToken === movingToken) continue;
    const weapon = reactorActor.items.find((item) => isEligiblePolearmWeapon(reactorActor, item));
    if (!weapon) {
      debugPolearm("Combatente ignorado: Arma de Haste não encontrada", { actorId: reactorActor.id });
      continue;
    }
    const reservedActions = CombatActionService.getState(reactorCombatant).reserved;
    if (reservedActions < 1) {
      debugPolearm("Combatente ignorado: sem ações reservadas", { actorId: reactorActor.id });
      continue;
    }
    debugPolearm("Combatente reativo encontrado", { actorId: reactorActor.id, tokenId: reactorToken.document?.id, weaponId: weapon.id, reservedActions });
    const maximum = Number(weapon.system.characteristics.armaDeHaste?.spaces);
    if (!Number.isFinite(maximum) || maximum <= 0) {
      debugPolearm("Combatente ignorado: alcance inválido", { actorId: reactorActor.id, maximum });
      continue;
    }
    let movementDirection = null;
    const crossed = path.slice(1).some((position, index) => {
      const beforeDistance = measureTokenDistanceAtPosition(reactorToken, tokenDocument, path[index]);
      const afterDistance = measureTokenDistanceAtPosition(reactorToken, tokenDocument, position);
      debugPolearm("Distâncias calculadas", { actorId: reactorActor.id, beforeDistance, afterDistance, maximum });
      if (!didCrossWeaponReach(beforeDistance, afterDistance, maximum)) return false;
      debugPolearm("Cruzamento de alcance confirmado", { actorId: reactorActor.id, beforeDistance, afterDistance, maximum });
      movementDirection = afterDistance > maximum ? "leaving" : "entering";
      return true;
    });
    if (!crossed) {
      debugPolearm("Nenhum cruzamento de alcance", { actorId: reactorActor.id });
      continue;
    }
    processedActors.add(reactorActor.id);
    const responsible = getActorUpdateAuthority(reactorActor);
    if (!responsible) {
      debugPolearm("Reação ignorada: usuário responsável não encontrado", { actorId: reactorActor.id });
      continue;
    }
    debugPolearm("Autoridade escolhida", { actorId: reactorActor.id, responsibleUserId: responsible.id, sceneId: getSceneId(tokenDocument) });
    const requestKey = `${combat.id}:${movement.id ?? "movement"}:${tokenDocument.uuid ?? tokenDocument.id}:${origin.x},${origin.y}->${destination.x},${destination.y}:${reactorActor.id}`;
    if ([...pendingReactionRequests.values()].includes(requestKey)) continue;
    const requestId = foundry.utils.randomID();
    pendingReactionRequests.set(requestId, requestKey);
    const requestTimeout = setTimeout(() => {
      if (pendingReactionRequests.get(requestId) === requestKey) pendingReactionRequests.delete(requestId);
    }, 35000);
    requestTimeout?.unref?.();
    const request = {
      type: "combat-polearm-reaction-request",
      targetUserId: responsible.id,
      requesterId: game.user.id,
      requestId,
      combatId: combat.id,
      actorId: reactorActor.id,
      reactorCombatantId: reactorCombatant.id,
      reactorTokenId: reactorCombatant.tokenId ?? reactorToken.document?.id ?? reactorToken.id,
      sceneId: getSceneId(tokenDocument),
      weaponId: weapon.id,
      targetTokenId: tokenDocument.id,
      enemyName: reactionDisplayName(tokenDocument.name || movingToken.name, game.i18n.localize("CMET.CombatAttack.UnknownEnemy")),
      weaponName: reactionDisplayName(weapon.name, game.i18n.localize("CMET.CombatAttack.UnknownWeapon")),
      movementDirection,
      reservedActions
    };
    debugPolearm("Solicitação enviada", { requestId, targetUserId: responsible.id, actorId: reactorActor.id, movementDirection });
    if (responsible.id === game.user.id) {
      await processPolearmReactionRequest(request);
      pendingReactionRequests.delete(requestId);
    } else game.socket.emit(SOCKET_CHANNEL, request);
  }
}

export function registerCombatAttackSocket() {
  game.socket.on(SOCKET_CHANNEL, async (message) => {
    if (message?.type === "combat-pull-movement-response") {
      resolvePullMovementResponse(message);
      return;
    }
    if (message?.type === "combat-pull-movement-request") {
      await processPullMovementRequest(message);
      return;
    }
    if (message?.type === "combat-condition-apply" && message.targetUserId === game.user.id) {
      const actor = game.actors.get(message.actorId);
      if (actor && game.combat?.id === message.combatId) await applyDazedCondition(actor, game.combat);
      return;
    }
    if (message?.type === "combat-defense-outcome") {
      if (message.targetUserId !== game.user.id) return;
      await updateSkillRollMessage(game.messages?.get(message.messageId), message.outcomeKey);
      return;
    }
    if (message?.type === "combat-defense-response") {
      if (message.requesterId === game.user.id) Hooks.callAll("cmetCombatDefenseResponse", message);
      return;
    }
    if (message?.type === "combat-polearm-reaction-response") {
      if (message.requesterId !== game.user.id) return;
      pendingReactionRequests.delete(message.requestId);
      return;
    }
    if (message?.type === "combat-polearm-reaction-request") {
      debugPolearm("Mensagem socket recebida", { requestId: message.requestId, targetUserId: message.targetUserId });
      await processPolearmReactionRequest(message);
      return;
    }
    if (message?.type !== "combat-defense-request" || message.requesterId === game.user.id) return;
    const combatant = game.combat?.combatants.get(message.combatantId);
    const actor = combatant?.actor;
    const responsible = actor && getActorUpdateAuthority(actor);
    if (!combatant || !actor || responsible?.id !== game.user.id) return;
    openDefenseChoice({ defender: actor, combatant, allowBlock: !message.projectile || hasEmpunhedCutterWeapon(actor), respond: (payload) => game.socket.emit(SOCKET_CHANNEL, { type: "combat-defense-response", requesterId: message.requesterId, requestId: message.requestId, ...payload }) });
  });
}

export const CombatAttackService = Object.freeze({
  get pendingAttack() {
    return pendingAttack;
  },
  startWeaponAttack,
  startReactiveWeaponAttack,
  startThrownWeaponAttack,
  startCombinedWeaponAttack,
  handleTargetToken
});
