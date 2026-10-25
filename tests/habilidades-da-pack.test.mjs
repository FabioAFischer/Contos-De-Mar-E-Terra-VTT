import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync(new URL("../system.json", import.meta.url), "utf8"));

const pack = readFileSync(new URL("../packs/habilidades-da.db", import.meta.url), "utf8")
  .trim()
  .split("\n")
  .map((line) => JSON.parse(line));
const items = pack.filter((entry) => entry.type === "habilidadeDa");

test("o manifesto aponta para o compêndio LevelDB do Foundry v14", () => {
  assert.equal(manifest.packs.find(({ name }) => name === "habilidades-da")?.path, "packs/habilidades-da");
});

test("compêndio DA contém as seis habilidades de Hrodnar, quatro de Marco e quatro de Draumma", () => {
  assert.equal(pack.length, 20);
  assert.equal(items.length, 20);
  assert.ok(pack.every((entry) => entry.type === "habilidadeDa"));
  assert.deepEqual(items.map(({ name }) => name), [
    "Empunhadura do Mais Forte",
    "Investida Brutal",
    "Postura de Jotun",
    "Queda do Predador",
    "Rugido dos Jotun",
    "Vitória do Mais Forte",
    "Filho de Hel",
    "Manifestação de Hel",
    "Conversão Profana",
    "Última Centelha",
    "Ás na Manga",
    "Redistribuição de Magia",
    "Sifão de Mana",
    "Truque de Mestre",
    "Frenesi do Lutador",
    "Punhos Abrasivos",
    "Chutes em Meia Lua",
    "Plumagem de um Pugilista",
    "Peso Pesado",
    "Armar Guarda"
  ]);
  assert.ok(items.every((item) => item.folder === null));
  const hrodnar = items.filter((item) => item.system.associatedCharacter === "Hrodnar");
  assert.equal(hrodnar.length, 6);
  assert.ok(hrodnar.every((item) => item.flags?.["contos-de-mar-e-terra"]?.packCharacter === "Hrodnar"));
});

test("o compêndio de Draumma possui quatro operações especializadas", () => {
  const draumma = items.filter((item) => item.system.associatedCharacter === "Draumma");
  assert.equal(draumma.length, 4);
  assert.deepEqual(draumma.map((item) => item.system.effects[0].operations[0].type), [
    "draummaAce", "draummaMagicRedistribution", "draummaManaSiphon", "draummaMasterTrick"
  ]);
  assert.ok(draumma.every((item) => item.flags?.["contos-de-mar-e-terra"]?.packCharacter === "Draumma"));
});

test("o compêndio de Marco possui quatro habilidades com metadados e operações específicas", () => {
  const marco = items.filter((item) => item.system.associatedCharacter === "Marco");
  assert.equal(marco.length, 4);
  assert.ok(marco.every((item) => item.flags?.["contos-de-mar-e-terra"]?.packCharacter === "Marco"));
  assert.deepEqual(marco.map((item) => item.system.effects[0].operations[0].type), [
    "marcoChildOfHel", "marcoManifestation", "marcoProfaneConversion", "marcoLastSpark"
  ]);
});

test("Manifestação de Hel declara raio, duração, recuperação e modificadores sem persistir perícias", () => {
  const item = items.find(({ name }) => name === "Manifestação de Hel");
  const effect = item.system.effects[0];
  assert.equal(effect.duration.amount, 3);
  assert.equal(effect.operations[0].type, "marcoManifestation");
  assert.match(effect.functioning ?? item.system.functioning, /Raio 4/);
  assert.match(item.system.functioning, /3 PV/);
});

test("Última Centelha usa Evocação, ação, alcance 5 e não possui custo de Mana", () => {
  const item = items.find(({ name }) => name === "Última Centelha");
  const effect = item.system.effects[0];
  assert.deepEqual(effect.costs.map(({ type, amount }) => ({ type, amount })), [{ type: "actions", amount: 1 }]);
  assert.deepEqual(effect.rolls.map(({ skillKey }) => skillKey), ["evocacao"]);
  assert.equal(effect.targets.range, 5);
  assert.equal(effect.operations[0].formula, "1d6");
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
