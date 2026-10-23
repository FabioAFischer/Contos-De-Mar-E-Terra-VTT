import test from "node:test";
import assert from "node:assert/strict";

import {
  handlePolearmMovement,
  processPolearmReactionRequest,
  registerCombatAttackSocket
} from "../module/services/combat-attack-service.mjs";

class Collection extends Map {
  [Symbol.iterator]() { return this.values(); }
  find(callback) { return [...this.values()].find(callback); }
}

const owner = { id: "user-reactor", active: true, isGM: false };
const mover = { id: "user-mover", active: true, isGM: false };
const gm = { id: "user-gm", active: true, isGM: true };
const sceneId = "scene-main";
const combatId = "combat-1";
const weaponId = "weapon-polearm";
const reactorCombatantId = "combatant-reactor";
const reactorTokenId = "token-reactor";
const movingTokenId = "token-moving";

let emitted = [];
let dialogInstances = [];
let socketHandler = null;

function createActor({ synthetic = false, maxActions = 1 } = {}) {
  const weapon = {
    id: weaponId,
    type: "arma",
    name: "Alabarda",
    system: {
      equipped: true,
      combatSkill: "armasDeHaste",
      hands: undefined,
      characteristics: { armaDeHaste: { enabled: true, spaces: 3, damageFormula: "1d8" } }
    }
  };
  const items = new Collection([[weapon.id, weapon]]);
  return {
    id: synthetic ? "synthetic-reactor" : "actor-reactor",
    name: "Tyra",
    system: {
      actions: { max: maxActions },
      hands: { mainHand: weaponId, offHand: "" },
      attributes: { combate: { skills: { armasDeHaste: 50 } } }
    },
    items,
    testUserPermission(user, permission) { return permission === "OWNER" && user.id === owner.id; }
  };
}

function createToken(id, x, disposition) {
  const document = { id, x, y: 0, width: 1, height: 1, disposition, parent: { id: sceneId } };
  const token = { id, name: id === movingTokenId ? "Inimigo" : "Tyra", document };
  document.object = token;
  return token;
}

function createCombat({ actor, reserved = 1, movingX = 500, reactorDisposition = 1, movingDisposition = -1, sameToken = false }) {
  const movingToken = createToken(movingTokenId, movingX, movingDisposition);
  const reactorToken = sameToken ? movingToken : createToken(reactorTokenId, 0, reactorDisposition);
  const actionState = { current: 0, reserved, turnKey: null };
  const reactorCombatant = {
    id: reactorCombatantId,
    tokenId: sameToken ? movingTokenId : reactorTokenId,
    actor,
    token: { object: reactorToken },
    getFlag() { return actionState; },
    setFlag(_scope, _key, value) { Object.assign(actionState, value); return Promise.resolve(value); }
  };
  const movingCombatant = {
    id: "combatant-moving",
    tokenId: movingTokenId,
    actor: { id: "actor-moving", system: { actions: { max: 1 } } },
    token: { object: movingToken }
  };
  const combatants = new Collection([[reactorCombatant.id, reactorCombatant], [movingCombatant.id, movingCombatant]]);
  return {
    id: combatId,
    started: true,
    scene: { id: sceneId },
    combatants,
    combatant: movingCombatant,
    turns: [reactorCombatant, movingCombatant]
  };
}

function createDialogMock() {
  return class DialogV2 {
    constructor(options) {
      this.options = options;
      this.listeners = new Map();
      this.renderCount = 0;
      this.element = { querySelector: () => null };
      dialogInstances.push(this);
    }

    addEventListener(type, callback) {
      this.listeners.set(type, callback);
    }

    render() {
      this.renderCount += 1;
      this.listeners.get("render")?.();
      return Promise.resolve(this);
    }

    close() {
      this.listeners.get("close")?.();
    }
  };
}

function configureClient({ actor, combat, user, users = [owner, mover, gm], synthetic = false, includeActorInWorld = true }) {
  emitted = [];
  dialogInstances = [];
  socketHandler = null;
  const tokens = new Collection();
  for (const combatant of combat.combatants.values()) tokens.set(combatant.tokenId, combatant.token.object);
  const socket = {
    on(_channel, callback) { socketHandler = callback; },
    emit(_channel, message) {
      emitted.push(message);
      if (message.type === "combat-polearm-reaction-response" && message.requesterId === game.user?.id) {
        socketHandler?.(message);
      }
    }
  };
  const actors = includeActorInWorld ? new Collection([[actor.id, actor]]) : new Collection();
  const translations = {
    "CMET.CombatAttack.ReactionTitle": "Ataque de reação — Arma de Haste",
    "CMET.CombatAttack.ReactionEntering": "entrando",
    "CMET.CombatAttack.ReactionLeaving": "saindo",
    "CMET.CombatAttack.UnknownEnemy": "o inimigo",
    "CMET.CombatAttack.UnknownWeapon": "Arma de Haste"
  };
  const prompts = {
    "CMET.CombatAttack.ReactionPromptSingular": "{enemyName} está {movementDirection} do alcance de {weaponName}.\n\nVocê possui {reservedActions} ação reservada.\n\nDeseja gastar 1 ação reservada para realizar um ataque reativo?",
    "CMET.CombatAttack.ReactionPromptPlural": "{enemyName} está {movementDirection} do alcance de {weaponName}.\n\nVocê possui {reservedActions} ações reservadas.\n\nDeseja gastar 1 ação reservada para realizar um ataque reativo?"
  };
  globalThis.game = {
    user,
    users,
    actors,
    combat,
    system: { id: "contos-de-mar-e-terra" },
    socket,
    i18n: {
      localize: (key) => translations[key] ?? key,
      format: (key, data) => (prompts[key] ?? key).replace(/\{(\w+)\}/g, (_match, name) => data[name] ?? "undefined")
    }
  };
  globalThis.canvas = {
    scene: { id: sceneId },
    grid: { size: 100, measurePath: ([from, to]) => ({ spaces: Math.abs(from.x - to.x) / 100, distance: Math.abs(from.x - to.x) / 100 }) },
    tokens: { get: (id) => tokens.get(id), placeables: [...tokens.values()] }
  };
  globalThis.foundry = {
    utils: { randomID: () => "request-1" },
    applications: { api: { DialogV2: createDialogMock() } }
  };
  globalThis.Roll = class MockRoll {
    constructor() {
      this.total = 50;
      this.dice = [{ results: [{ result: 50, active: true, discarded: false }] }];
    }

    async evaluate() { return this; }
  };
  globalThis.ui = { notifications: { warn() {}, error() {} } };
  globalThis.Hooks = { on() {}, off() {}, callAll() {} };
  return { movingToken: tokens.get(movingTokenId), reactorCombatant: combat.combatants.get(reactorCombatantId) };
}

let movementSequence = 0;

function movementFromTo(fromX, toX) {
  movementSequence += 1;
  return {
    id: `movement-${movementSequence}-${fromX}-${toX}`,
    method: "dragging",
    origin: { x: fromX, y: 0 },
    destination: { x: toX, y: 0 },
    passed: { waypoints: [] }
  };
}

async function detectReaction({ synthetic = false, reserved = 1, maxActions = 1, moverUser = mover, includeActorInWorld = true, fromX = 300, toX = 500, reactorDisposition = 1, movingDisposition = -1, sameToken = false } = {}) {
  const actor = createActor({ synthetic, maxActions });
  const combat = createCombat({ actor, reserved, movingX: toX, reactorDisposition, movingDisposition, sameToken });
  const client = configureClient({ actor, combat, user: moverUser, includeActorInWorld });
  await handlePolearmMovement(client.movingToken.document, movementFromTo(fromX, toX), {}, moverUser);
  return { actor, combat, client, request: emitted.find((message) => message.type === "combat-polearm-reaction-request") };
}

test("identifica Actor vinculado e entrega a solicitação ao usuário reativo", async () => {
  const result = await detectReaction({ includeActorInWorld: true });
  assert.equal(result.request.targetUserId, owner.id);
  assert.equal(result.request.reactorCombatantId, reactorCombatantId);
  assert.equal(result.request.reactorTokenId, reactorTokenId);
  assert.equal(result.request.movementDirection, "leaving");
});

test("permite reação entre adversários com a mesma disposição hostil", async () => {
  const result = await detectReaction({ reactorDisposition: -1, movingDisposition: -1 });
  assert.equal(result.request.targetUserId, owner.id);
});

test("permite reação entre adversários com a mesma disposição amigável", async () => {
  const result = await detectReaction({ reactorDisposition: 1, movingDisposition: 1 });
  assert.equal(result.request.targetUserId, owner.id);
});

test("usa combatant.actor para Actor sintético, sem consultar game.actors", async () => {
  const result = await detectReaction({ synthetic: true, includeActorInWorld: false });
  assert.equal(result.request.actorId, result.actor.id);
  assert.equal(result.request.targetUserId, owner.id);
});

test("GM movimentando o inimigo ainda entrega ao jogador reativo", async () => {
  const result = await detectReaction({ moverUser: gm, reactorDisposition: -1, movingDisposition: -1 });
  assert.equal(result.request.targetUserId, owner.id);
});

test("usuário diferente controla o personagem reativo sem exigir o turno dele", async () => {
  const result = await detectReaction({ moverUser: gm, users: [owner, gm] });
  assert.equal(result.request.targetUserId, owner.id);
  assert.notEqual(result.request.targetUserId, gm.id);
});

test("GM conectado em outra cena não substitui o cliente que iniciou o movimento", async () => {
  const result = await detectReaction({ moverUser: mover, users: [owner, mover, { ...gm, scene: { id: "scene-other" } }] });
  assert.equal(result.request.targetUserId, owner.id);
});

test("sem ações reservadas não envia solicitação", async () => {
  const result = await detectReaction({ reserved: 0 });
  assert.equal(result.request, undefined);
});

test("não oferece reação contra o próprio Combatant", async () => {
  const result = await detectReaction({ sameToken: true });
  assert.equal(result.request, undefined);
});

test("detecta entrada no alcance", async () => {
  const result = await detectReaction({ fromX: 500, toX: 300 });
  assert.equal(result.request.movementDirection, "entering");
});

test("entrega via socket e renderiza exatamente um DialogV2", async () => {
  const result = await detectReaction();
  registerCombatAttackSocket();
  assert.equal(typeof socketHandler, "function");
  globalThis.game.user = owner;
  const requestPromise = socketHandler(result.request);
  await Promise.resolve();
  assert.equal(dialogInstances.length, 1);
  assert.equal(dialogInstances[0].renderCount, 1);
  assert.deepEqual(dialogInstances[0].options.classes, ["cmet-polearm-reaction-dialog"]);
  assert.equal(dialogInstances[0].options.position.width, 360);
  assert.match(dialogInstances[0].options.content, /Inimigo/);
  assert.match(dialogInstances[0].options.content, /Alabarda/);
  assert.match(dialogInstances[0].options.content, /1 ação reservada\./);
  assert.doesNotMatch(dialogInstances[0].options.content, /undefined/);
  globalThis.game.user = mover;
  dialogInstances[0].close();
  await requestPromise;
  assert.equal(dialogInstances[0].renderCount, 1);
});

test("ignorar a reação não consome ação reservada", async () => {
  const result = await detectReaction();
  registerCombatAttackSocket();
  globalThis.game.user = owner;
  const requestPromise = processPolearmReactionRequest(result.request);
  await Promise.resolve();
  globalThis.game.user = mover;
  dialogInstances[0].close();
  await requestPromise;
  assert.equal(result.client.reactorCombatant.getFlag("contos-de-mar-e-terra", "actions").reserved, 1);
});

test("exibe ações reservadas no plural", async () => {
  const result = await detectReaction({ reserved: 4, maxActions: 4 });
  registerCombatAttackSocket();
  globalThis.game.user = owner;
  const requestPromise = processPolearmReactionRequest(result.request);
  await Promise.resolve();
  assert.match(dialogInstances[0].options.content, /4 ações reservadas\./);
  assert.doesNotMatch(dialogInstances[0].options.content, /undefined/);
  globalThis.game.user = mover;
  dialogInstances[0].close();
  await requestPromise;
});

test("Reagir abre a rolagem de ataque e consome uma ação reservada", async () => {
  const result = await detectReaction();
  registerCombatAttackSocket();
  globalThis.game.user = owner;
  const requestPromise = processPolearmReactionRequest(result.request);
  await Promise.resolve();
  assert.equal(dialogInstances.length, 1);

  globalThis.game.user = mover;
  dialogInstances[0].options.submit("react");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(dialogInstances.length, 2);

  const rollDialog = dialogInstances[1];
  const rollButton = rollDialog.options.buttons.find(({ action }) => action === "roll");
  await rollButton.callback(null, {
    form: { elements: { modifier: { value: "0" }, rollMode: { value: "normal" } } }
  });
  assert.equal(result.client.reactorCombatant.getFlag("contos-de-mar-e-terra", "actions").reserved, 0);
  await requestPromise;
});
