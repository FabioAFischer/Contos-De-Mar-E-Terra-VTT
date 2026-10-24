import test from "node:test";
import assert from "node:assert/strict";
import {
  actorHasEmpunhaduraDoMaisForte,
  getWeaponGripEffect,
  getEffectiveWeaponCharacteristics,
  validateCombinedWeaponAttack,
  getWeaponGripOptions,
  reduceWeaponQuality,
  resolveEffectiveWeaponWielding
} from "../module/services/weapon-wielding-service.mjs";

globalThis.foundry = {
  utils: {
    deepClone: (value) => structuredClone(value),
    randomID: () => "test-id"
  }
};

function weapon({ quality = "excepcional", twoHanded = true, equipped = true } = {}) {
  return {
    id: "weapon-1",
    type: "arma",
    system: {
      equipped,
      quality,
      characteristics: { duasMaos: { enabled: twoHanded } }
    }
  };
}

function actor({ mainHand = "weapon-1", offHand = "shield-1", grip = "umaMao", withAbility = true } = {}) {
  const items = [weapon()];
  if (withAbility) items.push({
    id: "ability-1",
    type: "habilidadeDa",
    system: { effects: [{ id: "hrodnar-empunhadura-superior", activationType: "passiva", enabled: true, operations: [{ type: "manual", manual: true }] }] }
  });
  return {
    system: { hands: { mainHand, offHand, mainHandGrip: grip, offHandGrip: "umaMao" } },
    items: { contents: items, get: (id) => items.find((item) => item.id === id) }
  };
}

test("Empunhadura do Mais Forte permite uma arma de duas mãos com uma mão", () => {
  const current = actor();
  assert.equal(actorHasEmpunhaduraDoMaisForte(current), true);
  assert.equal(getWeaponGripEffect(current.items.get("ability-1")).id, "hrodnar-empunhadura-superior");
  const result = resolveEffectiveWeaponWielding({ actor: current, item: current.items.get("weapon-1") });
  assert.equal(result.canWield, true);
  assert.equal(result.exceptionActive, true);
  assert.equal(result.effectiveQuality, "polido");
  const effective = getEffectiveWeaponCharacteristics(current, current.items.get("weapon-1"), "mainHand");
  assert.equal(effective.effective.umaMao.enabled, true);
  assert.equal(effective.effective.duasMaos.enabled, false);
});

test("a segunda arma de duas mãos também pode ocupar a mão secundária", () => {
  const current = actor();
  const result = resolveEffectiveWeaponWielding({ actor: current, item: current.items.get("weapon-1"), hand: "offHand", gripMode: "umaMao" });
  assert.equal(result.canWield, true);
  assert.equal(result.usesOneHand, true);
});

test("duas armas de duas mãos passam na validação combinada com a passiva", () => {
  const current = actor();
  const second = { ...weapon({ quality: "obraPrima" }), id: "weapon-2" };
  current.items.contents.push(second);
  current.system.hands.offHand = "weapon-2";
  const result = validateCombinedWeaponAttack({ actor: current, main: current.items.get("weapon-1"), off: second });
  assert.equal(result.valid, true);
  assert.deepEqual(result.reasons, []);
  assert.equal(result.mainWielding.effectiveQuality, "polido");
  assert.equal(result.offWielding.effectiveQuality, "excepcional");
});

test("sem a passiva, armas de duas mãos continuam bloqueadas no ataque combinado", () => {
  const current = actor({ withAbility: false, grip: "duasMaos" });
  const second = { ...weapon({ quality: "obraPrima" }), id: "weapon-2" };
  current.items.contents.push(second);
  current.system.hands.offHand = "weapon-2";
  const result = validateCombinedWeaponAttack({ actor: current, main: current.items.get("weapon-1"), off: second });
  assert.equal(result.valid, false);
  assert.ok(result.reasons.includes("mainWeaponNotWielded"));
});

test("a validação preserva bloqueios legítimos", () => {
  const current = actor({ withAbility: true });
  const main = current.items.get("weapon-1");
  assert.ok(validateCombinedWeaponAttack({ actor: current, main, off: main }).reasons.includes("sameWeapon"));
  const off = { ...weapon(), id: "weapon-2", system: { ...weapon().system, equipped: false } };
  assert.ok(validateCombinedWeaponAttack({ actor: current, main, off }).reasons.includes("offHandWeaponNotEquipped"));
});

test("sem a habilidade, uma arma de duas mãos exige a mão livre", () => {
  const current = actor({ withAbility: false, grip: "duasMaos" });
  const result = resolveEffectiveWeaponWielding({ actor: current, item: current.items.get("weapon-1") });
  assert.equal(result.canWield, false);
  assert.deepEqual(getWeaponGripOptions(current, current.items.get("weapon-1")), [{ key: "duasMaos", label: "CMET.Weapon.Grip.TwoHands" }]);
});

test("qualidade não desce abaixo de inicial", () => {
  assert.equal(reduceWeaponQuality("normal"), "desgastado");
  assert.equal(reduceWeaponQuality("inicial"), "inicial");
  assert.equal(reduceWeaponQuality("desconhecida"), "inicial");
});
