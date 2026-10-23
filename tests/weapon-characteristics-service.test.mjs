import test from "node:test";
import assert from "node:assert/strict";

import {
  applyRetaliar,
  additionalDamageFormulas,
  canFire,
  characteristicEnabled,
  getVersatileDamageParts,
  multiplyDamageFormula
} from "../module/services/weapon-characteristics-service.mjs";
import { SKILL_ROLL_DEGREES } from "../module/services/skill-roll-service.mjs";

const weapon = (characteristics = {}, extra = {}) => ({
  system: {
    characteristics,
    loaded: true,
    thrown: false,
    damage: [
      { formula: "2d8", nature: "physical", type: "cortante", availableTypes: ["cortante", "perfurante"] },
      { formula: "1d6", nature: "magical", type: "fogo", availableTypes: [] }
    ],
    ...extra
  }
});

test("Retaliar transforma natural de 10 em crítico, mesmo fora da perícia", () => {
  const result = applyRetaliar({ selectedRoll: 10, success: false, degree: SKILL_ROLL_DEGREES.NORMAL_FAILURE }, weapon({ retaliar: { enabled: true } }));
  assert.equal(result.success, true);
  assert.equal(result.degree, SKILL_ROLL_DEGREES.CRITICAL_SUCCESS);
});

test("Retaliar não altera resultado acima de 10 ou arma sem a característica", () => {
  const result = { selectedRoll: 11, success: false, degree: SKILL_ROLL_DEGREES.NORMAL_FAILURE };
  assert.deepEqual(applyRetaliar(result, weapon({ retaliar: { enabled: true } })), result);
  assert.deepEqual(applyRetaliar({ ...result, selectedRoll: 10 }, weapon()), { ...result, selectedRoll: 10 });
});

test("Versátil altera somente o componente selecionado", () => {
  const parts = getVersatileDamageParts(weapon(), { 0: "perfurante", 1: "raio" });
  assert.equal(parts[0].type, "perfurante");
  assert.equal(parts[1].type, "fogo");
});

test("Recarregar bloqueia apenas arma explicitamente descarregada", () => {
  const reloadable = weapon({ recarregar: { enabled: true } }, { loaded: false });
  assert.equal(canFire(reloadable), false);
  assert.equal(canFire(weapon({ recarregar: { enabled: true } })), true);
  assert.equal(characteristicEnabled(reloadable, "recarregar"), true);
});

test("Arma de Haste adiciona dano somente quando o ataque está no alcance máximo", () => {
  const item = weapon({ armaDeHaste: { enabled: true, spaces: 3, damageFormula: "1d8" } });
  assert.deepEqual(additionalDamageFormulas(item, { polearm: false }), []);
  assert.deepEqual(additionalDamageFormulas(item, { polearm: true }), [
    { formula: "1d8", nature: "physical", type: "impacto", criticalMax: true, source: "armaDeHaste" }
  ]);
});

test("Alcance multiplica a fórmula pelo número de espaços", () => {
  const item = weapon({ alcance: { enabled: true, spaces: 5, damageFormula: "1d6", damagePartIndex: 0 } });
  for (let distance = 1; distance <= 5; distance += 1) {
    assert.deepEqual(additionalDamageFormulas(item, { reachDistance: distance }), [{
      formula: `${distance}d6`,
      nature: "physical",
      type: "cortante",
      criticalMax: true,
      source: "alcance",
      sourcePartIndex: 0
    }]);
  }
  assert.deepEqual(additionalDamageFormulas(item, { reachDistance: 6 }), []);
});

test("Alcance multiplica dados e modificadores fixos", () => {
  assert.equal(multiplyDamageFormula("1d6+2", 4), "4d6+8");
  assert.equal(multiplyDamageFormula("2d4", 3), "6d4");
});

test("Alcance herda natureza e tipo da parcela vinculada, incluindo Versátil", () => {
  const item = weapon({ alcance: { enabled: true, spaces: 5, damageFormula: "1d8", damagePartIndex: 1 } });
  item.system.damage[1].availableTypes = ["fogo", "raio"];
  assert.deepEqual(additionalDamageFormulas(item, { reachDistance: 3, versatileSelections: { 1: "raio" } }), [{
    formula: "3d8",
    nature: "magical",
    type: "raio",
    criticalMax: true,
    source: "alcance",
    sourcePartIndex: 1
  }]);
});

test("Alcance ignora vínculo inválido sem inventar natureza ou tipo", () => {
  const item = weapon({ alcance: { enabled: true, spaces: 5, damageFormula: "1d8", damagePartIndex: 9 } });
  assert.deepEqual(additionalDamageFormulas(item, { reachDistance: 3 }), []);
});

test("Sequencial só aplica o bônus após acerto anterior e herda a parcela vinculada", () => {
  const item = weapon({ sequencial: { enabled: true, damageFormula: "+1", damagePartIndex: 0 } });
  assert.deepEqual(additionalDamageFormulas(item, { sequential: false }), []);
  assert.deepEqual(additionalDamageFormulas(item, { sequential: true }), [{
    formula: "+1",
    nature: "physical",
    type: "cortante",
    criticalMax: true,
    source: "sequencial",
    sourcePartIndex: 0
  }]);
});

test("Sequencial desabilitado nunca concede bônus mesmo com histórico", () => {
  const item = weapon({ sequencial: { enabled: false, damageFormula: "+1", damagePartIndex: 0 } });
  assert.deepEqual(additionalDamageFormulas(item, { sequential: true }), []);
});
