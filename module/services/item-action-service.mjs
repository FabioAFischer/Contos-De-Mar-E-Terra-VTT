import { ITEM_TYPES } from "../config/constants.mjs";
import { CombatActionService } from "./combat-action-service.mjs";
import { canRecover } from "./weapon-characteristics-service.mjs";

function getActorToken(actor, combat) {
  return globalThis.canvas?.tokens?.controlled?.find((token) => token.actor?.id === actor.id)
    ?? combat?.combatants.find((combatant) => combatant.actor?.id === actor.id)?.token?.object
    ?? null;
}

function getActorCombatant(actor, combat) {
  const token = getActorToken(actor, combat);
  const tokenId = token?.document?.id ?? token?.id;
  return token && combat?.combatants.find((combatant) => combatant.tokenId === tokenId);
}

export async function reloadWeapon({ actor, item } = {}) {
  if (item?.type !== ITEM_TYPES.ARMA || item.system.characteristics.recarregar?.enabled !== true) return null;
  const combat = game.combat;
  if (combat?.started) {
    const combatant = getActorCombatant(actor, combat);
    if (!combatant || combat.combatant?.id !== combatant.id) return ui.notifications.warn(game.i18n.localize("CMET.CombatAttack.Notifications.ReloadOnlyOnTurn"));
    try { await CombatActionService.spendAction(combatant); } catch { return ui.notifications.warn(game.i18n.localize("CMET.CombatAttack.Notifications.ActionInsufficient")); }
  }
  return item.update({ "system.loaded": true });
}

export async function recoverWeapon({ actor, item } = {}) {
  if (!canRecover(item)) return null;
  const combat = game.combat;
  if (combat?.started) {
    const combatant = getActorCombatant(actor, combat);
    if (!combatant || combat.combatant?.id !== combatant.id) return ui.notifications.warn(game.i18n.localize("CMET.CombatAttack.Notifications.ReloadOnlyOnTurn"));
    try { await CombatActionService.spendAction(combatant); } catch { return ui.notifications.warn(game.i18n.localize("CMET.CombatAttack.Notifications.ActionInsufficient")); }
  }
  return item.update({ "system.thrown": false });
}

export const ItemActionService = Object.freeze({ reloadWeapon, recoverWeapon });
