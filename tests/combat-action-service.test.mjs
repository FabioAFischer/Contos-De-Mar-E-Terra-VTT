import test from "node:test";
import assert from "node:assert/strict";

import { CombatActionService } from "../module/services/combat-action-service.mjs";
import { isForwardTurnProgression } from "../module/cmet-combat-tracker.mjs";

globalThis.game = {
  system: { id: "contos-de-mar-e-terra" }
};

function createCombatant({ id, max = 3, current = max, reserved = 0, combat = null } = {}) {
  let actions = { current, reserved, turnKey: null };
  let writeCount = 0;
  return {
    id,
    name: id,
    actor: { system: { actions: { max } } },
    combat,
    getFlag(_namespace, key) {
      return key === "actions" ? actions : undefined;
    },
    async setFlag(_namespace, key, value) {
      if (key === "actions") {
        actions = { ...value };
        writeCount += 1;
      }
      return value;
    },
    get writeCount() {
      return writeCount;
    }
  };
}

function state(combatant) {
  return CombatActionService.getState(combatant);
}

test("3/0 no fim do turno vira 0/3", async () => {
  const combatant = createCombatant({ id: "A", current: 3, reserved: 0 });
  await CombatActionService.reserveRemainingActions(combatant);
  assert.deepEqual(state(combatant), { current: 0, reserved: 3, turnKey: null });
});

test("2/0 no fim do turno vira 0/2", async () => {
  const combatant = createCombatant({ id: "A", current: 2, reserved: 0 });
  await CombatActionService.reserveRemainingActions(combatant);
  assert.deepEqual(state(combatant), { current: 0, reserved: 2, turnKey: null });
});

test("0/0 no fim do turno permanece 0/0 sem escrita", async () => {
  const combatant = createCombatant({ id: "A", current: 0, reserved: 0 });
  await CombatActionService.reserveRemainingActions(combatant);
  assert.deepEqual(state(combatant), { current: 0, reserved: 0, turnKey: null });
  assert.equal(combatant.writeCount, 0);
});

test("reserva existente recebe também as ações restantes", async () => {
  const combatant = createCombatant({ id: "A", current: 2, reserved: 1 });
  await CombatActionService.reserveRemainingActions(combatant);
  assert.deepEqual(state(combatant), { current: 0, reserved: 3, turnKey: null });
});

test("A sai e B entra: A reserva sobras e B recebe max/0", async () => {
  const combat = { id: "combat-1" };
  const a = createCombatant({ id: "A", current: 2, reserved: 0, combat });
  const b = createCombatant({ id: "B", current: 0, reserved: 0, combat });

  await CombatActionService.reserveRemainingActions(a);
  await CombatActionService.resetTurn(b, { combat, round: 1, turn: 1 });

  assert.equal(state(a).current, 0);
  assert.equal(state(a).reserved, 2);
  assert.equal(state(b).current, 3);
  assert.equal(state(b).reserved, 0);
});

test("reserva permanece enquanto outros Combatants jogam", async () => {
  const a = createCombatant({ id: "A", current: 0, reserved: 2 });
  const b = createCombatant({ id: "B", current: 3, reserved: 0 });
  const c = createCombatant({ id: "C", current: 3, reserved: 0 });

  assert.deepEqual(state(a), { current: 0, reserved: 2, turnKey: null });
  assert.deepEqual(state(b), { current: 3, reserved: 0, turnKey: null });
  assert.deepEqual(state(c), { current: 3, reserved: 0, turnKey: null });
});

test("ao voltar ao turno próprio, resetTurn faz max/0", async () => {
  const combat = { id: "combat-2" };
  const a = createCombatant({ id: "A", current: 0, reserved: 1, combat });
  await CombatActionService.resetTurn(a, { combat, round: 2, turn: 0 });
  assert.equal(state(a).current, 3);
  assert.equal(state(a).reserved, 0);
});

test("virada de rodada reserva o Combatant que saiu", async () => {
  const combat = { id: "combat-3" };
  const b = createCombatant({ id: "B", current: 2, reserved: 0, combat });
  const a = createCombatant({ id: "A", current: 0, reserved: 0, combat });

  await CombatActionService.reserveRemainingActions(b);
  await CombatActionService.resetTurn(a, { combat, round: 2, turn: 0 });

  assert.equal(state(b).current, 0);
  assert.equal(state(b).reserved, 2);
  assert.equal(state(a).current, 3);
  assert.equal(state(a).reserved, 0);
});

test("spendAction altera somente current", async () => {
  const combatant = createCombatant({ id: "A", current: 2, reserved: 1 });
  await CombatActionService.spendAction(combatant);
  assert.deepEqual(state(combatant), { current: 1, reserved: 1, turnKey: null });
});

test("spendReservedAction altera somente reserved", async () => {
  const combatant = createCombatant({ id: "A", current: 0, reserved: 2 });
  await CombatActionService.spendReservedAction(combatant);
  assert.deepEqual(state(combatant), { current: 0, reserved: 1, turnKey: null });
});

test("navegação para trás não é progressão para frente", () => {
  assert.equal(isForwardTurnProgression(
    { combatantId: "B", round: 2, turn: 0 },
    { combatantId: "A", round: 1, turn: 1 }
  ), false);
  assert.equal(isForwardTurnProgression(
    { combatantId: "A", round: 1, turn: 0 },
    { combatantId: "B", round: 1, turn: 1 }
  ), true);
  assert.equal(isForwardTurnProgression(
    { combatantId: "B", round: 1, turn: 1 },
    { combatantId: "A", round: 2, turn: 0 }
  ), true);
});
