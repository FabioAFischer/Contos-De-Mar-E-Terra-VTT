import { SKILL_ROLL_DEGREES } from "./skill-roll-service.mjs";

export function characteristicEnabled(item, key) {
  return item?.system?.characteristics?.[key]?.enabled === true;
}

export function isRetaliarCritical(result, item) {
  return characteristicEnabled(item, "retaliar")
    && Number.isInteger(Number(result?.selectedRoll))
    && Number(result.selectedRoll) >= 1 && Number(result.selectedRoll) <= 10;
}

export function applyRetaliar(result, item) {
  if (!isRetaliarCritical(result, item)) return result;
  return { ...result, success: true, degree: SKILL_ROLL_DEGREES.CRITICAL_SUCCESS, retaliar: true };
}

export function getVersatileDamageParts(item, selections = {}) {
  const parts = Array.isArray(item?.system?.damage) ? item.system.damage : [];
  return parts.map((part, index) => {
    const available = Array.isArray(part.availableTypes) ? part.availableTypes : [];
    const selected = selections[index];
    return available.length && available.includes(selected) ? { ...part, type: selected } : { ...part };
  });
}

export function additionalDamageFormulas(item, { critical = false, sequential = false, pointWeak = false, polearm = false } = {}) {
  const characteristics = item?.system?.characteristics ?? {};
  const additions = [];
  const add = (key, enabled) => {
    const formula = characteristics[key]?.damageFormula?.trim();
    if (enabled && formula) additions.push({ formula, nature: "physical", type: "impacto", criticalMax: true, source: key });
  };
  add("sequencial", sequential);
  add("pontoFraco", pointWeak);
  add("armaDeHaste", polearm);
  const execute = characteristics.executar?.damageFormula?.trim();
  if (critical && characteristicEnabled(item, "executar") && execute) {
    additions.push({ formula: execute, nature: "physical", type: "impacto", criticalMax: false, source: "executar" });
  }
  return additions;
}

export function canFire(item) {
  return item?.system?.thrown !== true && (!characteristicEnabled(item, "recarregar") || item.system.loaded !== false);
}

export function shouldUnloadAfterShot(item) {
  return characteristicEnabled(item, "recarregar");
}

export function canRecover(item) {
  return characteristicEnabled(item, "arremessavel") && item?.system?.thrown === true;
}

export function canThrow(item) { return characteristicEnabled(item, "arremessavel") && item?.system?.thrown !== true; }

export const WeaponCharacteristicsService = Object.freeze({ characteristicEnabled, isRetaliarCritical, applyRetaliar, getVersatileDamageParts, additionalDamageFormulas, canFire, shouldUnloadAfterShot, canRecover, canThrow });
