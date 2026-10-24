import test from "node:test";
import assert from "node:assert/strict";
import { canPayAbilityDaCost } from "../module/services/ability-da-resource-service.mjs";

globalThis.foundry = { utils: { deepClone: (value) => structuredClone(value) } };

function setupCombat({ current = 1, active = true, synthetic = true } = {}) {
  const actor = {
    id: "actor-1",
    uuid: synthetic ? undefined : "Actor.actor-1",
    system: { actions: { max: 1 }, resources: { mana: { value: 2 } } }
  };
  const combatant = {
    id: "combatant-1",
    actor: synthetic ? { id: actor.id } : actor,
    getFlag: (_scope, key) => key === "actions" ? { current, reserved: 0, turnKey: null } : undefined
  };
  globalThis.game = { combat: { started: true, combatant: active ? combatant : { id: "other" }, combatants: [combatant] }, system: { id: "contos-de-mar-e-terra" } };
  return { actor, combatant };
}

test("custos de ações fora de combate são ignorados sem exigir combatente", () => {
  globalThis.game = { combat: null };
  const actor = { system: { resources: {} } };
  assert.deepEqual(canPayAbilityDaCost(actor, { type: "actions", amount: 1 }), { valid: true, skipped: true, amount: 1 });
});

test("atores sintéticos são associados ao combatente pelo ID", () => {
  const { actor } = setupCombat({ synthetic: true });
  const result = canPayAbilityDaCost(actor, { type: "actions", amount: 1 });
  assert.equal(result.valid, true);
});

test("custos distinguem turno inválido de ações insuficientes", () => {
  const { actor } = setupCombat({ active: false });
  assert.equal(canPayAbilityDaCost(actor, { type: "actions", amount: 1 }).reason, "notActiveTurn");
  setupCombat({ current: 0 });
  assert.equal(canPayAbilityDaCost(actor, { type: "actions", amount: 1 }).reason, "insufficientActions");
});

test("recursos comuns, ausentes e custos inválidos possuem diagnóstico próprio", () => {
  const { actor } = setupCombat();
  assert.equal(canPayAbilityDaCost(actor, { type: "mana", amount: 3 }).reason, "insufficientResource");
  assert.equal(canPayAbilityDaCost(actor, { type: "vida", amount: 1 }).reason, "missingResource");
  assert.equal(canPayAbilityDaCost(actor, { type: "actions", amount: -1 }).reason, "invalidAmount");
});
