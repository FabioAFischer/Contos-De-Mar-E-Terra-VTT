import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const templatePath = new URL("../templates/actor/npc-sheet.hbs", import.meta.url);
const sheetPath = new URL("../module/sheets/actor/npc-sheet.mjs", import.meta.url);
const cssPath = new URL("../styles/contos-de-mar-e-terra.css", import.meta.url);
const abilityDaServicePath = new URL("../module/services/ability-da-service.mjs", import.meta.url);

test("NPC sheet keeps the ApplicationV2 tab contract", async () => {
  const template = await readFile(templatePath, "utf8");
  const sheet = await readFile(sheetPath, "utf8");
  const tabs = ["status", "atributos", "equipamentos", "habilidades", "magias", "descricao"];

  assert.match(template, /class="cmet-tabs tabs" data-group="primary"/);
  assert.match(sheet, /static TABS/);
  assert.match(sheet, /changeTab\(button\.dataset\.tab, "primary"/);
  for (const tab of tabs) {
    assert.match(template, new RegExp(`data-tab="${tab}"`));
    assert.match(template, new RegExp(`tabs\\.${tab}\\.cssClass`));
  }
  assert.doesNotMatch(template, /data-tab="(?:status|atributos|equipamentos|habilidades|magias|descricao)" hidden/);
});

test("NPC layout reserves six tab columns without changing the character selector", async () => {
  const css = await readFile(cssPath, "utf8");
  assert.match(css, /\.application\.cmet-npc-sheet \.cmet-tabs \{ grid-template-columns: repeat\(6/);
  assert.doesNotMatch(css, /\.application\.cmet-actor-sheet \.cmet-tabs \{[^}]*repeat\(6/);
});

test("NPC keeps combat resources outside the tab content", async () => {
  const template = await readFile(templatePath, "utf8");
  const resourceBarIndex = template.indexOf('<section class="cmet-resource-bar cmet-npc-resource-bar">');
  const firstTabIndex = template.indexOf('<section class="tab cmet-tab-content');

  assert.notEqual(resourceBarIndex, -1);
  assert.ok(resourceBarIndex < firstTabIndex);
  for (const path of [
    "system.resources.vida.value",
    "system.resources.vida.max",
    "system.resources.mana.value",
    "system.resources.mana.max",
    "system.resources.sanidade.value",
    "system.resources.sanidade.max",
    "system.movement.normal",
    "system.actions.max"
  ]) assert.equal((template.match(new RegExp(`name="${path.replaceAll(".", "\\.")}"`, "g")) ?? []).length, 1);
  assert.doesNotMatch(template.slice(firstTabIndex), /system\.resources\.(vida|mana|sanidade)\.(value|max)/);
  assert.doesNotMatch(template.slice(firstTabIndex), /system\.(movement\.normal|actions\.max)/);
});

test("NPC identification uses the canonical creature size field", async () => {
  const template = await readFile(templatePath, "utf8");
  const dataModel = await readFile(new URL("../module/data-models/actor/npc-data.mjs", import.meta.url), "utf8");
  const sizeConfig = await readFile(new URL("../module/config/creature-size-config.mjs", import.meta.url), "utf8");

  assert.match(template, /name="system\.size"/);
  assert.doesNotMatch(template, /name="system\.classification\.size"/);
  assert.match(dataModel, /size: new StringField\(\{ initial: "medio"/);
  assert.match(dataModel, /data\.classification\?\.size/);
  for (const key of ["miudo", "pequeno", "medio", "grande", "enorme", "colossal"]) assert.match(sizeConfig, new RegExp(`key: "${key}"`));
});

test("NPC ability rows expose the shared DA execution actions", async () => {
  const template = await readFile(templatePath, "utf8");
  const sheet = await readFile(sheetPath, "utf8");

  assert.match(sheet, /getAbilityDaEffects/);
  assert.match(sheet, /activateAbilityDaEffect/);
  assert.match(sheet, /activateNorisAbilityAction/);
  assert.match(sheet, /toggleAbilityDaEffect/);
  assert.match(sheet, /rollItemSkill/);
  assert.match(template, /data-action="activate-da-effect"/);
  assert.match(template, /data-action="execute-da-operation"/);
  assert.match(template, /\{\{#each effects\}\}/);
});

test("shared DA execution resolves NPC tests and manual resource maxima", async () => {
  const service = await readFile(abilityDaServicePath, "utf8");

  assert.match(service, /resolveActorTestValue/);
  assert.match(service, /isNpc\(actor\)/);
  assert.match(service, /actor\?\.system\?\.resources\?\[resourceKey\]\?\.max/);
  assert.match(service, /getResourceMaximum\(actor, resourceKey\)/);
});
