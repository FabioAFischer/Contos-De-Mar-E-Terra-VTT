import { ARMOR_REDUCTION_RULES } from "../config/armor-config.mjs";
import { DAMAGE_TYPES } from "../config/weapon-config.mjs";

const ELEMENTAL_TYPES = new Set(["fogo", "frio", "raio"]);

function safeAmount(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

function localize(key) {
  return game.i18n.localize(key);
}

function typeLabel(type) {
  const definition = DAMAGE_TYPES.find((entry) => entry.key === type);
  return definition ? localize(definition.label) : type;
}

function sourceLabel(rule, target) {
  const label = localize(rule.label);
  return target ? `${label} ${typeLabel(target)}` : label;
}

export function collectReductionSources(actor) {
  const items = actor?.items?.contents ?? Array.from(actor?.items ?? []);
  const sources = [];
  for (const item of items) {
    if (item.type !== "armadura" || item.system?.equipped !== true) continue;
    for (const [key, rule] of Object.entries(ARMOR_REDUCTION_RULES)) {
      const characteristic = item.system?.characteristics?.[key];
      if (characteristic?.enabled !== true) continue;
      const target = key === "revestimento" ? characteristic.element : rule.target;
      if (key === "revestimento" && !ELEMENTAL_TYPES.has(target)) continue;
      const amount = safeAmount(characteristic.reduction);
      if (!amount) continue;
      sources.push({
        sourceItemId: item.id,
        sourceItemName: item.name,
        key,
        label: sourceLabel(rule, target),
        channel: rule.channel,
        target,
        amount
      });
    }
  }
  for (const modifier of actor?.getFlag?.(globalThis.game?.system?.id ?? "contos-de-mar-e-terra", "daArmor") ?? []) {
    if (modifier.key !== "carapaca" || !safeAmount(modifier.amount)) continue;
    sources.push({ sourceItemId: modifier.source, sourceItemName: "Habilidade DA", key: "carapaca", label: "CMET.Armor.Characteristics.Carapaca", channel: "type", target: "perfurante", amount: safeAmount(modifier.amount) });
  }
  return sources;
}

export function resolveDamageGroup(group, reductionSources) {
  const rawDamage = Math.max(0, safeAmount(group?.rawDamage));
  const reductions = reductionSources.filter((source) => (
    source.channel === "nature" && source.target === group.nature
  ) || (
    source.channel === "type" && source.target === group.type
  ));
  const availableReduction = reductions.reduce((total, source) => total + source.amount, 0);
  const appliedReduction = Math.min(rawDamage, availableReduction);
  return {
    ...group,
    rawDamage,
    availableReduction,
    appliedReduction,
    finalDamage: rawDamage - appliedReduction,
    reductions
  };
}

export function resolveDamageGroups(groups, reductionSources) {
  return groups.map((group) => resolveDamageGroup(group, reductionSources));
}

export function calculateDamageTotals(groups) {
  return groups.reduce((totals, group) => ({
    totalRawDamage: totals.totalRawDamage + group.rawDamage,
    totalAvailableReduction: totals.totalAvailableReduction + group.availableReduction,
    totalAppliedReduction: totals.totalAppliedReduction + group.appliedReduction,
    totalFinalDamage: totals.totalFinalDamage + group.finalDamage
  }), {
    totalRawDamage: 0,
    totalAvailableReduction: 0,
    totalAppliedReduction: 0,
    totalFinalDamage: 0
  });
}

export function resolveDamageReduction({ groups, actor }) {
  const reductionSources = collectReductionSources(actor);
  const resolvedGroups = resolveDamageGroups(groups, reductionSources);
  return {
    groups: resolvedGroups,
    reductionSources,
    ...calculateDamageTotals(resolvedGroups)
  };
}

export const DamageReductionService = Object.freeze({
  collectReductionSources,
  resolveDamageGroup,
  resolveDamageGroups,
  calculateDamageTotals,
  resolveDamageReduction
});
