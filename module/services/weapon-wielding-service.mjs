import { WEAPON_QUALITIES } from "../config/weapon-config.mjs";
import { getAbilityDaEffects } from "./ability-da-service.mjs";

export const EMPUNHADURA_DO_MAIS_FORTE_EFFECT_ID = "hrodnar-empunhadura-superior";

function handGripPath(hand) {
  return hand === "offHand" ? "offHandGrip" : "mainHandGrip";
}

export function actorHasEmpunhaduraDoMaisForte(actor) {
  return [...(actor?.items?.contents ?? actor?.items ?? [])].some((item) => item.type === "habilidadeDa"
    && getAbilityDaEffects(item).some((effect) => effect.id === EMPUNHADURA_DO_MAIS_FORTE_EFFECT_ID && effect.activationType === "passiva"));
}

export function getWeaponGripEffect(item) {
  return getAbilityDaEffects(item).find((effect) => effect.id === EMPUNHADURA_DO_MAIS_FORTE_EFFECT_ID
    && effect.activationType === "passiva") ?? null;
}

export function reduceWeaponQuality(quality) {
  const index = WEAPON_QUALITIES.findIndex(({ key }) => key === quality);
  if (index <= 0) return WEAPON_QUALITIES[0]?.key ?? quality;
  return WEAPON_QUALITIES[index - 1].key;
}

export function resolveEffectiveWeaponWielding({ actor, item, hand = "mainHand", gripMode = null } = {}) {
  const characteristics = item?.system?.characteristics ?? {};
  const twoHanded = characteristics.duasMaos?.enabled === true;
  const polearm = characteristics.armaDeHaste?.enabled === true;
  const hands = actor?.system?.hands ?? {};
  const configuredGrip = gripMode ?? hands[handGripPath(hand)] ?? null;
  const hasException = twoHanded && actorHasEmpunhaduraDoMaisForte(actor);
  const isMainHand = hand === "mainHand";
  const selectedGrip = twoHanded
    ? (hasException && isMainHand && hands.offHand ? "umaMao" : (configuredGrip || (hands.offHand ? null : "duasMaos")))
    : "umaMao";
  const usesOneHand = twoHanded && selectedGrip === "umaMao";
  const usesTwoHands = twoHanded && selectedGrip === "duasMaos";
  const exceptionActive = usesOneHand && hasException;
  const canWield = item?.type === "arma"
    && item.system?.equipped === true
    && (twoHanded
      ? (usesTwoHands ? isMainHand && !hands.offHand : exceptionActive)
      : hand === "mainHand" || hand === "offHand");
  const originalQuality = item?.system?.quality ?? "normal";
  return {
    canWield,
    hasEmpunhaduraDoMaisForte: hasException,
    requiresTwoHands: twoHanded && !exceptionActive,
    originalQuality,
    effectiveQuality: exceptionActive ? reduceWeaponQuality(originalQuality) : originalQuality,
    hand,
    gripMode: selectedGrip,
    usesOneHand: twoHanded ? usesOneHand : true,
    usesTwoHands: twoHanded ? usesTwoHands : false,
    exceptionActive,
    polearm
  };
}

export function validateCombinedWeaponAttack({ actor, main, off } = {}) {
  const reasons = [];
  if (!main) reasons.push("missingMainWeapon");
  if (!off) reasons.push("missingOffHandWeapon");
  if (main && off && main.id === off.id) reasons.push("sameWeapon");
  if (main?.type !== "arma") reasons.push("invalidMainWeapon");
  if (off?.type !== "arma") reasons.push("invalidOffHandWeapon");
  if (main?.system?.equipped !== true) reasons.push("mainWeaponNotEquipped");
  if (off?.system?.equipped !== true) reasons.push("offHandWeaponNotEquipped");
  const mainWielding = resolveEffectiveWeaponWielding({ actor, item: main, hand: "mainHand" });
  const offWielding = resolveEffectiveWeaponWielding({ actor, item: off, hand: "offHand", gripMode: "umaMao" });
  if (main && !mainWielding.canWield) reasons.push("mainWeaponNotWielded");
  if (off && !offWielding.canWield) reasons.push("offHandWeaponNotWielded");
  if (main && mainWielding.usesOneHand !== true) reasons.push("mainWeaponNotEffectivelyOneHanded");
  if (off && offWielding.usesOneHand !== true) reasons.push("offHandWeaponNotEffectivelyOneHanded");
  return { valid: reasons.length === 0, reasons, mainWielding, offWielding };
}

export function getEffectiveWeaponCharacteristics(actor, item, hand = "mainHand") {
  const wielding = resolveEffectiveWeaponWielding({ actor, item, hand });
  const original = item?.system?.characteristics ?? {};
  const effective = Object.fromEntries(Object.entries(original).map(([key, value]) => [key, { ...value }]));
  if (wielding.usesOneHand) {
    effective.umaMao = { ...(effective.umaMao ?? {}), enabled: true };
    if (effective.duasMaos) effective.duasMaos = { ...effective.duasMaos, enabled: false };
  }
  return { original, effective, wielding };
}

export function getWeaponGripOptions(actor, item, hand = "mainHand") {
  if (item?.system?.characteristics?.duasMaos?.enabled !== true || hand !== "mainHand") return [{ key: "umaMao", label: "CMET.Weapon.Grip.OneHand" }];
  const options = [{ key: "duasMaos", label: "CMET.Weapon.Grip.TwoHands" }];
  if (actorHasEmpunhaduraDoMaisForte(actor)) options.push({ key: "umaMao", label: "CMET.Weapon.Grip.OneHandEmpunhadura" });
  return options;
}

export const WeaponWieldingService = Object.freeze({ actorHasEmpunhaduraDoMaisForte, getWeaponGripEffect, reduceWeaponQuality, resolveEffectiveWeaponWielding, getEffectiveWeaponCharacteristics, validateCombinedWeaponAttack, getWeaponGripOptions });
