import test from "node:test";
import assert from "node:assert/strict";

import { startCombinedWeaponAttack, startWeaponAttack } from "../module/services/combat-attack-service.mjs";

class Collection extends Map {
  [Symbol.iterator]() { return this.values(); }
  find(callback) { return [...this.values()].find(callback); }
}

let dialogs;
let skillCards;
let damageCards;
let attackRolls;
let chatId;
let dialogWaits;

class DialogV2Mock {
  constructor(options) {
    this.options = options;
    this.listeners = new Map();
    this.element = { querySelector: () => null };
    this.renderCount = 0;
    dialogs.push(this);
  }

  static wait(options) {
    return new Promise((resolve) => {
      dialogWaits.push({ options, resolve });
    });
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
}

class RollMock {
  constructor(formula) {
    this.formula = formula;
    if (formula === "1d100") {
      this.total = attackRolls.shift();
      this.dice = [{ results: [{ result: this.total, active: true, discarded: false }] }];
    } else {
      this.total = Number(formula) || 1;
      this.dice = [];
    }
  }

  async evaluate() { return this; }

  clone() { return new RollMock(this.formula); }

  evaluateSync({ maximize }) {
    this.total = maximize ? this.total : this.total;
    return this;
  }

  async toMessage({ speaker, content }) {
    return { speaker, content };
  }

  toJSON() { return { formula: this.formula, total: this.total }; }
}

function makeWeapon({ id, name, skill, damage = "1", special = {} }) {
  return {
    id,
    type: "arma",
    name,
    system: {
      equipped: true,
      combatSkill: skill,
      damage: [{ formula: damage, nature: "physical", type: "impacto" }],
      characteristics: {
        umaMao: { enabled: true },
        ...special
      }
    },
    async update() {}
  };
}

function setup({ attackResults = [50, 50], targetReserved = 0, targetX = 100, mainSpecial = {}, offSpecial = {} } = {}) {
  dialogs = [];
  dialogWaits = [];
  skillCards = [];
  damageCards = [];
  attackRolls = [...attackResults];
  chatId = 0;

  const main = makeWeapon({ id: "weapon-main", name: "Adaga principal", skill: "arcos", special: mainSpecial });
  const off = makeWeapon({ id: "weapon-off", name: "Adaga secundária", skill: "laminas", special: offSpecial });
  const items = new Collection([[main.id, main], [off.id, off]]);
  const actor = {
    id: "actor-attacker",
    name: "Dagnat",
    system: {
      hands: { mainHand: main.id, offHand: off.id },
      actions: { max: 1 },
      attributes: { combate: { skills: { arcos: 50, laminas: 50 } } },
      resources: { vida: { value: 10 } }
    },
    items,
    testUserPermission() { return true; }
  };
  const targetActor = {
    id: "actor-target",
    name: "Tyra",
    system: {
      resources: { vida: { value: 20 } },
      actions: { max: 1 },
      attributes: { combate: { skills: { esquivar: 50, bloquear: 50 } } }
    },
    items: new Collection(),
    testUserPermission() { return true; },
    async update(data) {
      this.system.resources.vida.value = data["system.resources.vida.value"];
    }
  };
  const actorToken = { id: "token-attacker", actor, document: { id: "token-attacker", x: 0, y: 0, width: 1, height: 1, parent: { id: "scene-1" } } };
  let lastMoveOptions = null;
  const targetDocument = { id: "token-target", x: targetX, y: 0, width: 1, height: 1, parent: { id: "scene-1" } };
  const targetToken = {
    id: "token-target",
    actor: targetActor,
    document: targetDocument,
    checkCollision: () => false,
    constrainMovementPath: (waypoints) => [waypoints, false]
  };
  targetDocument.move = async (waypoints, options) => {
    lastMoveOptions = options;
    const destination = waypoints.at(-1);
    targetDocument.x = destination.x;
    targetDocument.y = destination.y;
    return true;
  };
  const attackerActions = { current: 1, reserved: 0, turnKey: null };
  const targetActions = { current: 1 - targetReserved, reserved: targetReserved, turnKey: null };
  const attackerCombatant = {
    id: "combatant-attacker",
    tokenId: actorToken.id,
    actor,
    token: { object: actorToken },
    getFlag(_scope, key) { return key === "actions" ? attackerActions : undefined; },
    async setFlag(_scope, key, value) { if (key === "actions") Object.assign(attackerActions, value); return value; }
  };
  const targetCombatant = {
    id: "combatant-target",
    tokenId: targetToken.id,
    actor: targetActor,
    token: { object: targetToken },
    getFlag(_scope, key) { return key === "actions" ? targetActions : undefined; },
    async setFlag(_scope, key, value) { if (key === "actions") Object.assign(targetActions, value); return value; }
  };
  const flags = {};
  const combat = {
    id: "combat-1",
    started: true,
    combatant: attackerCombatant,
    combatants: new Collection([[attackerCombatant.id, attackerCombatant], [targetCombatant.id, targetCombatant]]),
    getFlag(_scope, key) { return flags[key]; },
    async setFlag(_scope, key, value) { flags[key] = structuredClone(value); return value; }
  };
  const user = { id: "user-attacker", active: true, isGM: false, targets: new Set([targetToken]) };
  const translations = new Proxy({}, { get: (_target, key) => key });

  globalThis.game = {
    user,
    users: [user],
    actors: new Collection([[actor.id, actor], [targetActor.id, targetActor]]),
    combat,
    system: { id: "contos-de-mar-e-terra" },
    messages: new Collection(),
    i18n: {
      localize: (key) => translations[key] ?? key,
      format: (key, data) => `${key} ${JSON.stringify(data)}`
    },
    socket: { emit() {}, on() {} }
  };
  globalThis.canvas = {
    scene: { id: "scene-1", dimensions: { rect: { left: 0, top: 0, right: 1000, bottom: 1000 } } },
    tokens: { controlled: [actorToken], placeables: [actorToken, targetToken], get: (id) => ({ [actorToken.id]: actorToken, [targetToken.id]: targetToken }[id]) },
    grid: { size: 100 }
  };
  globalThis.foundry = {
    utils: { randomID: () => `request-${++chatId}`, escapeHTML: (value) => String(value), deepClone: (value) => structuredClone(value) },
    applications: {
      api: { DialogV2: DialogV2Mock },
      handlebars: {
        async renderTemplate(path, context) {
          if (path.includes("skill-roll-card")) skillCards.push(context);
          if (path.includes("damage-card")) damageCards.push(context);
          return path;
        }
      }
    }
  };
  globalThis.Roll = RollMock;
  globalThis.ChatMessage = {
    getSpeaker: () => ({ actor: actor.id }),
    async create(message) {
      const created = { id: `message-${++chatId}`, content: message.content, update: async () => {} };
      game.messages.set(created.id, created);
      return created;
    }
  };
  globalThis.ui = { notifications: { warn() {}, info() {} } };
  globalThis.Hooks = { on() {}, off() {}, callAll() {} };
  return { actor, main, off, combat, attackerActions, targetActions, targetActor, targetToken, flags, get lastMoveOptions() { return lastMoveOptions; } };
}

function form() {
  return { elements: { modifier: { value: "0" }, rollMode: { value: "normal" } } };
}

async function rollDialog(dialog) {
  const button = dialog.options.buttons.find(({ action }) => action === "roll");
  const result = await button.callback(null, { form: form() });
  await dialog.options.submit(result);
}

async function chooseNoDefense(dialog) {
  await dialog.options.submit("none");
}

async function runCombinedRound(setupData, attackResults, { defendFirst = false } = {}) {
  dialogs.length = 0;
  skillCards.length = 0;
  damageCards.length = 0;
  attackRolls = [...attackResults];
  setupData.attackerActions.current = 1;
  const combined = startCombinedWeaponAttack({ actor: setupData.actor });
  await Promise.resolve();
  const firstRoll = rollDialog(dialogs[0]);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(dialogs.length, 2);
  if (defendFirst) {
    await dialogs[1].options.submit("dodge");
    assert.equal(dialogs.length, 3);
    await rollDialog(dialogs[2]);
  }
  await firstRoll;
  await new Promise((resolve) => setImmediate(resolve));
  const secondDialog = dialogs.at(-1);
  await rollDialog(secondDialog);
  return combined;
}

test("ataque combinado encadeia duas rolagens e consome uma ação", async () => {
  const setupData = setup({
    attackResults: [50, 1],
    mainSpecial: { sequencial: { enabled: true, damageFormula: "+1", damagePartIndex: 0 } },
    offSpecial: {
      sequencial: { enabled: true, damageFormula: "+9", damagePartIndex: 0 },
      alcance: { enabled: true, spaces: 10, damageFormula: "1d6", damagePartIndex: 0 }
    }
  });
  setupData.flags.weaponCombat = { sequences: { [setupData.actor.id]: { weaponId: setupData.main.id, streak: 1 } } };
  const combined = startCombinedWeaponAttack({ actor: setupData.actor });
  await Promise.resolve();
  assert.equal(dialogs.length, 1);
  assert.equal(skillCards.length, 0);

  await rollDialog(dialogs[0]);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(dialogs.length, 2);
  assert.equal(setupData.attackerActions.current, 0);
  assert.equal(skillCards[0].skillKey, "arcos");

  await rollDialog(dialogs[1]);
  const result = await combined;
  assert.equal(result.status, "completed");
  assert.equal(setupData.attackerActions.current, 0);
  assert.equal(skillCards[1].skillKey, "laminas");
  assert.equal(damageCards.length, 2);
  assert.deepEqual(damageCards[0].groups[0].components.map(({ source }) => source), ["base", "sequencial"]);
  assert.deepEqual(damageCards[1].groups[0].components.map(({ source }) => source), ["base"]);
  assert.equal(damageCards[1].groups[0].components[0].critical, true);
});

test("primeiro ataque falha e o segundo ainda é oferecido", async () => {
  const setupData = setup({ attackResults: [80, 50] });
  const combined = startCombinedWeaponAttack({ actor: setupData.actor });
  await Promise.resolve();
  await rollDialog(dialogs[0]);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(dialogs.length, 2);
  await rollDialog(dialogs[1]);
  await combined;
  assert.deepEqual(skillCards.map(({ skillKey }) => skillKey), ["arcos", "laminas"]);
  assert.equal(damageCards.length, 1);
  assert.equal(setupData.attackerActions.current, 0);
});

test("defesas são solicitadas separadamente para os dois ataques", async () => {
  const setupData = setup({ targetReserved: 1 });
  const combined = startCombinedWeaponAttack({ actor: setupData.actor });
  await Promise.resolve();
  const firstRoll = rollDialog(dialogs[0]);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(dialogs.length, 2);
  await chooseNoDefense(dialogs[1]);
  await firstRoll;
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(dialogs.length, 3);
  const secondRoll = rollDialog(dialogs[2]);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(dialogs.length, 4);
  await chooseNoDefense(dialogs[3]);
  await secondRoll;
  await combined;
  assert.equal(setupData.attackerActions.current, 0);
});

test("primeiro ataque defendido não impede a segunda rolagem", async () => {
  const setupData = setup({ attackResults: [50, 1, 50], targetReserved: 1 });
  const combined = startCombinedWeaponAttack({ actor: setupData.actor });
  await Promise.resolve();

  const firstRoll = rollDialog(dialogs[0]);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(dialogs.length, 2);
  await dialogs[1].options.submit("dodge");
  assert.equal(dialogs.length, 3);
  await rollDialog(dialogs[2]);
  await firstRoll;
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(dialogs.length, 4);
  await rollDialog(dialogs[3]);
  const result = await combined;
  assert.equal(result.status, "completed");
  assert.equal(setupData.attackerActions.current, 0);
  assert.equal(setupData.targetActions.reserved, 0);
  assert.equal(damageCards.length, 1);
});

test("cancelar antes da primeira rolagem não consome ação nem abre a segunda", async () => {
  const setupData = setup();
  const combined = startCombinedWeaponAttack({ actor: setupData.actor });
  await Promise.resolve();
  dialogs[0].close();
  const result = await combined;
  assert.equal(result.status, "cancelled");
  assert.equal(dialogs.length, 1);
  assert.equal(setupData.attackerActions.current, 1);
});

test("cancelar a segunda rolagem preserva a ação gasta na primeira", async () => {
  const setupData = setup();
  const combined = startCombinedWeaponAttack({ actor: setupData.actor });
  await Promise.resolve();
  await rollDialog(dialogs[0]);
  await new Promise((resolve) => setImmediate(resolve));
  dialogs[1].close();
  const result = await combined;
  assert.equal(result.status, "cancelled");
  assert.equal(dialogs.length, 2);
  assert.equal(setupData.attackerActions.current, 0);
});

test("Sequencial da principal acumula entre ataques combinados", async () => {
  const setupData = setup({
    mainSpecial: { sequencial: { enabled: true, damageFormula: "+1", damagePartIndex: 0 } },
    offSpecial: { sequencial: { enabled: true, damageFormula: "+9", damagePartIndex: 0 } }
  });

  for (const expectedStreak of [1, 2, 3]) {
    const combined = await runCombinedRound(setupData, [50, 50]);
    const result = await combined;
    assert.equal(result.status, "completed");
    assert.equal(setupData.attackerActions.current, 0);
    assert.equal(setupData.flags.weaponCombat.sequences[setupData.actor.id].weaponId, setupData.main.id);
    assert.equal(setupData.flags.weaponCombat.sequences[setupData.actor.id].streak, expectedStreak);
    assert.deepEqual(
      damageCards[0].groups[0].components.map(({ source }) => source),
      expectedStreak === 1 ? ["base"] : ["base", "sequencial"]
    );
    assert.deepEqual(damageCards[1].groups[0].components.map(({ source }) => source), ["base"]);
  }
});

test("resultado da secundária não altera Sequencial da principal", async () => {
  const setupData = setup({
    mainSpecial: { sequencial: { enabled: true, damageFormula: "+1", damagePartIndex: 0 } },
    offSpecial: { sequencial: { enabled: true, damageFormula: "+9", damagePartIndex: 0 } }
  });

  setupData.flags.weaponCombat = { sequences: { [setupData.actor.id]: { weaponId: setupData.main.id, streak: 1 } } };
  let combined = await runCombinedRound(setupData, [50, 80]);
  await combined;
  assert.equal(setupData.flags.weaponCombat.sequences[setupData.actor.id].streak, 2);

  combined = await runCombinedRound(setupData, [80, 50]);
  await combined;
  assert.equal(setupData.flags.weaponCombat.sequences[setupData.actor.id].streak, 0);
  assert.equal(setupData.flags.weaponCombat.sequences[setupData.actor.id].weaponId, null);
});

test("defesa da principal zera Sequencial mesmo quando a secundária acerta", async () => {
  const setupData = setup({
    targetReserved: 1,
    mainSpecial: { sequencial: { enabled: true, damageFormula: "+1", damagePartIndex: 0 } },
    offSpecial: { sequencial: { enabled: true, damageFormula: "+9", damagePartIndex: 0 } }
  });
  setupData.flags.weaponCombat = { sequences: { [setupData.actor.id]: { weaponId: setupData.main.id, streak: 2 } } };

  const combined = await runCombinedRound(setupData, [50, 1, 50], { defendFirst: true });
  await combined;
  assert.equal(setupData.flags.weaponCombat.sequences[setupData.actor.id].streak, 0);
  assert.equal(setupData.flags.weaponCombat.sequences[setupData.actor.id].weaponId, null);
  assert.equal(damageCards.length, 1);
  assert.deepEqual(damageCards[0].groups[0].components.map(({ source }) => source), ["base"]);
});

test("cancelar a secundária preserva a sequência resultante da principal", async () => {
  const setupData = setup({
    mainSpecial: { sequencial: { enabled: true, damageFormula: "+1", damagePartIndex: 0 } }
  });
  setupData.flags.weaponCombat = { sequences: { [setupData.actor.id]: { weaponId: setupData.main.id, streak: 1 } } };
  dialogs.length = 0;
  damageCards.length = 0;
  attackRolls = [50];
  setupData.attackerActions.current = 1;
  const combined = startCombinedWeaponAttack({ actor: setupData.actor });
  await Promise.resolve();
  await rollDialog(dialogs[0]);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(setupData.flags.weaponCombat.sequences[setupData.actor.id].streak, 2);
  dialogs[1].close();
  const result = await combined;
  assert.equal(result.status, "cancelled");
  assert.equal(setupData.flags.weaponCombat.sequences[setupData.actor.id].streak, 2);
});

test("crítico da principal inclui o bônus de Sequencial", async () => {
  const setupData = setup({
    mainSpecial: { sequencial: { enabled: true, damageFormula: "+1", damagePartIndex: 0 } }
  });
  setupData.flags.weaponCombat = { sequences: { [setupData.actor.id]: { weaponId: setupData.main.id, streak: 1 } } };

  const combined = await runCombinedRound(setupData, [1, 50]);
  await combined;
  assert.deepEqual(damageCards[0].groups[0].components.map(({ source }) => source), ["base", "sequencial"]);
  assert.equal(damageCards[0].groups[0].components.every(({ critical }) => critical === true), true);
  assert.equal(setupData.flags.weaponCombat.sequences[setupData.actor.id].streak, 2);
});

test("Puxar usa ataque e defesa normais, move sem dano e registra Sequencial", async () => {
  const setupData = setup({
    targetX: 500,
    attackResults: [50],
    mainSpecial: {
      puxar: { enabled: true, spaces: 2 },
      sequencial: { enabled: true, damageFormula: "+1", damagePartIndex: 0 },
      alcance: { enabled: true, spaces: 6, damageFormula: "1d6", damagePartIndex: 0 }
    }
  });
  setupData.flags.weaponCombat = { sequences: { [setupData.actor.id]: { weaponId: setupData.main.id, streak: 1 } } };

  startWeaponAttack({ actor: setupData.actor, item: setupData.main, attackMode: "pull" });
  await Promise.resolve();
  assert.equal(dialogs.length, 1);
  await rollDialog(dialogs[0]);
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(setupData.targetToken.document.x, 300);
  assert.equal(setupData.lastMoveOptions.method, "api");
  assert.equal(setupData.targetActor.system.resources.vida.value, 20);
  assert.equal(damageCards.length, 0);
  assert.equal(setupData.flags.weaponCombat.sequences[setupData.actor.id].streak, 2);
});

test("Puxar inválido impede somente o modo Puxar", async () => {
  const setupData = setup({ mainSpecial: { puxar: { enabled: true, spaces: 0 } } });
  startWeaponAttack({ actor: setupData.actor, item: setupData.main, attackMode: "pull" });
  await Promise.resolve();
  assert.equal(dialogs.length, 0);
  assert.equal(setupData.attackerActions.current, 1);

  startWeaponAttack({ actor: setupData.actor, item: setupData.main });
  await Promise.resolve();
  assert.equal(dialogs.length, 1);
});

test("defesa bem-sucedida impede o deslocamento de Puxar e zera Sequencial", async () => {
  const setupData = setup({
    targetX: 500,
    targetReserved: 1,
    attackResults: [50, 1],
    mainSpecial: { puxar: { enabled: true, spaces: 2 }, sequencial: { enabled: true, damageFormula: "+1", damagePartIndex: 0 } }
  });
  setupData.flags.weaponCombat = { sequences: { [setupData.actor.id]: { weaponId: setupData.main.id, streak: 4 } } };

  startWeaponAttack({ actor: setupData.actor, item: setupData.main, attackMode: "pull" });
  await Promise.resolve();
  const attackRoll = rollDialog(dialogs[0]);
  await new Promise((resolve) => setImmediate(resolve));
  await dialogs[1].options.submit("dodge");
  await rollDialog(dialogs[2]);
  await attackRoll;
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(setupData.lastMoveOptions, null);
  assert.equal(setupData.flags.weaponCombat.sequences[setupData.actor.id].streak, 0);
});

test("ataque combinado permite Puxar na principal e mantém ataque normal na secundária", async () => {
  const setupData = setup({
    targetX: 500,
    attackResults: [50, 50],
    mainSpecial: { puxar: { enabled: true, spaces: 2 }, sequencial: { enabled: true, damageFormula: "+1", damagePartIndex: 0 } }
  });
  const combined = startCombinedWeaponAttack({ actor: setupData.actor });
  await Promise.resolve();
  assert.equal(dialogWaits.length, 1);
  dialogWaits[0].resolve("pull");
  await Promise.resolve();
  assert.equal(dialogs.length, 1);
  await rollDialog(dialogs[0]);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(dialogs.length, 2);
  await rollDialog(dialogs[1]);
  const result = await combined;

  assert.equal(result.status, "completed");
  assert.equal(setupData.attackerActions.current, 0);
  assert.equal(setupData.targetToken.document.x, 300);
  assert.equal(damageCards.length, 1);
  assert.equal(setupData.flags.weaponCombat.sequences[setupData.actor.id].streak, 1);
});
