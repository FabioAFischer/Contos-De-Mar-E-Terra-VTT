import { ACTOR_TYPES, ITEM_TYPES } from "../config/constants.mjs";
import { PersonagemData } from "./actor/personagem-data.mjs";
import { EquipamentoData } from "./item/equipamento-data.mjs";
import { HabilidadeData } from "./item/habilidade-data.mjs";
import { MagiaData } from "./item/magia-data.mjs";
import { ArmaData } from "./item/arma-data.mjs";
import { ArmaduraData } from "./item/armadura-data.mjs";

export function registerDataModels() {
  CONFIG.Actor.dataModels[ACTOR_TYPES.PERSONAGEM] = PersonagemData;
  CONFIG.Item.dataModels[ITEM_TYPES.EQUIPAMENTO] = EquipamentoData;
  CONFIG.Item.dataModels[ITEM_TYPES.HABILIDADE] = HabilidadeData;
  CONFIG.Item.dataModels[ITEM_TYPES.MAGIA] = MagiaData;
  CONFIG.Item.dataModels[ITEM_TYPES.ARMA] = ArmaData;
  CONFIG.Item.dataModels[ITEM_TYPES.ARMADURA] = ArmaduraData;
}
