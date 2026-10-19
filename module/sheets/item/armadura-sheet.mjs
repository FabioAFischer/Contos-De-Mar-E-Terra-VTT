import { ARMOR_CATEGORIES, ARMOR_CHARACTERISTICS, ARMOR_ELEMENTS } from "../../config/armor-config.mjs";
import { WEAPON_QUALITIES } from "../../config/weapon-config.mjs";
import { CmetTabbedItemSheet } from "./tabbed-item-sheet.mjs";

export class ArmaduraSheet extends CmetTabbedItemSheet {
  static DEFAULT_OPTIONS = {
    classes: ["cmet-sheet", "cmet-item-sheet", "cmet-configured-item-sheet", "cmet-armor-sheet"],
    position: { width: 620, height: 760 },
    form: { closeOnSubmit: false, submitOnChange: false }
  };
  static PARTS = { main: { template: "systems/contos-de-mar-e-terra/templates/item/armadura-sheet.hbs", root: true } };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const system = this.item.system;
    return {
      ...context,
      item: this.item,
      system,
      categories: ARMOR_CATEGORIES.map((entry) => ({ ...entry, label: game.i18n.localize(entry.label), selected: entry.key === system.category })),
      qualities: WEAPON_QUALITIES.map((entry) => ({ ...entry, label: game.i18n.localize(entry.label), selected: entry.key === system.quality })),
      characteristics: ARMOR_CHARACTERISTICS.map((entry) => ({
        ...entry,
        label: game.i18n.localize(entry.label),
        enabled: Boolean(system.characteristics[entry.key].enabled),
        parameters: entry.parameters.map((parameter) => ({
          ...parameter,
          label: game.i18n.localize(parameter.label),
          value: system.characteristics[entry.key][parameter.key],
          options: parameter.field === "select" ? [
            { key: "", label: game.i18n.localize("CMET.Armor.Fields.NoElement"), selected: !system.characteristics[entry.key][parameter.key] },
            ...ARMOR_ELEMENTS.map((element) => ({ key: element.key, label: game.i18n.localize(element.label), selected: element.key === system.characteristics[entry.key][parameter.key] }))
          ] : []
        }))
      }))
    };
  }
}
