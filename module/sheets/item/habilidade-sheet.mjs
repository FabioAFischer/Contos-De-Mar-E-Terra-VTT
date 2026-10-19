import { ABILITY_CATEGORIES } from "../../config/ability-config.mjs";
import { ATTRIBUTE_DEFINITIONS, SKILL_LABELS } from "../../config/constants.mjs";
import { CmetTabbedItemSheet } from "./tabbed-item-sheet.mjs";

export class HabilidadeSheet extends CmetTabbedItemSheet {
  static DEFAULT_OPTIONS = {
    classes: ["cmet-sheet", "cmet-item-sheet", "cmet-configured-item-sheet", "cmet-ability-sheet"],
    position: { width: 620, height: 760 },
    form: { closeOnSubmit: false, submitOnChange: false }
  };

  static PARTS = { main: { template: "systems/contos-de-mar-e-terra/templates/item/habilidade-sheet.hbs", root: true } };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const system = this.item.system;
    return {
      ...context,
      item: this.item,
      system,
      categories: ABILITY_CATEGORIES.map((entry) => ({
        ...entry,
        label: game.i18n.localize(entry.label),
        selected: entry.key === system.category
      })),
      skillGroups: ATTRIBUTE_DEFINITIONS.map((definition) => ({
        label: game.i18n.localize(definition.label),
        skills: definition.skills.map((key) => ({ key, label: SKILL_LABELS[key], selected: key === system.rollSkill }))
      }))
    };
  }
}
