import test from "node:test";
import assert from "node:assert/strict";

import { arePotentialAdversaries, didCrossWeaponReach, getLateralEnemies, getTokenSide, isLaterallyAdjacent, measureTokenDistanceAtPosition } from "../module/services/weapon-combat-state-service.mjs";

globalThis.canvas = { grid: { size: 100, measurePath: ([origin, target]) => ({ spaces: Math.max(Math.abs(origin.x - target.x), Math.abs(origin.y - target.y)) / 100, distance: Math.max(Math.abs(origin.x - target.x), Math.abs(origin.y - target.y)) }) } };

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
