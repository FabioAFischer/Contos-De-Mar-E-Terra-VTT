import test from "node:test";
import assert from "node:assert/strict";

import { arePotentialAdversaries, clearWeaponCombatState, didCrossWeaponReach, getLateralEnemies, getSequentialBonusCount, getSequentialBonusState, getTokenSide, isLaterallyAdjacent, measureTokenDistanceAtPosition, recordSequentialOutcome } from "../module/services/weapon-combat-state-service.mjs";

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

test("Sequencial acumula acertos com a mesma arma e persiste entre turnos", async () => {
  const combat = combatWithState();
  const actor = { id: "actor-1" };
  const weaponA = { id: "weapon-a" };
  const weaponB = { id: "weapon-b" };
  assert.equal(getSequentialBonusCount(combat, actor, weaponA), 0);
  assert.equal(getSequentialBonusState(combat, actor, weaponA), false);
  await recordSequentialOutcome(combat, actor, weaponA, { effectiveHit: true });
  assert.equal(getSequentialBonusCount(combat, actor, weaponA), 1);
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
