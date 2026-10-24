import test from "node:test";
import assert from "node:assert/strict";

import { createItemHotbarCommand, getItemHotbarAction, getItemHotbarActions, registerItemHotbarHook } from "../module/services/item-hotbar-service.mjs";

test("atalhos classificam armas, itens roláveis e itens sem ação", () => {
  const weapon = { type: "arma", system: { combatSkill: "espadas", loaded: true, thrown: false, characteristics: {} } };
  assert.equal(getItemHotbarAction(weapon), "menu");
  assert.deepEqual(getItemHotbarActions(weapon).map(({ key }) => key), ["attack", "skill"]);
  assert.equal(getItemHotbarAction({ type: "equipamento", system: {} }), "menu");
  assert.equal(getItemHotbarAction({ type: "armadura", system: {} }), "menu");
});

test("comando da hotbar usa UUIDs serializados, sem inserir nomes como código", () => {
  const command = createItemHotbarCommand({
    actorUuid: 'Actor.1"; malicious()',
    itemUuid: "Actor.1.Item.2",
    action: "attack"
  });
  assert.match(command, /^game\.system\.api\?\.executeItemHotbarAction\?\./);
  assert.match(command, /Actor\.1\\"; malicious\(\)/);
  assert.doesNotMatch(command, /game\.system\.api.*malicious\(\)\s*;/);
});

test("hook do Foundry retorna síncrono e persiste a macro CMET no slot", async () => {
  let callback;
  let createdMacro;
  const actor = { uuid: "Actor.1", documentName: "Actor", testUserPermission: () => true };
  const item = {
    uuid: "Actor.1.Item.2",
    id: "2",
    name: "Florete",
    img: "florete.webp",
    type: "arma",
    parent: actor,
    system: { combatSkill: "espadas", loaded: true, thrown: false, characteristics: {} }
  };
  globalThis.fromUuidSync = () => item;
  globalThis.Hooks = { on: (name, handler) => { if (name === "hotbarDrop") callback = handler; } };
  globalThis.game = {
    user: { hotbar: {}, assignHotbarMacro: async (macro, slot) => { globalThis.game.user.hotbar[slot] = macro.id; } },
    macros: { contents: [], get: (id) => (createdMacro?.id === id ? createdMacro : null) },
    i18n: { localize: (key) => key, format: (key) => key }
  };
  globalThis.ui = { notifications: { warn() {}, error() {} } };
  globalThis.Macro = { create: async (data) => {
    createdMacro = {
      ...data,
      id: "Macro.1",
      getFlag: () => data.flags["contos-de-mar-e-terra"].itemHotbar
    };
    globalThis.game.macros.contents.push(createdMacro);
    return createdMacro;
  } };
  registerItemHotbarHook();
  assert.equal(callback({}, { type: "Actor", uuid: "Actor.1" }, 1), true);
  assert.equal(callback({}, { type: "Item", uuid: item.uuid }, 3), false);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(createdMacro.type, "script");
  assert.equal(globalThis.game.macros.get("Macro.1"), createdMacro);
  assert.equal(globalThis.game.user.hotbar[3], "Macro.1");
});
