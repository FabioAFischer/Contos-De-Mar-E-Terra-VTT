import test from "node:test";
import assert from "node:assert/strict";

import { rollWeaponBaseDamage, rollWeaponDamage } from "../module/services/damage-roll-service.mjs";
import { measureTokenReachDistanceAtPosition } from "../module/services/weapon-combat-state-service.mjs";

globalThis.canvas = {
  grid: {
    size: 100,
    measurePath: ([origin, target]) => ({
      spaces: Math.max(Math.abs(origin.x - target.x), Math.abs(origin.y - target.y)) / 100,
      distance: Math.max(Math.abs(origin.x - target.x), Math.abs(origin.y - target.y)) / 100
    })
  }
};

const token = (x, y, width = 1, height = 1) => ({ document: { x, y, width, height } });

test("Alcance conta espaços adjacentes, separados e tokens grandes", () => {
  const attacker = token(0, 0);
  assert.equal(measureTokenReachDistanceAtPosition(attacker, token(100, 0)), 1);
  assert.equal(measureTokenReachDistanceAtPosition(attacker, token(200, 0)), 2);
  assert.equal(measureTokenReachDistanceAtPosition(attacker, token(400, 0)), 4);
  assert.equal(measureTokenReachDistanceAtPosition(attacker, token(100, 0, 2, 2)), 1);
  assert.equal(measureTokenReachDistanceAtPosition(token(0, 0, 2, 2), token(300, 0)), 2);
});

test("Alcance participa do crítico com máximo e rolagem normal", async () => {
  globalThis.Roll = class MockRoll {
    constructor(formula) {
      this.formula = formula;
      this.total = this.#value(false);
    }

    #value(maximize) {
      return this.formula.replace(/(\d*)d(\d+)/gi, (_match, count, faces) => maximize ? Number(count || 1) * Number(faces) : Number(count || 1)).replace(/[^0-9+\-*/().]/g, "")
        ? Function(`return ${this.formula.replace(/(\d*)d(\d+)/gi, (_match, count, faces) => maximize ? Number(count || 1) * Number(faces) : Number(count || 1))}`)()
        : 0;
    }

    async evaluate() {
      this.total = this.#value(false);
      return this;
    }

    clone() {
      return new MockRoll(this.formula);
    }

    evaluateSync({ maximize }) {
      this.total = this.#value(maximize);
      return this;
    }
  };

  const item = {
    name: "Lança longa",
    system: {
      damage: [{ formula: "1d10", nature: "physical", type: "perfurante" }],
      characteristics: { alcance: { enabled: true, spaces: 5, damageFormula: "1d6+2", damagePartIndex: 0 } }
    }
  };
  const result = await rollWeaponDamage(item, { critical: true, reachDistance: 4 });
  assert.deepEqual(result.components.map(({ formula, nature, type, criticalMax }) => ({ formula, nature, type, criticalMax })), [
    { formula: "1d10", nature: "physical", type: "perfurante", criticalMax: undefined },
    { formula: "4d6+8", nature: "physical", type: "perfurante", criticalMax: true }
  ]);
  assert.equal(result.components[1].maximumDamage, 32);
  assert.equal(result.components[1].total, 44);
});

test("Alcance e Sequencial preservam os componentes no mesmo ataque", async () => {
  globalThis.Roll = class MockRoll {
    constructor(formula) {
      this.formula = formula;
      this.total = 1;
    }

    async evaluate() { return this; }
    toJSON() { return { formula: this.formula }; }
  };
  const item = {
    name: "Lança sequencial",
    system: {
      damage: [{ formula: "1d10", nature: "physical", type: "perfurante" }],
      characteristics: {
        alcance: { enabled: true, spaces: 5, damageFormula: "1d6", damagePartIndex: 0 },
        sequencial: { enabled: true, damageFormula: "+1", damagePartIndex: 0 }
      }
    }
  };
  const first = await rollWeaponDamage(item, { reachDistance: 4, sequentialCount: 0 });
  const second = await rollWeaponDamage(item, { reachDistance: 4, sequentialCount: 1 });
  const third = await rollWeaponDamage(item, { reachDistance: 4, sequentialCount: 2 });
  assert.deepEqual(first.components.map(({ source, formula }) => ({ source, formula })), [
    { source: "base", formula: "1d10" },
    { source: "alcance", formula: "4d6" }
  ]);
  assert.deepEqual(second.components.map(({ source, formula, nature, type }) => ({ source, formula, nature, type })), [
    { source: "base", formula: "1d10", nature: "physical", type: "perfurante" },
    { source: "alcance", formula: "4d6", nature: "physical", type: "perfurante" },
    { source: "sequencial", formula: "+1", nature: "physical", type: "perfurante" }
  ]);
  assert.equal(third.components[2].formula, "+2");
});

test("Golpe de Retaguarda reutiliza a rolagem base e compõe bônus por alvo", async () => {
  let rolls = 0;
  globalThis.Roll = class MockRoll {
    constructor(formula) { this.formula = formula; this.total = formula === "2d10" ? ++rolls : 1; }
    async evaluate() { return this; }
    clone() { return new MockRoll(this.formula); }
    evaluateSync() { return this; }
  };
  const item = {
    name: "Nunchaku",
    system: {
      damage: [{ formula: "2d10", nature: "physical", type: "impacto" }],
      characteristics: {
        golpeDeRetaguarda: { enabled: true },
        apunhalhar: { enabled: true, damageFormula: "+2", damagePartIndex: 0 }
      }
    }
  };
  const base = await rollWeaponBaseDamage(item);
  const first = await rollWeaponDamage(item, { baseComponents: base, apunhalhar: true });
  const second = await rollWeaponDamage(item, { baseComponents: base, apunhalhar: false });
  assert.equal(rolls, 1);
  assert.equal(first.totalRawDamage, 3);
  assert.equal(second.totalRawDamage, 1);
});

test("Sequencial progressivo mantém o máximo crítico da fórmula atual", async () => {
  globalThis.Roll = class MockRoll {
    constructor(formula) {
      this.formula = formula;
      this.total = formula === "1d10" ? 1 : 9;
    }

    async evaluate() { return this; }

    clone() { return new MockRoll(this.formula); }

    evaluateSync({ maximize }) {
      this.total = this.formula === "1d10" ? 10 : maximize ? 24 : 9;
      return this;
    }
  };
  const item = {
    name: "Lança progressiva",
    system: {
      damage: [{ formula: "1d10", nature: "physical", type: "perfurante" }],
      characteristics: {
        sequencial: { enabled: true, damageFormula: "1d6+2", damagePartIndex: 0 }
      }
    }
  };
  const result = await rollWeaponDamage(item, { critical: true, sequentialCount: 3 });
  assert.deepEqual(result.components.map(({ source, formula, maximumDamage, total }) => ({ source, formula, maximumDamage, total })), [
    { source: "base", formula: "1d10", maximumDamage: 10, total: 11 },
    { source: "sequencial", formula: "3d6+6", maximumDamage: 24, total: 33 }
  ]);
});
