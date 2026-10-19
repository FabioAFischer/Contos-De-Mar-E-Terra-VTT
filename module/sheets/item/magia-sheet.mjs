import { ATTRIBUTE_DEFINITIONS } from "../../config/constants.mjs";
import { CmetTabbedItemSheet } from "./tabbed-item-sheet.mjs";

export class MagiaSheet extends CmetTabbedItemSheet {
  static DEFAULT_OPTIONS = {
    classes: ["cmet-sheet", "cmet-item-sheet", "cmet-configured-item-sheet", "cmet-spell-sheet"],
    position: { width: 620, height: 760 },
    form: { closeOnSubmit: false, submitOnChange: false }
  };
  static PARTS = { main: { template: "systems/contos-de-mar-e-terra/templates/item/magia-sheet.hbs", root: true } };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    return {
      ...context,
      item: this.item,
      system: this.item.system,
      schools: ATTRIBUTE_DEFINITIONS.find(({ key }) => key === "magia").skills.map((key) => ({
        key,
        label: game.i18n.localize(`CMET.Spell.Schools.${key}`),
        selected: key === this.item.system.school
      }))
    };
  }
}
