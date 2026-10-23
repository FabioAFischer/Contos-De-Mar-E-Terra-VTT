import test from "node:test";
import assert from "node:assert/strict";

import { arePotentialAdversaries, clearWeaponCombatState, didCrossWeaponReach, getLateralEnemies, getSequentialBonusCount, getSequentialBonusState, getTokenSide, isLaterallyAdjacent, measureTokenDistanceAtPosition, recordImpactOutcome, recordSequentialOutcome } from "../module/services/weapon-combat-state-service.mjs";
import { compareAttackAndDefense } from "../module/services/combat-attack-service.mjs";

globalThis.canvas = { grid: { size: 100, measurePath: ([origin, target]) => ({ spaces: Math.max(Math.abs(origin.x - target.x), Math.abs(origin.y - target.y)) / 100, distance: Math.max(Math.abs(origin.x - target.x), Math.abs(origin.y - target.y)) }) } };
globalThis.game = { system: { id: "contos-de-mar-e-terra" } };
globalThis.foundry = { utils: { deepClone: (value) => structuredClone(value) } };

const token = (x, y, width = 1, height = 1, rotation = 0) => ({ document: { id: `${x}:${y}`, x, y, width, height, rotation } });

test("Duas mãos considera apenas adjacência lateral", () => {
  const origin = token(0, 0);
  assert.equal(isLaterallyAdjacent(origin, token(1, 0)), true);
  assert.equal(isLaterallyAdjacent(origin, token(0, 1)), true);
  assert.equal(isLaterallyAdjacent(origin, token(1, 1)), false);
});

test("disposição igual não impede identificar um adversário lateral potencial", () => {
  const origin = { document: { id: "origin", x: 0, y: 0, width: 1, height: 1, disposition: -1 } };
  const candidate = { document: { id: "candidate", x: 100, y: 0, width: 1, height: 1, disposition: -1 } };
  assert.equal(arePotentialAdversaries(origin, candidate), true);
  assert.deepEqual(getLateralEnemies(origin, { tokens: [origin, candidate] }), [candidate]);
});

test("Ponto fraco calcula os lados pela orientação do defensor", () => {
  const defender = token(0, 0, 1, 1, 0);
  assert.equal(getTokenSide(defender, token(1, 0)), "frente");
  assert.equal(getTokenSide(defender, token(-1, 0)), "costas");
  assert.equal(getTokenSide(defender, token(0, -1)), "esquerda");
});

test("detecta saída e entrada do alcance, mas não movimento interno", () => {
  assert.equal(didCrossWeaponReach(2, 4, 3), true);
  assert.equal(didCrossWeaponReach(4, 2, 3), true);
  assert.equal(didCrossWeaponReach(2, 3, 3), false);
  assert.equal(didCrossWeaponReach(3, 2, 3), true);
  assert.equal(didCrossWeaponReach(2, 2.5, 3), false);
});

test("mede distância pela borda dos tokens, respeitando token grande", () => {
  const attacker = token(0, 0, 1, 1);
  const largeTarget = token(300, 0, 2, 2);
  assert.equal(measureTokenDistanceAtPosition(attacker, largeTarget), 2);
  assert.equal(measureTokenDistanceAtPosition(attacker, largeTarget, { x: 100, y: 0 }), 0);
});

function combatWithState(initial = {}) {
  let state = structuredClone(initial);
  return {
    getFlag() { return state; },
    async setFlag(_scope, _key, value) { state = structuredClone(value); return state; }
  };
}

function delayedCombatWithState(initial = {}, delay = 5) {
  let state = structuredClone(initial);
  return {
    getFlag() { return state; },
    setFlag(_scope, _key, value) {
      return new Promise((resolve) => setTimeout(() => {
        state = structuredClone(value);
        resolve(state);
      }, delay));
    }
  };
}

function mergePartial(target, patch) {
  for (const [key, value] of Object.entries(patch)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      target[key] = mergePartial(
        target[key] && typeof target[key] === "object" ? target[key] : {},
        value
      );
    } else {
      target[key] = structuredClone(value);
    }
  }
  return target;
}

function partiallyMergedCombatWithState(initial = {}) {
  let state = structuredClone(initial);
  return {
    getFlag() { return state; },
    async setFlag(_scope, _key, value) {
      state = mergePartial(state, value);
      return state;
    }
  };
}

function combatWithUnsetFlag(initial = {}) {
  let state = structuredClone(initial);
  return {
    getFlag() { return state; },
    async setFlag(_scope, _key, value) {
      state = structuredClone(value);
      return state;
    },
    async unsetFlag() {
      state = undefined;
    }
  };
}

test("Sequencial acumula acertos com a mesma arma e persiste entre turnos", async () => {
  const combat = combatWithState();
  const actor = { id: "actor-1" };
  const weaponA = { id: "weapon-a" };
  const weaponB = { id: "weapon-b" };
  assert.equal(getSequentialBonusCount(combat, actor, weaponA), 0);
  assert.equal(getSequentialBonusState(combat, actor, weaponA), false);
  await recordSequentialOutcome(combat, actor, weaponA, { effectiveHit: true });
  assert.equal(getSequentialBonusCount(combat, actor, weaponA), 1);
  assert.deepEqual(combat.getFlag("contos-de-mar-e-terra", "weaponCombat").sequences[actor.id], { weaponId: weaponA.id, streak: 1 });
  assert.equal(getSequentialBonusState(combat, actor, weaponA), true);
  await recordSequentialOutcome(combat, actor, weaponA, { effectiveHit: true });
  assert.equal(getSequentialBonusCount(combat, actor, weaponA), 2);
  assert.equal(getSequentialBonusState(combat, actor, weaponA), true);
  await recordSequentialOutcome(combat, actor, weaponA, { effectiveHit: true });
  assert.equal(getSequentialBonusCount(combat, actor, weaponA), 3);
  assert.equal(getSequentialBonusState(combat, actor, weaponB), false);
  assert.equal(getSequentialBonusCount(combat, actor, weaponB), 0);
});

test("Erro ou defesa efetiva interrompe Sequencial; mudança de arma também", async () => {
  const combat = combatWithState();
  const actor = { id: "actor-1" };
  const weaponA = { id: "weapon-a" };
  const weaponB = { id: "weapon-b" };
  await recordSequentialOutcome(combat, actor, weaponA, { effectiveHit: true });
  await recordSequentialOutcome(combat, actor, weaponA, { effectiveHit: false });
  assert.equal(getSequentialBonusCount(combat, actor, weaponA), 0);
  assert.deepEqual(combat.getFlag("contos-de-mar-e-terra", "weaponCombat").sequences[actor.id], { weaponId: null, streak: 0 });
  assert.equal(getSequentialBonusState(combat, actor, weaponA), false);
  await recordSequentialOutcome(combat, actor, weaponA, { effectiveHit: true });
  await recordSequentialOutcome(combat, actor, weaponB, { effectiveHit: false });
  assert.equal(getSequentialBonusCount(combat, actor, weaponA), 0);
  assert.equal(getSequentialBonusState(combat, actor, weaponA), false);
  assert.equal(getSequentialBonusState(combat, actor, weaponB), false);
});

test("Sequencial não depende do alvo e é apagado ao terminar o combate", async () => {
  const combat = combatWithState();
  const actor = { id: "actor-1" };
  const weapon = { id: "weapon-a" };
  await recordSequentialOutcome(combat, actor, weapon, { effectiveHit: true });
  assert.equal(getSequentialBonusCount(combat, actor, weapon), 1);
  assert.equal(getSequentialBonusState(combat, actor, weapon), true);
  await clearWeaponCombatState(combat);
  assert.equal(getSequentialBonusCount(combat, actor, weapon), 0);
  assert.equal(getSequentialBonusState(combat, actor, weapon), false);
});

test("falha da perícia e defesa bem-sucedida zeram Sequencial antes do próximo acerto", async () => {
  const combat = combatWithState();
  const actor = { id: "actor-1" };
  const weapon = { id: "weapon-a" };
  await recordSequentialOutcome(combat, actor, weapon, { effectiveHit: true });
  await recordSequentialOutcome(combat, actor, weapon, { effectiveHit: true });
  await recordSequentialOutcome(combat, actor, weapon, { effectiveHit: true });
  assert.equal(getSequentialBonusCount(combat, actor, weapon), 3);

  const attackFailure = compareAttackAndDefense({ success: false, degree: "normalFailure", selectedRoll: 80 }, null);
  assert.equal(attackFailure.reason, "attackFailure");
  await recordSequentialOutcome(combat, actor, weapon, { effectiveHit: attackFailure.winner === "attack" });
  assert.deepEqual(combat.getFlag("contos-de-mar-e-terra", "weaponCombat").sequences[actor.id], { weaponId: null, streak: 0 });
  assert.equal(getSequentialBonusCount(combat, actor, weapon), 0);

  await recordSequentialOutcome(combat, actor, weapon, { effectiveHit: true });
  assert.equal(getSequentialBonusCount(combat, actor, weapon), 1);
  const defended = compareAttackAndDefense(
    { success: true, degree: "normalSuccess", selectedRoll: 50 },
    { success: true, degree: "goodSuccess", selectedRoll: 40 }
  );
  assert.equal(defended.winner, "defense");
  await recordSequentialOutcome(combat, actor, weapon, { effectiveHit: defended.winner === "attack" });
  assert.deepEqual(combat.getFlag("contos-de-mar-e-terra", "weaponCombat").sequences[actor.id], { weaponId: null, streak: 0 });
  assert.equal(getSequentialBonusCount(combat, actor, weapon), 0);

  await recordSequentialOutcome(combat, actor, weapon, { effectiveHit: true });
  assert.equal(getSequentialBonusCount(combat, actor, weapon), 1);
  await recordSequentialOutcome(combat, actor, weapon, { effectiveHit: true });
  assert.equal(getSequentialBonusCount(combat, actor, weapon), 2);
});

test("reset de Sequencial não é sobrescrito por uma atualização assíncrona antiga", async () => {
  const combat = delayedCombatWithState({
    sequences: { "actor-1": { weaponId: "weapon-a", streak: 3 } }
  });
  const actor = { id: "actor-1" };
  const weapon = { id: "weapon-a" };
  const defender = { document: { id: "target-1", x: 100, y: 0, rotation: 0 } };

  await Promise.all([
    recordSequentialOutcome(combat, actor, weapon, { effectiveHit: false }),
    recordImpactOutcome(combat, actor, weapon, defender, { effectiveHit: true })
  ]);

  assert.deepEqual(combat.getFlag("contos-de-mar-e-terra", "weaponCombat").sequences[actor.id], { weaponId: null, streak: 0 });
  assert.equal(getSequentialBonusCount(combat, actor, weapon), 0);
  await recordSequentialOutcome(combat, actor, weapon, { effectiveHit: true });
  assert.equal(getSequentialBonusCount(combat, actor, weapon), 1);
});

test("reset explícito sobrevive ao merge parcial e preserva outro personagem", async () => {
  const combat = partiallyMergedCombatWithState({
    sequences: {
      actor1: { weaponId: "arma1", streak: 0 },
      actor2: { weaponId: "arma2", streak: 4 }
    }
  });
  const actor = { id: "actor1" };
  const weapon = { id: "arma1" };

  for (let attack = 0; attack < 8; attack += 1) {
    await recordSequentialOutcome(combat, actor, weapon, { effectiveHit: true });
  }
  assert.equal(combat.getFlag("contos-de-mar-e-terra", "weaponCombat").sequences.actor1.streak, 8);

  await recordSequentialOutcome(combat, actor, weapon, { effectiveHit: false });
  assert.deepEqual(combat.getFlag("contos-de-mar-e-terra", "weaponCombat").sequences.actor1, { weaponId: null, streak: 0 });
  assert.deepEqual(combat.getFlag("contos-de-mar-e-terra", "weaponCombat").sequences.actor2, { weaponId: "arma2", streak: 4 });
  assert.equal(getSequentialBonusCount(combat, actor, weapon), 0);

  await recordSequentialOutcome(combat, actor, weapon, { effectiveHit: false });
  assert.deepEqual(combat.getFlag("contos-de-mar-e-terra", "weaponCombat").sequences.actor1, { weaponId: null, streak: 0 });

  await recordSequentialOutcome(combat, actor, weapon, { effectiveHit: true });
  assert.equal(getSequentialBonusCount(combat, actor, weapon), 1);
  await recordSequentialOutcome(combat, actor, weapon, { effectiveHit: true });
  assert.equal(getSequentialBonusCount(combat, actor, weapon), 2);
});

test("encerrar o combate remove o flag temporário inteiro", async () => {
  const combat = combatWithUnsetFlag({
    sequences: { actor1: { weaponId: "arma1", streak: 8 } },
    impact: { actor1: { streak: 1 } },
    conditions: { actor1: { dazed: true } }
  });
  await clearWeaponCombatState(combat);
  assert.equal(combat.getFlag("contos-de-mar-e-terra", "weaponCombat"), undefined);
});
