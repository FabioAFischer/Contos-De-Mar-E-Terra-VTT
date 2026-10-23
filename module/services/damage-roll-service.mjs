import { DAMAGE_NATURES, DAMAGE_TYPES } from "../config/weapon-config.mjs";
import { ARMOR_REDUCTION_RULES } from "../config/armor-config.mjs";
import { getVersatileDamageParts, additionalDamageFormulas } from "./weapon-characteristics-service.mjs";

const VALID_NATURES = new Set(DAMAGE_NATURES.map(({ key }) => key));
const VALID_TYPES = new Set(DAMAGE_TYPES.map(({ key }) => key));

export function normalizeDamageParts(source) {
  const parts = Array.isArray(source?.system?.damage) ? source.system.damage : Array.isArray(source?.damage) ? source.damage : [];
  return parts.map((part) => ({
    formula: String(part?.formula ?? "").trim(),
    nature: VALID_NATURES.has(part?.nature) ? part.nature : "physical",
    type: VALID_TYPES.has(part?.type) ? part.type : "cortante",
    availableTypes: Array.isArray(part?.availableTypes) ? part.availableTypes.filter((type) => VALID_TYPES.has(type)) : [],
    ...(part?.criticalMax === false ? { criticalMax: false } : {}),
    ...(part?.source ? { source: part.source } : {})
  }));
}

export function groupDamageComponents(components) {
  const groups = [];
  const byKey = new Map();
  for (const component of components) {
    const key = `${component.nature}:${component.type}`;
    let group = byKey.get(key);
    if (!group) {
      group = { nature: component.nature, type: component.type, rawDamage: 0, components: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.rawDamage += component.total;
    group.components.push(component);
  }
  return groups;
}

export function getMaximumRollTotal(roll) {
  if (!roll?.clone || !roll.evaluateSync) throw new TypeError("CMET | Roll inválida para calcular o máximo.");
  const maximumRoll = roll.clone();
  maximumRoll.evaluateSync({ maximize: true, strict: true });
  const maximum = Number(maximumRoll.total);
  if (!Number.isFinite(maximum)) throw new TypeError("CMET | Não foi possível calcular o máximo da Roll.");
  return maximum;
}

function invalidFormula(item, formula) {
  ui.notifications.warn(game.i18n.format("CMET.Damage.Notifications.InvalidFormula", { weapon: item?.name ?? "", formula }));
}

function missingDamage(item) {
  ui.notifications.warn(game.i18n.format("CMET.Damage.Notifications.MissingDamage", { weapon: item?.name ?? "" }));
}

function emptyFormula(item) {
  ui.notifications.warn(game.i18n.format("CMET.Damage.Notifications.EmptyFormula", { weapon: item?.name ?? "" }));
}

export async function rollWeaponDamage(item, { attacker = null, target = null, critical = false, versatileSelections = {}, sequential = false, pointWeak = false, polearm = false } = {}) {
  const parts = normalizeDamageParts({ damage: getVersatileDamageParts(item, versatileSelections) });
  parts.push(...additionalDamageFormulas(item, { critical, sequential, pointWeak, polearm }));
  if (!parts.length) {
    missingDamage(item);
    return null;
  }
  const emptyPart = parts.find(({ formula }) => !formula);
  if (emptyPart) {
    emptyFormula(item);
    return null;
  }
  const prepared = [];
  for (const part of parts) {
    try {
      prepared.push({ ...part, roll: new Roll(part.formula) });
    } catch (error) {
      invalidFormula(item, part.formula);
      return null;
    }
  }
  const components = [];
  for (const part of prepared) {
    let rolledDamage;
    let maximumDamage;
    try {
      await part.roll.evaluate();
      rolledDamage = Number(part.roll.total);
      maximumDamage = critical && part.criticalMax !== false ? getMaximumRollTotal(part.roll) : null;
      if (!Number.isFinite(rolledDamage) || (critical && part.criticalMax !== false && !Number.isFinite(maximumDamage))) throw new TypeError("Invalid damage total");
    } catch (error) {
      invalidFormula(item, part.formula);
      return null;
    }
    components.push({
      ...part,
      rolledDamage,
      ...(critical ? { maximumDamage } : {}),
      total: critical && part.criticalMax !== false ? rolledDamage + maximumDamage : rolledDamage,
      critical
    });
  }
  const groups = groupDamageComponents(components);
  return { weapon: item, attacker, target, critical, components, groups, totalRawDamage: groups.reduce((total, group) => total + group.rawDamage, 0) };
}

function localizedDamageLabel(namespace, key) {
  const entry = namespace.find((candidate) => candidate.key === key);
  return entry ? game.i18n.localize(entry.label) : key;
}

export async function sendDamageToChat(result, { attackerName, defenderName, item, damageApplication = null } = {}) {
  const { renderTemplate } = foundry.applications.handlebars;
  const presentation = {
    attackerName,
    defenderName,
    critical: Boolean(result.critical),
    groups: result.groups.map((group) => {
      const reductions = group.reductions ?? [];

      return {
        ...group,
        natureLabel: localizedDamageLabel(DAMAGE_NATURES, group.nature),
        typeLabel: localizedDamageLabel(DAMAGE_TYPES, group.type),
        components: group.components.map(({ formula, total, rolledDamage, maximumDamage, critical }) => ({ formula, total, rolledDamage, maximumDamage, critical })),
        reductions: reductions.map((reduction) => ({
          ...reduction,
          displayLabel: reduction.key === "revestimento"
            ? reduction.label
            : game.i18n.localize(ARMOR_REDUCTION_RULES[reduction.key]?.label ?? reduction.label)
        }))
      };
    })
  };
  const content = await renderTemplate("systems/contos-de-mar-e-terra/templates/chat/damage-card.hbs", {
    ...presentation,
    damageApplication,
    totalRawDamage: result.totalRawDamage,
    totalAppliedReduction: result.totalAppliedReduction ?? 0,
    totalFinalDamage: result.totalFinalDamage ?? result.totalRawDamage
  });
  const rolls = result.components.map(({ roll }) => roll);
  const speaker = ChatMessage.getSpeaker({ actor: item?.parent?.actor ?? item?.parent });
  return ChatMessage.create({ speaker, content, rolls: rolls.map((roll) => roll.toJSON()) });
}

export const DamageRollService = Object.freeze({ getMaximumRollTotal, rollWeaponDamage, sendDamageToChat });
