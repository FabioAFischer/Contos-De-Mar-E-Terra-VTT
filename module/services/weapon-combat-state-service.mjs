import { SYSTEM_ID } from "../config/constants.mjs";

const FLAG = "weaponCombat";
const stateMutationQueues = new WeakMap();

function namespace() {
  return globalThis.game?.system?.id ?? SYSTEM_ID;
}

export function emptyWeaponCombatState() {
  return { sequences: {}, pointWeak: {}, impact: {}, conditions: {} };
}

export function readWeaponCombatState(combat) {
  const state = combat?.getFlag?.(namespace(), FLAG);
  if (!state) return emptyWeaponCombatState();
  const stored = foundry.utils.deepClone(state);
  const defaults = emptyWeaponCombatState();
  return {
    ...defaults,
    ...stored,
    sequences: { ...defaults.sequences, ...(stored.sequences ?? {}) },
    pointWeak: { ...defaults.pointWeak, ...(stored.pointWeak ?? {}) },
    impact: { ...defaults.impact, ...(stored.impact ?? {}) },
    conditions: { ...defaults.conditions, ...(stored.conditions ?? {}) }
  };
}

async function persistWeaponCombatState(combat, state) {
  if (!combat?.setFlag) return state;
  await combat.setFlag(namespace(), FLAG, state);
  return state;
}

function enqueueWeaponCombatStateMutation(combat, mutation, persist = persistWeaponCombatState) {
  if (!combat || (typeof combat !== "object" && typeof combat !== "function")) {
    return Promise.resolve(mutation(readWeaponCombatState(combat)));
  }
  const previous = stateMutationQueues.get(combat) ?? Promise.resolve();
  let current;
  current = previous
    .catch(() => undefined)
    .then(async () => {
      const state = readWeaponCombatState(combat);
      const result = await mutation(state);
      await persist(combat, state);
      return result ?? state;
    })
    .finally(() => {
      if (stateMutationQueues.get(combat) === current) stateMutationQueues.delete(combat);
    });
  stateMutationQueues.set(combat, current);
  return current;
}

export function writeWeaponCombatState(combat, state) {
  return enqueueWeaponCombatStateMutation(combat, (current) => {
    for (const key of Object.keys(current)) delete current[key];
    Object.assign(current, state);
    return current;
  });
}

function attackerKey(actor) { return actor?.id ?? "unknown"; }
function targetKey(token) { return token?.document?.id ?? token?.id ?? "unknown"; }

export function getSequentialBonusCount(combat, actor, item) {
  const entry = readWeaponCombatState(combat).sequences[attackerKey(actor)];
  const streak = Number(entry?.streak);
  return entry?.weaponId === item?.id && Number.isInteger(streak) && streak > 0 ? streak : 0;
}

export function getSequentialBonusState(combat, actor, item) {
  return getSequentialBonusCount(combat, actor, item) > 0;
}

export async function recordSequentialOutcome(combat, actor, item, { effectiveHit = false } = {}) {
  return enqueueWeaponCombatStateMutation(combat, (state) => {
    const key = attackerKey(actor);
    const previous = state.sequences[key];
    if (!effectiveHit) {
      state.sequences[key] = { weaponId: null, streak: 0 };
    }
    else if (previous?.weaponId === item?.id) {
      state.sequences[key] = { weaponId: item.id, streak: (Number(previous.streak) || 0) + 1 };
    } else {
      state.sequences[key] = { weaponId: item.id, streak: 1 };
    }
  });
}

function tokenPosition(token) {
  const document = token?.document ?? token;
  return { x: Number(document?.x ?? 0), y: Number(document?.y ?? 0), rotation: Number(document?.rotation ?? 0) };
}

function tokenCenter(token) {
  const document = token?.document ?? token;
  const gridSize = Number(globalThis.canvas?.grid?.size ?? 1);
  const width = Number(document?.width);
  const height = Number(document?.height);
  const x = Number(document?.x);
  const y = Number(document?.y);
  if (![x, y, width, height, gridSize].every(Number.isFinite) || width <= 0 || height <= 0 || gridSize <= 0) return null;
  return { x: x + (width * gridSize) / 2, y: y + (height * gridSize) / 2 };
}

export function isAttackerBehindDefender(attackerToken, defenderToken) {
  const attacker = tokenCenter(attackerToken);
  const defender = tokenCenter(defenderToken);
  const rotation = Number((defenderToken?.document ?? defenderToken)?.rotation);
  if (!attacker || !defender || !Number.isFinite(rotation)) return false;
  const dx = attacker.x - defender.x;
  const dy = attacker.y - defender.y;
  const length = Math.hypot(dx, dy);
  if (!(length > 0)) return false;
  const radians = rotation * Math.PI / 180;
  // Foundry v14: 0° faces south; positive rotation turns the facing direction west.
  const frontX = -Math.sin(radians);
  const frontY = Math.cos(radians);
  const dotProduct = (dx / length) * frontX + (dy / length) * frontY;
  return dotProduct <= -Math.cos(Math.PI / 4);
}

export function getTokenSide(defenderToken, attackerToken) {
  const defender = tokenPosition(defenderToken);
  const attacker = tokenPosition(attackerToken);
  const dx = attacker.x - defender.x;
  const dy = attacker.y - defender.y;
  const angle = (Math.atan2(dy, dx) * 180 / Math.PI - defender.rotation + 360) % 360;
  if (angle >= 315 || angle < 45) return "frente";
  if (angle >= 45 && angle < 135) return "direita";
  if (angle >= 135 && angle < 225) return "costas";
  return "esquerda";
}

export function pointWeakBonusState(combat, actor, item, attackerToken, defenderToken) {
  if (item?.system?.characteristics?.pontoFraco?.enabled !== true) return false;
  const previous = readWeaponCombatState(combat).pointWeak?.[attackerKey(actor)]?.[targetKey(defenderToken)];
  if (!previous || previous.weaponId !== item.id) return false;
  const currentPosition = tokenPosition(attackerToken);
  const moved = currentPosition.x !== previous.x || currentPosition.y !== previous.y;
  const defenderRotation = tokenPosition(defenderToken).rotation;
  return moved && defenderRotation === previous.defenderRotation && previous.side !== getTokenSide(defenderToken, attackerToken);
}

export async function recordPointWeakAttack(combat, actor, item, attackerToken, defenderToken) {
  return enqueueWeaponCombatStateMutation(combat, (state) => {
    const actorState = state.pointWeak[attackerKey(actor)] ?? {};
    const position = tokenPosition(attackerToken);
    actorState[targetKey(defenderToken)] = { weaponId: item.id, side: getTokenSide(defenderToken, attackerToken), x: position.x, y: position.y, defenderRotation: tokenPosition(defenderToken).rotation };
    state.pointWeak[attackerKey(actor)] = actorState;
  });
}

export function impactSequenceBonusState(combat, actor, item, defenderToken) {
  const entry = readWeaponCombatState(combat).impact?.[attackerKey(actor)];
  return Boolean(entry?.weaponId === item?.id && entry?.targetId === targetKey(defenderToken) && entry.streak > 0);
}

export async function recordImpactOutcome(combat, actor, item, defenderToken, { effectiveHit = false } = {}) {
  return enqueueWeaponCombatStateMutation(combat, (state) => {
    const key = attackerKey(actor);
    const previous = state.impact[key];
    state.impact[key] = effectiveHit && previous?.weaponId === item.id && previous?.targetId === targetKey(defenderToken)
      ? { weaponId: item.id, targetId: targetKey(defenderToken), streak: 1 }
      : effectiveHit ? { weaponId: item.id, targetId: targetKey(defenderToken), streak: 1 } : {};
  });
}

export function isLaterallyAdjacent(originToken, candidateToken, tolerance = 0.01) {
  const a = originToken?.document ?? originToken;
  const b = candidateToken?.document ?? candidateToken;
  const gridSize = Number(globalThis.canvas?.grid?.size ?? 1);
  const ax = Number(a?.x ?? 0), ay = Number(a?.y ?? 0), aw = Number(a?.width ?? 1) * gridSize, ah = Number(a?.height ?? 1) * gridSize;
  const bx = Number(b?.x ?? 0), by = Number(b?.y ?? 0), bw = Number(b?.width ?? 1) * gridSize, bh = Number(b?.height ?? 1) * gridSize;
  const overlapX = Math.min(ax + aw, bx + bw) - Math.max(ax, bx);
  const overlapY = Math.min(ay + ah, by + bh) - Math.max(ay, by);
  const verticalTouch = Math.abs((ay + ah) - by) <= tolerance || Math.abs((by + bh) - ay) <= tolerance;
  const horizontalTouch = Math.abs((ax + aw) - bx) <= tolerance || Math.abs((bx + bw) - ax) <= tolerance;
  return (verticalTouch && overlapX > tolerance) || (horizontalTouch && overlapY > tolerance);
}

/**
 * There is no canonical faction/alliance field in the current system data.
 * Until that relationship is modeled explicitly, distinct documents are
 * potential adversaries; token disposition is only presentation metadata.
 */
export function arePotentialAdversaries(first, second) {
  if (!first || !second || first === second) return false;
  const firstId = first?.document?.id ?? first?.id;
  const secondId = second?.document?.id ?? second?.id;
  return !firstId || !secondId || firstId !== secondId;
}

export function getLateralEnemies(originToken, { tokens = globalThis.canvas?.tokens?.placeables ?? [] } = {}) {
  return tokens.filter((token) => token !== originToken
    && arePotentialAdversaries(originToken, token)
    && isLaterallyAdjacent(originToken, token));
}

function measureGridDistance(points) {
  const measurePath = globalThis.canvas?.grid?.measurePath;
  if (typeof measurePath === "function") {
    const result = measurePath.call(globalThis.canvas.grid, points);
    const measured = Number(result?.spaces ?? result?.distance);
    if (Number.isFinite(measured)) return measured;
    throw new TypeError("CMET | A medição da grade não retornou spaces ou distance válidos.");
  }
  const [origin, target] = points;
  const gridSize = Number(globalThis.canvas?.grid?.size ?? 1) || 1;
  return Math.max(Math.abs(origin.x - target.x), Math.abs(origin.y - target.y)) / gridSize;
}

function tokenBounds(token, position = null) {
  const document = token?.document ?? token ?? {};
  const gridSize = Number(globalThis.canvas?.grid?.size ?? 1) || 1;
  const x = Number(position?.x ?? document.x ?? 0);
  const y = Number(position?.y ?? document.y ?? 0);
  const width = Number(document.width ?? 1) * gridSize;
  const height = Number(document.height ?? 1) * gridSize;
  return { left: x, top: y, right: x + width, bottom: y + height };
}

function tokenOccupiedCells(token, position = null) {
  const document = token?.document ?? token ?? {};
  const gridSize = Number(globalThis.canvas?.grid?.size ?? 1) || 1;
  const x = Number(position?.x ?? document.x ?? 0);
  const y = Number(position?.y ?? document.y ?? 0);
  const width = Math.max(1, Math.ceil(Number(document.width ?? 1)));
  const height = Math.max(1, Math.ceil(Number(document.height ?? 1)));
  const startX = Math.floor(x / gridSize);
  const startY = Math.floor(y / gridSize);
  const cells = [];
  for (let cellY = 0; cellY < height; cellY += 1) {
    for (let cellX = 0; cellX < width; cellX += 1) {
      cells.push({ x: startX + cellX, y: startY + cellY });
    }
  }
  return cells;
}

/**
 * Alcance counts occupied grid spaces rather than the gap between token
 * borders. Each pair of occupied cells is measured by Foundry so the scene's
 * diagonal rule remains authoritative, including for large tokens.
 */
export function measureTokenReachDistanceAtPosition(originToken, targetToken, targetPosition = null) {
  const gridSize = Number(globalThis.canvas?.grid?.size ?? 1) || 1;
  const originCells = tokenOccupiedCells(originToken);
  const targetCells = tokenOccupiedCells(targetToken, targetPosition);
  let minimum = Infinity;
  for (const originCell of originCells) {
    for (const targetCell of targetCells) {
      const distance = measureGridDistance([
        { x: (originCell.x + 0.5) * gridSize, y: (originCell.y + 0.5) * gridSize },
        { x: (targetCell.x + 0.5) * gridSize, y: (targetCell.y + 0.5) * gridSize }
      ]);
      if (distance < minimum) minimum = distance;
      if (minimum === 0) return 0;
    }
  }
  if (!Number.isFinite(minimum)) throw new TypeError("CMET | Não foi possível medir o alcance entre os tokens.");
  return minimum;
}

export function measureTokenReachDistance(originToken, targetToken) {
  return measureTokenReachDistanceAtPosition(originToken, targetToken);
}

export function measureTokenDistanceAtPosition(originToken, targetToken, targetPosition = null) {
  const origin = tokenBounds(originToken);
  const target = tokenBounds(targetToken, targetPosition);
  const horizontalGap = Math.max(origin.left - target.right, target.left - origin.right, 0);
  const verticalGap = Math.max(origin.top - target.bottom, target.top - origin.bottom, 0);
  if (horizontalGap === 0 && verticalGap === 0) return 0;

  const originPoint = {
    x: horizontalGap === 0 ? Math.max(origin.left, Math.min(target.left, origin.right)) : (target.left < origin.left ? origin.left : origin.right),
    y: verticalGap === 0 ? Math.max(origin.top, Math.min(target.top, origin.bottom)) : (target.top < origin.top ? origin.top : origin.bottom)
  };
  const targetPoint = {
    x: horizontalGap === 0 ? originPoint.x : (target.left < origin.left ? target.right : target.left),
    y: verticalGap === 0 ? originPoint.y : (target.top < origin.top ? target.bottom : target.top)
  };
  return measureGridDistance([originPoint, targetPoint]);
}

export function measureTokenDistance(originToken, targetToken) {
  return measureTokenDistanceAtPosition(originToken, targetToken);
}

export function didCrossWeaponReach(beforeDistance, afterDistance, maximum) {
  if (![beforeDistance, afterDistance, maximum].every(Number.isFinite) || maximum <= 0) return false;
  const wasInside = beforeDistance <= maximum;
  const isInside = afterDistance <= maximum;
  return wasInside !== isInside;
}

export function isAtMaximumWeaponRange(item, originToken, targetToken) {
  const maximum = Number(item?.system?.characteristics?.armaDeHaste?.spaces);
  return Number.isFinite(maximum) && maximum > 0 && Math.abs(measureTokenDistance(originToken, targetToken) - maximum) < 0.001;
}

export async function clearWeaponCombatState(combat) {
  return enqueueWeaponCombatStateMutation(combat, (state) => {
    const empty = emptyWeaponCombatState();
    for (const key of Object.keys(state)) delete state[key];
    Object.assign(state, empty);
  }, async (document, state) => {
    if (typeof document?.unsetFlag === "function") {
      await document.unsetFlag(namespace(), FLAG);
      return emptyWeaponCombatState();
    }
    if (typeof document?.setFlag === "function") {
      await document.setFlag(namespace(), FLAG, null);
      return emptyWeaponCombatState();
    }
    return persistWeaponCombatState(document, state);
  });
}

export const WeaponCombatStateService = Object.freeze({ emptyWeaponCombatState, readWeaponCombatState, writeWeaponCombatState, getSequentialBonusCount, getSequentialBonusState, recordSequentialOutcome, getTokenSide, pointWeakBonusState, recordPointWeakAttack, impactSequenceBonusState, recordImpactOutcome, isLaterallyAdjacent, arePotentialAdversaries, getLateralEnemies, measureTokenDistanceAtPosition, measureTokenDistance, measureTokenReachDistanceAtPosition, measureTokenReachDistance, didCrossWeaponReach, isAtMaximumWeaponRange, clearWeaponCombatState });
