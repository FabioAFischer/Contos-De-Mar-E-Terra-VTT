export const WEAPON_QUALITIES = Object.freeze([
  { key: "inicial", label: "CMET.WeaponQualities.Inicial" },
  { key: "sucata", label: "CMET.WeaponQualities.Sucata" },
  { key: "danificado", label: "CMET.WeaponQualities.Danificado" },
  { key: "desgastado", label: "CMET.WeaponQualities.Desgastado" },
  { key: "normal", label: "CMET.WeaponQualities.Normal" },
  { key: "polido", label: "CMET.WeaponQualities.Polido" },
  { key: "excepcional", label: "CMET.WeaponQualities.Excepcional" },
  { key: "obraPrima", label: "CMET.WeaponQualities.ObraPrima" }
]);
export const WEAPON_COMBAT_SKILLS = Object.freeze([
  { key: "arcos", label: "CMET.Skills.arcos" }, { key: "armasDeHaste", label: "CMET.Skills.armasDeHaste" }, { key: "armasDeImpacto", label: "CMET.Skills.armasDeImpacto" }, { key: "arremessar", label: "CMET.Skills.arremessar" }, { key: "chicotes", label: "CMET.Skills.chicotes" }, { key: "corpoACorpo", label: "CMET.Skills.corpoACorpo" }, { key: "espadas", label: "CMET.Skills.espadas" }, { key: "laminas", label: "CMET.Skills.laminas" }
]);
export const DAMAGE_NATURES = Object.freeze([
  { key: "physical", label: "CMET.DamageNatures.Physical" },
  { key: "magical", label: "CMET.DamageNatures.Magical" }
]);
export const DAMAGE_TYPES = Object.freeze([
  { key: "cortante", label: "CMET.DamageTypes.Cortante" },
  { key: "impacto", label: "CMET.DamageTypes.Impacto" },
  { key: "perfurante", label: "CMET.DamageTypes.Perfurante" },
  { key: "fogo", label: "CMET.DamageTypes.Fogo" },
  { key: "frio", label: "CMET.DamageTypes.Frio" },
  { key: "raio", label: "CMET.DamageTypes.Raio" }
]);
export const WEAPON_CHARACTERISTICS = Object.freeze([
  { key: "umaMao", label: "CMET.WeaponCharacteristics.UmaMao" }, { key: "duasMaos", label: "CMET.WeaponCharacteristics.DuasMaos" }, { key: "pontoFraco", label: "CMET.WeaponCharacteristics.PontoFraco" }, { key: "impacto", label: "CMET.WeaponCharacteristics.Impacto" }, { key: "armaDeHaste", label: "CMET.WeaponCharacteristics.ArmaDeHaste" }, { key: "alcance", label: "CMET.WeaponCharacteristics.Alcance", parameters: [{ key: "spaces", field: "number", label: "CMET.Weapon.Fields.RangeMax", suffix: "CMET.Weapon.Fields.Spaces" }, { key: "bonus", field: "number", label: "CMET.Fields.Bonus" }] }, { key: "versatil", label: "CMET.WeaponCharacteristics.Versatil" }, { key: "arremessavel", label: "CMET.WeaponCharacteristics.Arremessavel" }, { key: "puxar", label: "CMET.WeaponCharacteristics.Puxar" }, { key: "retaliar", label: "CMET.WeaponCharacteristics.Retaliar" }, { key: "punhal", label: "CMET.WeaponCharacteristics.Punhal" }, { key: "sequencial", label: "CMET.WeaponCharacteristics.Sequencial", parameters: [{ key: "damageFormula", field: "text", label: "CMET.Fields.AdditionalDamage" }] }, { key: "golpeDeRetaguarda", label: "CMET.WeaponCharacteristics.GolpeDeRetaguarda" }, { key: "recarregar", label: "CMET.WeaponCharacteristics.Recarregar" }, { key: "executar", label: "CMET.WeaponCharacteristics.Executar", parameters: [{ key: "damageFormula", field: "text", label: "CMET.Fields.CriticalAdditionalDamage" }] }, { key: "armaDeManobra", label: "CMET.WeaponCharacteristics.ArmaDeManobra" }, { key: "cortarProjeteis", label: "CMET.WeaponCharacteristics.CortarProjeteis" }
]);
// TODO: Prender e Pancada aparecem em tabelas antigas, mas aguardam definição formal.
// TODO: Puxar possui descrições documentais divergentes; manter uma chave canônica.
