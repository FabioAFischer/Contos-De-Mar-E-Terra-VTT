import test from "node:test";
import assert from "node:assert/strict";

import { calculateDamageApplication } from "../module/services/damage-application-service.mjs";

test("aplica dano normal sem alterar a fórmula produzida", () => {
  assert.deepEqual(calculateDamageApplication({ hpBefore: 10, amount: 5 }), {
    amount: 5,
    hpBefore: 10,
    hpAfter: 5,
    appliedDamage: 5,
    reachedZero: false
  });
});

test("dano zero preserva a Vida", () => {
  assert.deepEqual(calculateDamageApplication({ hpBefore: 10, amount: 0 }), {
    amount: 0,
    hpBefore: 10,
    hpAfter: 10,
    appliedDamage: 0,
    reachedZero: false
  });
});

test("overkill limita a Vida em zero e distingue dano produzido de dano aplicado", () => {
  assert.deepEqual(calculateDamageApplication({ hpBefore: 3, amount: 8 }), {
    amount: 8,
    hpBefore: 3,
    hpAfter: 0,
    appliedDamage: 3,
    reachedZero: true
  });
});

test("não permite dano inválido", () => {
  assert.throws(() => calculateDamageApplication({ hpBefore: 10, amount: Number.NaN }), /finito/);
  assert.throws(() => calculateDamageApplication({ hpBefore: 10, amount: -1 }), /não negativo/);
});
