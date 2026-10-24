import { SYSTEM_ID } from "../config/constants.mjs";
import { getActorUpdateAuthority } from "./combat-authority-service.mjs";

const SOCKET_CHANNEL = `system.${SYSTEM_ID}`;
const forcedPullTokenIds = new Set();
const pendingPullRequests = new Map();
const processedPullRequests = new Map();
const processingPullRequests = new Set();

function tokenDocument(token) {
  return token?.document ?? token ?? null;
}

function tokenId(token) {
  const document = tokenDocument(token);
  return document?.id ?? token?.id ?? null;
}

function sceneId(token) {
  const document = tokenDocument(token);
  return document?.parent?.id ?? document?.scene?.id ?? token?.scene?.id ?? null;
}

function point(value) {
  const x = Number(value?.x);
  const y = Number(value?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function gridSize() {
  return Number(globalThis.canvas?.grid?.size ?? 1) || 1;
}

function dimensions(token, position = null) {
  const document = tokenDocument(token);
  const size = gridSize();
  return {
    x: Number(position?.x ?? document?.x ?? 0),
    y: Number(position?.y ?? document?.y ?? 0),
    width: Math.max(1, Number(document?.width ?? 1)) * size,
    height: Math.max(1, Number(document?.height ?? 1)) * size
  };
}

function center(token, position = null) {
  const bounds = dimensions(token, position);
  return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
}

function overlaps(first, second) {
  return first.x < second.x + second.width
    && first.x + first.width > second.x
    && first.y < second.y + second.height
    && first.y + first.height > second.y;
}

function sceneBounds() {
  const dimensions = globalThis.canvas?.scene?.dimensions;
  const rect = dimensions?.rect ?? dimensions;
  const left = Number(rect?.left ?? 0);
  const top = Number(rect?.top ?? 0);
  const right = Number(rect?.right ?? rect?.width ?? globalThis.canvas?.scene?.width);
  const bottom = Number(rect?.bottom ?? rect?.height ?? globalThis.canvas?.scene?.height);
  if (![left, top, right, bottom].every(Number.isFinite)) return null;
  return { left, top, right, bottom };
}

function insideScene(token, position) {
  const bounds = sceneBounds();
  if (!bounds) return true;
  const tokenBounds = dimensions(token, position);
  return tokenBounds.x >= bounds.left
    && tokenBounds.y >= bounds.top
    && tokenBounds.x + tokenBounds.width <= bounds.right
    && tokenBounds.y + tokenBounds.height <= bounds.bottom;
}

function snapPosition(document, position) {
  const snapped = document?.getSnappedPosition?.(position);
  if (point(snapped)) return point(snapped);
  const grid = globalThis.canvas?.grid;
  const gridSnapped = grid?.getSnappedPosition?.(position.x, position.y, 1);
  if (point(gridSnapped)) return point(gridSnapped);
  const size = gridSize();
  return { x: Math.round(position.x / size) * size, y: Math.round(position.y / size) * size };
}

function measureSpaces(document, origin, destination) {
  const waypoints = [origin, destination].map(({ x, y }) => ({ x, y }));
  const measured = document?.measureMovementPath?.(waypoints);
  const measuredSpaces = Number(measured?.spaces ?? measured?.distance);
  if (Number.isFinite(measuredSpaces)) return measuredSpaces;
  const gridMeasured = globalThis.canvas?.grid?.measurePath?.(waypoints);
  const gridSpaces = Number(gridMeasured?.spaces ?? gridMeasured?.distance);
  if (Number.isFinite(gridSpaces)) return gridSpaces;
  const size = gridSize();
  return Math.max(Math.abs(destination.x - origin.x), Math.abs(destination.y - origin.y)) / size;
}

function tokenObject(token) {
  return token?.object ?? token ?? null;
}

function hasWallCollision(token, origin, destination) {
  const object = tokenObject(token);
  if (typeof object?.checkCollision !== "function") return false;
  const result = object.checkCollision(center(token, destination), {
    origin: center(token, origin),
    mode: "any"
  });
  return Boolean(result);
}

function hasConstrainedPath(token, origin, destination) {
  const object = tokenObject(token);
  if (typeof object?.constrainMovementPath !== "function") return false;
  const [path, constrained] = object.constrainMovementPath([
    { x: origin.x, y: origin.y },
    { x: destination.x, y: destination.y }
  ], { preview: true });
  if (!constrained) return false;
  const last = path?.at?.(-1) ?? path?.[path.length - 1];
  return !last || Number(last.x) !== destination.x || Number(last.y) !== destination.y;
}

function hasTokenCollision(targetToken, attackerToken, position) {
  const targetId = tokenId(targetToken);
  const attackerId = tokenId(attackerToken);
  const targetBounds = dimensions(targetToken, position);
  const placeables = globalThis.canvas?.tokens?.placeables ?? [];
  return placeables.some((candidate) => {
    const candidateId = tokenId(candidate);
    if (!candidateId || candidateId === targetId || candidateId === attackerId) return false;
    return overlaps(targetBounds, dimensions(candidate));
  });
}

function resolveToken(tokenIdValue, expectedSceneId = null) {
  if (expectedSceneId && globalThis.canvas?.scene?.id && globalThis.canvas.scene.id !== expectedSceneId) return null;
  return globalThis.canvas?.tokens?.get?.(tokenIdValue)
    ?? globalThis.canvas?.tokens?.placeables?.find?.((token) => tokenId(token) === tokenIdValue)
    ?? null;
}

function getDirection(attackerToken, targetToken) {
  const attacker = center(attackerToken);
  const target = center(targetToken);
  return { x: Math.sign(attacker.x - target.x), y: Math.sign(attacker.y - target.y) };
}

export function calculatePullPath({ attackerToken, targetToken, spaces } = {}) {
  const maximum = Number(spaces);
  if (!Number.isInteger(maximum) || maximum <= 0) throw new RangeError("CMET | A quantidade de espaços de Puxar deve ser um inteiro positivo.");
  const document = tokenDocument(targetToken);
  if (!document) throw new TypeError("CMET | O alvo de Puxar não possui TokenDocument.");
  const origin = { x: Number(document.x ?? 0), y: Number(document.y ?? 0) };
  const direction = getDirection(attackerToken, targetToken);
  const positions = [origin];
  let current = origin;
  let blocked = false;
  let blockedReason = null;

  for (let step = 1; step <= maximum; step += 1) {
    if (!direction.x && !direction.y) {
      blocked = true;
      blockedReason = "overlap";
      break;
    }
    const candidate = snapPosition(document, {
      x: current.x + direction.x * gridSize(),
      y: current.y + direction.y * gridSize()
    });
    if (candidate.x === current.x && candidate.y === current.y) {
      blocked = true;
      blockedReason = "unsnapped";
      break;
    }
    if (!insideScene(targetToken, candidate)) {
      blocked = true;
      blockedReason = "sceneBoundary";
      break;
    }
    if (overlaps(dimensions(targetToken, candidate), dimensions(attackerToken))) {
      blocked = true;
      blockedReason = "attackerSpace";
      break;
    }
    if (hasTokenCollision(targetToken, attackerToken, candidate)) {
      blocked = true;
      blockedReason = "token";
      break;
    }
    if (hasWallCollision(targetToken, current, candidate) || hasConstrainedPath(targetToken, current, candidate)) {
      blocked = true;
      blockedReason = "wall";
      break;
    }
    if (measureSpaces(document, origin, candidate) > maximum) break;
    positions.push(candidate);
    current = candidate;
  }

  const destination = positions.at?.(-1) ?? positions[positions.length - 1];
  const measuredSpaces = measureSpaces(document, origin, destination);
  return {
    origin,
    destination,
    positions,
    movedSpaces: Number.isFinite(measuredSpaces) ? Math.max(0, measuredSpaces) : Math.max(0, positions.length - 1),
    blocked,
    blockedReason
  };
}

export async function executePullMovement({ attackerToken, targetToken, spaces } = {}) {
  const path = calculatePullPath({ attackerToken, targetToken, spaces });
  if (path.positions.length < 2) return { ...path, moved: false, executed: true };
  const document = tokenDocument(targetToken);
  if (typeof document.move !== "function") return { ...path, moved: false, executed: false, blockedReason: "permission" };
  const id = tokenId(targetToken);
  forcedPullTokenIds.add(id);
  try {
    const completed = await document.move(path.positions.slice(1), { method: "forced", broadcast: true, showRuler: false });
    const current = { x: Number(document.x ?? path.origin.x), y: Number(document.y ?? path.origin.y) };
    const moved = current.x !== path.origin.x || current.y !== path.origin.y;
    return {
      ...path,
      moved,
      executed: completed !== false,
      movedSpaces: moved ? measureSpaces(document, path.origin, current) : 0,
      blockedReason: completed === false && !path.blockedReason ? "movementStopped" : path.blockedReason
    };
  } catch (error) {
    return { ...path, moved: false, executed: false, blockedReason: "permission", error };
  } finally {
    forcedPullTokenIds.delete(id);
  }
}

export function isForcedPullMovement(token, movement) {
  const id = tokenId(token);
  if (id && forcedPullTokenIds.has(id)) return true;
  const methods = [movement?.method, movement?.type, movement?.mode].map((value) => String(value ?? "").toLowerCase());
  return methods.includes("forced") || methods.includes("forcedmovement") || movement?.forced === true || movement?.forcedMovement === true;
}

function emitPullResponse(message, result) {
  game.socket.emit(SOCKET_CHANNEL, {
    type: "combat-pull-movement-response",
    requesterId: message.requesterId,
    requestId: message.requestId,
    result
  });
}

export async function processPullMovementRequest(message) {
  if (message?.targetUserId !== game.user.id) return null;
  const previous = processedPullRequests.get(message.requestId);
  if (previous) {
    emitPullResponse(message, previous);
    return previous;
  }
  if (processingPullRequests.has(message.requestId)) return null;
  processingPullRequests.add(message.requestId);
  try {
    if (game.combat?.id !== message.combatId) {
      const result = { moved: false, executed: false, blockedReason: "combat" };
      emitPullResponse(message, result);
      return result;
    }
    const targetToken = resolveToken(message.targetTokenId, message.sceneId);
    const attackerToken = resolveToken(message.attackerTokenId, message.sceneId);
    const authority = targetToken?.actor && getActorUpdateAuthority(targetToken.actor);
    const result = !targetToken || !attackerToken || authority?.id !== game.user.id
      ? { moved: false, executed: false, blockedReason: "permission" }
      : await executePullMovement({ attackerToken, targetToken, spaces: message.spaces });
    processedPullRequests.set(message.requestId, result);
    setTimeout(() => processedPullRequests.delete(message.requestId), 35000)?.unref?.();
    emitPullResponse(message, result);
    return result;
  } finally {
    processingPullRequests.delete(message.requestId);
  }
}

export function resolvePullMovementResponse(message) {
  if (message?.requesterId !== game.user.id) return;
  const pending = pendingPullRequests.get(message.requestId);
  if (!pending) return;
  pendingPullRequests.delete(message.requestId);
  clearTimeout(pending.timeoutId);
  pending.resolve(message.result ?? { moved: false, executed: false, blockedReason: "unknown" });
}

export async function requestPullMovement({ attackerToken, targetToken, spaces, combatId } = {}) {
  const authority = targetToken?.actor && getActorUpdateAuthority(targetToken.actor);
  if (!authority) return { moved: false, executed: false, blockedReason: "permission" };
  if (authority.id === game.user.id) return executePullMovement({ attackerToken, targetToken, spaces });
  const requestId = foundry.utils.randomID();
  const result = await new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      pendingPullRequests.delete(requestId);
      resolve({ moved: false, executed: false, blockedReason: "timeout" });
    }, 35000);
    timeoutId?.unref?.();
    pendingPullRequests.set(requestId, { resolve, timeoutId });
    game.socket.emit(SOCKET_CHANNEL, {
      type: "combat-pull-movement-request",
      targetUserId: authority.id,
      requesterId: game.user.id,
      requestId,
      combatId,
      sceneId: sceneId(targetToken),
      targetTokenId: tokenId(targetToken),
      attackerTokenId: tokenId(attackerToken),
      spaces
    });
  });
  return result;
}

export const WeaponPullService = Object.freeze({ calculatePullPath, executePullMovement, requestPullMovement, processPullMovementRequest, resolvePullMovementResponse, isForcedPullMovement });
