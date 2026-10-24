const SIZE_STAGES = Object.freeze(["miudo", "pequeno", "medio", "grande", "enorme", "colossal"]);
const SIZE_ALIASES = Object.freeze({
  minúsculo: "miudo",
  minusculo: "miudo",
  diminuto: "miudo",
  médio: "medio",
  medio: "medio",
  grande: "grande",
  enorme: "enorme",
  colossal: "colossal"
});

function normalizeSize(value) {
  const key = String(value ?? "medio").trim().toLowerCase();
  return SIZE_ALIASES[key] ?? (SIZE_STAGES.includes(key) ? key : "medio");
}

export function getCreatureSize(actor) {
  const base = normalizeSize(actor?.system?.size ?? actor?.system?.creature?.size ?? actor?.system?.attributes?.size);
  const stored = actor?.getFlag?.(globalThis.game?.system?.id ?? "contos-de-mar-e-terra", "daSizeContributions");
  const bonus = Array.isArray(stored)
    ? stored.reduce((total, entry) => total + Math.max(0, Number(entry.stages) || 0), 0)
    : Number(actor?.getFlag?.(globalThis.game?.system?.id ?? "contos-de-mar-e-terra", "daSizeStages") ?? 0);
  return SIZE_STAGES[Math.min(SIZE_STAGES.length - 1, SIZE_STAGES.indexOf(base) + Math.max(0, bonus))];
}

export function compareCreatureSizes(sourceActor, targetActor) {
  const source = getCreatureSize(sourceActor);
  const target = getCreatureSize(targetActor);
  const difference = SIZE_STAGES.indexOf(target) - SIZE_STAGES.indexOf(source);
  return { source, target, difference, relation: difference < 0 ? "menor" : difference > 0 ? "maior" : "igual" };
}

export function nextCreatureSize(size) {
  const current = normalizeSize(size);
  return SIZE_STAGES[Math.min(SIZE_STAGES.length - 1, SIZE_STAGES.indexOf(current) + 1)];
}

export function getBaseCreatureSize(actor) {
  return normalizeSize(actor?.system?.size ?? actor?.system?.creature?.size ?? actor?.system?.attributes?.size);
}

export const CreatureSizeService = Object.freeze({ getCreatureSize, getBaseCreatureSize, compareCreatureSizes, nextCreatureSize });
