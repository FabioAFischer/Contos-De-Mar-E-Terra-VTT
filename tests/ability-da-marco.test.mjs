import test from "node:test";
import assert from "node:assert/strict";
import { activateManifestation, activateProfaneConversion, actorKey, calculateMarcoConversion, calculateMarcoLifeAfterSacrifice, calculateMarcoLifeLoss, calculateMarcoRecovery, getManifestationStatus, isMarcoAuraInRange, isMarcoDeathEventDuplicate, recordMarcoLifeLoss, registerMarcoAbilityHooks } from "../module/services/ability-da-marco-service.mjs";

globalThis.foundry = { utils: { deepClone: (value) => structuredClone(value) } };

test("Conversão Profana oferece somente 2, 4, 6 e 8 PV", () => {
  assert.deepEqual([2, 4, 6, 8].map(calculateMarcoConversion).map(({ mana }) => mana), [1, 2, 3, 4]);
  assert.equal(calculateMarcoConversion(10).valid, false);
});

test("Conversão Profana pode reduzir a Vida exatamente a zero", () => {
  const result = calculateMarcoLifeAfterSacrifice(8, 8);
  assert.equal(result.valid, true);
  assert.equal(result.lifeAfter, 0);
  assert.equal(result.mana, 4);
  assert.equal(calculateMarcoLifeAfterSacrifice(7, 8).valid, false);
});

test("cada redução efetiva de Vida é calculada uma única vez e a cura não conta", () => {
  assert.equal(calculateMarcoLifeLoss(90, 82), 8);
  assert.equal(calculateMarcoLifeLoss(82, 80), 2);
  assert.equal(calculateMarcoLifeLoss(80, 84), 0);
  assert.equal(calculateMarcoLifeLoss(80, 80), 0);
});

test("sacrifício e dano acumulam no mesmo estado de combate, inclusive para Actor de token", async () => {
  const state = { actors: {} };
  const combat = {
    started: true,
    getFlag: () => state,
    setFlag: async (_system, _flag, next) => Object.assign(state, next)
  };
  globalThis.game = { combat };
  const actor = { uuid: "Actor[marco]", id: "marco" };
  await recordMarcoLifeLoss(actor, 8, { reason: "profaneConversion" });
  await recordMarcoLifeLoss(actor, 2, { reason: "damage" });
  assert.equal(state.actors[actorKey(actor)].lifeLost, 10);
  assert.equal(calculateMarcoLifeLoss(82, 86), 0);
  assert.equal(state.actors[actorKey(actor)].lifeLost, 10);

  const tokenActor = { isToken: true, uuid: "Actor[token]", id: "token-actor" };
  const token = { actor: tokenActor, document: { uuid: "Scene.scene.Token.token" } };
  globalThis.canvas = { tokens: { placeables: [token] } };
  await recordMarcoLifeLoss(tokenActor, 8, { combat, reason: "damage" });
  assert.equal(state.actors[actorKey(tokenActor)].lifeLost, 8);
});

test("migra estado legado aninhado e usa chaves canônicas sem pontos", async () => {
  const state = {
    actors: {
      Actor: {
        "g6QgXEjshZMHDrKN": { lifeLost: 8, manifestationsUsed: 0, deathEvents: ["death-1"] }
      }
    }
  };
  const combat = {
    id: "combat-migration",
    started: true,
    getFlag: () => state,
    setFlag: async (_system, _flag, next) => Object.assign(state, next)
  };
  const actor = { id: "g6QgXEjshZMHDrKN", uuid: "Actor.g6QgXEjshZMHDrKN" };
  globalThis.game = { combat };
  assert.equal(actorKey(actor), "actor-g6QgXEjshZMHDrKN");
  assert.equal(getManifestationStatus(actor).lifeLost, 8);
  await recordMarcoLifeLoss(actor, 2, { reason: "damage" });
  assert.equal(state.actors[actorKey(actor)].lifeLost, 10);
  assert.deepEqual(state.actors[actorKey(actor)].deathEvents, ["death-1"]);
  assert.equal(state.actors.Actor, undefined);
  assert.equal(state.actors["Actor.g6QgXEjshZMHDrKN"], undefined);
  assert.equal(Object.keys(state.actors).some((key) => key.includes(".")), false);
});

test("distingue token vinculado de token não vinculado sem usar UUID pontuado", () => {
  const linkedActor = { isToken: true, id: "actor-linked", uuid: "Actor.actor-linked" };
  const unlinkedActor = { isToken: true, id: "actor-synthetic", uuid: "Actor.actor-synthetic" };
  globalThis.canvas = { tokens: { placeables: [
    { actor: linkedActor, document: { id: "token-linked", actorLink: true, parent: { id: "scene" } } },
    { actor: unlinkedActor, document: { id: "token-unlinked", actorLink: false, parent: { id: "scene" } } }
  ] } };
  assert.equal(actorKey(linkedActor), "actor-actor-linked");
  assert.equal(actorKey(unlinkedActor), "token-scene-token-unlinked");
});

test("serializa perdas concorrentes sem sobrescrever incrementos", async () => {
  const state = { actors: {} };
  const combat = {
    id: "combat-concurrent",
    started: true,
    getFlag: () => state,
    setFlag: async (_system, _flag, next) => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      Object.assign(state, next);
    }
  };
  const actor = { id: "concurrent", uuid: "Actor.concurrent" };
  await Promise.all([
    recordMarcoLifeLoss(actor, 2, { combat, reason: "damage" }),
    recordMarcoLifeLoss(actor, 8, { combat, reason: "damage" })
  ]);
  assert.equal(state.actors[actorKey(actor)].lifeLost, 10);
});

test("hooks de Actor e Token contabilizam a redução real sem duplicar a mesma atualização", async () => {
  const handlers = new Map();
  globalThis.Hooks = { on: (name, callback) => handlers.set(name, callback) };
  const state = { actors: {} };
  const combat = {
    id: "combat-hook",
    started: true,
    combatants: [],
    getFlag: () => state,
    setFlag: async (_system, _flag, next) => Object.assign(state, next)
  };
  globalThis.game = { combat, system: { id: "contos-de-mar-e-terra" }, i18n: { localize: (key) => key } };
  globalThis.canvas = { tokens: { placeables: [] } };
  globalThis.foundry.applications = { api: { DialogV2: { wait: async () => 2 } } };
  registerMarcoAbilityHooks();

  const actor = {
    uuid: "Actor[hook]",
    id: "hook",
    system: {
      attributes: { magia: { value: 32 }, mental: { value: 0 } },
      actions: { max: 1 },
      resources: { vida: { value: 40 }, mana: { value: 41 } }
    },
    flags: {},
    getFlag(_system, key) { return this.flags[key] ?? null; },
    async setFlag(_system, key, value) { this.flags[key] = value; },
    async update(changes, options = {}) {
      const nestedChanges = { system: { resources: { vida: { value: changes["system.resources.vida.value"] }, mana: { value: changes["system.resources.mana.value"] } } } };
      handlers.get("preUpdateActor")(this, nestedChanges, options);
      if (changes["system.resources.vida.value"] !== undefined) this.system.resources.vida.value = changes["system.resources.vida.value"];
      if (changes["system.resources.mana.value"] !== undefined) this.system.resources.mana.value = changes["system.resources.mana.value"];
      await handlers.get("updateActor")(this, nestedChanges, options);
    }
  };
  const actionState = { current: 1, reserved: 0 };
  const combatant = {
    id: "combatant-hook",
    actor,
    getFlag: () => actionState,
    async setFlag(_system, _flag, next) { Object.assign(actionState, next); }
  };
  combat.combatants.push(combatant);
  combat.combatant = combatant;

  const conversion = await activateProfaneConversion(actor);
  assert.equal(conversion.valid, true);
  assert.equal(actor.system.resources.vida.value, 38);
  assert.equal(actor.system.resources.mana.value, 42);
  assert.equal(state.actors[actorKey(actor)].lifeLost, 2);
  assert.equal(state.actors[actorKey(actor)].lastReason, "profaneConversion");

  await actor.update({ "system.resources.vida.value": 36 });
  assert.equal(state.actors[actorKey(actor)].lifeLost, 4);
  await handlers.get("updateActor")(actor);
  assert.equal(state.actors[actorKey(actor)].lifeLost, 4);
  await recordMarcoLifeLoss(actor, 6, { reason: "damage" });
  assert.equal(getManifestationStatus(actor).available, 1);
  actionState.current = 1;
  const manifestation = await activateManifestation(actor, { id: "manifestation-de-hel", costs: [{ type: "actions", amount: 1, timing: "activation" }] }, { uuid: "Item.manifestation-de-hel" }, {
    originToken: { document: { id: "token-hook", parent: { id: "scene" } } }
  });
  assert.equal(manifestation.valid, true);
  assert.equal(manifestation.aura.radius, 4);

  const tokenActor = { isToken: true, uuid: "Actor[token-hook]", id: "token-hook", system: { resources: { vida: { value: 90 } } } };
  const token = { actor: tokenActor, document: { uuid: "Scene.scene.Token.token-hook" } };
  globalThis.canvas.tokens.placeables = [token];
  handlers.get("preUpdateToken")(token, { "delta.system.resources.vida.value": 80 });
  tokenActor.system.resources.vida.value = 80;
  await handlers.get("updateToken")(token);
  assert.equal(state.actors[actorKey(tokenActor)].lifeLost, 10);
});

test("Manifestação de Hel libera um patamar por cada dez PV perdidos", () => {
  assert.deepEqual(getManifestationStatus({ uuid: "Marco" }, { started: true, getFlag: () => ({ actors: { Marco: { lifeLost: 9, manifestationsUsed: 0 } } }) }), { lifeLost: 9, manifestationsUsed: 0, reached: 0, available: 0 });
  assert.deepEqual(getManifestationStatus({ uuid: "Marco" }, { started: true, getFlag: () => ({ actors: { Marco: { lifeLost: 20, manifestationsUsed: 1 } } }) }), { lifeLost: 20, manifestationsUsed: 1, reached: 2, available: 1 });
});

test("Filho de Hel recupera no máximo dois pontos e deduplica uma morte confirmada", () => {
  assert.deepEqual(calculateMarcoRecovery(9, 10, 2), { valid: true, value: 10, recovered: 1 });
  assert.deepEqual(calculateMarcoRecovery(3, 10, 2), { valid: true, value: 5, recovered: 2 });
  assert.equal(isMarcoDeathEventDuplicate(["death-1"], "death-1"), true);
  assert.equal(isMarcoDeathEventDuplicate(["death-1"], "death-2"), false);
});

test("a aura de Hel usa raio de quatro espaços sem alterar valores persistidos de perícia", () => {
  assert.equal(isMarcoAuraInRange(4, 4), true);
  assert.equal(isMarcoAuraInRange(4.1, 4), false);
  assert.equal(isMarcoAuraInRange(0, 4), true);
});
