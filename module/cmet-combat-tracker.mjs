import { CombatActionService } from "./services/combat-action-service.mjs";
import { isAuthoritativeGM } from "./services/combat-authority-service.mjs";

let combatHooksRegistered = false;

function localize(key) {
  return game.i18n.localize(`CMET.Combat.${key}`);
}

function createActionsElement(combatant) {
  const state = CombatActionService.getState(combatant);
  const wrapper = document.createElement("div");
  wrapper.className = "cmet-combat-actions";
  wrapper.dataset.cmetCombatActions = "true";

  const available = document.createElement("span");
  available.className = "cmet-combat-actions__available";
  available.textContent = `A: ${state.current}`;
  available.title = `${localize("ActionsAvailable")}: ${state.current}`;
  wrapper.append(available);

  const reserved = document.createElement("span");
  reserved.className = "cmet-combat-actions__reserved";
  reserved.textContent = `R: ${state.reserved}`;
  reserved.title = `${localize("ActionsReserved")}: ${state.reserved}`;
  wrapper.append(reserved);

  return wrapper;
}

export function renderCombatActions(application, element) {
  if (application?.constructor?.tabName !== "combat") return;
  const combat = game.combat;
  if (!combat) return;
  for (const row of element.querySelectorAll(".combatant[data-combatant-id]")) {
    const combatant = combat.combatants.get(row.dataset.combatantId);
    if (!combatant?.actor) continue;
    try {
      row.querySelector("[data-cmet-combat-actions]")?.remove();
      const initiative = row.querySelector(".token-initiative");
      initiative?.before(createActionsElement(combatant));
    } catch (error) {
      console.warn("CMET | Não foi possível preparar as ações do Combat Tracker.", error);
    }
  }
}

export function isForwardTurnProgression(prior, current) {
  if (!prior?.combatantId || !current?.combatantId) return false;
  if (!Number.isInteger(prior.round) || !Number.isInteger(prior.turn)
    || !Number.isInteger(current.round) || !Number.isInteger(current.turn)) return false;
  return current.round > prior.round
    || (current.round === prior.round && current.turn > prior.turn);
}

export function registerCombatHooks() {
  if (combatHooksRegistered) return;
  combatHooksRegistered = true;
  Hooks.on("renderApplicationV2", renderCombatActions);
  Hooks.on("combatTurnChange", async (combat, prior, current) => {
    if (!isAuthoritativeGM()) return;

    const previousCombatant = prior?.combatantId
      ? combat.combatants.get(prior.combatantId)
      : null;
    const currentCombatant = current?.combatantId
      ? combat.combatants.get(current.combatantId)
      : null;
    const forward = isForwardTurnProgression(prior, current);

    console.log("CMET | TURN TRANSITION", {
      prior: {
        id: prior?.combatantId,
        round: prior?.round,
        turn: prior?.turn
      },
      current: {
        id: current?.combatantId,
        round: current?.round,
        turn: current?.turn
      },
      forward
    });

    if (!currentCombatant?.actor) return;
    if (!prior?.combatantId) {
      await CombatActionService.resetTurn(currentCombatant, {
        combat,
        round: current.round,
        turn: current.turn,
        reason: "combat-start"
      });
      return;
    }
    if (!forward) return;

    if (previousCombatant?.actor) {
      console.log("CMET | AUTO RESERVE TURN END", {
        combatant: previousCombatant.name,
        before: CombatActionService.getState(previousCombatant)
      });
      await CombatActionService.reserveRemainingActions(previousCombatant);
      console.log("CMET | AUTO RESERVE RESULT", {
        combatant: previousCombatant.name,
        after: CombatActionService.getState(previousCombatant)
      });
    }

    await CombatActionService.resetTurn(currentCombatant, {
      combat,
      round: current.round,
      turn: current.turn,
      reason: "turn-start"
    });
  });
  Hooks.on("createCombatant", async (combatant) => {
    if (!isAuthoritativeGM() || !combatant.combat?.started || !combatant.actor) return;
    await CombatActionService.initialize(combatant);
  });
}
