import { CmetTabbedItemSheet } from "./tabbed-item-sheet.mjs";
import { DA_ACTIVATION_TYPES, DA_COST_TIMINGS, DA_COST_TYPES, DA_EXECUTABLE_OPERATION_TYPES, DA_OPERATION_TYPES, DA_TRIGGER_EVENTS } from "../../config/ability-da-config.mjs";
import { SKILL_LABELS } from "../../config/constants.mjs";
import { ensureAbilityDaEffectIds } from "../../services/ability-da-service.mjs";

function localize(key) { return game.i18n.localize(key); }
function labelFrom(definitions, key) { return localize(definitions.find((entry) => entry.key === key)?.label ?? key); }
function conditionLabel(key) { return { "target.level": localize("CMET.AbilityDa.ConditionFields.TargetLevel"), "target.size": localize("CMET.AbilityDa.ConditionFields.TargetSize"), "actor.level": localize("CMET.AbilityDa.ConditionFields.ActorLevel"), "actor.size": localize("CMET.AbilityDa.ConditionFields.ActorSize"), logic: localize("CMET.AbilityDa.ConditionFields.Logic") }[key] ?? key; }
function operatorLabel(operator) { return { equals: localize("CMET.AbilityDa.Operators.Equals"), notEquals: localize("CMET.AbilityDa.Operators.NotEquals"), greaterThan: localize("CMET.AbilityDa.Operators.GreaterThan"), greaterThanOrEqual: localize("CMET.AbilityDa.Operators.GreaterThanOrEqual"), lessThan: localize("CMET.AbilityDa.Operators.LessThan"), lessThanOrEqual: localize("CMET.AbilityDa.Operators.LessThanOrEqual") }[operator] ?? operator; }
function valueLabel(value) { return { "actor.level": localize("CMET.AbilityDa.ConditionFields.ActorLevel"), "actor.size": localize("CMET.AbilityDa.ConditionFields.ActorSize"), true: localize("CMET.AbilityDa.ConditionFields.Or") }[String(value)] ?? value; }
function costSummary(cost) { return `${Number(cost.amount) || 0} ${labelFrom(DA_COST_TYPES, cost.type)}`; }
function rollSummary(roll) { const type = labelFrom([{ key: "skill", label: "CMET.AbilityDa.Tests.Skill" }, { key: "resistance", label: "CMET.AbilityDa.Tests.Resistance" }, { key: "opposed", label: "CMET.AbilityDa.Tests.Opposed" }, { key: "manual", label: "CMET.AbilityDa.Tests.Manual" }], roll.type); return [type, SKILL_LABELS[roll.skillKey] ?? roll.skillKey].filter(Boolean).join(": "); }
function operationSummary(operation) {
  const norisLabels = { norisFrenzy: "CMET.AbilityDa.Noris.Frenzy", norisFistsAttack: "CMET.AbilityDa.Noris.FistsAttack", norisFistsAmplification: "CMET.AbilityDa.Noris.FistsAmplification", norisHalfMoonAttack: "CMET.AbilityDa.Noris.HalfMoonAttack", norisHalfMoonAmplification: "CMET.AbilityDa.Noris.HalfMoonAmplification", norisAbsorption: "CMET.AbilityDa.Noris.Absorption", norisAbsorptionAmplification: "CMET.AbilityDa.Noris.AbsorptionAmplification", norisArmorProtection: "CMET.AbilityDa.Noris.ArmorProtection", norisHeavyWeight: "CMET.AbilityDa.Noris.HeavyWeight", norisGuard: "CMET.AbilityDa.Noris.Guard" };
  if (norisLabels[operation.type]) return localize(norisLabels[operation.type]);
  if (operation.type === "armorBonus") return `${localize("CMET.AbilityDa.OperationSummary.Armor")} (${operation.amount || 0})`;
  if (operation.type === "sizeIncrease") return `${localize("CMET.AbilityDa.OperationSummary.Size")} +${operation.amount || 0}`;
  if (operation.type === "heal") return `${localize("CMET.AbilityDa.OperationSummary.Heal")} ${operation.formula || operation.amount || 0}`;
  if (operation.type === "resource") return `${localize("CMET.AbilityDa.OperationSummary.Resource")} ${operation.resourceId || ""}`.trim();
  if (operation.type === "conditionAdd") return `${localize("CMET.AbilityDa.OperationSummary.ConditionAdd")} ${operation.conditionKey || ""}`.trim();
  if (operation.type === "conditionRemove") return `${localize("CMET.AbilityDa.OperationSummary.ConditionRemove")} ${operation.conditionKey || ""}`.trim();
  if (operation.type === "skillModifier") return `${localize("CMET.AbilityDa.OperationSummary.SkillModifier")} ${operation.skillKey || ""} ${operation.amount || 0}`.trim();
  if (operation.type === "damage") return `${localize("CMET.AbilityDa.OperationSummary.Damage")} ${operation.formula || operation.amount || 0}`;
  if (operation.type === "weaponGrip") return localize("CMET.AbilityDa.OperationSummary.WeaponGrip");
  return operation.description || localize("CMET.AbilityDa.OperationSummary.Manual");
}
function durationLabel(duration) { return localize({ instant: "CMET.AbilityDa.Duration.Instant", turns: "CMET.AbilityDa.Duration.Turns", rounds: "CMET.AbilityDa.Duration.Rounds", combat: "CMET.AbilityDa.Duration.Combat", permanent: "CMET.AbilityDa.Duration.Permanent", condition: "CMET.AbilityDa.Duration.Condition" }[duration?.type] ?? "CMET.AbilityDa.Duration.Instant"); }
function prepareEffect(effect, index, openEffectId) {
  const operations = effect.operations ?? []; const conditions = effect.conditions ?? []; const costs = effect.costs ?? []; const rolls = effect.rolls ?? [];
  return { ...effect, index, isOpen: effect.id === openEffectId, activationLabel: localize(`CMET.AbilityDa.Activation.${effect.activationType === "ativa" ? "Active" : effect.activationType === "reativa" ? "Reactive" : "Passive"}`), triggerLabel: labelFrom(DA_TRIGGER_EVENTS, effect.trigger?.event), conditionSummaries: conditions.map((condition) => condition.key === "logic" ? valueLabel(condition.value) : `${conditionLabel(condition.key)} ${operatorLabel(condition.operator)} ${valueLabel(condition.value)}`), costSummaries: costs.map(costSummary), rollSummaries: rolls.map(rollSummary), operationSummaries: operations.map(operationSummary), durationLabel: durationLabel(effect.duration), automaticCount: operations.filter((operation) => !operation.manual && DA_EXECUTABLE_OPERATION_TYPES.has(operation.type)).length, manualCount: operations.filter((operation) => operation.manual || !DA_EXECUTABLE_OPERATION_TYPES.has(operation.type)).length, activeLabel: effect.active ? localize("CMET.AbilityDa.Status.Active") : localize("CMET.AbilityDa.Status.Inactive"), costLabel: costs.length ? costs.map(costSummary).join(", ") : localize("CMET.AbilityDa.Summary.NoCost"), testLabel: rolls.length ? rolls.map(rollSummary).join(", ") : localize("CMET.AbilityDa.Summary.NoTests") };
}

export class HabilidadeDaSheet extends CmetTabbedItemSheet {
  static DEFAULT_OPTIONS = { classes: ["cmet-sheet", "cmet-item-sheet", "cmet-configured-item-sheet", "cmet-da-ability-sheet"], position: { width: 820, height: 760 }, form: { closeOnSubmit: false, submitOnChange: false } };
  static TABS = { primary: { initial: "resumo", tabs: [{ id: "resumo", label: "CMET.AbilityDa.Tabs.Summary" }, { id: "mecanica", label: "CMET.AbilityDa.Tabs.Mechanics" }, { id: "narrativa", label: "CMET.AbilityDa.Tabs.Narrative" }, { id: "avancado", label: "CMET.AbilityDa.Tabs.Advanced" }] } };
  static PARTS = { main: { template: "systems/contos-de-mar-e-terra/templates/item/habilidade-da-sheet.hbs", root: true } };

  constructor(...args) { super(...args); this._uiState.daMode ??= this.item?.isOwner === false ? "view" : "edit"; this._uiState.openEffectId ??= null; }

  async _prepareContext(options) {
    const context = await super._prepareContext(options); const effects = ensureAbilityDaEffectIds(this.item.system.effects ?? []); const preparedEffects = effects.map((effect, index) => prepareEffect(effect, index, this._uiState.openEffectId));
    const itemActivationLabel = localize(`CMET.AbilityDa.Activation.${this.item.system.activationType === "ativa" ? "Active" : this.item.system.activationType === "reativa" ? "Reactive" : "Passive"}`);
    return { ...context, item: this.item, effects: preparedEffects, activationTypes: DA_ACTIVATION_TYPES, triggerEvents: DA_TRIGGER_EVENTS, costTypes: DA_COST_TYPES, costTimings: DA_COST_TIMINGS, operationTypes: DA_OPERATION_TYPES, isOwner: this.item.isOwner, isEditMode: this.item.isOwner !== false && this._uiState.daMode !== "view", itemActivationLabel, advancedJson: JSON.stringify(this.item.system, null, 2) };
  }

  async #handleDaAction(action, index, effectId) {
    if (action === "toggle-mode") { this._uiState.daMode = this._uiState.daMode === "view" ? "edit" : "view"; await this.render(); return; }
    if (action === "toggle-effect") { const effects = ensureAbilityDaEffectIds(this.item.system.effects ?? []); const effect = effects.find((entry) => entry.id === effectId); this._uiState.openEffectId = effect?.id === this._uiState.openEffectId ? null : effect?.id ?? null; await this.render(); return; }
    if (!this.item.isOwner) { ui.notifications.warn(game.i18n.localize("CMET.AbilityDa.Notifications.NoPermission")); return; }
    const effects = ensureAbilityDaEffectIds(this.item.system.effects ?? []); const effectIndex = Number(index); const effect = Number.isInteger(effectIndex) ? effects[effectIndex] : null; const subIndex = Number(effectId);
    if (action === "add-cost" && effect) effect.costs.push({ id: foundry.utils.randomID(), type: "actions", amount: 0, resourceId: "", timing: "activation", allowInsufficient: false, description: "" });
    if (action === "remove-cost" && effect && Number.isInteger(subIndex)) effect.costs.splice(subIndex, 1);
    if (action === "add-operation" && effect) effect.operations.push({ id: foundry.utils.randomID(), type: "manual", amount: 0, formula: "", skillKey: "", resourceId: "", conditionKey: "", durationId: "", description: "", manual: true });
    if (action === "remove-operation" && effect && Number.isInteger(subIndex)) effect.operations.splice(subIndex, 1);
    if (action === "add-condition" && effect) effect.conditions.push({ key: "target.level", operator: "greaterThan", value: "actor.level" });
    if (action === "remove-condition" && effect && Number.isInteger(subIndex)) effect.conditions.splice(subIndex, 1);
    if (action === "add-test" && effect) effect.rolls.push({ id: foundry.utils.randomID(), type: "manual", skillKey: "", difficulty: 0, targetSkillKey: "", resultMode: "success" });
    if (action === "remove-test" && effect && Number.isInteger(subIndex)) effect.rolls.splice(subIndex, 1);
    if (action === "add-branch" && effect) effect.branches.push({ id: foundry.utils.randomID(), name: "", selection: "manual", exclusive: true, effectIds: [], condition: "" });
    if (action === "remove-branch" && effect && Number.isInteger(subIndex)) effect.branches.splice(subIndex, 1);
    if (action === "add") effects.push(ensureAbilityDaEffectIds([{}])[0]);
    if (action === "remove" && Number.isInteger(effectIndex)) { const confirmed = await foundry.applications.api.DialogV2.confirm({ window: { title: localize("CMET.AbilityDa.Actions.DeleteEffect") }, content: `<p>${localize("CMET.AbilityDa.Actions.ConfirmDelete")}</p>` }); if (!confirmed) return; effects.splice(effectIndex, 1); }
    if (action === "duplicate" && Number.isInteger(effectIndex)) effects.splice(effectIndex + 1, 0, { ...foundry.utils.deepClone(effects[effectIndex]), id: foundry.utils.randomID() });
    if (action === "up" && effectIndex > 0) [effects[effectIndex - 1], effects[effectIndex]] = [effects[effectIndex], effects[effectIndex - 1]];
    if (action === "down" && effectIndex < effects.length - 1) [effects[effectIndex + 1], effects[effectIndex]] = [effects[effectIndex], effects[effectIndex + 1]];
    if (["add", "remove", "duplicate", "up", "down", "add-cost", "remove-cost", "add-operation", "remove-operation", "add-condition", "remove-condition", "add-test", "remove-test", "add-branch", "remove-branch"].includes(action)) await this.item.update({ "system.effects": effects });
  }

  async _onRender(context, options) { await super._onRender(context, options); this._daListeners?.abort(); this._daListeners = new AbortController(); this.element.addEventListener("click", (event) => { const button = event.target.closest("[data-da-action]"); if (!button) return; event.preventDefault(); void this.#handleDaAction(button.dataset.daAction, button.closest("[data-effect-index]")?.dataset.effectIndex, button.dataset.effectId); }, { signal: this._daListeners.signal }); }
}
