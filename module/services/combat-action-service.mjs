import { SYSTEM_ID } from "../config/constants.mjs";

const resetOperations = new Map();

export class CombatActionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "CombatActionError";
    this.code = code;
  }
}

function namespace() {
  return globalThis.game?.system?.id ?? SYSTEM_ID;
}

function getMax(combatant) {
  const max = Number(combatant?.actor?.system?.actions?.max);
  if (!combatant?.actor || !Number.isInteger(max) || max < 0) {
    throw new CombatActionError("invalidActor", "CMET | Combatant sem ações máximas válidas.");
  }
  return max;
}

function validateState(state, max) {
  if (!state || !Number.isInteger(state.current) || !Number.isInteger(state.reserved)
    || state.current < 0 || state.reserved < 0 || state.current + state.reserved > max) {
    throw new CombatActionError("invalidState", "CMET | Estado de ações inválido.");
  }
}

function readStoredState(combatant) {
  return combatant.getFlag(namespace(), "actions");
}

async function writeState(combatant, state, reason) {
  if (!reason) throw new CombatActionError("missingWriteReason", "CMET | Toda escrita de ações deve informar um motivo.");
  validateState(state, getMax(combatant));
  await combatant.setFlag(namespace(), "actions", { ...state });
  return { ...state };
}

export const CombatActionService = Object.freeze({
  getState(combatant) {
    const max = getMax(combatant);
    const stored = readStoredState(combatant);
    if (!stored) return { current: max, reserved: 0, turnKey: null };
    const state = { current: Number(stored.current), reserved: Number(stored.reserved), turnKey: stored.turnKey ?? null };
    validateState(state, max);
    return state;
  },

  async initialize(combatant) {
    const existing = combatant.getFlag(namespace(), "actions");
    if (existing) return this.getState(combatant);
    return writeState(combatant, { current: getMax(combatant), reserved: 0, turnKey: null }, "initialize");
  },

  async resetTurn(combatant, { combat = combatant.combat, round = combat?.round, turn = combat?.turn, reason = "turn-start" } = {}) {
    const state = this.getState(combatant);
    const normalizedRound = Number.isInteger(round) ? round : null;
    const normalizedTurn = Number.isInteger(turn) ? turn : null;
    const turnKey = combat?.id && normalizedRound !== null && normalizedTurn !== null
      ? `${combat.id}:${normalizedRound}:${normalizedTurn}:${combatant.id}`
      : null;
    if (turnKey !== null && state.turnKey === turnKey) return state;
    if (turnKey === null) return writeState(combatant, { current: getMax(combatant), reserved: 0, turnKey }, reason);
    const operationKey = `${combatant.id}:${turnKey}`;
    const existingOperation = resetOperations.get(operationKey);
    if (existingOperation) return existingOperation;
    const operation = writeState(combatant, { current: getMax(combatant), reserved: 0, turnKey }, reason);
    resetOperations.set(operationKey, operation);
    try {
      return await operation;
    } finally {
      if (resetOperations.get(operationKey) === operation) resetOperations.delete(operationKey);
    }
  },

  async reserveRemainingActions(combatant) {
    const state = this.getState(combatant);
    const current = Number(state.current ?? 0);
    const reserved = Number(state.reserved ?? 0);
    if (current <= 0) return state;

    const nextState = {
      ...state,
      current: 0,
      reserved: reserved + current
    };
    return writeState(combatant, nextState, "turn-end-reserve");
  },

  async spendAction(combatant, amount = 1) {
    const state = this.getState(combatant);
    if (!Number.isInteger(amount) || amount <= 0) throw new CombatActionError("invalidAmount", "CMET | Quantidade de ações inválida.");
    if (state.current < amount) throw new CombatActionError("insufficientActions", "CMET | Ações insuficientes.");
    return writeState(combatant, { ...state, current: state.current - amount }, "spend");
  },

  async spendReservedAction(combatant, amount = 1) {
    const state = this.getState(combatant);
    if (!Number.isInteger(amount) || amount <= 0) throw new CombatActionError("invalidAmount", "CMET | Quantidade de ações inválida.");
    if (state.reserved < amount) throw new CombatActionError("insufficientReserved", "CMET | Ações reservadas insuficientes.");
    return writeState(combatant, { ...state, reserved: state.reserved - amount }, "spend-reserved");
  }
});
