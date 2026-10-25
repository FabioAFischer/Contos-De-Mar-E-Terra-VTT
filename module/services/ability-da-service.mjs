import { DA_DEFAULT_EFFECT } from "../config/ability-da-config.mjs";
import { canPayAbilityDaCost, payAbilityDaCost } from "./ability-da-resource-service.mjs";
import { calculateCharacterDerivedData } from "./character-calculations.mjs";
import { compareSkillRolls, findSkillDefinition } from "./skill-roll-service.mjs";
import { openSkillRollDialog } from "../dialogs/skill-roll-dialog.mjs";
import { SKILL_LABELS, SYSTEM_ID } from "../config/constants.mjs";
import { getActorUpdateAuthority } from "./combat-authority-service.mjs";
import { compareCreatureSizes, getBaseCreatureSize, getCreatureSize, nextCreatureSize } from "./creature-size-service.mjs";
import { applyNamedCondition, clearNamedCondition } from "./combat-condition-service.mjs";
import { measureTokenDistance } from "./weapon-combat-state-service.mjs";
import { arePotentialAdversaries } from "./weapon-combat-state-service.mjs";
import { activateChildOfHel, activateLastSpark, activateManifestation, activateProfaneConversion, registerMarcoDeathChoice } from "./ability-da-marco-service.mjs";
import { activateDraummaAce, activateDraummaManaSiphon, activateDraummaTrick } from "./ability-da-draumma-service.mjs";
import { activateNorisAbility } from "./ability-da-noris-service.mjs";
import { NPC_ATTRIBUTE_DEFINITIONS } from "../config/npc-config.mjs";
import { isNpc, resolveActorTestValue } from "./npc-test-service.mjs";

function clone(value) { return foundry.utils.deepClone(value); }

export function ensureAbilityDaEffectIds(effects = []) {
  const used = new Set();
  return effects.map((effect) => {
    const next = { ...clone(DA_DEFAULT_EFFECT), ...clone(effect) };
    let id = typeof next.id === "string" && next.id.trim() ? next.id : foundry.utils.randomID();
    while (used.has(id)) id = foundry.utils.randomID();
    used.add(id);
    next.id = id;
    return next;
  });
}

export function getAbilityDaEffects(item, { includeDisabled = false } = {}) {
  const effects = ensureAbilityDaEffectIds(item?.system?.effects ?? []);
  return includeDisabled ? effects : effects.filter((effect) => effect.enabled !== false);
}

export function getAbilityDaEffect(item, effectId) {
  return getAbilityDaEffects(item, { includeDisabled: true }).find((effect) => effect.id === effectId) ?? null;
}

export function getAbilityDaActions(item) {
  return getAbilityDaEffects(item).flatMap((effect) => {
    const operation = effect.operations?.find((entry) => ["norisFistsAttack", "norisHalfMoonAttack"].includes(entry.type));
    if (operation) return [{ key: `noris:${operation.type}:${effect.id}`, effectId: effect.id, operationType: operation.type, label: effect.name || item.name, activationType: "ativa" }];
    if (!["ativa", "reativa"].includes(effect.activationType)) return [];
    return [{ key: `da:${effect.id}`, effectId: effect.id, label: effect.name || item.name, activationType: effect.activationType }];
  });
}

export async function activateNorisAbilityAction({ actor, item, effectId, operationType, context = {} } = {}) {
  const effect = getAbilityDaEffect(item, effectId);
  const operation = effect?.operations?.find((entry) => entry.type === operationType);
  if (!effect || !operation) return null;
  return activateNorisAbility({ actor, item, effect, operation, context });
}

function notify(key, data = {}) {
  const message = game.i18n.format(`CMET.AbilityDa.Notifications.${key}`, data);
  ui.notifications.warn(message);
}

function notifyCostFailure(check, item) {
  const data = { ability: item?.name ?? "", amount: check?.amount ?? 0, available: check?.available ?? 0, resource: check?.resourceType ?? "" };
  const key = {
    insufficientActions: "InsufficientActions",
    insufficientReservedActions: "InsufficientReservedActions",
    notActiveTurn: "NotActiveTurn",
    missingCombatant: "MissingCombatant",
    insufficientResource: "InsufficientResource",
    missingResource: "MissingResource",
    invalidAmount: "InvalidCost",
    unsupportedCost: "InvalidCost"
  }[check?.reason] ?? "InvalidCost";
  notify(key, data);
}

function tokenActor(entry) { return entry?.actor ?? entry?.document?.actor ?? null; }

function resolveTargets(actor, effect, context = {}) {
  if (effect.targets?.relation === "self") return [{ actor, token: null }];
  const originToken = context.originToken
    ?? globalThis.canvas?.tokens?.controlled?.find((token) => token.actor?.id === actor.id)
    ?? null;
  const candidates = context.targets
    ?? (effect.targets?.relation === "enemy"
      ? Array.from(globalThis.canvas?.tokens?.placeables ?? []).filter((token) => token !== originToken && (!originToken || arePotentialAdversaries(originToken, token)))
      : Array.from(globalThis.game?.user?.targets ?? []));
  const range = Number(effect.targets?.range ?? 0);
  return candidates
    .map((token) => ({ token, actor: tokenActor(token) }))
    .filter(({ actor: targetActor, token }) => targetActor && targetActor !== actor
      && (!range || !originToken || measureTokenDistance(originToken, token) <= range))
    .slice(0, Number(effect.targets?.count) > 0 ? Number(effect.targets.count) : undefined);
}

function compareAbilityRolls(attack, defense) {
  return compareSkillRolls(attack, defense);
}

function getSkillBaseValue(actor, skillKey) {
  const definition = findSkillDefinition(skillKey);
  if (isNpc(actor)) return resolveActorTestValue(actor, skillKey);
  return definition ? Number(actor?.system?.attributes?.[definition.key]?.skills?.[skillKey]) : NaN;
}

function getResourceMaximum(actor, resourceKey) {
  if (isNpc(actor)) return Number(actor?.system?.resources?.[resourceKey]?.max) || 0;
  return Number(calculateCharacterDerivedData(actor.system)[`${resourceKey}Max`]) || 0;
}

function getSkillLabel(actor, skillKey) {
  if (isNpc(actor)) {
    const definition = NPC_ATTRIBUTE_DEFINITIONS.find(({ key }) => key === skillKey);
    if (definition) return game.i18n.localize(definition.label);
  }
  return SKILL_LABELS[skillKey] ?? skillKey;
}

function requestAbilitySkillRoll({ actor, skillKey, modifier = 0, context } = {}) {
  const baseValue = getSkillBaseValue(actor, skillKey);
  if (!Number.isFinite(baseValue)) return Promise.resolve(null);
  return new Promise((resolve) => {
    let settled = false;
    const settle = (result) => {
      if (settled) return;
      settled = true;
      resolve(result ?? null);
    };
    try {
      openSkillRollDialog({
        actor,
        skillKey,
        skillLabel: getSkillLabel(actor, skillKey),
        baseValue,
        initialModifier: modifier,
        context,
        onResult: (result) => settle(result),
        onCancel: () => settle(null),
        onComplete: ({ status, result }) => {
          if (status !== "completed") settle(result ?? null);
        }
      });
    } catch {
      settle(null);
    }
  });
}

const ABILITY_DA_SOCKET = `system.${SYSTEM_ID}`;
const pendingResistanceRequests = new Set();

function serializableSkillRoll(result) {
  if (!result) return null;
  const { roll, ...serializable } = result;
  return serializable;
}

function requestRemoteResistance({ actor, skillKey, modifier = 0, context } = {}) {
  const authority = getActorUpdateAuthority(actor);
  if (!authority || !actor?.uuid) return Promise.resolve(null);
  const requestId = foundry.utils.randomID();
  return new Promise((resolve) => {
    const finish = (result) => {
      Hooks.off("cmetAbilityDaResistanceResponse", onResponse);
      pendingResistanceRequests.delete(requestId);
      resolve(result ?? null);
    };
    const onResponse = (message) => {
      if (message?.type !== "ability-da-resistance-response" || message.requestId !== requestId || message.requesterId !== game.user.id) return;
      finish(message.result);
    };
    pendingResistanceRequests.add(requestId);
    Hooks.on("cmetAbilityDaResistanceResponse", onResponse);
    game.socket.emit(ABILITY_DA_SOCKET, {
      type: "ability-da-resistance-request",
      requestId,
      requesterId: game.user.id,
      targetUserId: authority.id,
      actorUuid: actor.uuid,
      skillKey,
      modifier,
      context
    });
    setTimeout(() => finish(null), 120000);
  });
}

export function registerAbilityDaSocket() {
  game.socket.on(ABILITY_DA_SOCKET, async (message) => {
    if (message?.type !== "ability-da-resistance-request" || message.targetUserId !== game.user.id) return;
    const actor = await fromUuid(message.actorUuid);
    if (!actor || pendingResistanceRequests.has(message.requestId)) return;
    pendingResistanceRequests.add(message.requestId);
    const result = await requestAbilitySkillRoll({ actor, skillKey: message.skillKey, modifier: Number(message.modifier) || 0, context: message.context });
    pendingResistanceRequests.delete(message.requestId);
    game.socket.emit(ABILITY_DA_SOCKET, {
      type: "ability-da-resistance-response",
      requestId: message.requestId,
      requesterId: message.requesterId,
      result: serializableSkillRoll(result)
    });
  });
}

async function publishNativeRoll(roll, actor, content) {
  if (!roll?.toMessage || !globalThis.ChatMessage?.create) return null;
  const chatData = await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), content }, { create: false });
  return ChatMessage.create(chatData);
}

async function resizeActorTokens(actor, size, { token = null } = {}) {
  const dimensions = { miudo: 0.5, pequeno: 1, medio: 1, grande: 2, enorme: 3, colossal: 4 };
  const value = dimensions[size];
  if (!Number.isFinite(value)) return [];
  const selectedToken = token
    ?? globalThis.canvas?.tokens?.controlled?.find((candidate) => candidate.actor === actor || candidate.actor?.id === actor?.id)
    ?? null;
  if (!selectedToken) return [];
  const document = selectedToken.document ?? selectedToken;
  if (typeof document.resize !== "function") return [];
  const before = { width: Number(document.width), height: Number(document.height) };
  const result = await document.resize({ width: value, height: value });
  const after = { width: Number(document.width), height: Number(document.height) };
  return [{ token: selectedToken, before, after, expected: { width: value, height: value }, result, changed: after.width === value && after.height === value }];
}

function selectBranch(effect, sourceActor, targetActor) {
  const relation = compareCreatureSizes(sourceActor, targetActor).relation;
  return (effect.branches ?? []).find((branch) => {
    const condition = String(branch.condition ?? "").replace(/\s+/g, " ").trim();
    if (!condition) return false;
    if (/target\.size\s*<\s*actor\.size/.test(condition)) return relation === "menor";
    if (/target\.size\s*<=\s*actor\.size/.test(condition)) return relation === "menor" || relation === "igual";
    if (/target\.size\s*>\s*actor\.size/.test(condition)) return relation === "maior";
    if (/target\.size\s*>=\s*actor\.size/.test(condition)) return relation !== "menor";
    return false;
  }) ?? null;
}

const VICTORY_EFFECT_ID = "hrodnar-desafio-ancestral";

function victoryOperations() {
  return [
    { id: "op-armor-bonus", type: "armorBonus", amount: 4, formula: "", skillKey: "", resourceId: "", conditionKey: "carapaca", durationId: "", description: "Conceder Carapaça (4) enquanto a habilidade estiver ativa.", manual: false },
    { id: "op-size-increase", type: "sizeIncrease", amount: 1, formula: "", skillKey: "", resourceId: "", conditionKey: "", durationId: "", description: "Aumentar o tamanho efetivo em exatamente um estágio enquanto a habilidade estiver ativa.", manual: false }
  ];
}

function isVictoryEffect(item, effect) {
  return item?.type === "habilidadeDa"
    && (item.name === "Vitória do Mais Forte" || effect?.id === VICTORY_EFFECT_ID);
}

export function migrateVictoryEffect(item) {
  const effects = getAbilityDaEffects(item, { includeDisabled: true });
  const effect = effects.find((entry) => isVictoryEffect(item, entry));
  if (!effect) return { changed: false, effects, effect: null };
  const hasArmor = effect.operations?.some((operation) => operation.type === "armorBonus" && operation.conditionKey === "carapaca" && operation.manual !== true);
  const hasSize = effect.operations?.some((operation) => operation.type === "sizeIncrease" && operation.manual !== true);
  if (hasArmor && hasSize) return { changed: false, effects, effect };
  const preserved = (effect.operations ?? []).filter((operation) => operation.type !== "manual" || operation.manual !== true);
  effect.operations = [...preserved, ...victoryOperations().filter((operation) => operation.type === "armorBonus" ? !hasArmor : !hasSize)];
  effect.stacking = { ...(effect.stacking ?? {}), policy: "preventDuplicate", key: VICTORY_EFFECT_ID };
  return { changed: true, effects, effect };
}

function actorDocumentsForAbilityMigration() {
  const actors = new Map();
  for (const actor of globalThis.game?.actors?.contents ?? []) actors.set(actor.uuid ?? actor.id, actor);
  for (const token of globalThis.canvas?.tokens?.placeables ?? []) {
    if (token.actor) actors.set(token.actor.uuid ?? token.actor.id, token.actor);
  }
  return [...actors.values()];
}

export async function migrateAbilityDaCopies() {
  const migrated = [];
  for (const actor of actorDocumentsForAbilityMigration()) {
    for (const item of actor.items?.contents ?? []) {
      const result = migrateVictoryEffect(item);
      if (!result.effect || !result.changed || item.isOwner === false) continue;
      await item.update({ "system.effects": result.effects });
      if (result.effect.active === true) {
        const token = globalThis.canvas?.tokens?.placeables?.find((candidate) => candidate.actor === actor || candidate.actor?.id === actor.id) ?? null;
        for (const operation of result.effect.operations ?? []) await evaluateOperation(operation, actor, { actor, effect: result.effect, item, token });
      }
      migrated.push({ actor, item });
    }
  }
  return migrated;
}

async function confirmTargetReview(item, targets) {
  if (!targets.length) return true;
  const { DialogV2 } = foundry.applications.api;
  const names = targets.map(({ actor }) => `<li>${foundry.utils.escapeHTML(actor.name ?? actor.id)}</li>`).join("");
  return DialogV2.wait({
    window: { title: item.name },
    content: `<p>${game.i18n.localize("CMET.AbilityDa.Chat.TargetReview")}</p><ul>${names}</ul>`,
    buttons: [
      { action: "confirm", label: game.i18n.localize("CMET.AbilityDa.Actions.Confirm"), type: "button", callback: () => true },
      { action: "cancel", label: game.i18n.localize("CMET.Hotbar.Actions.Cancel"), type: "button", callback: () => false }
    ]
  });
}

async function evaluateOperation(operation, targetActor, { actor, effect, item, rollResult, targetToken, token } = {}) {
  if (operation.manual) return null;
  if (operation.type === "conditionAdd") {
    const conditionKey = operation.conditionKey;
    return conditionKey ? applyNamedCondition(targetActor, conditionKey, { source: effect.id, sourceItem: item.uuid, targetId: targetActor.id, manual: true }) : null;
  }
  if (operation.type === "conditionRemove") return operation.conditionKey ? clearNamedCondition(targetActor, operation.conditionKey) : null;
  if (operation.type === "skillModifier") {
    const receiver = operation.conditionKey === "target.id" ? actor : targetActor;
    const modifiers = foundry.utils.deepClone(receiver.getFlag?.(game.system.id, "daModifiers") ?? []);
    const targetId = operation.conditionKey === "target.id" ? targetActor.id : actor.id;
    const entry = { source: effect.id, sourceItem: item.uuid, skillKey: operation.skillKey, amount: Number(operation.amount) || 0, targetId, targetTokenId: targetToken?.document?.id ?? targetToken?.id ?? null };
    const filtered = modifiers.filter((modifier) => modifier.source !== effect.id || modifier.targetId !== targetId);
    await receiver.setFlag(game.system.id, "daModifiers", [...filtered, entry]);
    return entry;
  }
  if (operation.type === "armorBonus") {
    const armor = foundry.utils.deepClone(targetActor.getFlag?.(game.system.id, "daArmor") ?? []);
    const entry = { source: effect.id, sourceItem: item.uuid, key: operation.conditionKey || "carapaca", amount: Number(operation.amount) || 0 };
    const filtered = armor.filter((value) => value.source !== effect.id);
    await targetActor.setFlag(game.system.id, "daArmor", [...filtered, entry]);
    return entry;
  }
  if (operation.type === "sizeIncrease") {
    const contributions = foundry.utils.deepClone(targetActor.getFlag?.(game.system.id, "daSizeContributions") ?? []);
    if (contributions.some((entry) => entry.source === effect.id)) return { source: effect.id, stages: 1 };
    contributions.push({ source: effect.id, stages: 1 });
    await targetActor.setFlag(game.system.id, "daSizeContributions", contributions);
    const size = nextCreatureSize(getCreatureSize(targetActor));
    const selectedToken = token ?? globalThis.canvas?.tokens?.controlled?.find((candidate) => candidate.actor === targetActor || candidate.actor?.id === targetActor?.id) ?? null;
    const resizeResults = await resizeActorTokens(targetActor, size, { token: selectedToken });
    if (selectedToken && (!resizeResults.length || resizeResults.some((entry) => !entry.changed))) {
      contributions.pop();
      await targetActor.setFlag(game.system.id, "daSizeContributions", contributions);
      throw new Error("CMET | O TokenDocument não confirmou o novo tamanho de Vitória do Mais Forte.");
    }
    return { source: effect.id, stages: 1, size, resizeResults };
  }
  if (operation.type === "damage") {
    let amount = Number(operation.amount ?? 0);
    if (operation.formula) { const roll = new Roll(operation.formula); await roll.evaluate(); amount = Number(roll.total); }
    if (!Number.isInteger(amount) || amount <= 0 || !targetActor.system?.resources?.vida) return null;
    const current = Number(targetActor.system.resources.vida.value) || 0;
    await targetActor.update({ "system.resources.vida.value": Math.max(0, current - amount) });
    return { ...operation, amount };
  }
  return null;
}

async function activateMarcoOperation(actor, item, effect, operation, context) {
  if (operation.type === "marcoChildOfHel") return registerMarcoDeathChoice(actor, effect, item, { eventId: context.eventId ?? `manual-death:${game.combat?.id ?? "combat"}:${foundry.utils.randomID()}` });
  if (operation.type === "marcoManifestation") return activateManifestation(actor, effect, item, context);
  if (operation.type === "marcoProfaneConversion") return activateProfaneConversion(actor, effect.costs?.find((cost) => cost.timing === "activation") ?? { type: "actions", amount: 1, timing: "activation" });
  if (operation.type === "marcoLastSpark") return activateLastSpark(actor, item, effect, context);
  return null;
}

function resolveDraummaTarget(actor, effect, context = {}) {
  if (context.targetActor) return { actor: context.targetActor, token: context.targetToken ?? null };
  const selected = context.targets ?? [...(globalThis.game?.user?.targets ?? [])];
  const candidate = [...selected][0] ?? null;
  const targetActor = candidate?.actor ?? candidate?.document?.actor ?? (candidate?.system ? candidate : null);
  return targetActor && targetActor !== actor ? { actor: targetActor, token: candidate?.actor ? candidate : null } : { actor: null, token: null };
}

async function announceDraummaResult(actor, item, result) {
  if (!result?.valid || !globalThis.ChatMessage?.create) return;
  if (result.skillKey && result.roll?.toMessage && globalThis.foundry?.applications?.handlebars?.renderTemplate) {
    const content = await foundry.applications.handlebars.renderTemplate(
      "systems/contos-de-mar-e-terra/templates/chat/ability-da-bonus-roll-card.hbs",
      {
        actorName: actor?.name ?? "",
        itemName: item?.name ?? "",
        skillLabel: SKILL_LABELS[result.skillKey] ?? result.skillKey,
        dice: result.modifier?.dice ?? [],
        amount: Number(result.amount) || 0,
        duration: game.i18n.localize("CMET.AbilityDa.Summary.Duration")
      }
    );
    await publishNativeRoll(result.roll, actor, content);
    return;
  }
  const skill = result.skillKey ? `Perícia copiada: ${SKILL_LABELS[result.skillKey] ?? result.skillKey}.` : "";
  const amount = Number.isFinite(Number(result.amount)) ? ` Bônus: +${result.amount}.` : "";
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<article class="cmet-chat-card cmet-ability-da-card"><header><strong>${foundry.utils.escapeHTML(item.name)}</strong></header><p>Ativada. ${skill}${amount} Duração: até o fim do combate.</p></article>` });
}

function notifyDraummaFailure(result) {
  if (result?.valid !== false || !globalThis.ui?.notifications?.warn) return;
  const messages = {
    missingTarget: "Selecione um inimigo válido para Truque de Mestre.",
    targetDidNotHit: "O inimigo selecionado não acertou um ataque neste turno.",
    requiresSkillSelection: "Escolha qual perícia do inimigo deseja copiar.",
    insufficientActions: "Não há ações suficientes para ativar Truque de Mestre.",
    invalidSkill: "A perícia do ataque não é válida para ser copiada."
  };
  ui.notifications.warn(messages[result.reason] ?? `Não foi possível ativar a habilidade (${result.reason ?? "motivo desconhecido"}).`);
}

async function activateDraummaOperation(actor, item, effect, operation, context) {
  const target = resolveDraummaTarget(actor, effect, context);
  const operationContext = { ...context, targetActor: context.targetActor ?? target.actor, targetToken: context.targetToken ?? target.token };
  let result;
  if (operation.type === "draummaAce") result = await activateDraummaAce({ actor, spell: operationContext.spell, rollD6: operationContext.rollD6 });
  else if (operation.type === "draummaManaSiphon") result = await activateDraummaManaSiphon({ actor, targetActor: operationContext.targetActor, actorToken: operationContext.originToken, targetToken: operationContext.targetToken, combat: operationContext.combat ?? game.combat, rollFortitude: operationContext.rollFortitude, rollD6: operationContext.rollD6 });
  else if (operation.type === "draummaMasterTrick") result = operationContext.targetActor
    ? await activateDraummaTrick({ actor, targetActor: operationContext.targetActor, combat: operationContext.combat ?? game.combat, selectedSkillKey: operationContext.selectedSkillKey, roll2d6: operationContext.roll2d6 })
    : { valid: false, reason: "missingTarget" };
  else if (operation.type === "draummaMagicRedistribution") result = operationContext.resolveMagicRedistribution?.({ actor, effect, item }) ?? { valid: false, reason: "missingMagicContext" };
  else return null;
  notifyDraummaFailure(result);
  await announceDraummaResult(actor, item, result);
  return result;
}

export async function applyConditionalAbilityDaEffects({ actor, targetActor, context = {} } = {}) {
  if (!actor || !targetActor) return [];
  const applied = [];
  const eligibleSources = new Set();
  const activeSources = new Set();
  for (const item of actor.items?.contents ?? []) {
    if (item.type !== "habilidadeDa") continue;
    for (const effect of getAbilityDaEffects(item)) {
      if (effect.activationType !== "passiva" || effect.active !== true) continue;
      activeSources.add(effect.id);
      const relation = compareCreatureSizes({ system: { size: getBaseCreatureSize(actor) } }, { system: { size: getBaseCreatureSize(targetActor) } }).relation;
      const eligible = (effect.conditions ?? []).some((condition) => (
        condition.key === "target.level" && condition.operator === "greaterThan" && Number(targetActor.system?.progression?.nivel) > Number(actor.system?.progression?.nivel)
      ) || (
        condition.key === "target.size" && condition.operator === "greaterThan" && relation === "maior"
      ));
      if (!eligible) continue;
      eligibleSources.add(effect.id);
      for (const operation of effect.operations ?? []) {
        const result = await evaluateOperation(operation, actor, { actor, effect, item, targetToken: context.targetToken, token: context.originToken });
        if (result) applied.push({ item, effect, result });
      }
    }
  }
  const existingArmor = targetActor.getFlag?.(game.system.id, "daArmor") ?? [];
  const retainedArmor = existingArmor.filter((entry) => !String(entry.source ?? "").startsWith("hrodnar-") || activeSources.has(entry.source) || eligibleSources.has(entry.source));
  if (retainedArmor.length !== existingArmor.length) await targetActor.setFlag(game.system.id, "daArmor", retainedArmor);
  return applied;
}

async function confirmActivation(item, effect) {
  if (effect.activationType !== "reativa" && !effect.targets?.manualConfirmation && !effect.trigger?.confirmation) return true;
  const { DialogV2 } = foundry.applications.api;
  return DialogV2.wait({
    window: { title: item.name },
    content: `<p>${foundry.utils.escapeHTML(effect.name || item.name)}</p>`,
    buttons: [
      { action: "confirm", label: game.i18n.localize("CMET.AbilityDa.Actions.Confirm"), type: "button", callback: () => true },
      { action: "cancel", label: game.i18n.localize("CMET.Hotbar.Actions.Cancel"), type: "button", callback: () => false }
    ]
  });
}

export async function toggleAbilityDaEffect({ actor, item, effectId, token = null } = {}) {
  const effects = getAbilityDaEffects(item, { includeDisabled: true });
  const effect = effects.find((entry) => entry.id === effectId);
  if (!actor || !item || item.type !== "habilidadeDa" || !effect || effect.enabled === false || effect.activationType !== "passiva") {
    notify("EffectUnavailable");
    return null;
  }
  const active = effect.active !== true;
  effect.active = active;
  await item.update({ "system.effects": effects });
  if (active) {
    for (const operation of effect.operations ?? []) await evaluateOperation(operation, actor, { actor, effect, item, token });
  } else {
    const armor = actor.getFlag?.(game.system.id, "daArmor") ?? [];
    const retainedArmor = armor.filter((entry) => entry.source !== effect.id);
    if (retainedArmor.length !== armor.length) await actor.setFlag(game.system.id, "daArmor", retainedArmor);
    const contributions = actor.getFlag?.(game.system.id, "daSizeContributions") ?? [];
    const retainedContributions = contributions.filter((entry) => entry.source !== effect.id);
    if (retainedContributions.length !== contributions.length) {
      await actor.setFlag(game.system.id, "daSizeContributions", retainedContributions);
      await resizeActorTokens(actor, getCreatureSize(actor), { token });
    }
  }
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<article class="cmet-chat-card cmet-ability-da-card"><header><strong>${foundry.utils.escapeHTML(item.name)}</strong> — ${foundry.utils.escapeHTML(effect.name || item.name)}</header><p>${game.i18n.localize(active ? "CMET.AbilityDa.Chat.Activated" : "CMET.AbilityDa.Chat.Deactivated")}</p></article>` });
  return { effect, active };
}

export async function activateAbilityDaEffect({ actor, item, effectId, context = {} } = {}) {
  const effect = getAbilityDaEffect(item, effectId);
  if (!actor || !item || item.type !== "habilidadeDa" || !effect || effect.enabled === false) {
    notify("EffectUnavailable");
    return null;
  }
  if (!["ativa", "reativa"].includes(effect.activationType)) {
    notify("PassiveManual");
    return null;
  }
  if (!(await confirmActivation(item, effect))) return null;
  const marcoOperation = effect.operations?.find((operation) => ["marcoChildOfHel", "marcoManifestation", "marcoProfaneConversion", "marcoLastSpark"].includes(operation.type));
  if (marcoOperation) return activateMarcoOperation(actor, item, effect, marcoOperation, context);
  const draummaOperation = effect.operations?.find((operation) => ["draummaAce", "draummaMagicRedistribution", "draummaManaSiphon", "draummaMasterTrick"].includes(operation.type));
  if (draummaOperation) return activateDraummaOperation(actor, item, effect, draummaOperation, context);
  const norisOperation = effect.operations?.find((operation) => operation.type?.startsWith("noris"));
  if (norisOperation) return activateNorisAbility({ actor, item, effect, operation: norisOperation, context });
  const activationCosts = (effect.costs ?? []).filter((cost) => cost.timing === "activation");
  const successCosts = (effect.costs ?? []).filter((cost) => cost.timing === "success");
  for (const cost of activationCosts) {
    const check = canPayAbilityDaCost(actor, cost);
    if (!check.valid) { notifyCostFailure(check, item); return null; }
  }
  let rollResult = null;
  const applied = [];
  let nativeRollPublished = false;
  const unsupported = (effect.operations ?? []).filter((operation) => operation.manual || !["resource", "heal", "conditionAdd", "conditionRemove", "skillModifier", "weaponGrip", "armorBonus", "sizeIncrease", "damage"].includes(operation.type));
  const targets = resolveTargets(actor, effect, context);
  if (effect.targets?.relation === "enemy" && effect.rolls?.some((roll) => roll.type === "resistance")) {
    if (!(await confirmTargetReview(item, targets))) return { effect, applied, unsupported, cancelled: true };
  }
  const rollDefinition = effect.rolls?.find((roll) => roll.type === "skill" && roll.skillKey);
  if (rollDefinition) {
    rollResult = await requestAbilitySkillRoll({ actor, skillKey: rollDefinition.skillKey, modifier: Number(rollDefinition.difficulty ?? 0), context: { type: "abilityDa", itemName: item.name, effectName: effect.name } });
    if (!rollResult) return { effect, rollResult: null, applied, unsupported, cancelled: true };
  }
  const resistance = effect.rolls?.find((roll) => roll.type === "resistance" && roll.skillKey);
  const targetResolutions = [];
  for (const target of targets) {
    let targetRoll = null;
    if (resistance) {
      const resistanceContext = { type: "abilityDa", itemName: item.name, effectName: effect.name };
      const authority = getActorUpdateAuthority(target.actor);
      targetRoll = authority?.id && authority.id !== game.user.id
        ? await requestRemoteResistance({ actor: target.actor, skillKey: resistance.skillKey, modifier: Number(resistance.difficulty ?? 0), context: resistanceContext })
        : await requestAbilitySkillRoll({ actor: target.actor, skillKey: resistance.skillKey, modifier: Number(resistance.difficulty ?? 0), context: resistanceContext });
      if (!targetRoll) return { effect, rollResult, applied, unsupported, cancelled: true };
    }
    targetResolutions.push({ target, targetRoll, outcome: resistance ? compareAbilityRolls(rollResult, targetRoll) : null });
  }
  for (const cost of activationCosts) await payAbilityDaCost(actor, cost);
  if (rollResult && !rollResult.success) return { effect, rollResult, applied, unsupported };
  for (const { target, targetRoll, outcome } of targetResolutions) {
    if (outcome && outcome.winner !== "attack") continue;
    const branch = selectBranch(effect, actor, target.actor);
    const operations = [...(effect.operations ?? []), ...(branch?.operations ?? [])];
    for (const operation of operations) {
      const result = await evaluateOperation(operation, target.actor, { actor, effect, item, rollResult: targetRoll ?? rollResult, targetToken: target.token });
      if (result) applied.push({ operation, target: target.actor, result });
    }
  }
  for (const operation of effect.operations ?? []) {
    if (operation.manual) continue;
    if (operation.type === "resource" || operation.type === "heal") {
      const resourceKey = operation.type === "heal" ? "vida" : operation.resourceId;
      let amount = Number(operation.amount ?? 0);
      let operationRoll = null;
      if (operation.formula) {
        operationRoll = new Roll(operation.formula);
        await operationRoll.evaluate();
        amount = Number(operationRoll.total);
      }
      if (!Number.isInteger(amount) || !resourceKey) continue;
      if (["vida", "mana", "sanidade"].includes(resourceKey)) {
        const current = Number(actor.system.resources[resourceKey].value);
        const max = getResourceMaximum(actor, resourceKey);
        await actor.update({ [`system.resources.${resourceKey}.value`]: Math.min(max, Math.max(0, current + amount)) });
        applied.push({ ...operation, amount, roll: operationRoll });
        if (operationRoll) {
          await publishNativeRoll(operationRoll, actor, `<p>${foundry.utils.escapeHTML(item.name)}: ${amount} ${game.i18n.localize("CMET.AbilityDa.Resources.Current")}</p>`);
          nativeRollPublished = true;
        }
      } else if (resourceKey === "custom") {
        const resources = foundry.utils.deepClone(actor.system.resources.custom ?? []);
        const resource = resources.find((entry) => entry.id === operation.resourceId);
        if (resource) {
          resource.current = Math.min(Number(resource.max ?? Number.MAX_SAFE_INTEGER), Math.max(0, Number(resource.current) + amount));
          await actor.update({ "system.resources.custom": resources });
          if (operationRoll) {
            await publishNativeRoll(operationRoll, actor, `<p>${foundry.utils.escapeHTML(item.name)}: ${amount} ${game.i18n.localize("CMET.AbilityDa.Resources.Current")}</p>`);
            nativeRollPublished = true;
          }
          applied.push({ ...operation, amount, roll: operationRoll });
        }
      }
    }
  }
  for (const cost of successCosts) {
    const check = canPayAbilityDaCost(actor, cost);
    if (!check.valid) { notifyCostFailure(check, item); return { effect, rollResult, applied, unsupported }; }
  }
  for (const cost of successCosts) await payAbilityDaCost(actor, cost);
  if (!nativeRollPublished) await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<article class="cmet-chat-card cmet-ability-da-card"><header><strong>${foundry.utils.escapeHTML(item.name)}</strong> — ${foundry.utils.escapeHTML(effect.name || item.name)}</header><p>${game.i18n.localize("CMET.AbilityDa.Chat.Activated")}</p>${unsupported.length ? `<p>${game.i18n.localize("CMET.AbilityDa.Chat.ManualEffects")}</p>` : ""}</article>` });
  return { effect, rollResult, applied, unsupported };
}

export const AbilityDaService = Object.freeze({ ensureAbilityDaEffectIds, getAbilityDaEffects, getAbilityDaEffect, getAbilityDaActions, activateAbilityDaEffect, activateNorisAbilityAction, toggleAbilityDaEffect, applyConditionalAbilityDaEffects, registerAbilityDaSocket, migrateVictoryEffect, migrateAbilityDaCopies });
