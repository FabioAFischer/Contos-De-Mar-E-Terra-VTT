import { SKILL_LABELS, SYSTEM_ID } from "../config/constants.mjs";
import { CombatActionError, CombatActionService } from "./combat-action-service.mjs";
import { findSkillDefinition, SKILL_ROLL_DEGREES, updateSkillRollMessage } from "./skill-roll-service.mjs";
import { openSkillRollDialog } from "../dialogs/skill-roll-dialog.mjs";
import { DamageRollService } from "./damage-roll-service.mjs";
import { DamageReductionService } from "./damage-reduction-service.mjs";
import { DamageApplicationService } from "./damage-application-service.mjs";
import { getActorUpdateAuthority } from "./combat-authority-service.mjs";

export const SUCCESS_RANK = Object.freeze({
  [SKILL_ROLL_DEGREES.NORMAL_SUCCESS]: 1,
  [SKILL_ROLL_DEGREES.GOOD_SUCCESS]: 2,
  [SKILL_ROLL_DEGREES.OPTIMAL_SUCCESS]: 3,
  [SKILL_ROLL_DEGREES.CRITICAL_SUCCESS]: 4
});

const SOCKET_CHANNEL = `system.${SYSTEM_ID}`;
let pendingAttack = null;
let hooksRegistered = false;

function notify(key, data = {}) {
  const message = game.i18n.format(`CMET.CombatAttack.Notifications.${key}`, data);
  ui.notifications.warn(message);
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

function notifyInfo(key) {
  ui.notifications.info(game.i18n.localize(`CMET.CombatAttack.${key}`));
}

function clearPendingAttack() {
  pendingAttack = null;
}

function queuePendingAttack(actor, item, combat) {
  pendingAttack = {
    actorId: actor.id,
    itemId: item.id,
    combatId: combat.id
  };
  console.debug("CMET | no target, creating pending attack", pendingAttack);
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


export function compareAttackAndDefense(attack, defense) {
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

function openDefenseChoice({ defender, combatant, respond }) {
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
      { action: "block", label: localize("Block"), type: "button", callback: () => "block" },
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

async function requestDefense({ combatantId, defenderId, requestId }) {
  return new Promise((resolve) => {
    const handler = (message) => {
      if (message?.type !== "combat-defense-response" || message.requestId !== requestId) return;
      Hooks.off("cmetCombatDefenseResponse", handler);
      resolve(message);
    };
    Hooks.on("cmetCombatDefenseResponse", handler);
    game.socket.emit(SOCKET_CHANNEL, { type: "combat-defense-request", requestId, combatantId, defenderId, requesterId: game.user.id });
    setTimeout(() => {
      Hooks.off("cmetCombatDefenseResponse", handler);
      resolve({ choice: "none" });
    }, 120000);
  });
}

async function resolveDefense({ targetCombatant, targetActor, attacker, item, attack }) {
  const state = CombatActionService.getState(targetCombatant);
  if (state.reserved <= 0) return { defense: null, reason: "noReserved" };
  const requestId = foundry.utils.randomID();
  const responsible = getActorUpdateAuthority(targetActor);
  if (!responsible) return { defense: null, reason: "noReserved" };
  const respond = (payload) => game.socket.emit(SOCKET_CHANNEL, { type: "combat-defense-response", requestId, requesterId: game.user.id, ...payload });
  let response;
  if (responsible.id === game.user.id) {
    openDefenseChoice({ defender: targetActor, combatant: targetCombatant, respond: (payload) => { response = payload; } });
    response = await new Promise((resolve) => {
      const check = () => response ? resolve(response) : setTimeout(check, 50);
      check();
    });
  } else {
    response = await requestDefense({ combatantId: targetCombatant.id, defenderId: targetActor.id, requestId });
  }
  return {
    defense: response.rollResult ?? null,
    reason: response.choice === "none" ? "noDefense" : "defense",
    messageId: response.messageId ?? null,
    responsibleId: responsible.id
  };
}

async function prepareWeaponAttack({ actor, item, targetToken, combat }) {
  const attackerToken = getAttackerToken(actor, combat);
  const attackerCombatant = getCombatantForToken(combat, attackerToken);
  if (!attackerCombatant) return notify("AttackerNotInCombat");
  if (combat.combatant?.id !== attackerCombatant.id) return notify("NotActiveTurn");
  if (CombatActionService.getState(attackerCombatant).current < 1) return notify("ActionInsufficient");
  const targetCombatant = getCombatantForToken(combat, targetToken);
  if (!targetCombatant) return notify("TargetNotInCombat");
  const attackerTokenId = attackerToken?.document?.id ?? attackerToken?.id;
  const targetTokenId = targetToken?.document?.id ?? targetToken?.id;
  if (targetCombatant.id === attackerCombatant.id || attackerTokenId === targetTokenId) return notify("CannotTargetSelf");
  const skill = resolveAttackSkill(actor, item);
  if (!skill) return;
  const attackerName = combatantDisplayName(attackerCombatant, actor);
  const defenderName = combatantDisplayName(targetCombatant, targetCombatant.actor);
  clearPendingAttack();
  console.debug("CMET | opening skill roll", { actorId: actor.id, itemId: item.id, skillKey: skill.skillKey });
  openSkillRollDialog({
    actor,
    skillKey: skill.skillKey,
    skillLabel: SKILL_LABELS[skill.skillKey],
    baseValue: skill.baseValue,
    titleKey: "AttackRoll",
    context: {
      type: "attack",
      attackerName,
      defenderName,
      weaponName: item.name
    },
    beforeRoll: async () => {
      try {
        await CombatActionService.spendAction(attackerCombatant);
        return true;
      } catch (error) {
        if (error instanceof CombatActionError) notify(error.code === "insufficientActions" ? "ActionInsufficient" : "InvalidActionState");
        return false;
      }
    },
    onResult: async (attack, attackMessage) => {
      if (!attack.success) {
        await updateSkillRollMessage(attackMessage, "AttackMiss");
        return;
      }
      const defenseResult = await resolveDefense({ targetCombatant, targetActor: targetCombatant.actor, attacker: actor, item, attack });
      const { defense, reason } = defenseResult;
      const outcome = compareAttackAndDefense(attack, defense);
      const finalOutcome = { ...outcome, reason: defense ? outcome.reason : reason };
      if (defense) {
        await updateDefenseOutcome({ ...defenseResult, outcome: finalOutcome });
      } else {
        await updateSkillRollMessage(attackMessage, outcomeKey(finalOutcome));
      }
      if (finalOutcome.winner !== "attack") return;
      const critical = attack.degree === SKILL_ROLL_DEGREES.CRITICAL_SUCCESS;
      const damage = await DamageRollService.rollWeaponDamage(item, { attacker: attackerCombatant, target: targetCombatant, critical });
      if (!damage) return;
      const resolvedDamage = DamageReductionService.resolveDamageReduction({ groups: damage.groups, actor: targetCombatant.actor });
      const damageApplication = await DamageApplicationService.applyDamage({
        actor: targetCombatant.actor,
        combatant: targetCombatant,
        amount: resolvedDamage.totalFinalDamage
      });
      await DamageRollService.sendDamageToChat({ ...damage, ...resolvedDamage }, {
        attackerName,
        defenderName,
        item,
        damageApplication
      });
    }
  });
}

export async function startWeaponAttack({ actor, item }) {
  console.debug("CMET | startWeaponAttack", { actorId: actor?.id, itemId: item?.id });
  clearPendingAttack();
  const combat = game.combat;
  if (!combat?.started) return notify("CombatRequired");
  const attackerToken = getAttackerToken(actor, combat);
  const attackerCombatant = getCombatantForToken(combat, attackerToken);
  if (!attackerCombatant) return notify("AttackerNotInCombat");
  if (combat.combatant?.id !== attackerCombatant.id) return notify("NotActiveTurn");
  if (CombatActionService.getState(attackerCombatant).current < 1) return notify("ActionInsufficient");
  if (!resolveAttackSkill(actor, item)) return;
  const targetCount = Array.from(game.user.targets ?? []).length;
  if (targetCount > 1) return notify("SelectOnlyOneTarget");
  const targetToken = getSingleTarget();
  if (!targetToken) {
    queuePendingAttack(actor, item, combat);
    return;
  }
  return prepareWeaponAttack({ actor, item, targetToken, combat });
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
  console.debug("CMET | pending attack found", { pendingAttack: current, targetToken: candidateTarget?.id, targetCount: targets.length });
  const combat = game.combat;
  const actor = game.actors.get(current.actorId);
  const item = actor?.items.get(current.itemId);
  if (!combat?.started || combat.id !== current.combatId || !actor || !item) {
    clearPendingAttack();
    return notify("AttackNoLongerValid");
  }
  console.debug("CMET | continuing weapon attack", { actorId: actor.id, itemId: item.id, targetToken: candidateTarget.id });
  return prepareWeaponAttack({ actor, item, targetToken: candidateTarget, combat });
}

export async function handleTargetToken(user, token, targeted) {
  console.debug("CMET | targetToken", {
    userId: user?.id,
    currentUserId: game.user?.id,
    tokenId: token?.id,
    tokenName: token?.name,
    targeted,
    targetCount: game.user?.targets?.size
  });
  if (user?.id !== game.user.id || !targeted) return;
  if (!pendingAttack) return;
  return continuePendingAttack(token);
}

export function registerCombatAttackHooks() {
  if (hooksRegistered) return;
  hooksRegistered = true;
  console.debug("CMET | Registering targetToken hook");
  Hooks.on("targetToken", handleTargetToken);
  Hooks.on("combatTurnChange", () => clearPendingAttack());
  Hooks.on("deleteCombat", (combat) => {
    if (pendingAttack?.combatId === combat.id) clearPendingAttack();
  });
}

export function registerCombatAttackSocket() {
  game.socket.on(SOCKET_CHANNEL, async (message) => {
    if (message?.type === "combat-defense-outcome") {
      if (message.targetUserId !== game.user.id) return;
      await updateSkillRollMessage(game.messages?.get(message.messageId), message.outcomeKey);
      return;
    }
    if (message?.type === "combat-defense-response") {
      if (message.requesterId === game.user.id) Hooks.callAll("cmetCombatDefenseResponse", message);
      return;
    }
    if (message?.type !== "combat-defense-request" || message.requesterId === game.user.id) return;
    const combatant = game.combat?.combatants.get(message.combatantId);
    const actor = combatant?.actor;
    const responsible = actor && getActorUpdateAuthority(actor);
    if (!combatant || !actor || responsible?.id !== game.user.id) return;
    openDefenseChoice({ defender: actor, combatant, respond: (payload) => game.socket.emit(SOCKET_CHANNEL, { type: "combat-defense-response", requesterId: message.requesterId, requestId: message.requestId, ...payload }) });
  });
}

export const CombatAttackService = Object.freeze({
  get pendingAttack() {
    return pendingAttack;
  },
  startWeaponAttack,
  handleTargetToken
});
