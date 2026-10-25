const SYSTEM_ID = "contos-de-mar-e-terra";
const AURA_FLAG = "marcoAuras";
const AURA_RADIUS = 4;
const auraGraphics = new Map();
let hooksRegistered = false;

function tokenId(token) {
  return token?.document?.id ?? token?.id ?? null;
}

function tokenUuid(token) {
  return token?.document?.uuid ?? token?.uuid ?? null;
}

function sceneId(token) {
  return token?.document?.parent?.id ?? token?.scene?.id ?? globalThis.canvas?.scene?.id ?? null;
}

export function getMarcoAuraVisualKey(token, aura) {
  return `${tokenUuid(token) ?? tokenId(token) ?? "token"}:${aura?.source ?? "aura"}`;
}

export function getMarcoAuraRadiusPixels(gridSize, radius = AURA_RADIUS) {
  const size = Number(gridSize);
  const spaces = Number(radius);
  return Number.isFinite(size) && size > 0 && Number.isFinite(spaces) && spaces >= 0 ? size * spaces : 0;
}

function tokenMatchesAura(token, actor, aura) {
  const expectedTokenId = aura?.tokenId;
  const expectedSceneId = aura?.sceneId;
  if (expectedSceneId && sceneId(token) !== expectedSceneId) return false;
  if (expectedTokenId) return tokenId(token) === expectedTokenId;
  return token?.actor?.uuid === actor?.uuid || token?.actor?.id === actor?.id;
}

function findAuraToken(actor, aura) {
  return [...(globalThis.canvas?.tokens?.placeables ?? [])].find((token) => tokenMatchesAura(token, actor, aura)) ?? null;
}

function destroyGraphic(graphic) {
  graphic?.parent?.removeChild?.(graphic);
  graphic?.destroy?.();
}

function drawAuraGraphic(graphic, token, aura) {
  const radius = getMarcoAuraRadiusPixels(globalThis.canvas?.grid?.size, aura?.radius ?? AURA_RADIUS);
  if (!radius) return false;
  const center = token.center ?? { x: Number(token.x) || 0, y: Number(token.y) || 0 };
  graphic.position.set(center.x, center.y);
  graphic.clear?.();
  if (typeof graphic.circle === "function" && typeof graphic.fill === "function" && typeof graphic.stroke === "function") {
    graphic.circle(0, 0, radius).fill({ color: 0x321044, alpha: 0.2 }).stroke({ color: 0xd2a5ff, width: 3, alpha: 0.78 });
  } else {
    graphic.beginFill?.(0x321044, 0.2);
    graphic.lineStyle?.(3, 0xd2a5ff, 0.78);
    graphic.drawCircle?.(0, 0, radius);
    graphic.endFill?.();
  }
  graphic.eventMode = "none";
  graphic.interactive = false;
  graphic.zIndex = 0;
  return true;
}

function createGraphic(token, aura) {
  const Graphics = globalThis.PIXI?.Graphics;
  const layer = globalThis.canvas?.tokens;
  if (!Graphics || !layer?.addChildAt) return null;
  const graphic = new Graphics();
  graphic.name = `cmet-marco-aura-${aura.source}`;
  if (!drawAuraGraphic(graphic, token, aura)) {
    graphic.destroy?.();
    return null;
  }
  layer.addChildAt(graphic, 0);
  return graphic;
}

export function clearMarcoAuraVisuals() {
  for (const graphic of auraGraphics.values()) destroyGraphic(graphic);
  auraGraphics.clear();
}

export function syncMarcoAuraVisuals() {
  const placeables = globalThis.canvas?.tokens?.placeables;
  if (!placeables) return;
  const expected = new Set();
  for (const token of placeables) {
    const actor = token.actor;
    for (const aura of actor?.getFlag?.(SYSTEM_ID, AURA_FLAG) ?? []) {
      const key = getMarcoAuraVisualKey(token, aura);
      expected.add(key);
      const graphic = auraGraphics.get(key) ?? createGraphic(token, aura);
      if (graphic) {
        if (graphic.parent !== globalThis.canvas.tokens) globalThis.canvas.tokens.addChildAt(graphic, 0);
        drawAuraGraphic(graphic, token, aura);
        auraGraphics.set(key, graphic);
      }
    }
  }
  for (const [key, graphic] of auraGraphics) {
    if (!expected.has(key)) {
      destroyGraphic(graphic);
      auraGraphics.delete(key);
    }
  }
}

export function registerMarcoAuraVisualHooks() {
  if (hooksRegistered || typeof Hooks === "undefined") return;
  hooksRegistered = true;
  Hooks.on("canvasReady", syncMarcoAuraVisuals);
  Hooks.on("canvasTearDown", clearMarcoAuraVisuals);
  Hooks.on("updateActor", syncMarcoAuraVisuals);
  Hooks.on("updateToken", syncMarcoAuraVisuals);
  Hooks.on("refreshToken", syncMarcoAuraVisuals);
  Hooks.on("createToken", syncMarcoAuraVisuals);
  Hooks.on("deleteToken", syncMarcoAuraVisuals);
}

export const MarcoAuraVisualService = Object.freeze({
  getMarcoAuraVisualKey,
  getMarcoAuraRadiusPixels,
  clearMarcoAuraVisuals,
  syncMarcoAuraVisuals,
  registerMarcoAuraVisualHooks
});
