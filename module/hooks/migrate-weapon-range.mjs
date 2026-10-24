const SYSTEM_ID = "contos-de-mar-e-terra";
const MIGRATION_FLAG = "damageAndRangeMigrated";
const POLEARM_MIGRATION_FLAG = "polearmReachMigrated";
const APUNHALHAR_MIGRATION_FLAG = "apunhalharMigrated";

function legacyDamageParts(source) {
  const current = source.system?.damage;
  if (Array.isArray(current) && current.length) return null;
  const oldFormula = source.system?.damageFormula || current?.formula;
  if (typeof oldFormula !== "string" || !oldFormula.trim()) return null;
  const oldTypes = current?.types ?? {};
  const magicalType = Object.keys(oldTypes).find((key) => key.endsWith("Magico") && oldTypes[key]);
  const type = magicalType
    ? magicalType.replace(/Magico$/, "")
    : Object.keys(oldTypes).find((key) => oldTypes[key] && ["cortante", "impacto", "perfurante", "fogo", "frio", "raio"].includes(key)) ?? "cortante";
  return [{ formula: oldFormula.trim(), nature: magicalType ? "magical" : "physical", type }];
}

export async function migrateWeapon(item) {
  if (item.type !== "arma") return;

  const source = item.toObject(true);
  const update = {};

  if (!item.getFlag(SYSTEM_ID, APUNHALHAR_MIGRATION_FLAG)) {
    const characteristics = {
      ...(item._source?.system?.characteristics ?? {}),
      ...(source.system?.characteristics ?? {})
    };
    const legacyStab = characteristics.punhal;
    const currentStab = characteristics.apunhalhar;
    if (legacyStab?.enabled === true && currentStab?.enabled !== true) {
      update["system.characteristics.apunhalhar.enabled"] = true;
      update["system.characteristics.apunhalhar.damageFormula"] = String(legacyStab.damageFormula ?? "1d8").trim() || "1d8";
      update["system.characteristics.apunhalhar.damagePartIndex"] = Number.isInteger(Number(legacyStab.damagePartIndex)) ? Number(legacyStab.damagePartIndex) : 0;
    }
    if (legacyStab?.enabled === true) update["system.characteristics.punhal.enabled"] = false;
    update[`flags.${SYSTEM_ID}.${APUNHALHAR_MIGRATION_FLAG}`] = true;
  }

  if (!item.getFlag(SYSTEM_ID, MIGRATION_FLAG)) {
    const legacy = source.system?.range;
    const current = source.system?.characteristics?.alcance;
    const hasNewConfiguration = Boolean(current?.enabled || current?.spaces);
    const damage = legacyDamageParts(source);
    if (damage) update["system.damage"] = damage;
    if (legacy?.ranged && !hasNewConfiguration) {
      update["system.characteristics.alcance.enabled"] = true;
      update["system.characteristics.alcance.spaces"] = legacy.max ?? 0;
    }
    update[`flags.${SYSTEM_ID}.${MIGRATION_FLAG}`] = true;
  }

  if (!item.getFlag(SYSTEM_ID, POLEARM_MIGRATION_FLAG)) {
    const polearm = source.system?.characteristics?.armaDeHaste;
    const oldReach = source.system?.characteristics?.alcance;
    if (polearm?.enabled === true && Number(polearm.spaces) <= 0 && Number(oldReach?.spaces) > 0) {
      update["system.characteristics.armaDeHaste.spaces"] = Number(oldReach.spaces);
    }
    update[`flags.${SYSTEM_ID}.${POLEARM_MIGRATION_FLAG}`] = true;
  }

  if (!Object.keys(update).length) return;

  // A marca impede que um alcance desativado voluntariamente seja reativado no próximo login.
  await item.update(update);
}

export async function migrateWeaponRanges() {
  if (!game.user.isGM) return;
  const items = [...game.items.contents, ...game.actors.contents.flatMap((actor) => actor.items.contents)];
  for (const item of items) {
    try {
      await migrateWeapon(item);
    } catch (error) {
      console.error(`CMET | Falha ao migrar alcance da arma ${item.uuid}`, error);
    }
  }
}
