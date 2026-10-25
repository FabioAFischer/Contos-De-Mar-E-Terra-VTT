import test from "node:test";
import assert from "node:assert/strict";
import { damageTypeFromD6, rewriteSpellDamageType, calculateManaSiphonTransfer, nextTrickModifier, recordDraummaAttackHit, getDraummaHitSkills, draummaActorKey, activateDraummaTrick, getDraummaSkillModifier, getDraummaModifierSources } from "../module/services/ability-da-draumma-service.mjs";
import { activateAbilityDaEffect } from "../module/services/ability-da-service.mjs";
import { rollSkill, sendSkillRollToChat } from "../module/services/skill-roll-service.mjs";

test("Ás na Manga mapeia todos os resultados e preserva a magia original", () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(damageTypeFromD6), ["fogo", "frio", "raio", "veneno", "radiante", "necrotico"]);
  const spell = { name: "Raio", system: { damage: [{ formula: "2d6", type: "fogo", other: "preservado" }], damageType: "fogo", manaCost: 8 } };
  const result = rewriteSpellDamageType(spell, "necrotico");
  assert.equal(spell.system.damage[0].type, "fogo");
  assert.equal(result.spell.system.damage[0].formula, "2d6");
  assert.equal(result.spell.system.damage[0].type, "necrotico");
  assert.equal(result.spell.system.manaCost, 8);
});

test("Sifão de Mana limita o roubo pela Mana do alvo e pelo máximo de Draumma", () => {
  assert.deepEqual(calculateManaSiphonTransfer({ targetMana: 3, draummaMana: 9, draummaMaxMana: 10, rolled: 6 }), { amount: 1, targetMana: 2, draummaMana: 10 });
  assert.deepEqual(calculateManaSiphonTransfer({ targetMana: 8, draummaMana: 0, draummaMaxMana: 20, rolled: 4 }), { amount: 4, targetMana: 4, draummaMana: 4 });
});

test("Truque de Mestre substitui o modificador anterior", () => {
  assert.deepEqual(nextTrickModifier({ skillKey: "espadas", amount: 8 }, "armasDeHaste", 5), { source: "draumma-truque-de-mestre", skillKey: "armasDeHaste", amount: 5, dice: [], active: true });
});

test("registro de acerto pertence ao atacante, não ao defensor", async () => {
  globalThis.game = { system: { id: "contos-de-mar-e-terra" } };
  const flags = {};
  const combat = {
    id: "combat-varkin-tyra",
    round: 8,
    turn: 0,
    getFlag: (_scope, key) => flags[key],
    async setFlag(_scope, key, value) { flags[key] = structuredClone(value); }
  };
  const varkinToken = { id: "lFrd1BpxlQI0grCp", actorLink: false, parent: { id: "W9lGH8637Zf9Fovw" } };
  const tyraToken = { id: "NWP0GUFgsejuMLEb", actorLink: false, parent: { id: "W9lGH8637Zf9Fovw" } };
  const varkin = { id: "varkin", isToken: true, token: { document: varkinToken } };
  const tyra = { id: "tyra", isToken: true, token: { document: tyraToken } };
  await recordDraummaAttackHit(combat, varkin, "arcos");
  assert.deepEqual(getDraummaHitSkills(combat, varkin), ["arcos"]);
  assert.deepEqual(getDraummaHitSkills(combat, tyra), []);
  assert.equal(draummaActorKey(varkin), "token-W9lGH8637Zf9Fovw-lFrd1BpxlQI0grCp");
  assert.equal(draummaActorKey(tyra), "token-W9lGH8637Zf9Fovw-NWP0GUFgsejuMLEb");
});

test("acerto reativo do mesmo atacante acumula a perícia no turno correto", async () => {
  globalThis.game = { system: { id: "contos-de-mar-e-terra" } };
  const flags = {};
  const combat = { id: "combat-reactive", round: 8, turn: 1, getFlag: (_scope, key) => flags[key], async setFlag(_scope, key, value) { flags[key] = structuredClone(value); } };
  const actor = { id: "varkin", token: { document: { id: "varkin-token", actorLink: true, parent: { id: "scene" } } } };
  await recordDraummaAttackHit(combat, actor, "arcos");
  await recordDraummaAttackHit(combat, actor, "espadas");
  assert.deepEqual(getDraummaHitSkills(combat, actor).sort(), ["arcos", "espadas"]);
  combat.round = 9;
  combat.turn = 0;
  assert.deepEqual(getDraummaHitSkills(combat, actor), []);
});

test("ativação completa de Truque de Mestre consome uma ação e persiste o bônus real", async () => {
  const flags = {};
  const tyra = {
    id: "tyra",
    name: "Tyra",
    system: { actions: { max: 5 }, attributes: { combate: { skills: { arcos: 40 } } } },
    getFlag: (_scope, key) => flags[key],
    async setFlag(_scope, key, value) { flags[key] = structuredClone(value); }
  };
  const varkin = { id: "varkin", name: "Varkin", token: { document: { id: "varkin-token", actorLink: true, parent: { id: "scene" } } } };
  const actionState = { current: 5, reserved: 0, turnKey: null };
  const combatant = { id: "combatant-tyra", actor: tyra, getFlag: (_scope, key) => key === "actions" ? actionState : undefined, async setFlag(_scope, key, value) { if (key === "actions") Object.assign(actionState, value); } };
  const combat = { id: "combat-trick", round: 10, turn: 1, started: true, combatants: { find: (predicate) => predicate(combatant) ? combatant : null }, getFlag: (_scope, key) => flags[key], async setFlag(_scope, key, value) { flags[key] = structuredClone(value); } };
  globalThis.game = { system: { id: "contos-de-mar-e-terra" }, combat };
  combat.turn = 0;
  await recordDraummaAttackHit(combat, varkin, "arcos");
  combat.turn = 1;
  const result = await activateDraummaTrick({ actor: tyra, targetActor: varkin, combat, roll2d6: () => ({ total: 8, dice: [{ faces: 6, results: [{ result: 3 }, { result: 5 }] }] }) });
  assert.equal(result.valid, true);
  assert.equal(actionState.current, 4);
  assert.equal(flags.draummaDa.modifiers["actor-tyra"].skillKey, "arcos");
  assert.equal(getDraummaSkillModifier(tyra, "arcos"), 8);
  assert.deepEqual(flags.daModifiers.find((entry) => entry.source === "draumma-truque-de-mestre").dice, [3, 5]);
  assert.equal(getDraummaSkillModifier(tyra, "espadas"), 0);
});

test("ativação inválida não consome ação nem cria modificador", async () => {
  const flags = {};
  const tyra = { id: "tyra-invalid", system: { actions: { max: 5 } }, getFlag: (_scope, key) => flags[key], async setFlag(_scope, key, value) { flags[key] = structuredClone(value); } };
  const varkin = { id: "varkin-invalid" };
  const actionState = { current: 5, reserved: 0, turnKey: null };
  const combatant = { id: "combatant-invalid", actor: tyra, getFlag: (_scope, key) => key === "actions" ? actionState : undefined, async setFlag(_scope, key, value) { Object.assign(actionState, value); } };
  const combat = { id: "combat-invalid", round: 1, turn: 1, started: true, combatants: { find: (predicate) => predicate(combatant) ? combatant : null }, getFlag: () => ({ hits: {}, modifiers: {} }), setFlag: async () => {} };
  globalThis.game = { system: { id: "contos-de-mar-e-terra" }, combat };
  const result = await activateDraummaTrick({ actor: tyra, targetActor: varkin, combat, roll2d6: () => 8 });
  assert.deepEqual(result, { valid: false, reason: "targetDidNotHit" });
  assert.equal(actionState.current, 5);
});

test("rolagem beneficiada exibe os mesmos dados 2d6 usados no modificador, sem duplicar mensagem", async () => {
  const flags = { daModifiers: [{ source: "draumma-truque-de-mestre", skillKey: "arcos", amount: 9, dice: [4, 5], active: true }] };
  const actor = { id: "tyra-chat", name: "Tyra", system: { attributes: { combate: { skills: { arcos: 55 } } } }, getFlag: (_scope, key) => flags[key] };
  class FakeD100Roll {
    constructor(formula) { this.formula = formula; this.total = 42; this.dice = [{ results: [{ result: 42, active: true }] }]; }
    async evaluate() { return this; }
    async toMessage(data) { return { ...data, roll: this }; }
  }
  let renderedContext;
  let createdMessages = 0;
  globalThis.game = { system: { id: "contos-de-mar-e-terra" }, i18n: { localize: (key) => key } };
  globalThis.foundry = { applications: { handlebars: { renderTemplate: async (_path, context) => { renderedContext = context; return "<article>card</article>"; } } } };
  globalThis.ChatMessage = { getSpeaker: () => ({}), async create(data) { createdMessages += 1; return data; } };
  const result = await rollSkill({ actor, skillKey: "arcos", modifier: getDraummaSkillModifier(actor, "arcos"), context: { modifierSources: getDraummaModifierSources(actor, "arcos") }, rollClass: FakeD100Roll });
  assert.equal(result.selectedRoll, 42);
  assert.equal(result.effectiveTarget, 64);
  await sendSkillRollToChat(result, { actor });
  assert.deepEqual(renderedContext.modifierSources, [{ source: "CMET.AbilityDa.Draumma.MasterTrick", formula: "2d6", dice: [4, 5], amount: 9 }]);
  assert.equal(renderedContext.modifier, "+9");
  assert.equal(createdMessages, 1);
});

test("fluxo completo da ficha despacha Truque de Mestre, resolve alvo e publica confirmação", async () => {
  const flags = {};
  const messages = [];
  let renderedPath = "";
  let renderedContext = null;
  const tyra = { id: "tyra-flow", name: "Tyra", system: { actions: { max: 5 } }, getFlag: (_scope, key) => flags[key], async setFlag(_scope, key, value) { flags[key] = structuredClone(value); } };
  const varkin = { id: "varkin-flow", name: "Varkin", token: { document: { id: "varkin-flow-token", actorLink: true, parent: { id: "scene" } } } };
  const varkinToken = { id: "varkin-flow-token", actor: varkin, document: varkin.token.document };
  const actions = { current: 5, reserved: 0, turnKey: null };
  const combatant = { id: "combatant-flow", actor: tyra, getFlag: (_scope, key) => key === "actions" ? actions : undefined, async setFlag(_scope, key, value) { Object.assign(actions, value); } };
  const combat = { id: "combat-flow", round: 10, turn: 1, started: true, combatants: { find: (predicate) => predicate(combatant) ? combatant : null }, getFlag: (_scope, key) => flags[key], async setFlag(_scope, key, value) { flags[key] = structuredClone(value); } };
  const item = { id: "trick-item", uuid: "Item.trick-item", name: "Truque de Mestre", type: "habilidadeDa", system: { effects: [{ id: "draumma-truque", name: "Observar um ataque", activationType: "ativa", enabled: true, targets: { relation: "enemy", count: 1, requiresSelection: true, manualConfirmation: true }, operations: [{ type: "draummaMasterTrick" }] }] } };
  globalThis.game = { system: { id: "contos-de-mar-e-terra" }, combat, user: { targets: new Set([varkinToken]) }, i18n: { localize: (key) => key, format: (key) => key } };
  const bonusRoll = { total: 8, dice: [{ faces: 6, results: [{ result: 3 }, { result: 5 }] }], async toMessage(data, options) { return { ...data, roll: this, options }; } };
  globalThis.foundry = {
    utils: { deepClone: structuredClone, randomID: () => "random", escapeHTML: (value) => String(value) },
    applications: {
      api: { DialogV2: { wait: async () => true } },
      handlebars: { renderTemplate: async (path, context) => { renderedPath = path; renderedContext = context; return `<article class="cmet-roll-card">${context.skillLabel} [${context.dice.join(", ")}] +${context.amount}</article>`; } }
    }
  };
  globalThis.ChatMessage = { getSpeaker: () => ({}), async create(data) { messages.push(data); return data; } };
  globalThis.ui = { notifications: { warn: () => {} } };
  combat.turn = 0;
  await recordDraummaAttackHit(combat, varkin, "arcos");
  combat.turn = 1;
  const result = await activateAbilityDaEffect({ actor: tyra, item, effectId: "draumma-truque", context: { roll2d6: () => bonusRoll } });
  assert.equal(result.valid, true);
  assert.equal(actions.current, 4);
  assert.equal(getDraummaSkillModifier(tyra, "arcos"), 8);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].roll, bonusRoll);
  assert.equal(messages[0].options.create, false);
  assert.equal(renderedPath, "systems/contos-de-mar-e-terra/templates/chat/ability-da-bonus-roll-card.hbs");
  assert.deepEqual(renderedContext.dice, [3, 5]);
  assert.equal(renderedContext.amount, 8);
  assert.match(messages[0].content, /Arcos/);
  assert.match(messages[0].content, /cmet-roll-card/);
});
