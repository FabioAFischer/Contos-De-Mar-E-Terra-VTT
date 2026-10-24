import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const pack = readFileSync(new URL("../packs/habilidades-da.db", import.meta.url), "utf8")
  .trim()
  .split("\n")
  .map((line) => JSON.parse(line));
const items = pack.filter((entry) => entry.type === "habilidadeDa");

test("compêndio DA contém exatamente as seis habilidades de Hrodnar", () => {
  assert.equal(pack.length, 6);
  assert.equal(items.length, 6);
  assert.ok(pack.every((entry) => entry.type === "habilidadeDa"));
  assert.deepEqual(items.map(({ name }) => name), [
    "Empunhadura do Mais Forte",
    "Vitória do Mais Forte",
    "Postura de Jotun",
    "Investida Brutal",
    "Rugido dos Jotun",
    "Queda do Predador"
  ]);
  assert.ok(items.every((item) => item.folder === null));
  assert.ok(items.every((item) => item.flags?.["contos-de-mar-e-terra"]?.packCharacter === "Hrodnar"));
  assert.ok(items.every((item) => item.system.associatedCharacter === "Hrodnar"));
});

test("Postura de Jotun possui custo de ação e cura 2d6 estruturados", () => {
  const item = items.find(({ name }) => name === "Postura de Jotun");
  const [effect] = item.system.effects;
  assert.equal(effect.activationType, "ativa");
  assert.deepEqual(effect.costs.map(({ type, amount, timing }) => ({ type, amount, timing })), [{ type: "actions", amount: 1, timing: "activation" }]);
  assert.equal(effect.operations[0].type, "heal");
  assert.equal(effect.operations[0].formula, "2d6");
  assert.equal(effect.operations[0].resourceId, "vida");
});

test("Vitória do Mais Forte possui Carapaça e aumento de tamanho não cumulativo", () => {
  const item = items.find(({ name }) => name === "Vitória do Mais Forte");
  const [effect] = item.system.effects;
  assert.equal(effect.activationType, "passiva");
  assert.equal(effect.active, undefined);
  assert.deepEqual(effect.operations.map(({ type, amount, conditionKey }) => ({ type, amount, conditionKey })), [
    { type: "armorBonus", amount: 4, conditionKey: "carapaca" },
    { type: "sizeIncrease", amount: 1, conditionKey: "" }
  ]);
  assert.equal(effect.stacking.policy, "preventDuplicate");
});

test("operações não suportadas permanecem explicitamente manuais", () => {
  const item = items.find(({ name }) => name === "Queda do Predador");
  const operations = item.system.effects.flatMap(({ operations, branches }) => [
    ...operations,
    ...branches.flatMap(({ operations: branchOperations }) => branchOperations)
  ]);
  assert.ok(operations.some((operation) => operation.manual === true));
});

test("Rugido dos Jotun possui alvo em raio e operações de condição estruturadas", () => {
  const item = items.find(({ name }) => name === "Rugido dos Jotun");
  const [effect] = item.system.effects;
  assert.deepEqual(effect.targets, { relation: "enemy", count: 0, requiresSelection: true, range: 3, manualConfirmation: false });
  assert.deepEqual(effect.rolls.map(({ type, skillKey }) => ({ type, skillKey })), [
    { type: "skill", skillKey: "intimidar" },
    { type: "resistance", skillKey: "vontade" }
  ]);
  assert.ok(effect.branches.flatMap(({ operations }) => operations).every((operation) => operation.manual === false));
});

test("Empunhadura do Mais Forte possui operação contextual estruturada", () => {
  const item = items.find(({ name }) => name === "Empunhadura do Mais Forte");
  const [effect] = item.system.effects;
  assert.equal(effect.id, "hrodnar-empunhadura-superior");
  assert.equal(effect.activationType, "passiva");
  assert.deepEqual(effect.operations[0].type, "weaponGrip");
  assert.equal(effect.operations[0].manual, false);
  assert.equal(effect.operations[0].amount, -1);
});
