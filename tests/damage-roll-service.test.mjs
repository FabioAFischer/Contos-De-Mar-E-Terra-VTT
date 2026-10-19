import test from "node:test";
import assert from "node:assert/strict";

import { getMaximumRollTotal } from "../module/services/damage-roll-service.mjs";

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
