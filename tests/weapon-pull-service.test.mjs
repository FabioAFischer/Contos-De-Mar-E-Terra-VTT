import test from "node:test";
import assert from "node:assert/strict";

import { calculatePullPath, executePullMovement, isForcedPullMovement } from "../module/services/weapon-pull-service.mjs";

function makeScene() {
  globalThis.canvas = {
    scene: { id: "scene-1", dimensions: { rect: { left: 0, top: 0, right: 1000, bottom: 1000 } } },
    grid: { size: 100 },
    tokens: { placeables: [] }
  };
}

function makeToken(id, x, y, { width = 1, height = 1, collision = () => false } = {}) {
  const document = {
    id,
    x,
    y,
    width,
    height,
    parent: { id: "scene-1" },
    getSnappedPosition: ({ x: nextX, y: nextY }) => ({ x: Math.round(nextX / 100) * 100, y: Math.round(nextY / 100) * 100 }),
    measureMovementPath: ([origin, destination]) => ({
      spaces: Math.max(Math.abs(destination.x - origin.x), Math.abs(destination.y - origin.y)) / 100,
      distance: Math.max(Math.abs(destination.x - origin.x), Math.abs(destination.y - origin.y)) / 100,
      segments: [],
      waypoints: [origin, destination]
    })
  };
  return { id, document, checkCollision: (_destination, options) => collision(options) };
}

test("calcula deslocamento direto progressivo até o limite de espaços", () => {
  makeScene();
  const attacker = makeToken("attacker", 0, 0);
  const target = makeToken("target", 500, 0);
  canvas.tokens.placeables = [attacker, target];

  const path = calculatePullPath({ attackerToken: attacker, targetToken: target, spaces: 3 });

  assert.deepEqual(path.positions, [{ x: 500, y: 0 }, { x: 400, y: 0 }, { x: 300, y: 0 }, { x: 200, y: 0 }]);
  assert.equal(path.movedSpaces, 3);
  assert.equal(path.blocked, false);
});

test("interrompe Puxar em parede e não atravessa o atacante", () => {
  makeScene();
  const attacker = makeToken("attacker", 0, 0);
  let collisionChecks = 0;
  const wallTarget = makeToken("wall-target", 500, 0, { collision: () => ++collisionChecks > 1 });
  canvas.tokens.placeables = [attacker, wallTarget];
  const wallPath = calculatePullPath({ attackerToken: attacker, targetToken: wallTarget, spaces: 3 });
  assert.deepEqual(wallPath.positions, [{ x: 500, y: 0 }, { x: 400, y: 0 }]);
  assert.equal(wallPath.blockedReason, "wall");

  const adjacent = makeToken("adjacent", 100, 0);
  canvas.tokens.placeables = [attacker, adjacent];
  const adjacentPath = calculatePullPath({ attackerToken: attacker, targetToken: adjacent, spaces: 3 });
  assert.equal(adjacentPath.movedSpaces, 0);
  assert.equal(adjacentPath.blockedReason, "attackerSpace");
});

test("executa movimento com método forçado e aguarda a conclusão", async () => {
  makeScene();
  const attacker = makeToken("attacker", 0, 0);
  const target = makeToken("target", 400, 0);
  let movementOptions;
  let forcedDuringMove = false;
  target.document.move = async (waypoints, options) => {
    movementOptions = options;
    forcedDuringMove = isForcedPullMovement(target, { method: options.method });
    const destination = waypoints.at(-1);
    target.document.x = destination.x;
    target.document.y = destination.y;
    return true;
  };
  canvas.tokens.placeables = [attacker, target];

  const result = await executePullMovement({ attackerToken: attacker, targetToken: target, spaces: 2 });

  assert.equal(result.executed, true);
  assert.equal(result.moved, true);
  assert.equal(result.movedSpaces, 2);
  assert.equal(movementOptions.method, "forced");
  assert.equal(forcedDuringMove, true);
  assert.equal(isForcedPullMovement(target, {}), false);
});
