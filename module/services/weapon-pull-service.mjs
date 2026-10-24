import { SYSTEM_ID } from "../config/constants.mjs";
import { getActorUpdateAuthority } from "./combat-authority-service.mjs";

const SOCKET_CHANNEL = `system.${SYSTEM_ID}`;
const PULL_MOVEMENT_METHOD = "api";
const PULL_MOVEMENT_TIMEOUT_MS = 35000;
const DEBUG_PULL_MOVEMENT = true;
const forcedPullTokenIds = new Set();
const pendingPullRequests = new Map();
const processedPullRequests = new Map();
const processingPullRequests = new Set();
const activePullMovements = new Map();
let pullMovementSequence = 0;

function movementErrorDetails(error) {
  return {
    errorName: error?.name ?? "Error",
    errorMessage: error?.message ?? String(error),
    errorStack: error?.stack ?? null
  };
}

function logMovementError(error, context = {}) {
  console.error("CMET | Falha ao executar movimento de Puxar", {
    ...context,
    error
  });
}

function debugPullMovement(data) {
  if (!DEBUG_PULL_MOVEMENT) return;
  console.debug("CMET | Diagnóstico Puxar", data);
}

function targetActor(token) {
  const document = tokenDocument(token);
  return document?.actor ?? token?.actor ?? null;
}

function targetMovementAuthority(token) {
  const actor = targetActor(token);
  if (!actor || !globalThis.game?.users || !globalThis.game?.user) return null;
  return getActorUpdateAuthority(actor);
}

function currentUserCanMoveTarget(token) {
  const document = tokenDocument(token);
  const currentUser = globalThis.game?.user;
  const users = globalThis.game?.users;

  // Direct service tests can run without a Foundry game. In Foundry, both
  // the Actor authority and the TokenDocument permission are required.
  if (!currentUser || !users) return { allowed: true, authority: null };

  const authority = targetMovementAuthority(token);
  if (!authority || authority.id !== currentUser.id) {
    return { allowed: false, reason: "permission", authority };
  }

  if (typeof document?.canUserModify !== "function") {
    return { allowed: true, authority };
  }

  try {
    if (!document.canUserModify(currentUser, "update")) {
      return { allowed: false, reason: "permission", authority };
    }
  } catch (error) {
    logMovementError(error, { tokenId: tokenId(token), phase: "permission-check" });
    return { allowed: false, reason: "apiError", authority, error: movementErrorDetails(error) };
  }

  return { allowed: true, authority };
}

function currentPosition(document, fallback, movement = document?.movement) {
  const persisted = point({ x: document?.x, y: document?.y });
  const waypoints = passedWaypoints(movement);
  const passed = point(waypoints.at?.(-1) ?? waypoints[waypoints.length - 1]);

  // The persisted TokenDocument position is authoritative once it differs
  // from the origin. When a mock or a movement hook exposes the confirmed
  // passed waypoint before the document source is refreshed, use that
  // confirmed waypoint instead of the planned destination.
  if (persisted && passed && persisted.x === fallback.x && persisted.y === fallback.y
    && (passed.x !== fallback.x || passed.y !== fallback.y)) return passed;
  return persisted ?? passed ?? null;
}

function confirmedMovementPosition(document, origin, movement, completed) {
  if (completed === false) {
    const waypoints = passedWaypoints(movement);
    const passed = point(waypoints.at?.(-1) ?? waypoints[waypoints.length - 1]);
    if (passed) return passed;
  }
  if (completed === true) {
    return point(movement?.destination) ?? currentPosition(document, origin, movement);
  }
  return currentPosition(document, origin, movement);
}

async function waitForMovementResult(movement) {
  if (!movement) return { movement: null, completed: null };
  const finished = movement.finished;
  if (typeof finished?.then !== "function") return { movement, completed: null };
  return { movement, completed: Boolean(await finished) };
}

async function waitForMovementConfirmation(document, previousMovement, expectedMovementId) {
  const movement = document?.movement;
  if (!movement || movement === previousMovement) return { movement: null, completed: null };
  if (expectedMovementId && movement.id && movement.id !== expectedMovementId) {
    return { movement: null, completed: null };
  }
  return waitForMovementResult(movement);
}

function nextPullMovementId(tokenIdValue) {
  pullMovementSequence += 1;
  return `cmet-pull-${tokenIdValue ?? "token"}-${pullMovementSequence}`;
}

function tokenDocument(token) {
  return token?.document ?? token ?? null;
}

function tokenId(token) {
  const document = tokenDocument(token);
  return document?.id ?? token?.id ?? null;
}

function passedWaypoints(movement) {
  return [
    ...(movement?.passed?.waypoints ?? []),
    ...(movement?.history?.recorded?.waypoints ?? []),
    ...(movement?.history?.unrecorded?.waypoints ?? [])
  ];
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
    requestedSpaces: maximum,
    positions,
    plannedSpaces: Math.max(0, positions.length - 1),
    movedSpaces: Number.isFinite(measuredSpaces) ? Math.max(0, measuredSpaces) : Math.max(0, positions.length - 1),
    blocked,
    blockedReason
  };
}

export async function executePullMovement({ attackerToken, targetToken, spaces } = {}) {
  const path = calculatePullPath({ attackerToken, targetToken, spaces });
  const document = tokenDocument(targetToken);
  if (path.positions.length < 2) {
    const result = {
      ...path,
      moved: false,
      executed: true,
      confirmed: true,
      confirmedDestination: path.origin,
      completed: true,
      failureReason: "noSpace"
    };
    debugPullMovement({
      phase: "movement-result",
      tokenId: tokenId(targetToken),
      origin: path.origin,
      plannedDestination: path.destination,
      confirmedDestination: path.origin,
      requestedSpaces: path.requestedSpaces,
      plannedSpaces: path.plannedSpaces,
      movedSpaces: 0,
      moved: false,
      blocked: path.blocked,
      blockedReason: path.blockedReason,
      failureReason: result.failureReason,
      completed: true
    });
    return result;
  }

  const permission = currentUserCanMoveTarget(targetToken);
  if (!permission.allowed) {
    return {
      ...path,
      moved: false,
      executed: false,
      blockedReason: permission.reason,
      failureReason: permission.reason,
      completed: false,
      ...(permission.error ?? {})
    };
  }

  if (typeof document.move !== "function") {
    const error = new TypeError("CMET | TokenDocument.move não está disponível para o movimento de Puxar.");
    const details = movementErrorDetails(error);
    logMovementError(error, { tokenId: tokenId(targetToken), phase: "api-availability" });
    return {
      ...path,
      moved: false,
      executed: false,
      blockedReason: "apiError",
      failureReason: "apiError",
      completed: false,
      ...details
    };
  }

  const id = tokenId(targetToken);
  const movementId = nextPullMovementId(id);
  forcedPullTokenIds.add(id);
  const previousMovement = document.movement;
  const pendingMovement = { origin: path.origin, operationId: movementId, movementId: null, movement: null };
  activePullMovements.set(id, pendingMovement);
  try {
    const completed = await document.move(path.positions.slice(1), {
      method: PULL_MOVEMENT_METHOD,
      broadcast: true,
      showRuler: false,
      id: movementId
    });
    const confirmation = pendingMovement.movement
      ? await waitForMovementResult(pendingMovement.movement)
      : await waitForMovementConfirmation(document, previousMovement, pendingMovement.movementId);
    const movement = confirmation.movement;
    const movementCompleted = confirmation.completed ?? (typeof completed === "boolean" ? completed : null);
    const confirmedPosition = confirmedMovementPosition(document, path.origin, movement, movementCompleted);
    const current = confirmedPosition ?? path.origin;
    const moved = current.x !== path.origin.x || current.y !== path.origin.y;
    const interrupted = movementCompleted === false;
    const result = {
      ...path,
      moved,
      confirmed: Boolean(movement) || moved,
      confirmedDestination: confirmedPosition,
      executed: !interrupted,
      completed: movementCompleted,
      movedSpaces: moved ? measureSpaces(document, path.origin, current) : 0,
      movementId: movement?.id ?? pendingMovement.movementId ?? pendingMovement.operationId,
      blockedReason: interrupted && !path.blockedReason ? "movementStopped" : path.blockedReason,
      failureReason: interrupted ? "movementStopped" : moved ? null : "confirmation"
    };
    debugPullMovement({
      phase: "movement-result",
      tokenId: id,
      origin: path.origin,
      plannedDestination: path.destination,
      confirmedDestination: confirmedPosition,
      requestedSpaces: path.requestedSpaces,
      plannedSpaces: path.plannedSpaces,
      movedSpaces: result.movedSpaces,
      moved: result.moved,
      blocked: result.blocked,
      blockedReason: result.blockedReason,
      failureReason: result.failureReason,
      completed: movementCompleted,
      movementId: result.movementId,
      passedWaypoints: passedWaypoints(movement),
      documentPosition: point({ x: document?.x, y: document?.y })
    });
    return result;
  } catch (error) {
    const confirmedPosition = currentPosition(document, path.origin, null);
    const current = confirmedPosition ?? path.origin;
    const details = movementErrorDetails(error);
    logMovementError(error, {
      tokenId: id,
      phase: "document.move",
      method: PULL_MOVEMENT_METHOD,
      origin: path.origin,
      destination: path.destination
    });
    const result = {
      ...path,
      moved: current.x !== path.origin.x || current.y !== path.origin.y,
      confirmed: Boolean(confirmedPosition
        && (current.x !== path.origin.x || current.y !== path.origin.y)),
      confirmedDestination: confirmedPosition,
      executed: false,
      completed: false,
      movedSpaces: current.x !== path.origin.x || current.y !== path.origin.y
        ? measureSpaces(document, path.origin, current)
        : 0,
      movementId: pendingMovement.movementId ?? pendingMovement.operationId,
      blockedReason: "apiError",
      failureReason: "apiError",
      ...details
    };
    debugPullMovement({
      phase: "movement-result",
      tokenId: id,
      origin: path.origin,
      plannedDestination: path.destination,
      confirmedDestination: confirmedPosition,
      requestedSpaces: path.requestedSpaces,
      plannedSpaces: path.plannedSpaces,
      movedSpaces: result.movedSpaces,
      moved: result.moved,
      blocked: result.blocked,
      blockedReason: result.blockedReason,
      failureReason: result.failureReason,
      completed: false,
      movementId,
      passedWaypoints: [],
      documentPosition: point({ x: document?.x, y: document?.y })
    });
    return result;
  } finally {
    activePullMovements.delete(id);
    forcedPullTokenIds.delete(id);
  }
}

export function isForcedPullMovement(token, movement) {
  const id = tokenId(token);
  if (id && forcedPullTokenIds.has(id)) return true;
  const methods = [movement?.method, movement?.type, movement?.mode].map((value) => String(value ?? "").toLowerCase());
  return methods.includes("forced") || methods.includes("forcedmovement") || movement?.forced === true || movement?.forcedMovement === true;
}

export function recordPullMovementConfirmation(tokenDocument, movement) {
  const id = tokenId(tokenDocument);
  const pending = id && activePullMovements.get(id);
  if (!pending || !movement) return false;
  if (pending.movementId && movement.id && movement.id !== pending.movementId) return false;
  const movementOrigin = point(movement.origin);
  if (movementOrigin && (movementOrigin.x !== pending.origin.x || movementOrigin.y !== pending.origin.y)) return false;
  if (movement.id) pending.movementId = movement.id;
  pending.movement = movement;
  const waypoints = passedWaypoints(movement);
  const passedDestination = point(waypoints.at?.(-1) ?? waypoints[waypoints.length - 1]);
  const destination = point(movement.destination) ?? passedDestination;
  const reportedSpaces = Number(movement.passed?.spaces ?? movement.spaces);
  debugPullMovement({
    phase: "movement-confirmed",
    tokenId: id,
    origin: movement.origin,
    destination: movement.destination,
    passedWaypoints: waypoints,
    documentPosition: point({ x: tokenDocument?.x, y: tokenDocument?.y }),
    completed: movement.completed ?? null,
    movedSpaces: Number.isFinite(reportedSpaces)
      ? reportedSpaces
      : (passedDestination ?? destination)
        ? measureSpaces(tokenDocument, pending.origin, passedDestination ?? destination)
        : null,
    movementId: movement.id,
    method: movement.method
  });
  return true;
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
    const permission = targetToken && currentUserCanMoveTarget(targetToken);
    const result = !targetToken || !attackerToken
      ? { moved: false, executed: false, blockedReason: "permission", failureReason: "permission" }
      : !permission.allowed
        ? {
          moved: false,
          executed: false,
          blockedReason: permission.reason,
          failureReason: permission.reason,
          ...(permission.error ?? {})
        }
      : await executePullMovement({ attackerToken, targetToken, spaces: message.spaces });
    processedPullRequests.set(message.requestId, result);
    setTimeout(() => processedPullRequests.delete(message.requestId), PULL_MOVEMENT_TIMEOUT_MS)?.unref?.();
    debugPullMovement({ phase: "socket-response-sent", requestId: message.requestId, result });
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
  debugPullMovement({ phase: "socket-response-received", requestId: message.requestId, result: message.result });
  pending.resolve(message.result ?? { moved: false, executed: false, blockedReason: "unknown" });
}

export async function requestPullMovement({ attackerToken, targetToken, spaces, combatId, timeoutMs = PULL_MOVEMENT_TIMEOUT_MS } = {}) {
  const authority = targetMovementAuthority(targetToken);
  if (!authority) return { moved: false, executed: false, blockedReason: "permission", failureReason: "permission" };
  if (authority.id === game.user.id) return executePullMovement({ attackerToken, targetToken, spaces });
  const requestId = foundry.utils.randomID();
  const result = await new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      pendingPullRequests.delete(requestId);
      console.warn("CMET | Tempo limite aguardando a autoridade do alvo para Puxar", {
        requestId,
        targetTokenId: tokenId(targetToken),
        authorityId: authority.id
      });
      resolve({ moved: false, executed: false, blockedReason: "timeout", failureReason: "timeout" });
    }, timeoutMs);
    timeoutId?.unref?.();
    pendingPullRequests.set(requestId, { resolve, timeoutId });
    debugPullMovement({
      phase: "socket-request-sent",
      requestId,
      targetTokenId: tokenId(targetToken),
      authorityId: authority.id,
      requestedSpaces: spaces
    });
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

export const WeaponPullService = Object.freeze({ calculatePullPath, executePullMovement, requestPullMovement, processPullMovementRequest, resolvePullMovementResponse, isForcedPullMovement, recordPullMovementConfirmation });
