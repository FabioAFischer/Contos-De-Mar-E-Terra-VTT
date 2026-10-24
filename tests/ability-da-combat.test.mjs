import test from "node:test";
import assert from "node:assert/strict";
import { calculateInvestidaBrutalDistance, getHrodnarBranch } from "../module/services/ability-da-combat-service.mjs";

globalThis.foundry = { utils: { deepClone: (value) => structuredClone(value) } };

const actor = (fisico, combate, size = "medio") => ({ system: { size, attributes: { fisico: { value: fisico }, combate: { value: combate } } } });

test("Investida Brutal usa metade inteira para baixo do deslocamento efetivo", () => {
  assert.equal(calculateInvestidaBrutalDistance(actor(5, 20)), 2);
  assert.equal(calculateInvestidaBrutalDistance(actor(5, 30)), 3);
  assert.equal(calculateInvestidaBrutalDistance(actor(5, 35)), 4);
});

test("ramificação de Queda trata alvo igual como menor ou igual", () => {
  const source = actor(0, 0, "medio");
  assert.equal(getHrodnarBranch(source, actor(0, 0, "medio"), { equalUsesSmaller: true }), "menorOuIgual");
  assert.equal(getHrodnarBranch(source, actor(0, 0, "grande"), { equalUsesSmaller: true }), "maior");
});
