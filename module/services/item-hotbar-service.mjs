import { ITEM_TYPES } from "../config/constants.mjs";
import { startThrownWeaponAttack, startWeaponAttack } from "./combat-attack-service.mjs";
import { resolveItemRollSkill, rollItemSkill } from "./item-roll-service.mjs";
import { recoverWeapon, reloadWeapon } from "./item-action-service.mjs";
import { canFire, canRecover, canThrow, characteristicEnabled } from "./weapon-characteristics-service.mjs";
import { activateAbilityDaEffect, getAbilityDaActions } from "./ability-da-service.mjs";

const SYSTEM_ID = "contos-de-mar-e-terra";
const HOTBAR_FLAG = "itemHotbar";
const SUPPORTED_ITEM_TYPES = new Set(Object.values(ITEM_TYPES));

function notify(key) {
  const message = game.i18n.localize(`CMET.Hotbar.Notifications.${key}`);
  ui.notifications.warn(message);
}

function escapeHTML(value) {
  return foundry.utils.escapeHTML?.(String(value ?? "")) ?? String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
}

function actorOwnsItem(actor, item) {
  if (!actor || !item || item.parent?.uuid !== actor.uuid) return false;
  if (typeof actor.testUserPermission === "function") return actor.testUserPermission(game.user, "OWNER");
  return actor.isOwner === true;
}

function resolveDroppedItem(data) {
  if (typeof globalThis.fromUuidSync !== "function") return null;
  const item = globalThis.fromUuidSync(data.uuid);
  return item?.documentName === "Item" ? item : null;
}

export function getItemHotbarAction(item) {
  return SUPPORTED_ITEM_TYPES.has(item?.type) ? "menu" : null;
}

export function getItemHotbarActions(item) {
  if (item?.type === ITEM_TYPES.ARMA) {
    const actions = [];
    if (resolveItemRollSkill(item) && canFire(item)) actions.push({ key: "attack", label: "CMET.Hotbar.Actions.Attack" });
    if (resolveItemRollSkill(item)) actions.push({ key: "skill", label: "CMET.Hotbar.Actions.SkillTest" });
    if (canFire(item) && characteristicEnabled(item, "puxar")) actions.push({ key: "pull", label: "CMET.Hotbar.Actions.Pull" });
    if (canFire(item) && characteristicEnabled(item, "golpeDeRetaguarda")) actions.push({ key: "golpeDeRetaguarda", label: "CMET.Hotbar.Actions.RearStrike" });
    if (canThrow(item)) actions.push({ key: "throw", label: "CMET.Hotbar.Actions.Throw" });
    if (characteristicEnabled(item, "recarregar") && item.system.loaded === false) actions.push({ key: "reload", label: "CMET.Hotbar.Actions.Reload" });
    if (canRecover(item)) actions.push({ key: "recover", label: "CMET.Hotbar.Actions.Recover" });
    return actions;
  }
  if ([ITEM_TYPES.MAGIA, ITEM_TYPES.HABILIDADE].includes(item?.type) && resolveItemRollSkill(item)) {
    return [{ key: "skill", label: "CMET.Hotbar.Actions.SkillTest" }];
  }
  if (item?.type === ITEM_TYPES.HABILIDADE_DA) return getAbilityDaActions(item);
  return [];
}

export function createItemHotbarCommand({ actorUuid, itemUuid, action = "menu", effectId = null } = {}) {
  const payload = JSON.stringify({ actorUuid: String(actorUuid ?? ""), itemUuid: String(itemUuid ?? ""), action: String(action), ...(effectId ? { effectId: String(effectId) } : {}) });
  return `game.system.api?.executeItemHotbarAction?.(${payload});`;
}

function findExistingMacro(itemUuid, effectId = null) {
  return game.macros?.contents?.find((macro) => {
    const metadata = macro.getFlag?.(SYSTEM_ID, HOTBAR_FLAG);
    return metadata?.itemUuid === itemUuid && (metadata?.effectId ?? null) === effectId;
  }) ?? null;
}

async function getOrCreateMacro(item, actor, effectId = null) {
  if (!getItemHotbarAction(item) || !item?.uuid || !actor?.uuid) return null;
  const action = "menu";
  const command = createItemHotbarCommand({ actorUuid: actor.uuid, itemUuid: item.uuid, action, effectId });
  const flags = { [SYSTEM_ID]: { [HOTBAR_FLAG]: { actorUuid: actor.uuid, itemUuid: item.uuid, action, ...(effectId ? { effectId } : {}) } } };
  const existing = findExistingMacro(item.uuid, effectId);
  if (existing) {
    await existing.update({ command, [`flags.${SYSTEM_ID}.${HOTBAR_FLAG}`]: flags[SYSTEM_ID][HOTBAR_FLAG] });
    return existing;
  }
  return Macro.create({
    name: item.name,
    type: "script",
    img: item.img,
    command,
    flags
  });
}

export async function handleItemHotbarDrop(_hotbar, data, slot) {
  if (data?.type !== "Item" || !data.uuid) return false;
  const item = resolveDroppedItem(data) ?? await fromUuid(data.uuid);
  const actor = item?.parent?.documentName === "Actor" ? item.parent : null;
  if (!item || !actor || !SUPPORTED_ITEM_TYPES.has(item.type)) return false;
  if (!actorOwnsItem(actor, item)) {
    notify("ItemUnavailable");
    return true;
  }
  const macro = await getOrCreateMacro(item, actor, data.effectId ?? null);
  if (!macro) return false;
  if (!macro.id || !(game.macros?.get?.(macro.id) ?? macro)) throw new Error("CMET | Macro não foi persistida na coleção de macros.");
  await game.user.assignHotbarMacro(macro, slot);
  if (game.user.hotbar && game.user.hotbar[slot] !== macro.id) throw new Error("CMET | Macro não foi atribuída ao slot da hotbar.");
  return true;
}

export async function executeItemAction({ actor, item, action } = {}) {
  if (action?.startsWith?.("da:")) return activateAbilityDaEffect({ actor, item, effectId: action.slice(3) });
  if (action === "attack") return startWeaponAttack({ actor, item });
  if (action === "pull") return startWeaponAttack({ actor, item, attackMode: "pull" });
  if (action === "golpeDeRetaguarda") return startWeaponAttack({ actor, item, attackMode: "golpeDeRetaguarda" });
  if (action === "throw") return startThrownWeaponAttack({ actor, item });
  if (action === "skill") return rollItemSkill({ actor, item });
  if (action === "reload") return reloadWeapon({ actor, item });
  if (action === "recover") return recoverWeapon({ actor, item });
  notify("NoActionAvailable");
  return null;
}

export async function openItemActionMenu({ actor, item, effectId = null } = {}) {
  if (item?.type === ITEM_TYPES.HABILIDADE_DA && effectId) return executeItemAction({ actor, item, action: `da:${effectId}` });
  const actions = getItemHotbarActions(item);
  if (!actions.length) {
    notify("NoActionAvailable");
    return null;
  }
  if (item.type !== ITEM_TYPES.ARMA && actions.length === 1) return executeItemAction({ actor, item, action: actions[0].key });
  const { DialogV2 } = foundry.applications.api;
  const action = await DialogV2.wait({
    window: { title: item.name },
    content: `<p>${game.i18n.format("CMET.Hotbar.ChooseAction", { item: escapeHTML(item.name) })}</p>`,
    buttons: [
      ...actions.map((entry) => ({
        action: entry.key,
        label: game.i18n.localize(entry.label),
        type: "button",
        callback: () => entry.key
      })),
      { action: "cancel", label: game.i18n.localize("CMET.Hotbar.Actions.Cancel"), type: "button", callback: () => null }
    ]
  });
  if (!action || action === "cancel") return null;
  return executeItemAction({ actor, item, action });
}

export async function executeItemHotbarAction({ actorUuid, itemUuid, action = null, effectId = null } = {}) {
  const item = await fromUuid(itemUuid);
  const actor = await fromUuid(actorUuid);
  if (!item || !actor || !SUPPORTED_ITEM_TYPES.has(item.type) || !actorOwnsItem(actor, item)) {
    notify("ItemUnavailable");
    return null;
  }
  return openItemActionMenu({ actor, item, effectId });
}

export function registerItemHotbarApi() {
  const system = game.system;
  if (!system) return;
  system.api = { ...(system.api ?? {}), executeItemHotbarAction: system.api?.executeItemHotbarAction ?? executeItemHotbarAction };
}

export function registerItemHotbarHook() {
  Hooks.on("hotbarDrop", (hotbar, data, slot) => {
    if (data?.type !== "Item" || !data.uuid) return true;
    const item = resolveDroppedItem(data);
    if (!item || !SUPPORTED_ITEM_TYPES.has(item.type)) return true;
    void handleItemHotbarDrop(hotbar, data, slot).catch((error) => {
      console.error("CMET | Erro ao criar atalho de item", error);
      ui.notifications.error(game.i18n.localize("CMET.Hotbar.Notifications.CreationFailed"));
    });
    return false;
  });
}

export const ItemHotbarService = Object.freeze({
  getItemHotbarAction,
  getItemHotbarActions,
  createItemHotbarCommand,
  handleItemHotbarDrop,
  executeItemAction,
  openItemActionMenu,
  executeItemHotbarAction,
  registerItemHotbarApi,
  registerItemHotbarHook
});
