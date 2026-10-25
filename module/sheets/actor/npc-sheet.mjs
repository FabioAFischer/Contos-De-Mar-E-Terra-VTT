import { ITEM_TYPES } from "../../config/constants.mjs";
import { NPC_ATTRIBUTE_DEFINITIONS, NPC_CREATURE_TYPES } from "../../config/npc-config.mjs";
import { resolveActorItemRollSkill, rollItemSkill } from "../../services/item-roll-service.mjs";
import { startNaturalAttack, startWeaponAttack } from "../../services/combat-attack-service.mjs";
import { openSkillRollDialog } from "../../dialogs/skill-roll-dialog.mjs";
import { resolveActorSkillValue } from "../../services/skill-roll-service.mjs";
import { collectReductionSources } from "../../services/damage-reduction-service.mjs";
import { CombatActionService } from "../../services/combat-action-service.mjs";
import { CREATURE_SIZE_OPTIONS } from "../../config/creature-size-config.mjs";
import { DA_OPERATION_TYPES } from "../../config/ability-da-config.mjs";
import { getAbilityDaActions, getAbilityDaEffect, getAbilityDaEffects, activateAbilityDaEffect, activateNorisAbilityAction, toggleAbilityDaEffect } from "../../services/ability-da-service.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

function getSheetCombatant(actor) {
  const combat = globalThis.game?.combat;
  if (!combat?.started || !actor) return null;
  const tokenId = actor.token?.document?.id ?? actor.token?.id ?? null;
  if (tokenId) return combat.combatants.find((entry) => entry.tokenId === tokenId) ?? null;
  return combat.combatants.find((entry) => entry.actor === actor || entry.actor?.uuid === actor.uuid) ?? null;
}

function resolveActorToken(actor) {
  return actor?.token?.object
    ?? actor?.token
    ?? Array.from(globalThis.canvas?.tokens?.placeables ?? []).find((token) => token.actor === actor || token.actor?.uuid === actor?.uuid || token.actor?.id === actor?.id)
    ?? null;
}

const DA_SPECIAL_OPERATION_LABELS = Object.freeze(Object.fromEntries(
  DA_OPERATION_TYPES.map(({ key, label }) => [key, label])
));

const TOGGLEABLE_PASSIVE_OPERATIONS = new Set(["armorBonus", "sizeIncrease"]);

export class NpcSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  constructor(...args) {
    super(...args);
    this._uiState = { scrollByTab: { status: 0, atributos: 0, equipamentos: 0, habilidades: 0, magias: 0, descricao: 0 } };
  }

  static DEFAULT_OPTIONS = { classes: ["cmet-sheet", "cmet-actor-sheet", "cmet-npc-sheet"], position: { width: 900, height: 760 }, form: { closeOnSubmit: false, submitOnChange: false } };
  static PARTS = { main: { template: "systems/contos-de-mar-e-terra/templates/actor/npc-sheet.hbs", root: true } };
  static TABS = { primary: { tabs: [{ id: "status", label: "CMET.NPC.Tabs.Status" }, { id: "atributos", label: "CMET.NPC.Tabs.Attributes" }, { id: "equipamentos", label: "CMET.NPC.Tabs.Equipment" }, { id: "habilidades", label: "CMET.NPC.Tabs.Abilities" }, { id: "magias", label: "CMET.NPC.Tabs.Spells" }, { id: "descricao", label: "CMET.NPC.Tabs.Description" }], initial: "status" } };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const system = this.actor.system;
    const classification = system.classification;
    const creatureType = NPC_CREATURE_TYPES.find(({ key }) => key === classification.type) ?? NPC_CREATURE_TYPES[0];
    const items = this.actor.items.contents;
    const itemContext = (item) => ({ id: item.id, name: item.name, img: item.img, type: item.type, description: item.system.description || "", equipped: item.system.equipped === true, roll: resolveActorItemRollSkill(this.actor, item) });
    const abilityDaContext = (item) => {
      const specialActions = getAbilityDaActions(item);
      const effects = getAbilityDaEffects(item, { includeDisabled: true }).map((effect) => {
        const actions = specialActions
          .filter((action) => action.effectId === effect.id && action.operationType)
          .map((action) => ({ ...action, label: DA_SPECIAL_OPERATION_LABELS[action.operationType] ?? action.label }));
        const canToggle = effect.activationType === "passiva"
          && (effect.operations ?? []).some((operation) => TOGGLEABLE_PASSIVE_OPERATIONS.has(operation.type));
        return {
          id: effect.id,
          name: effect.name || game.i18n.localize("CMET.AbilityDa.Actions.UntitledEffect"),
          activationType: effect.activationType,
          activationLabel: game.i18n.localize(`CMET.AbilityDa.Activation.${effect.activationType === "passiva" ? "Passive" : effect.activationType === "reativa" ? "Reactive" : "Active"}`),
          active: effect.active === true,
          enabled: effect.enabled !== false,
          hasRolls: Array.isArray(effect.rolls) && effect.rolls.length > 0,
          actions,
          canActivate: effect.enabled !== false && actions.length === 0 && (["ativa", "reativa"].includes(effect.activationType) || canToggle)
        };
      });
      return {
        ...itemContext(item),
        isDa: true,
        effects
      };
    };
    const groups = {
      armas: items.filter((item) => item.type === ITEM_TYPES.ARMA).map(itemContext),
      armaduras: items.filter((item) => item.type === ITEM_TYPES.ARMADURA).map(itemContext),
      equipamentos: items.filter((item) => item.type === ITEM_TYPES.EQUIPAMENTO).map(itemContext),
      habilidades: items.filter((item) => item.type === ITEM_TYPES.HABILIDADE).map(itemContext),
      habilidadesDa: items.filter((item) => item.type === ITEM_TYPES.HABILIDADE_DA).map(abilityDaContext),
      magias: items.filter((item) => item.type === ITEM_TYPES.MAGIA).map(itemContext)
    };
    const conditionFlags = this.actor.getFlag?.(game.system.id, "conditions") ?? {};
    const conditions = Object.entries(conditionFlags).filter(([, value]) => value?.active).map(([key]) => key);
    const resistances = collectReductionSources(this.actor).map((source) => ({ ...source, label: game.i18n.localize(source.label) }));
    const attributes = NPC_ATTRIBUTE_DEFINITIONS.map((definition) => ({ ...definition, label: game.i18n.localize(definition.label), value: Number(system.attributes?.[definition.key]?.value) || 0 }));
    const combatant = getSheetCombatant(this.actor);
    let combatActions = { inCombat: false, current: null, reserved: 0 };
    if (combatant) {
      try {
        const state = CombatActionService.getState(combatant);
        combatActions = { inCombat: true, current: state.current, reserved: state.reserved };
      } catch {
        combatActions = { inCombat: false, current: null, reserved: 0 };
      }
    }
    return {
      ...context, actor: this.actor, attributes, attributeGroups: [{ key: "corpo", label: game.i18n.localize("CMET.NPC.AttributeGroups.Corpo"), attributes: attributes.slice(0, 10) }, { key: "essencia", label: game.i18n.localize("CMET.NPC.AttributeGroups.Essencia"), attributes: attributes.slice(10) }],
      creatureTypes: NPC_CREATURE_TYPES.map((entry) => ({ ...entry, label: game.i18n.localize(entry.label), selected: entry.key === classification.type })),
      subcategories: creatureType.subcategories.map((key) => ({ key, label: game.i18n.localize(`CMET.NPC.Subcategories.${key}`), selected: key === classification.subcategory })),
      classification, size: system.size, sizes: CREATURE_SIZE_OPTIONS.map((entry) => ({ ...entry, label: game.i18n.localize(entry.label), selected: entry.key === system.size })), resources: system.resources, actions: { ...system.actions, ...combatActions }, movement: system.movement, naturalAttacks: system.naturalAttacks ?? [], customResources: system.resources.custom ?? [], conditions, resistances, biography: system.biography, description: system.description, ...groups
    };
  }

  async _preRender(context, options) {
    this.#captureScroll();
    this._renderListeners?.abort();
    await super._preRender(context, options);
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    this._hookListeners?.forEach(([hook, listener]) => Hooks.off(hook, listener));
    const rerenderForActor = (actor) => {
      if (actor === this.actor || actor?.uuid === this.actor.uuid) this.render();
    };
    const rerenderForCombatant = (combatant) => rerenderForActor(combatant?.actor);
    const rerenderForCombat = () => {
      if (getSheetCombatant(this.actor) || !game.combat?.started) this.render();
    };
    this._hookListeners = [["cmetActionSpent", rerenderForActor], ["updateCombatant", rerenderForCombatant], ["combatTurnChange", rerenderForCombat], ["updateCombat", rerenderForCombat]];
    this._hookListeners.forEach(([hook, listener]) => Hooks.on(hook, listener));
    this._renderListeners?.abort();
    this._renderListeners = new AbortController();
    this.element.addEventListener("click", (event) => Promise.resolve(this.#onClick(event)).catch(() => ui.notifications.error(game.i18n.localize("CMET.Notifications.UpdateFailed"))), { signal: this._renderListeners.signal });
    this.element.addEventListener("change", (event) => Promise.resolve(this.#onChange(event)).catch(() => ui.notifications.error(game.i18n.localize("CMET.Notifications.UpdateFailed"))), { signal: this._renderListeners.signal });
    this.element.querySelector(".cmet-tabs")?.addEventListener("click", (event) => {
      const button = event.target.closest('button[data-group="primary"][data-tab]');
      if (!button) return;
      queueMicrotask(() => {
        if (this.tabGroups.primary !== button.dataset.tab) this.changeTab(button.dataset.tab, "primary", { event, navElement: button.closest("nav") });
      });
    }, { signal: this._renderListeners.signal });
    this.#restoreScroll(this.tabGroups.primary ?? "status");
  }

  async _onClose(options) {
    this._hookListeners?.forEach(([hook, listener]) => Hooks.off(hook, listener));
    this._hookListeners = [];
    return super._onClose(options);
  }

  changeTab(tab, group, options) {
    if (group === "primary") this.#captureScroll();
    super.changeTab(tab, group, options);
    if (group === "primary") this.#restoreScroll(tab);
  }

  #captureScroll() {
    const tab = this.tabGroups?.primary ?? "status";
    const content = this.element?.querySelector(`[data-group="primary"][data-tab="${tab}"].cmet-tab-content`);
    if (content) this._uiState.scrollByTab[tab] = content.scrollTop;
  }

  #restoreScroll(tab) {
    const content = this.element?.querySelector(`[data-group="primary"][data-tab="${tab}"].cmet-tab-content`);
    if (!content) return;
    const saved = this._uiState.scrollByTab[tab] ?? 0;
    const restoreId = this._restoreId = (this._restoreId ?? 0) + 1;
    requestAnimationFrame(() => {
      if (this._restoreId !== restoreId) return;
      content.scrollTop = saved;
    });
  }

  async _onDrop(event) {
    const data = TextEditor.getDragEventData(event);
    if (data?.type !== "Item" || !data.uuid) return false;
    const item = await fromUuid(data.uuid);
    if (!item || ![ITEM_TYPES.ARMA, ITEM_TYPES.ARMADURA, ITEM_TYPES.EQUIPAMENTO, ITEM_TYPES.HABILIDADE, ITEM_TYPES.HABILIDADE_DA, ITEM_TYPES.MAGIA].includes(item.type)) return false;
    await this.actor.createEmbeddedDocuments("Item", [item.toObject()]);
    return true;
  }

  async #onChange(event) {
    const input = event.target.closest("[name]");
    if (!input) return;
    event.preventDefault();
    const path = input.name;
    const value = input.type === "checkbox" ? input.checked : input.type === "number" ? Number(input.value) : input.value;
    if (path === "name") return this.actor.update({ name: value });
    if (path === "img") return;
    if (path.startsWith("system.naturalAttacks.")) {
      const [, , index, key] = path.split(".");
      const attacks = foundry.utils.deepClone(this.actor.system.naturalAttacks ?? []);
      if (attacks[index]) attacks[index][key] = value;
      return this.actor.update({ "system.naturalAttacks": attacks });
    }
    if (path === "system.classification.type") return this.actor.update({ [path]: value, "system.classification.subcategory": "" });
    if (path.startsWith("system.resources.")) {
      const [, , resource, field] = path.split(".");
      if (resource === "custom") {
        const [, , , index, customField] = path.split(".");
        const resources = foundry.utils.deepClone(this.actor.system.resources.custom ?? []);
        if (resources[index]) resources[index][customField] = value;
        return this.actor.update({ "system.resources.custom": resources });
      }
      if (field === "max") return this.actor.update({ [path]: Math.max(0, value), [`system.resources.${resource}.value`]: Math.min(Math.max(0, Number(this.actor.system.resources[resource].value) || 0), Math.max(0, value)) });
      const max = Number(this.actor.system.resources[resource]?.max) || 0;
      return this.actor.update({ [path]: Math.min(Math.max(0, value), max) });
    }
    return this.actor.update({ [path]: value });
  }

  async #onClick(event) {
    const action = event.target.closest("[data-action]");
    if (!action) return;
    event.preventDefault();
    const item = action.dataset.itemId ? this.actor.items.get(action.dataset.itemId) : null;
    if (action.dataset.action === "activate-da-effect" && item?.type === ITEM_TYPES.HABILIDADE_DA) {
      const effect = getAbilityDaEffect(item, action.dataset.effectId);
      const token = resolveActorToken(this.actor);
      return effect?.activationType === "passiva"
        ? toggleAbilityDaEffect({ actor: this.actor, item, effectId: action.dataset.effectId, token })
        : activateAbilityDaEffect({ actor: this.actor, item, effectId: action.dataset.effectId, context: { originToken: token } });
    }
    if (action.dataset.action === "execute-da-operation" && item?.type === ITEM_TYPES.HABILIDADE_DA) {
      return activateNorisAbilityAction({ actor: this.actor, item, effectId: action.dataset.effectId, operationType: action.dataset.operationType, context: { originToken: resolveActorToken(this.actor) } });
    }
    if (action.dataset.action === "open-item" && item) return item.sheet.render(true);
    if (action.dataset.action === "delete-item" && item) return item.delete();
    if (action.dataset.action === "toggle-equipped" && item) return item.update({ "system.equipped": action.checked });
    if (action.dataset.action === "roll-item" && item) return rollItemSkill({ actor: this.actor, item });
    if (action.dataset.action === "attack-item" && item) return startWeaponAttack({ actor: this.actor, item });
    if (action.dataset.action === "roll-attribute") return openSkillRollDialog({ actor: this.actor, skillKey: action.dataset.attributeKey, skillLabel: action.dataset.attributeLabel, baseValue: resolveActorSkillValue(this.actor, action.dataset.attributeKey) });
    if (action.dataset.action === "attack-natural") return startNaturalAttack({ actor: this.actor, attack: this.actor.system.naturalAttacks.find(({ id }) => id === action.dataset.attackId) });
    if (action.dataset.action === "delete-natural") {
      const attacks = foundry.utils.deepClone(this.actor.system.naturalAttacks ?? []).filter(({ id }) => id !== action.dataset.attackId);
      return this.actor.update({ "system.naturalAttacks": attacks });
    }
    if (action.dataset.action === "create-natural") {
      const attacks = foundry.utils.deepClone(this.actor.system.naturalAttacks ?? []);
      attacks.push({ id: foundry.utils.randomID(), name: game.i18n.localize("CMET.NPC.NaturalAttacks.New"), combatSkill: "corpoACorpo", damageFormula: "", description: "" });
      return this.actor.update({ "system.naturalAttacks": attacks });
    }
    if (action.dataset.action === "create-custom-resource") {
      const resources = foundry.utils.deepClone(this.actor.system.resources.custom ?? []);
      resources.push({ id: foundry.utils.randomID(), name: game.i18n.localize("CMET.AbilityDa.Resources.New"), current: 0, initial: 0, max: 0, resetRule: "manual", description: "", enabled: true });
      return this.actor.update({ "system.resources.custom": resources });
    }
    if (action.dataset.action === "delete-custom-resource") {
      const resources = foundry.utils.deepClone(this.actor.system.resources.custom ?? []);
      resources.splice(Number(action.dataset.resourceIndex), 1);
      return this.actor.update({ "system.resources.custom": resources });
    }
    if (action.dataset.action === "create-item") {
      const [created] = await this.actor.createEmbeddedDocuments("Item", [{ name: game.i18n.localize(`CMET.ItemTypes.${action.dataset.itemType}`), type: action.dataset.itemType }]);
      return created.sheet.render(true);
    }
  }
}
