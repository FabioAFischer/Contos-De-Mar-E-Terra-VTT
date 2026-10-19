import { DAMAGE_NATURES, DAMAGE_TYPES, WEAPON_CHARACTERISTICS, WEAPON_COMBAT_SKILLS, WEAPON_QUALITIES } from "../../config/weapon-config.mjs";
import { CmetTabbedItemSheet } from "./tabbed-item-sheet.mjs";

export class ArmaSheet extends CmetTabbedItemSheet {
  static DEFAULT_OPTIONS = {
    classes: ["cmet-sheet", "cmet-item-sheet", "cmet-configured-item-sheet", "cmet-weapon-sheet"],
    position: { width: 620, height: 760 },
    form: { closeOnSubmit: false, submitOnChange: false }
  };
  static PARTS = { main: { template: "systems/contos-de-mar-e-terra/templates/item/arma-sheet.hbs", root: true } };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const system = this.item.system;
    return {
      ...context,
      item: this.item,
      system,
      qualities: WEAPON_QUALITIES.map((entry) => ({ ...entry, label: game.i18n.localize(entry.label), selected: entry.key === system.quality })),
      combatSkills: WEAPON_COMBAT_SKILLS.map((entry) => ({ ...entry, label: game.i18n.localize(entry.label), selected: entry.key === system.combatSkill })),
      damageParts: (Array.isArray(system.damage) ? system.damage : []).map((part, index) => ({
        ...part,
        index,
        natureOptions: DAMAGE_NATURES.map((entry) => ({ ...entry, label: game.i18n.localize(entry.label), selected: entry.key === part.nature })),
        typeOptions: DAMAGE_TYPES.map((entry) => ({ ...entry, label: game.i18n.localize(entry.label), selected: entry.key === part.type }))
      })),
      characteristics: WEAPON_CHARACTERISTICS.map((entry) => ({
        ...entry,
        label: game.i18n.localize(entry.label),
        enabled: Boolean(system.characteristics[entry.key].enabled),
        parameters: (entry.parameters ?? []).map((parameter) => ({ ...parameter, label: game.i18n.localize(parameter.label), suffix: parameter.suffix ? game.i18n.localize(parameter.suffix) : "", value: system.characteristics[entry.key][parameter.key] }))
      }))
    };
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    this._weaponRenderListeners?.abort();
    this._weaponRenderListeners = new AbortController();
    this._damageUpdate = this._damageUpdate ?? Promise.resolve();
    this.element.addEventListener("change", (event) => {
      if (!event.target.closest('[name^="system.damage."]')) return;
      event.stopPropagation();
      const damage = this.#readDamageRows(this.element);
      this._damageUpdate = this._damageUpdate.catch(() => {}).then(() => this.item.update({ "system.damage": damage }));
    }, { capture: true, signal: this._weaponRenderListeners.signal });
    this.element.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-damage-action]");
      if (!button) return;
      event.preventDefault();
      const damage = this.#readDamageRows(this.element);
      const index = Number(button.dataset.damageIndex);
      if (button.dataset.damageAction === "add") damage.push({ formula: "1d6", nature: "physical", type: "cortante" });
      if (button.dataset.damageAction === "remove" && Number.isInteger(index) && index >= 0 && index < damage.length) damage.splice(index, 1);
      else if (button.dataset.damageAction === "remove") return;
      this._damageUpdate = this._damageUpdate.catch(() => {}).then(() => this.item.update({ "system.damage": damage }));
      await this._damageUpdate;
    }, { signal: this._weaponRenderListeners.signal });
  }

  #readDamageRows(root) {
    return [...root.querySelectorAll("[data-damage-row]")].map((row) => ({
      formula: row.querySelector("[data-damage-formula], .cmet-damage-formula")?.value?.trim() ?? "",
      nature: row.querySelector("[data-damage-nature], .cmet-damage-nature")?.value ?? "physical",
      type: row.querySelector("[data-damage-type], .cmet-damage-type")?.value ?? "cortante"
    }));
  }
}
