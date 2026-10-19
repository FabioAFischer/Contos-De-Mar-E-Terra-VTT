const SYSTEM_ID = "contos-de-mar-e-terra";
const MIGRATION_FLAG = "damageAndRangeMigrated";

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

async function migrateWeapon(item) {
  if (item.type !== "arma" || item.getFlag(SYSTEM_ID, MIGRATION_FLAG)) return;

  const source = item.toObject(true);
  const legacy = source.system?.range;
  const current = source.system?.characteristics?.alcance;
  const hasNewConfiguration = Boolean(current?.enabled || current?.spaces);
  const update = { [`flags.${SYSTEM_ID}.${MIGRATION_FLAG}`]: true };
  const damage = legacyDamageParts(source);
  if (damage) update["system.damage"] = damage;
  if (!legacy?.ranged && !damage) return;
  if (!hasNewConfiguration) {
    update["system.characteristics.alcance.enabled"] = true;
    update["system.characteristics.alcance.spaces"] = legacy.max ?? 0;
  }

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
