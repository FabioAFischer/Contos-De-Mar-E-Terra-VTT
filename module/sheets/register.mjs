import { PersonagemSheet } from "./actor/personagem-sheet.mjs";
import { CmetItemSheet } from "./item/item-sheet.mjs";
import { ArmaSheet } from "./item/arma-sheet.mjs";
import { ArmaduraSheet } from "./item/armadura-sheet.mjs";
import { MagiaSheet } from "./item/magia-sheet.mjs";
import { HabilidadeSheet } from "./item/habilidade-sheet.mjs";

export function registerSheets() {
  const { DocumentSheetConfig } = foundry.applications.apps;
  const { Actor, Item } = foundry.documents;
  DocumentSheetConfig.registerSheet(
    Actor,
    game.system.id,
    PersonagemSheet,
    { types: ["personagem"], makeDefault: true, label: "CMET.Sheets.Personagem" }
  );
  DocumentSheetConfig.registerSheet(
    Item,
    game.system.id,
    CmetItemSheet,
    { types: ["equipamento"], makeDefault: true, label: "CMET.Sheets.Item" }
  );
  DocumentSheetConfig.registerSheet(
    Item,
    game.system.id,
    HabilidadeSheet,
    { types: ["habilidade"], makeDefault: true, label: "CMET.Sheets.Habilidade" }
  );
  DocumentSheetConfig.registerSheet(
    Item,
    game.system.id,
    ArmaSheet,
    { types: ["arma"], makeDefault: true, label: "CMET.Sheets.Arma" }
  );
  DocumentSheetConfig.registerSheet(
    Item,
    game.system.id,
    ArmaduraSheet,
    { types: ["armadura"], makeDefault: true, label: "CMET.Sheets.Armadura" }
  );
  DocumentSheetConfig.registerSheet(
    Item,
    game.system.id,
    MagiaSheet,
    { types: ["magia"], makeDefault: true, label: "CMET.Sheets.Magia" }
  );
}
