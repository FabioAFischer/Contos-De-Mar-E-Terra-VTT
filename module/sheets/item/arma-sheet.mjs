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
    const versatileEnabled = Boolean(system.characteristics?.versatil?.enabled);
    const damageParts = (Array.isArray(system.damage) ? system.damage : []).map((part, index) => ({
      ...part,
      index,
      natureOptions: DAMAGE_NATURES.map((entry) => ({ ...entry, label: game.i18n.localize(entry.label), selected: entry.key === part.nature })),
      typeOptions: DAMAGE_TYPES.map((entry) => ({ ...entry, label: game.i18n.localize(entry.label), selected: entry.key === part.type })),
      availableTypeOptions: DAMAGE_TYPES.map((entry) => ({ ...entry, label: game.i18n.localize(entry.label), selected: (part.availableTypes ?? []).includes(entry.key) })),
      availableTypes: Array.isArray(part.availableTypes) ? part.availableTypes : []
    }));
    const damagePartOptions = (characteristicKey) => damageParts.map((part) => ({
      value: part.index,
      label: game.i18n.format("CMET.Weapon.Fields.DamagePartOption", {
        index: part.index + 1,
        formula: part.formula || game.i18n.localize("CMET.Weapon.Fields.NoDamageFormula")
      }),
      selected: Number(system.characteristics?.[characteristicKey]?.damagePartIndex) === part.index
    }));
    return {
      ...context,
      item: this.item,
      system,
      versatileEnabled,
      qualities: WEAPON_QUALITIES.map((entry) => ({ ...entry, label: game.i18n.localize(entry.label), selected: entry.key === system.quality })),
      combatSkills: WEAPON_COMBAT_SKILLS.map((entry) => ({ ...entry, label: game.i18n.localize(entry.label), selected: entry.key === system.combatSkill })),
      damageParts,
      characteristics: WEAPON_CHARACTERISTICS.map((entry) => ({
        ...entry,
        label: game.i18n.localize(entry.label),
        enabled: Boolean(system.characteristics[entry.key].enabled),
        parameters: (entry.parameters ?? []).map((parameter) => ({
          ...parameter,
          label: game.i18n.localize(parameter.label),
          suffix: parameter.suffix ? game.i18n.localize(parameter.suffix) : "",
          value: system.characteristics[entry.key][parameter.key],
          options: ["alcance", "apunhalhar", "sequencial"].includes(entry.key) && parameter.key === "damagePartIndex"
            ? damagePartOptions(entry.key)
            : parameter.options
        }))
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
    this.element.addEventListener("change", (event) => {
      if (event.target.name === "system.characteristics.versatil.enabled") this.render();
    }, { signal: this._weaponRenderListeners.signal });
    this.element.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-damage-action]");
      if (!button) return;
      event.preventDefault();
      const damage = this.#readDamageRows(this.element);
      const index = Number(button.dataset.damageIndex);
      if (button.dataset.damageAction === "add") damage.push({ formula: "1d6", nature: "physical", type: "cortante", availableTypes: [] });
      const update = { "system.damage": damage };
      if (button.dataset.damageAction === "remove") {
        if (!Number.isInteger(index) || index < 0 || index >= damage.length) return;
        damage.splice(index, 1);
        for (const characteristicKey of ["alcance", "sequencial"]) {
          const linkedIndex = Number(this.element.querySelector(`[name="system.characteristics.${characteristicKey}.damagePartIndex"]`)?.value);
          if (!Number.isInteger(linkedIndex)) continue;
          const nextIndex = damage.length === 0 ? 0 : index < linkedIndex ? linkedIndex - 1 : Math.min(linkedIndex, damage.length - 1);
          update[`system.characteristics.${characteristicKey}.damagePartIndex`] = nextIndex;
        }
      }
      this._damageUpdate = this._damageUpdate.catch(() => {}).then(() => this.item.update(update));
      await this._damageUpdate;
    }, { signal: this._weaponRenderListeners.signal });
  }

  #readDamageRows(root) {
    return [...root.querySelectorAll("[data-damage-row]")].map((row) => ({
      formula: row.querySelector("[data-damage-formula], .cmet-damage-formula")?.value?.trim() ?? "",
      nature: row.querySelector("[data-damage-nature], .cmet-damage-nature")?.value ?? "physical",
      type: row.querySelector("[data-damage-type], .cmet-damage-type")?.value ?? "cortante",
      availableTypes: [...row.querySelectorAll("[data-damage-available-type]:checked")].map((input) => input.value).concat(
        [...row.querySelectorAll("[data-damage-available-type-preserved]")].map((input) => input.value)
      )
    }));
  }
}
