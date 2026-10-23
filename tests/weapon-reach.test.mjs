import test from "node:test";
import assert from "node:assert/strict";

import { rollWeaponDamage } from "../module/services/damage-roll-service.mjs";
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
