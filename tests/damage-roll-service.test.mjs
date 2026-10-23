import test from "node:test";
import assert from "node:assert/strict";

import { getMaximumRollTotal, sendDamageToChat } from "../module/services/damage-roll-service.mjs";

test("usa avaliação maximizada determinística para o máximo da Roll", () => {
  let options;
  const roll = {
    clone() {
      return {
        evaluateSync(receivedOptions) {
          options = receivedOptions;
          this.total = 10;
        },
        total: null
      };
    },
    evaluateSync() {}
  };

  assert.equal(getMaximumRollTotal(roll), 10);
  assert.deepEqual(options, { maximize: true, strict: true });
});

test("card preserva origem, fórmula e resultado de cada componente", async () => {
  let renderedContext;
  globalThis.game = { i18n: { localize: (key) => key } };
  globalThis.foundry = {
    applications: {
      handlebars: {
        async renderTemplate(_path, context) {
          renderedContext = context;
          return "damage-card";
        }
      }
    }
  };
  globalThis.ChatMessage = {
    getSpeaker: () => ({ actor: "actor-1" }),
    create: async (message) => message
  };
  const roll = { toJSON: () => ({ formula: "1d10" }) };
  const components = [
    { source: "base", formula: "1d10", rolledDamage: 7, total: 7, critical: false, roll },
    { source: "alcance", formula: "4d6", rolledDamage: 11, total: 11, critical: false, roll },
    { source: "sequencial", formula: "+1", rolledDamage: 1, total: 1, critical: false, roll }
  ];
  await sendDamageToChat({
    critical: false,
    totalRawDamage: 19,
    totalAppliedReduction: 0,
    totalFinalDamage: 19,
    groups: [{
      nature: "physical",
      type: "perfurante",
      rawDamage: 19,
      finalDamage: 19,
      reductions: [],
      components
    }],
    components
  }, { attackerName: "A", defenderName: "B", item: { parent: null } });
  assert.deepEqual(renderedContext.groups[0].components.map(({ sourceLabel, formula, rolledDamage }) => ({ sourceLabel, formula, rolledDamage })), [
    { sourceLabel: "CMET.Damage.Sources.Base", formula: "1d10", rolledDamage: 7 },
    { sourceLabel: "CMET.Damage.Sources.Alcance", formula: "4d6", rolledDamage: 11 },
    { sourceLabel: "CMET.Damage.Sources.Sequencial", formula: "+1", rolledDamage: 1 }
  ]);
});
