import { ATTRIBUTE_DEFINITIONS, ITEM_TYPES, SKILL_LABELS } from "../../config/constants.mjs";
import { DAMAGE_TYPES, WEAPON_COMBAT_SKILLS, WEAPON_QUALITIES } from "../../config/weapon-config.mjs";
import { ARMOR_CATEGORIES, ARMOR_CHARACTERISTICS, ARMOR_ELEMENTS } from "../../config/armor-config.mjs";
import { ABILITY_CATEGORIES } from "../../config/ability-config.mjs";
import { calculateCharacterDerivedData, calculateSkillTotals, validateSkillChange } from "../../services/character-calculations.mjs";
import { findSkillDefinition } from "../../services/skill-roll-service.mjs";
import { resolveItemRollSkill, rollItemSkill } from "../../services/item-roll-service.mjs";
import { getDraummaModifierSources, getDraummaSkillModifier } from "../../services/ability-da-draumma-service.mjs";
import { openSkillRollDialog } from "../../dialogs/skill-roll-dialog.mjs";
import { startWeaponAttack, startThrownWeaponAttack, startCombinedWeaponAttack } from "../../services/combat-attack-service.mjs";
import { canRecover } from "../../services/weapon-characteristics-service.mjs";
import { recoverWeapon, reloadWeapon } from "../../services/item-action-service.mjs";
import { calculateConditionMovement } from "../../services/combat-condition-service.mjs";
import { getAbilityDaEffects, activateAbilityDaEffect, activateNorisAbilityAction, toggleAbilityDaEffect } from "../../services/ability-da-service.mjs";
import { CombatActionService } from "../../services/combat-action-service.mjs";
import { actorHasEmpunhaduraDoMaisForte, getWeaponGripOptions, resolveEffectiveWeaponWielding } from "../../services/weapon-wielding-service.mjs";
import { NORIS_FRENZY_ID, NORIS_FRENZY_MAX } from "../../services/ability-da-noris-service.mjs";

function getSheetCombatant(actor) {
  const combat = globalThis.game?.combat;
  if (!combat?.started || !actor) return null;
  const tokenId = actor.token?.document?.id ?? actor.token?.id ?? null;
  if (tokenId) return combat.combatants.find((entry) => entry.tokenId === tokenId) ?? null;
  return combat.combatants.find((entry) => entry.actor === actor || entry.actor?.uuid === actor.uuid) ?? null;
}

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

export class PersonagemSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  constructor(...args) {
    super(...args);
    this._uiState = {
      activeTab: "atributos",
      scrollByTab: { atributos: 0, equipamentos: 0, habilidades: 0, magias: 0, biografia: 0 }
    };
  }

  static DEFAULT_OPTIONS = { classes: ["cmet-sheet", "cmet-actor-sheet"], position: { width: 900, height: 760 }, form: { closeOnSubmit: false, submitOnChange: false } };
  static PARTS = { main: { template: "systems/contos-de-mar-e-terra/templates/actor/personagem-sheet.hbs", root: true } };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const items = this.actor.items.contents;
    const hands = this.actor.system.hands ?? { mainHand: "", offHand: "", mainHandGrip: "duasMaos", offHandGrip: "umaMao" };
    const groupedItems = {
      equipamentos: items.filter((item) => item.type === ITEM_TYPES.EQUIPAMENTO).map((item) => ({
        id: item.id, name: item.name, img: item.img, firstMeta: "", secondMeta: "", detailLabel: item.system.description || ""
      })),
      armas: items.filter((item) => item.type === ITEM_TYPES.ARMA).map((item) => {
        const system = item.system;
        const roll = resolveItemRollSkill(item);
        const hand = hands.mainHand === item.id ? "mainHand" : hands.offHand === item.id ? "offHand" : "mainHand";
        const wielding = resolveEffectiveWeaponWielding({ actor: this.actor, item, hand });
        const quality = WEAPON_QUALITIES.find(({ key }) => key === wielding.effectiveQuality);
        const combatSkill = WEAPON_COMBAT_SKILLS.find(({ key }) => key === system.combatSkill);
        // Os controles dependem da perícia configurada, não das parcelas de dano.
        // A validade mecânica continua sendo verificada pelos serviços ao clicar.
        const hasCombatSkill = Boolean(system.combatSkill);
        const damageParts = Array.isArray(system.damage) ? system.damage : [];
        const damageTypesLabel = damageParts.map(({ nature, type }) => {
          const natureLabel = nature === "magical" ? game.i18n.localize("CMET.DamageNatures.Magical") : game.i18n.localize("CMET.DamageNatures.Physical");
          const typeEntry = DAMAGE_TYPES.find(({ key }) => key === type);
          return `${natureLabel} / ${typeEntry ? game.i18n.localize(typeEntry.label) : type}`;
        }).join(", ");
        const range = system.characteristics.alcance;
        const pull = system.characteristics.puxar;
        return {
          id: item.id,
          name: item.name,
          img: item.img,
          equipped: system.equipped,
          firstMeta: quality ? game.i18n.localize(quality.label) : "",
          secondMeta: combatSkill ? game.i18n.localize(combatSkill.label) : "",
          sideLabel: damageParts.map(({ formula }) => formula).filter(Boolean).join(" + "),
          detailLabel: [damageTypesLabel, range.enabled ? `${game.i18n.localize("CMET.WeaponCharacteristics.Alcance")} ${range.spaces}` : "", wielding.exceptionActive ? game.i18n.localize("CMET.Weapon.Grip.QualityReduced") : ""].filter(Boolean).join(" • "),
          canRoll: hasCombatSkill,
          canAttack: hasCombatSkill,
          canPull: hasCombatSkill && pull?.enabled === true,
          canRearStrike: hasCombatSkill && system.characteristics.golpeDeRetaguarda?.enabled === true,
          loaded: system.loaded !== false,
          thrown: system.thrown === true,
          canReload: system.characteristics.recarregar?.enabled === true && system.loaded === false,
          canRecover: canRecover(item),
          canThrow: item.system.characteristics.arremessavel?.enabled === true && system.thrown !== true,
          stateLabel: system.thrown
            ? game.i18n.localize("CMET.Weapon.States.Thrown")
            : system.characteristics.recarregar?.enabled === true
              ? (system.loaded === false ? game.i18n.localize("CMET.Weapon.States.Unloaded") : game.i18n.localize("CMET.Weapon.States.Loaded"))
              : "",
          rollSkillKey: roll?.skillKey ?? "",
          rollSkillLabel: roll?.skillLabel ?? (combatSkill ? game.i18n.localize(combatSkill.label) : system.combatSkill ?? "")
        };
      }),
      armaduras: items.filter((item) => item.type === ITEM_TYPES.ARMADURA).map((item) => {
        const system = item.system;
        const quality = WEAPON_QUALITIES.find(({ key }) => key === system.quality);
        const category = ARMOR_CATEGORIES.find(({ key }) => key === system.category);
        const detailLabel = ARMOR_CHARACTERISTICS.filter(({ key }) => system.characteristics[key].enabled).map(({ key, label }) => {
          const characteristic = system.characteristics[key];
          const name = game.i18n.localize(label);
          if (key === "revestimento") {
            const element = ARMOR_ELEMENTS.find(({ key: elementKey }) => elementKey === characteristic.element);
            return `${name}: ${element ? `${game.i18n.localize(element.label)} ` : ""}${characteristic.reduction}`;
          }
          if (key === "discreto") return `${name} +${characteristic.bonus}`;
          return `${name} ${characteristic.reduction}`;
        }).join(" • ");
        return {
          id: item.id,
          name: item.name,
          img: item.img,
          equipped: system.equipped,
          firstMeta: quality ? game.i18n.localize(quality.label) : "",
          secondMeta: category ? game.i18n.localize(category.label) : "",
          detailLabel,
          sideLabel: ""
        };
      }),
      habilidades: items.filter((item) => item.type === ITEM_TYPES.HABILIDADE).map((item) => {
        const category = ABILITY_CATEGORIES.find(({ key }) => key === item.system.category);
        const roll = resolveItemRollSkill(item);
        const meta = [category ? game.i18n.localize(category.label) : "", item.system.path, `${item.system.cost} ${game.i18n.localize("CMET.Ability.Fields.Points")}`].filter(Boolean);
        return {
          id: item.id,
          name: item.name,
          img: item.img,
          itemType: item.type,
          isDa: false,
          firstMeta: meta.join(" • "),
          secondMeta: "",
          detailLabel: [`${game.i18n.localize("CMET.Ability.Fields.Requirements")}: ${item.system.requirements || game.i18n.localize("CMET.Ability.Fields.None")}`, item.system.description].filter(Boolean).join(" • "),
          sideLabel: "",
          canRoll: Boolean(roll),
          rollSkillKey: roll?.skillKey ?? "",
          rollSkillLabel: roll?.skillLabel ?? ""
        };
      }),
      habilidadesDa: items.filter((item) => item.type === ITEM_TYPES.HABILIDADE_DA).map((item) => ({
        id: item.id,
        name: item.name,
        img: item.img,
        itemType: item.type,
        isDa: true,
        firstMeta: item.system.origin || game.i18n.localize("CMET.AbilityDa.Fields.NoOrigin"),
        secondMeta: game.i18n.localize(`CMET.AbilityDa.Activation.${item.system.activationType === "ativa" ? "Active" : item.system.activationType === "reativa" ? "Reactive" : "Passive"}`),
        detailLabel: [item.system.category, item.system.description].filter(Boolean).join(" • "),
        effects: getAbilityDaEffects(item).map((effect) => ({ id: effect.id, name: effect.name || game.i18n.localize("CMET.AbilityDa.Actions.UntitledEffect"), activationType: effect.activationType, active: effect.active === true, canActivate: effect.enabled !== false && (["ativa", "reativa"].includes(effect.activationType) || effect.activationType === "passiva") && !(effect.operations ?? []).some((operation) => ["norisFistsAttack", "norisHalfMoonAttack"].includes(operation.type)), actions: (effect.operations ?? []).filter((operation) => ["norisFistsAttack", "norisHalfMoonAttack"].includes(operation.type)).map((operation) => ({ type: operation.type, label: operation.type === "norisFistsAttack" ? "CMET.AbilityDa.Noris.FistsAttackAction" : "CMET.AbilityDa.Noris.HalfMoonAttackAction" })) }))
      })),
      magias: items.filter((item) => item.type === ITEM_TYPES.MAGIA).map((item) => {
        const school = item.system.school;
        const roll = resolveItemRollSkill(item);
        const schoolLabel = ATTRIBUTE_DEFINITIONS.find(({ key }) => key === "magia").skills.includes(school) ? game.i18n.localize(`CMET.Spell.Schools.${school}`) : "";
        return {
          id: item.id,
          name: item.name,
          img: item.img,
          firstMeta: schoolLabel,
          secondMeta: `${item.system.manaCost} ${game.i18n.localize("CMET.Spell.Fields.ManaUnit")}`,
          detailLabel: [item.system.range, item.system.duration].filter(Boolean).join(" • "),
          sideLabel: "",
          canRoll: Boolean(roll),
          rollSkillKey: roll?.skillKey ?? "",
          rollSkillLabel: roll?.skillLabel ?? ""
        };
      })
    };
    const attributes = ATTRIBUTE_DEFINITIONS.map((definition) => {
      const attribute = this.actor.system.attributes[definition.key];
      const totals = calculateSkillTotals(attribute, definition.skills);
      return { ...definition, label: game.i18n.localize(definition.label), value: attribute.value, ...totals, invalid: totals.remainingPoints < 0, exceeded: Math.abs(totals.remainingPoints), available: totals.remainingPoints > 0, skills: definition.skills.map((key) => ({ key, label: SKILL_LABELS[key], value: attribute.skills[key] })) };
    });
    const derived = calculateCharacterDerivedData(this.actor.system);
    const resources = {
      vida: { label: "Vida", value: this.actor.system.resources.vida.value, max: derived.vidaMax },
      mana: { label: "Mana", value: this.actor.system.resources.mana.value, max: derived.manaMax },
      sanidade: { label: "Sanidade", value: this.actor.system.resources.sanidade.value, max: derived.sanidadeMax },
      frenzy: (() => {
        const hasFrenzy = items.some((item) => item.type === ITEM_TYPES.HABILIDADE_DA && (item.system.effects ?? []).some((effect) => (effect.operations ?? []).some((operation) => operation.type === "norisFrenzy")));
        const resource = (this.actor.system.resources.custom ?? []).find((entry) => entry.id === NORIS_FRENZY_ID);
        return { visible: hasFrenzy, label: game.i18n.localize("CMET.Fields.Frenzy"), value: Math.min(NORIS_FRENZY_MAX, Math.max(0, Number(resource?.current) || 0)), max: NORIS_FRENZY_MAX, percentage: Math.min(100, Math.max(0, ((Number(resource?.current) || 0) / NORIS_FRENZY_MAX) * 100)) };
      })(),
      movimento: calculateConditionMovement(derived.movimento, this.actor),
      actions: this.actor.system.actions.max
    };
    const customResources = Array.isArray(this.actor.system.resources.custom) ? this.actor.system.resources.custom : [];
    const weaponOptions = [{ id: "", name: game.i18n.localize("CMET.Weapon.Fields.None") }, ...groupedItems.armas.map((weapon) => ({ id: weapon.id, name: weapon.name }))];
    const mainWeapon = this.actor.items.get(hands.mainHand);
    const mainHandGripOptions = mainWeapon?.system?.characteristics?.duasMaos?.enabled === true
      ? getWeaponGripOptions(this.actor, mainWeapon, "mainHand").map((entry) => ({ ...entry, label: game.i18n.localize(entry.label), selected: entry.key === hands.mainHandGrip }))
      : [];
    const { habilidadesDa, ...itemsWithoutSeparateDaList } = groupedItems;
    return { ...context, actor: this.actor, attributes, derived, resources, customResources, weaponOptions, hands, mainHandGripOptions, ...itemsWithoutSeparateDaList, habilidades: [...groupedItems.habilidades, ...habilidadesDa] };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    this._renderListeners?.abort();
    this._renderListeners = new AbortController();
    this.element.addEventListener("click", (event) => {
      Promise.resolve(this.#onClick(event)).catch(() => {
        ui.notifications.error(game.i18n.localize("CMET.CombatAttack.Notifications.AttackUnavailable"));
      });
    }, { signal: this._renderListeners.signal });
    this.element.addEventListener("change", (event) => {
      Promise.resolve(this.#onChange(event)).catch(() => ui.notifications.error(game.i18n.localize("CMET.Notifications.UpdateFailed")));
    }, { signal: this._renderListeners.signal });
    this.element.addEventListener("dragstart", (event) => {
      const dragTarget = event.target.closest("[data-item-drag]");
      if (!dragTarget || !this.element.contains(dragTarget)) return;
      const row = dragTarget.closest("[data-item-id]");
      const itemId = row?.dataset.itemId;
      const item = this.actor.items.get(itemId);
      if (!item?.toDragData || !event.dataTransfer) return;
      event.dataTransfer.effectAllowed = "copy";
      const dragData = item.toDragData();
      const effectId = dragTarget.closest("[data-da-effect-id]")?.dataset.daEffectId;
      event.dataTransfer.setData("text/plain", JSON.stringify(effectId ? { ...dragData, effectId } : dragData));
    }, { signal: this._renderListeners.signal });
    this.#restoreUiState();
  }

  #restoreUiState() {
    const { activeTab } = this._uiState;
    this.element.querySelectorAll("[data-tab]").forEach((element) => element.classList.toggle("active", element.dataset.tab === activeTab));
    this.element.querySelectorAll("[data-tab-content]").forEach((element) => { element.hidden = element.dataset.tabContent !== activeTab; });
    const scrollContainer = this.element.querySelector(`[data-tab-content="${activeTab}"]`);
    if (scrollContainer) {
      if (!scrollContainer.dataset.cmetScrollBound) {
        scrollContainer.addEventListener("scroll", () => {
          if (!this._restoringScroll) this._uiState.scrollByTab[activeTab] = scrollContainer.scrollTop;
        }, { passive: true });
        scrollContainer.dataset.cmetScrollBound = "true";
      }
      const savedScroll = this._uiState.scrollByTab[activeTab] ?? 0;
      const restoreId = this._restoreId = (this._restoreId ?? 0) + 1;
      this._restoringScroll = true;
      requestAnimationFrame(() => {
        if (this._restoreId !== restoreId) return;
        scrollContainer.scrollTop = savedScroll;
        requestAnimationFrame(() => {
          if (this._restoreId === restoreId) this._restoringScroll = false;
        });
      });
    }
  }

  #saveScrollPosition() {
    const container = this.element.querySelector(`[data-tab-content="${this._uiState.activeTab}"]`);
    if (container && !this._restoringScroll) this._uiState.scrollByTab[this._uiState.activeTab] = container.scrollTop;
  }

  async #onChange(event) {
    const equippedInput = event.target.closest("[data-item-equipped]");
    if (equippedInput) {
      const item = this.actor.items.get(equippedInput.closest("[data-item-id]")?.dataset.itemId);
      if (!item || ![ITEM_TYPES.ARMA, ITEM_TYPES.ARMADURA].includes(item.type)) return;
      this.#saveScrollPosition();
      return item.update({ "system.equipped": equippedInput.checked });
    }
    const input = event.target.closest("[name]");
    if (!input) return;
    event.preventDefault();
    const path = input.name;
    const value = input.type === "number" ? Number(input.value) : input.value;
    if (path === "name") return this.actor.update({ name: value });
    if (!path.startsWith("system.")) return;
    if (["system.hands.mainHand", "system.hands.offHand", "system.hands.mainHandGrip", "system.hands.offHandGrip"].includes(path)) {
      const hands = this.actor.system.hands ?? { mainHand: "", offHand: "" };
      if (path.endsWith("Grip")) {
        const main = this.actor.items.get(hands.mainHand);
        if (path.endsWith("mainHandGrip") && value === "umaMao" && (!main || !resolveEffectiveWeaponWielding({ actor: this.actor, item: main, hand: "mainHand", gripMode: value }).hasEmpunhaduraDoMaisForte)) {
          ui.notifications.warn(game.i18n.localize("CMET.Notifications.EmpunhaduraUnavailable"));
          return this.render();
        }
        if (path.endsWith("mainHandGrip") && value === "duasMaos" && hands.offHand) {
          ui.notifications.warn(game.i18n.localize("CMET.Notifications.WeaponRequiresFreeHand"));
          return this.render();
        }
        return this.actor.update({ [path]: value });
      }
      const other = path.endsWith("mainHand") ? "offHand" : "mainHand";
      if (value && value === hands[other]) {
        ui.notifications.warn(game.i18n.localize("CMET.Notifications.DuplicateHandWeapon"));
        return this.render();
      }
      const nextHands = { ...hands, [path.endsWith("mainHand") ? "mainHand" : "offHand"]: value };
      const main = this.actor.items.get(nextHands.mainHand);
      const off = this.actor.items.get(nextHands.offHand);
      const hasEmpunhadura = actorHasEmpunhaduraDoMaisForte(this.actor);
      const mainNeedsTwoHands = main?.system?.characteristics?.duasMaos?.enabled === true;
      const offNeedsTwoHands = off?.system?.characteristics?.duasMaos?.enabled === true;
      if (mainNeedsTwoHands && nextHands.offHand && !hasEmpunhadura) {
        ui.notifications.warn(game.i18n.localize("CMET.Notifications.WeaponRequiresFreeHand"));
        return this.render();
      }
      if (offNeedsTwoHands && !hasEmpunhadura) {
        ui.notifications.warn(game.i18n.localize("CMET.Notifications.WeaponRequiresMainHand"));
        return this.render();
      }
      if (game.combat?.started && hands[path.endsWith("mainHand") ? "mainHand" : "offHand"] !== value) {
        const combatant = getSheetCombatant(this.actor);
        if (!combatant || game.combat.combatant?.id !== combatant.id) {
          ui.notifications.warn(game.i18n.localize("CMET.CombatAttack.Notifications.NotActiveTurn"));
          return this.render();
        }
        try { await CombatActionService.spendAction(combatant); } catch { ui.notifications.warn(game.i18n.localize("CMET.CombatAttack.Notifications.ActionInsufficient")); return this.render(); }
      }
      const updates = { [path]: value };
      if (hasEmpunhadura && nextHands.mainHand && nextHands.offHand && mainNeedsTwoHands && nextHands.mainHandGrip !== "umaMao") {
        updates["system.hands.mainHandGrip"] = "umaMao";
      }
      return this.actor.update(updates);
    }
    const parts = path.split(".");
    if (input.dataset.frenzyResource === "true") {
      const custom = foundry.utils.deepClone(this.actor.system.resources.custom ?? []);
      const resource = custom.find((entry) => entry.id === NORIS_FRENZY_ID);
      if (resource) resource.current = Math.min(NORIS_FRENZY_MAX, Math.max(0, value));
      return this.actor.update({ "system.resources.custom": custom });
    }
    if (parts[1] === "attributes" && parts[3] === "skills") {
      const definition = ATTRIBUTE_DEFINITIONS.find(({ key }) => key === parts[2]);
      const result = validateSkillChange(this.actor.system, parts[2], parts[4], value, definition.skills);
      if (!result.valid) { ui.notifications.warn(game.i18n.localize("CMET.Notifications.SkillPoolExceeded")); return this.render(); }
      return this.actor.update({ [path]: result.value });
    }
    if (parts[1] === "attributes" && parts[3] === "value") {
      const nextSystem = foundry.utils.deepClone(this.actor.system);
      nextSystem.attributes[parts[2]].value = Math.max(0, value);
      const nextDerived = calculateCharacterDerivedData(nextSystem);
      const resourceUpdates = {};
      for (const [key, max] of [["vida", nextDerived.vidaMax], ["mana", nextDerived.manaMax], ["sanidade", nextDerived.sanidadeMax]]) {
        const current = this.actor.system.resources[key].value;
        if (current > max) resourceUpdates[`system.resources.${key}.value`] = max;
      }
      return this.actor.update({ [path]: nextSystem.attributes[parts[2]].value, ...resourceUpdates });
    }
    if (parts[1] === "resources" && parts[2] === "custom") return this.actor.update({ [path]: Math.max(0, value) });
    if (parts[1] === "resources") {
      const max = calculateCharacterDerivedData(this.actor.system)[`${parts[2]}Max`];
      return this.actor.update({ [path]: Math.min(Math.max(0, value), max) });
    }
    return this.actor.update({ [path]: value });
  }

  async #onClick(event) {
    const tab = event.target.closest("[data-tab]");
    if (tab) {
      event.preventDefault();
      this.#saveScrollPosition();
      this._uiState.activeTab = tab.dataset.tab;
      this.#restoreUiState();
      return;
    }
    const action = event.target.closest("[data-action]");
    if (!action) return;
    if (action.dataset.action === "editImage") return;
    event.preventDefault();
    event.stopPropagation();
    if (action.dataset.action === "roll-skill") {
      const skillKey = action.dataset.skillKey;
      const definition = findSkillDefinition(skillKey);
      const baseValue = definition && this.actor.system.attributes[definition.key].skills[skillKey];
      if (!definition || !Number.isFinite(Number(baseValue))) {
        ui.notifications.warn(game.i18n.localize("CMET.Rolling.InvalidSkill"));
        return;
      }
      return openSkillRollDialog({ actor: this.actor, skillKey, skillLabel: action.dataset.skillLabel, baseValue, initialModifier: getDraummaSkillModifier(this.actor, skillKey), context: { modifierSources: getDraummaModifierSources(this.actor, skillKey) } });
    }
    const item = action.dataset.itemId ? this.actor.items.get(action.dataset.itemId) : null;
    if (["attackItem", "pullItem", "rearStrikeItem", "throwItem", "reloadItem", "recoverItem", "open-item", "delete-item"].includes(action.dataset.action) && !item) {
      ui.notifications.warn(game.i18n.localize("CMET.CombatAttack.Notifications.ItemUnavailable"));
      return;
    }
    if (action.dataset.action === "rollItemSkill" && item) return rollItemSkill({ actor: this.actor, item });
    if (action.dataset.action === "attackItem" && item) return startWeaponAttack({ actor: this.actor, item });
    if (action.dataset.action === "pullItem" && item) return startWeaponAttack({ actor: this.actor, item, attackMode: "pull" });
    if (action.dataset.action === "rearStrikeItem" && item) return startWeaponAttack({ actor: this.actor, item, attackMode: "golpeDeRetaguarda" });
    if (action.dataset.action === "throwItem" && item) return startThrownWeaponAttack({ actor: this.actor, item });
    if (action.dataset.action === "combinedAttack") return startCombinedWeaponAttack({ actor: this.actor });
    if (action.dataset.action === "reloadItem" && item) return this.#reloadWeapon(item);
    if (action.dataset.action === "recoverItem" && item) return this.#recoverWeapon(item);
    if (action.dataset.action === "activate-da-effect" && item?.type === ITEM_TYPES.HABILIDADE_DA) {
      const effect = getAbilityDaEffects(item, { includeDisabled: true }).find((entry) => entry.id === action.dataset.effectId);
    return effect?.activationType === "passiva"
      ? toggleAbilityDaEffect({ actor: this.actor, item, effectId: action.dataset.effectId, token: canvas.tokens.controlled.find((token) => token.actor?.id === this.actor.id) })
      : activateAbilityDaEffect({ actor: this.actor, item, effectId: action.dataset.effectId, context: { originToken: canvas.tokens.controlled.find((token) => token.actor?.id === this.actor.id) } });
    }
    if (action.dataset.action === "execute-da-operation" && item?.type === ITEM_TYPES.HABILIDADE_DA) {
      return activateNorisAbilityAction({ actor: this.actor, item, effectId: action.dataset.effectId, operationType: action.dataset.operationType, context: { originToken: canvas.tokens.controlled.find((token) => token.actor?.id === this.actor.id) } });
    }
    if (action.dataset.action === "open-item" && item) return item.sheet.render(true);
    if (action.dataset.action === "delete-item" && item) return item.delete();
    if (action.dataset.action === "create-item") {
      const type = action.dataset.itemType;
      if (!Object.values(ITEM_TYPES).includes(type)) return;
      const [created] = await this.actor.createEmbeddedDocuments("Item", [{ name: game.i18n.localize(`CMET.ItemTypes.${type}`), type }]);
      return created.sheet.render(true);
    }
    if (action.dataset.action === "create-ability") return this.#createAbility();
    if (action.dataset.action === "create-custom-resource") {
      const custom = foundry.utils.deepClone(this.actor.system.resources.custom ?? []);
      custom.push({ id: foundry.utils.randomID(), name: game.i18n.localize("CMET.AbilityDa.Resources.New"), current: 0, initial: 0, max: 0, resetRule: "manual", description: "", enabled: true });
      return this.actor.update({ "system.resources.custom": custom });
    }
    if (action.dataset.action === "delete-custom-resource") {
      const custom = foundry.utils.deepClone(this.actor.system.resources.custom ?? []);
      custom.splice(Number(action.dataset.resourceIndex), 1);
      return this.actor.update({ "system.resources.custom": custom });
    }
  }

  async #reloadWeapon(item) {
    return reloadWeapon({ actor: this.actor, item });
  }

  async #recoverWeapon(item) {
    return recoverWeapon({ actor: this.actor, item });
  }

  async #createAbility() {
    const { DialogV2 } = foundry.applications.api;
    const type = await DialogV2.wait({
      window: { title: game.i18n.localize("CMET.Ability.Create") },
      content: `<p>${game.i18n.localize("CMET.Ability.CreateChoice")}</p>`,
      buttons: [
        { action: ITEM_TYPES.HABILIDADE, label: game.i18n.localize("CMET.Ability.CreateCommon"), type: "button", callback: () => ITEM_TYPES.HABILIDADE },
        { action: ITEM_TYPES.HABILIDADE_DA, label: game.i18n.localize("CMET.Ability.CreateDa"), type: "button", callback: () => ITEM_TYPES.HABILIDADE_DA },
        { action: "cancel", label: game.i18n.localize("CMET.Hotbar.Actions.Cancel"), type: "button", callback: () => null }
      ]
    });
    if (![ITEM_TYPES.HABILIDADE, ITEM_TYPES.HABILIDADE_DA].includes(type)) return null;
    const [created] = await this.actor.createEmbeddedDocuments("Item", [{ name: game.i18n.localize(`CMET.ItemTypes.${type}`), type }]);
    return created.sheet.render(true);
  }
}
