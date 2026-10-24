import test from "node:test";
import assert from "node:assert/strict";

import { arePotentialAdversaries, canApplyManeuverWeaponBonus, clearWeaponCombatState, didCrossWeaponReach, getEffectivelyWieldedWeapons, getLateralEnemies, getSequentialBonusCount, getSequentialBonusState, getTargetPositionRelativeToAttacker, getTokenSide, impactSequenceBonusState, isAttackerBehindDefender, isLaterallyAdjacent, measureTokenDistanceAtPosition, pointWeakBonusState, recordImpactOutcome, recordPointWeakAttack, recordSequentialOutcome } from "../module/services/weapon-combat-state-service.mjs";
import { compareAttackAndDefense } from "../module/services/combat-attack-service.mjs";

globalThis.canvas = { grid: { size: 100, measurePath: ([origin, target]) => ({ spaces: Math.max(Math.abs(origin.x - target.x), Math.abs(origin.y - target.y)) / 100, distance: Math.max(Math.abs(origin.x - target.x), Math.abs(origin.y - target.y)) }) } };
globalThis.game = { system: { id: "contos-de-mar-e-terra" } };
globalThis.foundry = { utils: { deepClone: (value) => structuredClone(value) } };

const token = (x, y, width = 1, height = 1, rotation = 0) => ({ document: { id: `${x}:${y}`, x, y, width, height, rotation } });

test("Duas mãos considera apenas adjacência lateral", () => {
  const origin = token(0, 0);
  assert.equal(isLaterallyAdjacent(origin, token(1, 0)), true);
  assert.equal(isLaterallyAdjacent(origin, token(0, 1)), true);
  assert.equal(isLaterallyAdjacent(origin, token(1, 1)), false);
});

test("disposição igual não impede identificar um adversário lateral potencial", () => {
  const origin = { document: { id: "origin", x: 0, y: 0, width: 1, height: 1, disposition: -1 } };
  const candidate = { document: { id: "candidate", x: 100, y: 0, width: 1, height: 1, disposition: -1 } };
  assert.equal(arePotentialAdversaries(origin, candidate), true);
  assert.deepEqual(getLateralEnemies(origin, { tokens: [origin, candidate] }), [candidate]);
});

test("Ponto fraco calcula os lados pela orientação do defensor", () => {
  const defender = token(0, 0, 1, 1, 0);
  assert.equal(getTokenSide(defender, token(0, 1)), "frente");
  assert.equal(getTokenSide(defender, token(0, -1)), "costas");
  assert.equal(getTokenSide(defender, token(1, 0)), "direita");
  assert.equal(getTokenSide(defender, token(-1, 0)), "esquerda");
  assert.equal(getTokenSide({ document: { ...defender.document, rotation: 90 } }, token(-1, 0)), "frente");
  assert.equal(getTokenSide({ document: { ...defender.document, rotation: 180 } }, token(0, -1)), "frente");
  assert.equal(getTokenSide({ document: { ...defender.document, rotation: 270 } }, token(1, 0)), "frente");
  assert.equal(getTokenSide(defender, token(0, 0, 1, 1)), null);
});

test("Apunhalhar usa centros e o setor traseiro de 90 graus", () => {
  const defender = token(100, 100, 2, 2, 0);
  assert.equal(isAttackerBehindDefender(token(100, -100), defender), true);
  assert.equal(isAttackerBehindDefender(token(300, 100), defender), false);
  assert.equal(isAttackerBehindDefender(token(100, 300), defender), false);
  assert.equal(isAttackerBehindDefender(token(100, 100, 2, 2, 0), defender), false);
});

const wieldedActor = ({ mainHand = "", offHand = "", items = [] } = {}) => ({
  id: "actor",
  system: { hands: { mainHand, offHand } },
  items: { get: (id) => items.find((item) => item.id === id) }
});

const maneuverWeapon = (id, equipped = true) => ({
  id,
  type: "arma",
  system: { equipped, characteristics: { armaDeManobra: { enabled: true, damageFormula: "1d10" } } }
});

test("Arma de Manobra conta somente a arma efetivamente empunhada", () => {
  const rapier = maneuverWeapon("rapier");
  const dagger = maneuverWeapon("dagger");
  assert.deepEqual(getEffectivelyWieldedWeapons(wieldedActor({ mainHand: "rapier", items: [rapier, dagger] })), [rapier]);
  assert.equal(canApplyManeuverWeaponBonus(wieldedActor({ mainHand: "rapier", items: [rapier, dagger] }), rapier), true);
  assert.equal(canApplyManeuverWeaponBonus(wieldedActor({ mainHand: "rapier", offHand: "dagger", items: [rapier, dagger] }), rapier), false);
  assert.equal(canApplyManeuverWeaponBonus(wieldedActor({ mainHand: "rapier", items: [rapier, dagger] }), dagger), false);
});

test("Escudo e item guardado não desabilitam Arma de Manobra", () => {
  const rapier = maneuverWeapon("rapier");
  const shield = { id: "shield", type: "armadura", system: { equipped: true } };
  const storedDagger = maneuverWeapon("dagger");
  const actor = wieldedActor({ mainHand: "rapier", offHand: "shield", items: [rapier, shield, storedDagger] });
  assert.deepEqual(getEffectivelyWieldedWeapons(actor), [rapier]);
  assert.equal(canApplyManeuverWeaponBonus(actor, rapier), true);
});

test("Arma de Manobra não concede bônus com arma desmarcada, mão inválida ou configuração ausente", () => {
  const rapier = maneuverWeapon("rapier", false);
  const actor = wieldedActor({ mainHand: "rapier", items: [rapier] });
  assert.equal(canApplyManeuverWeaponBonus(actor, rapier), false);
  assert.equal(canApplyManeuverWeaponBonus(wieldedActor({ mainHand: "missing", items: [rapier] }), rapier), false);
  assert.equal(canApplyManeuverWeaponBonus({ items: [rapier] }, rapier), false);
});

test("A mesma arma em ambas as mãos é contada uma única vez", () => {
  const rapier = maneuverWeapon("rapier");
  const actor = wieldedActor({ mainHand: "rapier", offHand: "rapier", items: [rapier] });
  assert.deepEqual(getEffectivelyWieldedWeapons(actor), [rapier]);
  assert.equal(canApplyManeuverWeaponBonus(actor, rapier), true);
});

test("Ponto Fraco só ativa após mudar de setor, não apenas por rotação do defensor", async () => {
  const combat = combatWithState();
  const actor = { id: "attacker" };
  const item = { id: "rapier", system: { characteristics: { pontoFraco: { enabled: true, damageFormula: "1d8" } } } };
  const defender = token(100, 100, 2, 2, 0);
  const firstPosition = token(100, 300, 1, 1, 0);
  await recordPointWeakAttack(combat, actor, item, firstPosition, defender);
  assert.equal(pointWeakBonusState(combat, actor, item, token(100, 400), defender), false);
  assert.equal(pointWeakBonusState(combat, actor, item, token(300, 100), defender), true);
  const rotatedDefender = { document: { ...defender.document, rotation: 90 } };
  assert.equal(pointWeakBonusState(combat, actor, item, firstPosition, rotatedDefender), false);
  assert.equal(pointWeakBonusState(combat, actor, item, token(300, 100), rotatedDefender), true);
});

test("Ponto Fraco mantém histórico isolado por alvo e arma e invalida estado geométrico legado", async () => {
  const combat = combatWithState({ pointWeak: { attacker: { enemyA: { weaponId: "old", side: "frente", x: 0, y: 0 } } } });
  const actor = { id: "attacker" };
  const item = { id: "rapier", system: { characteristics: { pontoFraco: { enabled: true, damageFormula: "1d8" } } } };
  const defenderA = token(100, 100, 1, 1, 0);
  const defenderB = token(400, 100, 1, 1, 0);
  const initial = token(100, 300, 1, 1, 0);
  await recordPointWeakAttack(combat, actor, item, initial, defenderA);
  await recordPointWeakAttack(combat, actor, item, initial, defenderB);
  assert.equal(pointWeakBonusState(combat, actor, item, token(300, 100), defenderA), true);
  assert.equal(pointWeakBonusState(combat, actor, item, token(600, 100), defenderB), true);
  assert.equal(pointWeakBonusState(combat, actor, { ...item, id: "different" }, token(300, 100), defenderA), false);
});

test("Golpe de Retaguarda classifica os setores pela rotação do atacante", () => {
  const attacker = token(100, 100, 2, 2, 0);
  assert.equal(getTargetPositionRelativeToAttacker(attacker, token(100, 300)), "frente");
  assert.equal(getTargetPositionRelativeToAttacker(attacker, token(100, -100)), "costas");
  assert.equal(getTargetPositionRelativeToAttacker(attacker, token(300, 100)), "lateral");
  assert.equal(getTargetPositionRelativeToAttacker({ document: { ...attacker.document, rotation: 90 } }, token(-100, 100)), "frente");
  assert.equal(getTargetPositionRelativeToAttacker({ document: { ...attacker.document, rotation: 180 } }, token(100, -100)), "frente");
  assert.equal(getTargetPositionRelativeToAttacker({ document: { ...attacker.document, rotation: 270 } }, token(300, 100)), "frente");
  assert.equal(getTargetPositionRelativeToAttacker(attacker, token(100, 100, 2, 2)), null);
});

test("detecta saída e entrada do alcance, mas não movimento interno", () => {
  assert.equal(didCrossWeaponReach(2, 4, 3), true);
  assert.equal(didCrossWeaponReach(4, 2, 3), true);
  assert.equal(didCrossWeaponReach(2, 3, 3), false);
  assert.equal(didCrossWeaponReach(3, 2, 3), true);
  assert.equal(didCrossWeaponReach(2, 2.5, 3), false);
});

test("mede distância pela borda dos tokens, respeitando token grande", () => {
  const attacker = token(0, 0, 1, 1);
  const largeTarget = token(300, 0, 2, 2);
  assert.equal(measureTokenDistanceAtPosition(attacker, largeTarget), 2);
  assert.equal(measureTokenDistanceAtPosition(attacker, largeTarget, { x: 100, y: 0 }), 0);
});

function combatWithState(initial = {}) {
  let state = structuredClone(initial);
  return {
    getFlag() { return state; },
    async setFlag(_scope, _key, value) { state = structuredClone(value); return state; }
  };
}

function delayedCombatWithState(initial = {}, delay = 5) {
  let state = structuredClone(initial);
  return {
    getFlag() { return state; },
    setFlag(_scope, _key, value) {
      return new Promise((resolve) => setTimeout(() => {
        state = structuredClone(value);
        resolve(state);
      }, delay));
    }
  };
}

function mergePartial(target, patch) {
  for (const [key, value] of Object.entries(patch)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      target[key] = mergePartial(
        target[key] && typeof target[key] === "object" ? target[key] : {},
        value
      );
    } else {
      target[key] = structuredClone(value);
    }
  }
  return target;
}

function partiallyMergedCombatWithState(initial = {}) {
  let state = structuredClone(initial);
  return {
    getFlag() { return state; },
    async setFlag(_scope, _key, value) {
      state = mergePartial(state, value);
      return state;
    }
  };
}

function combatWithUnsetFlag(initial = {}) {
  let state = structuredClone(initial);
  return {
    getFlag() { return state; },
    async setFlag(_scope, _key, value) {
      state = structuredClone(value);
      return state;
    },
    async unsetFlag() {
      state = undefined;
    }
  };
}

test("Sequencial acumula acertos com a mesma arma e persiste entre turnos", async () => {
  const combat = combatWithState();
  const actor = { id: "actor-1" };
  const weaponA = { id: "weapon-a" };
  const weaponB = { id: "weapon-b" };
  assert.equal(getSequentialBonusCount(combat, actor, weaponA), 0);
  assert.equal(getSequentialBonusState(combat, actor, weaponA), false);
  await recordSequentialOutcome(combat, actor, weaponA, { effectiveHit: true });
  assert.equal(getSequentialBonusCount(combat, actor, weaponA), 1);
  assert.deepEqual(combat.getFlag("contos-de-mar-e-terra", "weaponCombat").sequences[actor.id], { weaponId: weaponA.id, streak: 1 });
  assert.equal(getSequentialBonusState(combat, actor, weaponA), true);
  await recordSequentialOutcome(combat, actor, weaponA, { effectiveHit: true });
  assert.equal(getSequentialBonusCount(combat, actor, weaponA), 2);
  assert.equal(getSequentialBonusState(combat, actor, weaponA), true);
  await recordSequentialOutcome(combat, actor, weaponA, { effectiveHit: true });
  assert.equal(getSequentialBonusCount(combat, actor, weaponA), 3);
  assert.equal(getSequentialBonusState(combat, actor, weaponB), false);
  assert.equal(getSequentialBonusCount(combat, actor, weaponB), 0);
});

test("Erro ou defesa efetiva interrompe Sequencial; mudança de arma também", async () => {
  const combat = combatWithState();
  const actor = { id: "actor-1" };
  const weaponA = { id: "weapon-a" };
  const weaponB = { id: "weapon-b" };
  await recordSequentialOutcome(combat, actor, weaponA, { effectiveHit: true });
  await recordSequentialOutcome(combat, actor, weaponA, { effectiveHit: false });
  assert.equal(getSequentialBonusCount(combat, actor, weaponA), 0);
  assert.deepEqual(combat.getFlag("contos-de-mar-e-terra", "weaponCombat").sequences[actor.id], { weaponId: null, streak: 0 });
  assert.equal(getSequentialBonusState(combat, actor, weaponA), false);
  await recordSequentialOutcome(combat, actor, weaponA, { effectiveHit: true });
  await recordSequentialOutcome(combat, actor, weaponB, { effectiveHit: false });
  assert.equal(getSequentialBonusCount(combat, actor, weaponA), 0);
  assert.equal(getSequentialBonusState(combat, actor, weaponA), false);
  assert.equal(getSequentialBonusState(combat, actor, weaponB), false);
});

test("Sequencial não depende do alvo e é apagado ao terminar o combate", async () => {
  const combat = combatWithState();
  const actor = { id: "actor-1" };
  const weapon = { id: "weapon-a" };
  await recordSequentialOutcome(combat, actor, weapon, { effectiveHit: true });
  assert.equal(getSequentialBonusCount(combat, actor, weapon), 1);
  assert.equal(getSequentialBonusState(combat, actor, weapon), true);
  await clearWeaponCombatState(combat);
  assert.equal(getSequentialBonusCount(combat, actor, weapon), 0);
  assert.equal(getSequentialBonusState(combat, actor, weapon), false);
});

test("falha da perícia e defesa bem-sucedida zeram Sequencial antes do próximo acerto", async () => {
  const combat = combatWithState();
  const actor = { id: "actor-1" };
  const weapon = { id: "weapon-a" };
  await recordSequentialOutcome(combat, actor, weapon, { effectiveHit: true });
  await recordSequentialOutcome(combat, actor, weapon, { effectiveHit: true });
  await recordSequentialOutcome(combat, actor, weapon, { effectiveHit: true });
  assert.equal(getSequentialBonusCount(combat, actor, weapon), 3);

  const attackFailure = compareAttackAndDefense({ success: false, degree: "normalFailure", selectedRoll: 80 }, null);
  assert.equal(attackFailure.reason, "attackFailure");
  await recordSequentialOutcome(combat, actor, weapon, { effectiveHit: attackFailure.winner === "attack" });
  assert.deepEqual(combat.getFlag("contos-de-mar-e-terra", "weaponCombat").sequences[actor.id], { weaponId: null, streak: 0 });
  assert.equal(getSequentialBonusCount(combat, actor, weapon), 0);

  await recordSequentialOutcome(combat, actor, weapon, { effectiveHit: true });
  assert.equal(getSequentialBonusCount(combat, actor, weapon), 1);
  const defended = compareAttackAndDefense(
    { success: true, degree: "normalSuccess", selectedRoll: 50 },
    { success: true, degree: "goodSuccess", selectedRoll: 40 }
  );
  assert.equal(defended.winner, "defense");
  await recordSequentialOutcome(combat, actor, weapon, { effectiveHit: defended.winner === "attack" });
  assert.deepEqual(combat.getFlag("contos-de-mar-e-terra", "weaponCombat").sequences[actor.id], { weaponId: null, streak: 0 });
  assert.equal(getSequentialBonusCount(combat, actor, weapon), 0);

  await recordSequentialOutcome(combat, actor, weapon, { effectiveHit: true });
  assert.equal(getSequentialBonusCount(combat, actor, weapon), 1);
  await recordSequentialOutcome(combat, actor, weapon, { effectiveHit: true });
  assert.equal(getSequentialBonusCount(combat, actor, weapon), 2);
});

test("reset de Sequencial não é sobrescrito por uma atualização assíncrona antiga", async () => {
  const combat = delayedCombatWithState({
    sequences: { "actor-1": { weaponId: "weapon-a", streak: 3 } }
  });
  const actor = { id: "actor-1" };
  const weapon = { id: "weapon-a" };
  const defender = { document: { id: "target-1", x: 100, y: 0, rotation: 0 } };

  await Promise.all([
    recordSequentialOutcome(combat, actor, weapon, { effectiveHit: false }),
    recordImpactOutcome(combat, actor, weapon, defender, { effectiveHit: true })
  ]);

  assert.deepEqual(combat.getFlag("contos-de-mar-e-terra", "weaponCombat").sequences[actor.id], { weaponId: null, streak: 0 });
  assert.equal(getSequentialBonusCount(combat, actor, weapon), 0);
  await recordSequentialOutcome(combat, actor, weapon, { effectiveHit: true });
  assert.equal(getSequentialBonusCount(combat, actor, weapon), 1);
});

test("Impacto mantém o histórico independente por defensor", async () => {
  const combat = combatWithState();
  const actor = { id: "actor-1" };
  const weapon = { id: "weapon-a" };
  const firstTarget = { document: { id: "target-1", x: 100, y: 0, rotation: 0 } };
  const secondTarget = { document: { id: "target-2", x: 200, y: 0, rotation: 0 } };
  await recordImpactOutcome(combat, actor, weapon, firstTarget, { effectiveHit: true });
  await recordImpactOutcome(combat, actor, weapon, secondTarget, { effectiveHit: true });
  assert.equal(impactSequenceBonusState(combat, actor, weapon, firstTarget), true);
  assert.equal(impactSequenceBonusState(combat, actor, weapon, secondTarget), true);
  await recordImpactOutcome(combat, actor, weapon, firstTarget, { effectiveHit: false });
  assert.equal(impactSequenceBonusState(combat, actor, weapon, firstTarget), false);
  assert.equal(impactSequenceBonusState(combat, actor, weapon, secondTarget), true);
});

test("reset explícito sobrevive ao merge parcial e preserva outro personagem", async () => {
  const combat = partiallyMergedCombatWithState({
    sequences: {
      actor1: { weaponId: "arma1", streak: 0 },
      actor2: { weaponId: "arma2", streak: 4 }
    }
  });
  const actor = { id: "actor1" };
  const weapon = { id: "arma1" };

  for (let attack = 0; attack < 8; attack += 1) {
    await recordSequentialOutcome(combat, actor, weapon, { effectiveHit: true });
  }
  assert.equal(combat.getFlag("contos-de-mar-e-terra", "weaponCombat").sequences.actor1.streak, 8);

  await recordSequentialOutcome(combat, actor, weapon, { effectiveHit: false });
  assert.deepEqual(combat.getFlag("contos-de-mar-e-terra", "weaponCombat").sequences.actor1, { weaponId: null, streak: 0 });
  assert.deepEqual(combat.getFlag("contos-de-mar-e-terra", "weaponCombat").sequences.actor2, { weaponId: "arma2", streak: 4 });
  assert.equal(getSequentialBonusCount(combat, actor, weapon), 0);

  await recordSequentialOutcome(combat, actor, weapon, { effectiveHit: false });
  assert.deepEqual(combat.getFlag("contos-de-mar-e-terra", "weaponCombat").sequences.actor1, { weaponId: null, streak: 0 });

  await recordSequentialOutcome(combat, actor, weapon, { effectiveHit: true });
  assert.equal(getSequentialBonusCount(combat, actor, weapon), 1);
  await recordSequentialOutcome(combat, actor, weapon, { effectiveHit: true });
  assert.equal(getSequentialBonusCount(combat, actor, weapon), 2);
});

test("encerrar o combate remove o flag temporário inteiro", async () => {
  const combat = combatWithUnsetFlag({
    sequences: { actor1: { weaponId: "arma1", streak: 8 } },
    impact: { actor1: { streak: 1 } },
    conditions: { actor1: { dazed: true } }
  });
  await clearWeaponCombatState(combat);
  assert.equal(combat.getFlag("contos-de-mar-e-terra", "weaponCombat"), undefined);
});
