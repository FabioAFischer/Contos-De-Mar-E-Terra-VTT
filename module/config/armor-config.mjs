import { DAMAGE_TYPES } from "./weapon-config.mjs";

export const ARMOR_CATEGORIES = Object.freeze([
  { key: "armadura", label: "CMET.Armor.Categories.Armadura" },
  { key: "traje", label: "CMET.Armor.Categories.Traje" }
]);

export const ARMOR_ELEMENTS = Object.freeze(DAMAGE_TYPES.filter(({ key }) => ["fogo", "frio", "raio"].includes(key)));

export const ARMOR_CHARACTERISTICS = Object.freeze([
  { key: "encouracado", label: "CMET.Armor.Characteristics.Encouracado", parameters: [{ key: "reduction", field: "number", label: "CMET.Armor.Fields.Reduction" }] },
  { key: "absorcao", label: "CMET.Armor.Characteristics.Absorcao", parameters: [{ key: "reduction", field: "number", label: "CMET.Armor.Fields.Reduction" }] },
  { key: "carapaca", label: "CMET.Armor.Characteristics.Carapaca", parameters: [{ key: "reduction", field: "number", label: "CMET.Armor.Fields.Reduction" }] },
  { key: "selo", label: "CMET.Armor.Characteristics.Selo", parameters: [{ key: "reduction", field: "number", label: "CMET.Armor.Fields.MagicReduction" }] },
  { key: "revestimento", label: "CMET.Armor.Characteristics.Revestimento", parameters: [
    { key: "element", field: "select", label: "CMET.Armor.Fields.Element" },
    { key: "reduction", field: "number", label: "CMET.Armor.Fields.Reduction" }
  ] },
  { key: "discreto", label: "CMET.Armor.Characteristics.Discreto", parameters: [{ key: "bonus", field: "number", label: "CMET.Fields.Bonus" }] }
]);

export const ARMOR_REDUCTION_RULES = Object.freeze({
  encouracado: { channel: "type", target: "cortante", label: "CMET.Armor.Characteristics.Encouracado" },
  absorcao: { channel: "type", target: "impacto", label: "CMET.Armor.Characteristics.Absorcao" },
  carapaca: { channel: "type", target: "perfurante", label: "CMET.Armor.Characteristics.Carapaca" },
  selo: { channel: "nature", target: "magical", label: "CMET.Armor.Characteristics.Selo" },
  revestimento: { channel: "type", label: "CMET.Armor.Characteristics.Revestimento" }
});
