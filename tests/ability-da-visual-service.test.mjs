import test from "node:test";
import assert from "node:assert/strict";
import { getMarcoAuraRadiusPixels, getMarcoAuraVisualKey } from "../module/services/ability-da-visual-service.mjs";

test("a aura visual usa quatro espaços do grid como raio em pixels", () => {
  assert.equal(getMarcoAuraRadiusPixels(100, 4), 400);
  assert.equal(getMarcoAuraRadiusPixels(70, 4), 280);
});

test("a identificação visual distingue token e manifestação", () => {
  const token = { document: { id: "token-marco", uuid: "Scene.scene.Token.token-marco" } };
  assert.equal(getMarcoAuraVisualKey(token, { source: "marco-manifestacao-de-hel-aura" }), "Scene.scene.Token.token-marco:marco-manifestacao-de-hel-aura");
});
