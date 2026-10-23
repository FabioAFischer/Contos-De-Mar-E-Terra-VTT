import { SKILL_ROLL_DEGREES } from "./skill-roll-service.mjs";
import { DAMAGE_NATURES, DAMAGE_TYPES } from "../config/weapon-config.mjs";

const VALID_DAMAGE_NATURES = new Set(DAMAGE_NATURES.map(({ key }) => key));
const VALID_DAMAGE_TYPES = new Set(DAMAGE_TYPES.map(({ key }) => key));

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

function scaleFormulaTerm(term, multiplier) {
  const match = term.match(/^([+-]?)(?:(\d*)d(\d+)|(\d+(?:\.\d+)?))$/i);
  if (!match) return null;
  const sign = match[1] === "+" ? "+" : match[1] === "-" ? "-" : "";
  if (match[3]) return `${sign}${Number(match[2] || 1) * multiplier}d${match[3]}`;
  return `${sign}${Number(match[4]) * multiplier}`;
}

/**
 * Multiplies dice and fixed modifiers independently when the expression is a
 * simple damage formula. More complex Roll expressions remain valid by being
 * grouped and multiplied as a whole.
 */
export function multiplyDamageFormula(formula, multiplier) {
  const count = Number(multiplier);
  if (!Number.isInteger(count) || count <= 0) return null;
  const normalized = String(formula ?? "").replace(/\s+/g, "").trim();
  if (!normalized) return "";
  const terms = normalized.match(/[+-]?[^+-]+/g);
  if (terms?.join("") === normalized) {
    const scaled = terms.map((term) => scaleFormulaTerm(term, count));
    if (scaled.every(Boolean)) return scaled.join("");
  }
  return `(${String(formula).trim()})*${count}`;
}

export function additionalDamageFormulas(item, { critical = false, sequential = false, pointWeak = false, polearm = false, reachDistance = null, versatileSelections = {} } = {}) {
  const characteristics = item?.system?.characteristics ?? {};
  const additions = [];
  const add = (key, enabled) => {
    const formula = characteristics[key]?.damageFormula?.trim();
    if (enabled && formula) additions.push({ formula, nature: "physical", type: "impacto", criticalMax: true, source: key });
  };
  add("sequencial", sequential);
  add("pontoFraco", pointWeak);
  add("armaDeHaste", polearm);
  const alcance = characteristics.alcance;
  const distance = Number(reachDistance);
  const damageParts = getVersatileDamageParts(item, versatileSelections);
  const damagePartIndex = Number(alcance?.damagePartIndex);
  const linkedPart = Number.isInteger(damagePartIndex) && damagePartIndex >= 0 ? damageParts[damagePartIndex] : null;
  const reachFormula = alcance?.damageFormula?.trim();
  const maximum = Number(alcance?.spaces);
  if (alcance?.enabled === true
    && Number.isInteger(distance) && distance > 0
    && Number.isInteger(maximum) && maximum > 0 && distance <= maximum
    && linkedPart
    && VALID_DAMAGE_NATURES.has(linkedPart.nature)
    && VALID_DAMAGE_TYPES.has(linkedPart.type)
    && reachFormula) {
    additions.push({
      formula: multiplyDamageFormula(reachFormula, distance),
      nature: linkedPart.nature,
      type: linkedPart.type,
      criticalMax: true,
      source: "alcance",
      sourcePartIndex: damagePartIndex
    });
  }
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

export const WeaponCharacteristicsService = Object.freeze({ characteristicEnabled, isRetaliarCritical, applyRetaliar, getVersatileDamageParts, multiplyDamageFormula, additionalDamageFormulas, canFire, shouldUnloadAfterShot, canRecover, canThrow });
