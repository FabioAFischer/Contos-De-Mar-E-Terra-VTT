import { editDocumentImage } from "../../helpers/edit-document-image.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

export class CmetItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["cmet-sheet", "cmet-item-sheet"],
    position: { width: 520, height: 480 },
    actions: { editImage: editDocumentImage },
    form: { closeOnSubmit: false, submitOnChange: false }
  };

  static PARTS = {
    form: { template: "systems/contos-de-mar-e-terra/templates/item/item-sheet.hbs" }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    return {
      ...context,
      item: this.item,
      typeLabel: game.i18n.localize(`CMET.ItemTypes.${this.item.type}`)
    };
  }
}
