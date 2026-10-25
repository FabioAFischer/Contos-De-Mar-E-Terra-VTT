import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const template = fs.readFileSync(new URL("../templates/actor/personagem-sheet.hbs", import.meta.url), "utf8");
const sheet = fs.readFileSync(new URL("../module/sheets/actor/personagem-sheet.mjs", import.meta.url), "utf8");
const noris = fs.readFileSync(new URL("../module/services/ability-da-noris-service.mjs", import.meta.url), "utf8");
const daConfig = fs.readFileSync(new URL("../module/config/ability-da-config.mjs", import.meta.url), "utf8");
const styles = fs.readFileSync(new URL("../styles/contos-de-mar-e-terra.css", import.meta.url), "utf8");

test("o template da PersonagemSheet mantém a estrutura essencial de renderização", () => {
  for (const selector of [
    'class="cmet-sheet__header"',
    'class="cmet-resource-bar',
    'class="cmet-tabs"',
    'class="cmet-sheet__body"',
    'data-tab-content="atributos"',
    'data-tab-content="equipamentos"',
    'data-tab-content="habilidades"',
    'data-tab-content="magias"',
    'data-tab-content="biografia"'
  ]) {
    assert.match(template, new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `ausente: ${selector}`);
  }

  assert.match(template, /<section data-tab-content="atributos" class="cmet-tab-content">/);
  assert.match(template, /<section data-tab-content="equipamentos" class="cmet-tab-content" hidden>/);
  assert.match(template, /<section data-tab-content="habilidades" class="cmet-tab-content" hidden>/);
  assert.match(template, /<section data-tab-content="magias" class="cmet-tab-content" hidden>/);
  assert.match(template, /<section data-tab-content="biografia" class="cmet-tab-content" hidden>/);
});

test("o contexto preserva habilidades unificadas e Frenesi opcional", () => {
  assert.match(sheet, /habilidades: \[\.\.\.groupedItems\.habilidades, \.\.\.habilidadesDa\]/);
  assert.match(sheet, /frenzy: \(\(\) => \{/);
  assert.match(sheet, /visible: hasFrenzy/);
  assert.match(sheet, /resource\?\.current/);
  assert.match(sheet, /system\.characteristics\?\.alcance \?\? \{ enabled: false, spaces: 0 \}/);
  assert.match(sheet, /system\.characteristics\?\.\[key\]\?\.enabled === true/);
  assert.match(noris, /export const NORIS_FRENZY_MAX = 50/);
  assert.match(daConfig, /export const DA_EXECUTABLE_OPERATION_TYPES = Object\.freeze\(new Set\(/);
});

test("o CSS mantém o contrato de dimensão e rolagem da ficha", () => {
  assert.match(styles, /\.application\.cmet-actor-sheet \.window-content[\s\S]*?background:/);
  assert.match(styles, /\.application\.cmet-actor-sheet\s*\{[\s\S]*?height: 100%/);
  assert.doesNotMatch(styles, /\.application\.cmet-actor-sheet > form/);
  assert.match(styles, /\.application\.cmet-actor-sheet \.cmet-sheet__body[\s\S]*?min-height: 0[\s\S]*?overflow: hidden/);
  assert.match(styles, /\.application\.cmet-actor-sheet \.cmet-tab-content[\s\S]*?overflow-y: auto/);
});
