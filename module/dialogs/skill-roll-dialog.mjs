import { calculateEffectiveTarget, rollSkill, sendSkillRollToChat, SKILL_ROLL_MODES } from "../services/skill-roll-service.mjs";

function localize(key) {
  return game.i18n.localize(`CMET.Rolling.${key}`);
}

function readModifier(value) {
  if (value.trim() === "") return 0;
  const modifier = Number(value);
  return Number.isInteger(modifier) ? modifier : 0;
}

export function openSkillRollDialog({ actor, skillKey, skillLabel, baseValue, beforeRoll, onResult, onCancel, onComplete, titleKey = "SkillTest", context } = {}) {
  const { DialogV2 } = foundry.applications.api;
  const content = `<div class="cmet-skill-roll-dialog"><p><strong>${skillLabel}</strong></p><p><span>${localize("BaseValue")}:</span> <strong>${baseValue}</strong></p><label>${localize("Modifier")}<input name="modifier" type="number" step="1" value="0" /></label><fieldset><legend>${localize("RollType")}</legend><label><input type="radio" name="rollMode" value="${SKILL_ROLL_MODES.NORMAL}" checked /> ${localize("Normal")}</label><label><input type="radio" name="rollMode" value="${SKILL_ROLL_MODES.ADVANTAGE}" /> ${localize("Advantage")}</label><label><input type="radio" name="rollMode" value="${SKILL_ROLL_MODES.DISADVANTAGE}" /> ${localize("Disadvantage")}</label></fieldset><p><span>${localize("EffectiveValue")}:</span> <strong data-effective-target>${baseValue}</strong></p></div>`;

  let submitted = false;
  let completionSettled = false;
  const complete = async (status, data = {}) => {
    if (completionSettled) return;
    completionSettled = true;
    await onComplete?.({ status, ...data });
  };
  const dialog = new DialogV2({
    window: { title: localize(titleKey) },
    content,
    buttons: [
      { action: "cancel", label: localize("Cancel"), type: "button", callback: (_event, _button, dialog) => dialog.close() },
      {
        action: "roll",
        label: localize("Roll"),
        default: true,
        callback: async (_event, button) => {
          const form = button.form;
          const modifier = readModifier(form.elements.modifier.value);
          const rollMode = form.elements.rollMode.value;
          try {
            return await rollSkill({ actor, skillKey, modifier, rollMode, beforeRoll, context });
          } catch (error) {
            ui.notifications.warn(error.message || localize("InvalidSkill"));
            return null;
          }
        }
      }
    ],
    submit: async (result) => {
      if (result?.degree) {
        submitted = true;
        try {
          const message = await sendSkillRollToChat(result, { context });
          await onResult?.(result, message);
          await complete("completed", { result, message });
        } catch (error) {
          await complete("failed", { result, error });
          throw error;
        }
      }
    }
  });
  dialog.addEventListener("close", () => {
    if (!submitted) {
      Promise.resolve(onCancel?.())
        .then(() => complete("cancelled"))
        .catch((error) => complete("failed", { error }));
    }
  }, { once: true });
  dialog.addEventListener("render", () => {
    const form = dialog.element.querySelector("form");
    const modifierInput = form?.elements.modifier;
    const target = dialog.element.querySelector("[data-effective-target]");
    if (!modifierInput || !target) return;
    const update = () => target.textContent = calculateEffectiveTarget(baseValue, readModifier(modifierInput.value)).effectiveTarget;
    modifierInput.addEventListener("input", update);
    update();
  }, { once: true });
  return dialog.render({ force: true });
}
