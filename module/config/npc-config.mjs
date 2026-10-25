export const NPC_ATTRIBUTE_DEFINITIONS = Object.freeze([
  { key: "fortitude", label: "CMET.NPC.Attributes.Fortitude" },
  { key: "forcaBruta", label: "CMET.NPC.Attributes.ForcaBruta" },
  { key: "agilidade", label: "CMET.NPC.Attributes.Agilidade" },
  { key: "movimentacaoEspecial", label: "CMET.NPC.Attributes.MovimentacaoEspecial" },
  { key: "ataquesSimples", label: "CMET.NPC.Attributes.AtaquesSimples" },
  { key: "ataquesDistancia", label: "CMET.NPC.Attributes.AtaquesDistancia" },
  { key: "ataqueMagico", label: "CMET.NPC.Attributes.AtaqueMagico" },
  { key: "sentidos", label: "CMET.NPC.Attributes.Sentidos" },
  { key: "esconder", label: "CMET.NPC.Attributes.Esconder" },
  { key: "defesa", label: "CMET.NPC.Attributes.Defesa" },
  { key: "intimidacao", label: "CMET.NPC.Attributes.Intimidacao" },
  { key: "astucia", label: "CMET.NPC.Attributes.Astucia" },
  { key: "persuasao", label: "CMET.NPC.Attributes.Persuasao" },
  { key: "vontade", label: "CMET.NPC.Attributes.Vontade" },
  { key: "instinto", label: "CMET.NPC.Attributes.Instinto" },
  { key: "conhecimento", label: "CMET.NPC.Attributes.Conhecimento" },
  { key: "investigacao", label: "CMET.NPC.Attributes.Investigacao" },
  { key: "artesanato", label: "CMET.NPC.Attributes.Artesanato" },
  { key: "orientacao", label: "CMET.NPC.Attributes.Orientacao" },
  { key: "coragem", label: "CMET.NPC.Attributes.Coragem" }
]);

export const NPC_CREATURE_TYPES = Object.freeze([
  { key: "humanoides", label: "CMET.NPC.CreatureTypes.Humanoides", subcategories: [] },
  { key: "feras", label: "CMET.NPC.CreatureTypes.Feras", subcategories: ["caravana", "matagal", "maritimas", "montanhesas", "profundezas"] },
  { key: "dragoes", label: "CMET.NPC.CreatureTypes.Dragoes", subcategories: ["caldeira", "coline", "caverna", "lagoa", "floresta"] },
  { key: "mortosVivos", label: "CMET.NPC.CreatureTypes.MortosVivos", subcategories: ["espiritosAgua", "espiritosFogo", "espiritosTerra", "espiritosVento"] },
  { key: "elementais", label: "CMET.NPC.CreatureTypes.Elementais", subcategories: ["agua", "fogo", "terra", "vento"] },
  { key: "construtos", label: "CMET.NPC.CreatureTypes.Construtos", subcategories: ["runicos", "mecanicos", "guardioes", "guerra"] },
  { key: "profanos", label: "CMET.NPC.CreatureTypes.Profanos", subcategories: ["ruina", "desejo", "fenda", "macula"] },
  { key: "luminares", label: "CMET.NPC.CreatureTypes.Luminares", subcategories: ["astrais", "juramento", "guardioes", "juizo"] },
  { key: "aberracoes", label: "CMET.NPC.CreatureTypes.Aberracoes", subcategories: [] },
  { key: "plantas", label: "CMET.NPC.CreatureTypes.Plantas", subcategories: [] }
]);

export const NPC_WEAPON_ATTRIBUTES = Object.freeze({
  espadas: "ataquesSimples", laminas: "ataquesSimples", armasDeHaste: "ataquesSimples",
  armasDeImpacto: "ataquesSimples", chicotes: "ataquesSimples", corpoACorpo: "ataquesSimples",
  arcos: "ataquesDistancia", arremessar: "ataquesDistancia"
});

export const NPC_DEFENSE_ATTRIBUTES = Object.freeze({ esquivar: "agilidade", bloquear: "defesa" });
export const NPC_SPELL_ATTRIBUTE = "ataqueMagico";

export function getNpcCreatureType(key) {
  return NPC_CREATURE_TYPES.find((entry) => entry.key === key) ?? null;
}
