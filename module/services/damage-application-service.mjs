import { SYSTEM_ID } from "../config/constants.mjs";
import { getActorUpdateAuthority } from "./combat-authority-service.mjs";

const SOCKET_CHANNEL = `system.${SYSTEM_ID}`;
const processedRequests = new Map();

function validateAmount(totalFinalDamage) {
  const amount = Number(totalFinalDamage);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new TypeError("CMET | O dano final precisa ser um número finito não negativo.");
  }
  return amount;
}

export function calculateDamageApplication({ hpBefore, amount }) {
  const normalizedHpBefore = Number(hpBefore);
  const normalizedAmount = validateAmount(amount);
  if (!Number.isFinite(normalizedHpBefore) || normalizedHpBefore < 0) {
    throw new TypeError("CMET | A Vida atual precisa ser um número finito não negativo.");
  }

  const hpAfter = Math.max(0, normalizedHpBefore - normalizedAmount);
  return {
    amount: normalizedAmount,
    hpBefore: normalizedHpBefore,
    hpAfter,
    appliedDamage: normalizedHpBefore - hpAfter,
    reachedZero: hpAfter === 0
  };
}

async function applyDamageDirect(actor, amount) {
  const result = calculateDamageApplication({ hpBefore: actor.system.resources.vida.value, amount });
  if (result.hpAfter !== result.hpBefore) {
    await actor.update({ "system.resources.vida.value": result.hpAfter });
  }
  return result;
}

function rememberRequest(requestId, operation) {
  processedRequests.set(requestId, operation);
  if (processedRequests.size > 100) processedRequests.delete(processedRequests.keys().next().value);
  return operation;
}

function requestRemoteApplication({ actor, combatant, amount, authority }) {
  if (!combatant?.id) throw new Error("CMET | Não foi possível identificar o Combatant defensor.");

  const requestId = foundry.utils.randomID();
  return new Promise((resolve, reject) => {
    const handler = (message) => {
      if (message?.type !== "combat-damage-application-response"
        || message.requestId !== requestId
        || message.requesterId !== game.user.id) return;
      Hooks.off("cmetCombatDamageApplicationResponse", handler);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    };
    Hooks.on("cmetCombatDamageApplicationResponse", handler);
    game.socket.emit(SOCKET_CHANNEL, {
      type: "combat-damage-application-request",
      requestId,
      requesterId: game.user.id,
      authorityId: authority.id,
      combatantId: combatant.id,
      amount,
      actorId: actor.id
    });
    setTimeout(() => {
      Hooks.off("cmetCombatDamageApplicationResponse", handler);
      reject(new Error("CMET | A autoridade do defensor não respondeu à aplicação de dano."));
    }, 30000);
  });
}

export async function applyDamage({ actor, combatant = null, amount: totalFinalDamage }) {
  const amount = validateAmount(totalFinalDamage);
  if (!actor) throw new Error("CMET | Não foi fornecido o Actor defensor.");

  const authority = getActorUpdateAuthority(actor);
  if (!authority) throw new Error("CMET | Não foi encontrada autoridade para atualizar o Actor defensor.");
  if (authority.id === game.user.id) return applyDamageDirect(actor, amount);
  return requestRemoteApplication({ actor, combatant, amount, authority });
}

export function registerDamageApplicationSocket() {
  game.socket.on(SOCKET_CHANNEL, async (message) => {
    if (message?.type !== "combat-damage-application-request"
      || message.requesterId === game.user.id
      || message.authorityId !== game.user.id) return;

    const combatant = game.combat?.combatants.get(message.combatantId);
    const actor = combatant?.actor;
    const authority = getActorUpdateAuthority(actor);
    if (!combatant || !actor || authority?.id !== game.user.id) return;

    let operation = processedRequests.get(message.requestId);
    if (!operation) operation = rememberRequest(message.requestId, applyDamageDirect(actor, message.amount));

    try {
      const result = await operation;
      game.socket.emit(SOCKET_CHANNEL, {
        type: "combat-damage-application-response",
        requesterId: message.requesterId,
        requestId: message.requestId,
        result
      });
    } catch (error) {
      game.socket.emit(SOCKET_CHANNEL, {
        type: "combat-damage-application-response",
        requesterId: message.requesterId,
        requestId: message.requestId,
        error: { message: error.message }
      });
    }
  });
}

export const DamageApplicationService = Object.freeze({ applyDamage, calculateDamageApplication });
