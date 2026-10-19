import test from "node:test";
import assert from "node:assert/strict";

import {
  calculateDamageTotals,
  resolveDamageGroup,
  resolveDamageGroups
} from "../module/services/damage-reduction-service.mjs";


const source = (key, channel, target, amount) => ({
  sourceItemId: key,
  sourceItemName: key,
  key,
  label: key,
  channel,
  target,
  amount
});

test("acumula redução de tipo e natureza no mesmo grupo", () => {
  const result = resolveDamageGroup(
    { nature: "magical", type: "fogo", rawDamage: 12 },
    [
      source("selo-a", "nature", "magical", 2),
      source("selo-b", "nature", "magical", 3),
      source("revestimento", "type", "fogo", 2),
      source("encouracado", "type", "cortante", 99)
    ]
  );

  assert.equal(result.availableReduction, 7);
  assert.equal(result.appliedReduction, 7);
  assert.equal(result.finalDamage, 5);
  assert.equal(result.reductions.length, 3);
});

test("redução excedente não transborda entre grupos", () => {
  const groups = resolveDamageGroups(
    [
      { nature: "magical", type: "fogo", rawDamage: 3 },
      { nature: "physical", type: "cortante", rawDamage: 10 }
    ],
    [
      source("selo", "nature", "magical", 3),
      source("revestimento", "type", "fogo", 4)
    ]
  );

  assert.deepEqual(groups.map(({ finalDamage, appliedReduction }) => ({ finalDamage, appliedReduction })), [
    { finalDamage: 0, appliedReduction: 3 },
    { finalDamage: 10, appliedReduction: 0 }
  ]);
});

test("totais usam redução aplicada por grupo", () => {
  const totals = calculateDamageTotals([
    { rawDamage: 15, availableReduction: 5, appliedReduction: 5, finalDamage: 10 },
    { rawDamage: 6, availableReduction: 7, appliedReduction: 6, finalDamage: 0 }
  ]);

  assert.deepEqual(totals, {
    totalRawDamage: 21,
    totalAvailableReduction: 12,
    totalAppliedReduction: 11,
    totalFinalDamage: 10
  });
});
