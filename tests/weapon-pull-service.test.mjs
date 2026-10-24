import test from "node:test";
import assert from "node:assert/strict";

import { calculatePullPath, executePullMovement, isForcedPullMovement, recordPullMovementConfirmation, requestPullMovement, resolvePullMovementResponse } from "../module/services/weapon-pull-service.mjs";

function makeScene() {
  globalThis.game = undefined;
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

test("executa movimento pela API v14 e mantém a marcação de Puxar durante o movimento", async () => {
  makeScene();
  const attacker = makeToken("attacker", 0, 0);
  const target = makeToken("target", 400, 0);
  let movementOptions;
  let forcedDuringMove = false;
  target.document.move = async (waypoints, options) => {
    movementOptions = options;
    assert.equal(options.method, "api", "métodos fora da API v14 não podem ser usados por Puxar");
    assert.equal(options.broadcast, true);
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
  assert.equal(movementOptions.method, "api");
  assert.equal(forcedDuringMove, true);
  assert.equal(isForcedPullMovement(target, {}), false);
});

test("aguarda a confirmação da movimentação antes de medir a posição final", async () => {
  makeScene();
  const attacker = makeToken("attacker", 0, 0);
  const target = makeToken("target", 500, 0);
  let resolveFinished;
  target.document.move = async (_waypoints, options) => {
    assert.equal(options.method, "api");
    target.document.movement = {
      passed: { waypoints: [{ x: 500, y: 0 }, { x: 200, y: 0 }] },
      finished: new Promise((resolve) => { resolveFinished = resolve; })
    };
    setImmediate(() => {
      target.document.x = 200;
      resolveFinished(true);
    });
    return true;
  };
  canvas.tokens.placeables = [attacker, target];

  const result = await executePullMovement({ attackerToken: attacker, targetToken: target, spaces: 3 });

  assert.equal(result.moved, true);
  assert.equal(result.movedSpaces, 3);
  assert.equal(result.destination.x, 200);
});

test("usa o movimento processado pelo hook quando o TokenDocument ainda está na origem", async () => {
  makeScene();
  const attacker = makeToken("attacker", 0, 0);
  const target = makeToken("target", 500, 0);
  target.document.move = async (waypoints, options) => {
    assert.equal(options.method, "api");
    const movement = {
      id: options.id,
      method: options.method,
      origin: { x: 500, y: 0 },
      destination: { x: 300, y: 0 },
      passed: { waypoints: [{ x: 500, y: 0 }, { x: 300, y: 0 }] },
      finished: Promise.resolve(true)
    };
    assert.equal(recordPullMovementConfirmation(target.document, movement), true);
    assert.equal(recordPullMovementConfirmation(target.document, movement), true, "callbacks duplicados devem ser idempotentes");
    assert.equal(waypoints.at(-1).x, 300);
    return true;
  };
  canvas.tokens.placeables = [attacker, target];

  const result = await executePullMovement({ attackerToken: attacker, targetToken: target, spaces: 2 });

  assert.equal(result.moved, true);
  assert.equal(result.movedSpaces, 2);
  assert.deepEqual(result.confirmedDestination, { x: 300, y: 0 });
});

test("classifica erro real da API sem tratá-lo como falha de permissão", async () => {
  makeScene();
  const attacker = makeToken("attacker", 0, 0);
  const target = makeToken("target", 400, 0);
  const apiError = new Error("Token movement rejected by the server");
  target.document.move = async (_waypoints, options) => {
    assert.equal(options.method, "api");
    throw apiError;
  };
  canvas.tokens.placeables = [attacker, target];

  const originalError = console.error;
  console.error = () => {};
  let result;
  try {
    result = await executePullMovement({ attackerToken: attacker, targetToken: target, spaces: 2 });
  } finally {
    console.error = originalError;
  }

  assert.equal(result.executed, false);
  assert.equal(result.failureReason, "apiError");
  assert.equal(result.blockedReason, "apiError");
  assert.equal(result.errorName, "Error");
  assert.equal(result.errorMessage, apiError.message);
  assert.equal(isForcedPullMovement(target, {}), false);
});

test("classifica confirmação ausente sem inventar um deslocamento", async () => {
  makeScene();
  const attacker = makeToken("attacker", 0, 0);
  const target = makeToken("target", 400, 0);
  target.document.move = async (_waypoints, options) => {
    assert.equal(options.method, "api");
    return true;
  };
  canvas.tokens.placeables = [attacker, target];

  const result = await executePullMovement({ attackerToken: attacker, targetToken: target, spaces: 2 });

  assert.equal(result.moved, false);
  assert.equal(result.movedSpaces, 0);
  assert.equal(result.failureReason, "confirmation");
  assert.notEqual(result.failureReason, "noSpace");
});

test("diferencia movimento interrompido e preserva deslocamento parcial", async () => {
  makeScene();
  const attacker = makeToken("attacker", 0, 0);
  const target = makeToken("target", 400, 0);
  target.document.move = async (waypoints, options) => {
    assert.equal(options.method, "api");
    const partial = waypoints[0];
    target.document.x = partial.x;
    target.document.y = partial.y;
    return false;
  };
  canvas.tokens.placeables = [attacker, target];

  const result = await executePullMovement({ attackerToken: attacker, targetToken: target, spaces: 2 });

  assert.equal(result.executed, false);
  assert.equal(result.moved, true);
  assert.equal(result.movedSpaces, 1);
  assert.equal(result.failureReason, "movementStopped");
  assert.equal(result.blockedReason, "movementStopped");
});

test("usa os waypoints percorridos quando a movimentação é interrompida antes de atualizar o documento", async () => {
  makeScene();
  const attacker = makeToken("attacker", 0, 0);
  const target = makeToken("target", 400, 0);
  target.document.move = async (_waypoints, options) => {
    const movement = {
      id: options.id,
      origin: { x: 400, y: 0 },
      destination: { x: 200, y: 0 },
      passed: { waypoints: [{ x: 400, y: 0 }, { x: 300, y: 0 }] },
      finished: Promise.resolve(false)
    };
    assert.equal(recordPullMovementConfirmation(target.document, movement), true);
    target.document.x = 200;
    return true;
  };
  canvas.tokens.placeables = [attacker, target];

  const result = await executePullMovement({ attackerToken: attacker, targetToken: target, spaces: 2 });

  assert.equal(result.executed, false);
  assert.equal(result.moved, true);
  assert.equal(result.movedSpaces, 1);
  assert.deepEqual(result.confirmedDestination, { x: 300, y: 0 });
  assert.equal(result.failureReason, "movementStopped");
});

test("mede um único espaço efetivamente percorrido antes de um obstáculo", async () => {
  makeScene();
  const attacker = makeToken("attacker", 0, 0);
  let collisionChecks = 0;
  const target = makeToken("target", 500, 0, {
    collision: () => ++collisionChecks > 1
  });
  target.document.move = async (waypoints, options) => {
    assert.equal(options.method, "api");
    const destination = waypoints.at(-1);
    target.document.x = destination.x;
    target.document.y = destination.y;
    return true;
  };
  canvas.tokens.placeables = [attacker, target];

  const result = await executePullMovement({ attackerToken: attacker, targetToken: target, spaces: 3 });

  assert.equal(result.moved, true);
  assert.equal(result.movedSpaces, 1);
  assert.equal(result.blocked, true);
  assert.equal(result.failureReason, null);
  assert.equal(result.plannedSpaces, 1);
});

test("classifica ausência de espaço livre sem chamar a API de movimento", async () => {
  makeScene();
  const attacker = makeToken("attacker", 0, 0);
  const target = makeToken("target", 100, 0);
  let moveCalled = false;
  target.document.move = async () => { moveCalled = true; };
  canvas.tokens.placeables = [attacker, target];

  const result = await executePullMovement({ attackerToken: attacker, targetToken: target, spaces: 2 });

  assert.equal(result.moved, false);
  assert.equal(result.executed, true);
  assert.equal(result.failureReason, "noSpace");
  assert.equal(result.blockedReason, "attackerSpace");
  assert.equal(moveCalled, false);
});

test("valida autoridade do TokenDocument de um Actor sintético", async () => {
  makeScene();
  const user = { id: "owner", active: true, isGM: false };
  const actor = {
    testUserPermission(candidate, permission) {
      return candidate.id === user.id && permission === "OWNER";
    }
  };
  globalThis.game = { user, users: [user] };
  const attacker = makeToken("attacker", 0, 0);
  const target = makeToken("target", 400, 0);
  target.actor = actor;
  target.document.actor = actor;
  target.document.canUserModify = (candidate, action) => candidate === user && action === "update";
  target.document.move = async (waypoints, options) => {
    assert.equal(options.method, "api");
    const destination = waypoints.at(-1);
    target.document.x = destination.x;
    target.document.y = destination.y;
    return true;
  };
  canvas.tokens.placeables = [attacker, target];

  const result = await executePullMovement({ attackerToken: attacker, targetToken: target, spaces: 2 });

  assert.equal(result.executed, true);
  assert.equal(result.moved, true);
});

test("classifica falta de autoridade do TokenDocument como permissão", async () => {
  makeScene();
  const user = { id: "not-owner", active: true, isGM: false };
  const actor = { testUserPermission: () => false };
  globalThis.game = { user, users: [user] };
  const attacker = makeToken("attacker", 0, 0);
  const target = makeToken("target", 400, 0);
  target.actor = actor;
  target.document.actor = actor;
  target.document.canUserModify = () => true;
  target.document.move = async () => {
    throw new Error("não deveria executar sem autoridade");
  };
  canvas.tokens.placeables = [attacker, target];

  const result = await executePullMovement({ attackerToken: attacker, targetToken: target, spaces: 2 });

  assert.equal(result.executed, false);
  assert.equal(result.failureReason, "permission");
  assert.equal(result.blockedReason, "permission");
});

test("retorna timeout quando a autoridade remota não responde", async () => {
  makeScene();
  const localUser = { id: "local", active: true, isGM: false };
  const remoteUser = { id: "remote", active: true, isGM: false };
  const actor = {
    testUserPermission(candidate, permission) {
      return candidate.id === remoteUser.id && permission === "OWNER";
    }
  };
  const emitted = [];
  globalThis.game = {
    user: localUser,
    users: [localUser, remoteUser],
    socket: { emit: (_channel, message) => emitted.push(message) }
  };
  globalThis.foundry = { utils: { randomID: () => "pull-request-1" } };
  const attacker = makeToken("attacker", 0, 0);
  const target = makeToken("target", 400, 0);
  target.actor = actor;
  target.document.actor = actor;
  canvas.tokens.placeables = [attacker, target];

  const result = await requestPullMovement({
    attackerToken: attacker,
    targetToken: target,
    spaces: 2,
    combatId: "combat-1",
    timeoutMs: 1
  });

  assert.equal(result.failureReason, "timeout");
  assert.equal(result.blockedReason, "timeout");
  assert.equal(emitted[0].targetUserId, remoteUser.id);
});

test("preserva movedSpaces ao receber o resultado pelo socket", async () => {
  makeScene();
  const localUser = { id: "local", active: true, isGM: false };
  const remoteUser = { id: "remote", active: true, isGM: false };
  const actor = {
    testUserPermission(candidate, permission) {
      return candidate.id === remoteUser.id && permission === "OWNER";
    }
  };
  globalThis.game = {
    user: localUser,
    users: [localUser, remoteUser],
    socket: {
      emit: (_channel, message) => {
        resolvePullMovementResponse({
          requesterId: localUser.id,
          requestId: message.requestId,
          result: {
            moved: true,
            movedSpaces: 2,
            requestedSpaces: 3,
            plannedSpaces: 2,
            confirmedDestination: { x: 200, y: 0 },
            completed: true,
            blocked: true,
            failureReason: null
          }
        });
      }
    }
  };
  globalThis.foundry = { utils: { randomID: () => "pull-request-response" } };
  const attacker = makeToken("attacker", 0, 0);
  const target = makeToken("target", 400, 0);
  target.actor = actor;
  target.document.actor = actor;
  canvas.tokens.placeables = [attacker, target];

  const result = await requestPullMovement({
    attackerToken: attacker,
    targetToken: target,
    spaces: 3,
    combatId: "combat-1"
  });

  assert.equal(result.moved, true);
  assert.equal(result.movedSpaces, 2);
  assert.deepEqual(result.confirmedDestination, { x: 200, y: 0 });
  assert.equal(result.completed, true);
  assert.equal(result.failureReason, null);
});
