import test from "node:test";
import assert from "node:assert/strict";
import { addNorisFrenzy, getNorisFrenzy, recordNorisFrenzyHit, activateNorisAbility, isNorisHeavyWeightActive } from "../module/services/ability-da-noris-service.mjs";
import { collectReductionSources } from "../module/services/damage-reduction-service.mjs";

function actor() {
  const data = { id: "noris", system: { resources: { custom: [] } }, items: { contents: [{ type: "habilidadeDa", name: "Frenesi do Lutador", system: { associatedCharacter: "Noris" } }] } };
  const result = { ...data, flags: {}, async update(update) { data.system.resources.custom = update["system.resources.custom"]; result.system = data.system; }, getFlag: (_scope, key) => result.flags[key], async setFlag(_scope, key, value) { result.flags[key] = structuredClone(value); } };
  return result;
}

test("Frenesi concede uma vez por ataque, limita em 50 e não multiplica por alvo", async () => {
  globalThis.game = { system: { id: "contos-de-mar-e-terra" } };
  const noris = actor();
  const combat = { id: "combat-noris", started: true, round: 1, turn: 0 };
  assert.equal((await recordNorisFrenzyHit(combat, noris, { attackId: "attack-1" })).current, 5);
  assert.equal((await recordNorisFrenzyHit(combat, noris, { attackId: "attack-1" })).awarded, false);
  await Promise.all(Array.from({ length: 12 }, (_, index) => recordNorisFrenzyHit(combat, noris, { attackId: `attack-${index + 2}` })));
  assert.equal(getNorisFrenzy(noris), 50);
});

test("Plumagem fornece Absorção natural e Peso Pesado expira após o próximo turno", async () => {
  globalThis.game = { system: { id: "contos-de-mar-e-terra" }, combat: { id: "combat-noris", started: true, round: 3, turn: 0 } };
  const noris = actor();
  const sources = collectReductionSources(noris);
  assert.equal(sources.find((source) => source.key === "absorcao")?.amount, 3);
  noris.system.resources.custom = [{ id: "noris-frenesi", name: "Frenesi", current: 30, initial: 0, max: 50, resetRule: "combatEnd" }];
  const result = await activateNorisAbility({ actor: noris, item: { name: "Peso Pesado" }, effect: { costs: [], }, operation: { type: "norisHeavyWeight" }, context: { combat: game.combat } });
  assert.equal(result.valid, true);
  game.combat.turn = 1;
  assert.equal(isNorisHeavyWeightActive(noris), true);
  game.combat.round = 4;
  game.combat.turn = 0;
  assert.equal(isNorisHeavyWeightActive(noris), true);
  game.combat.turn = 1;
  assert.equal(isNorisHeavyWeightActive(noris), false);
});
