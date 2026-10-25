import { activateAbilityDaEffect, getAbilityDaEffects } from "./ability-da-service.mjs";
import { resetCustomResources } from "./ability-da-resource-service.mjs";
import { registerMarcoAbilityHooks } from "./ability-da-marco-service.mjs";
import { registerMarcoAuraVisualHooks } from "./ability-da-visual-service.mjs";
import { clearNorisCombatEffects, executeNorisOperation, ensureNorisFrenzy, resetNorisFrenzy } from "./ability-da-noris-service.mjs";

const activeEvents = new Set();
let hooksRegistered = false;

export async function emitAbilityDaEvent({ event, actor, context = {} } = {}) {
  if (!event || !actor) return [];
  const eventKey = context.eventId ?? `${event}:${actor.uuid}:${Date.now()}`;
  if (activeEvents.has(eventKey)) return [];
  activeEvents.add(eventKey);
  try {
    const results = [];
    for (const item of actor.items?.contents ?? []) {
      if (item.type !== "habilidadeDa") continue;
      for (const effect of getAbilityDaEffects(item)) {
        if (effect.trigger?.event !== event || effect.activationType === "passiva" && effect.trigger?.confirmation) continue;
        if (effect.activationType === "passiva") {
          for (const operation of effect.operations ?? []) {
            if (operation.manual) continue;
            const result = operation.type.startsWith("noris")
              ? await executeNorisOperation(operation, { actor, effect, item, ...context })
              : null;
            if (result !== null) results.push({ item, effect, operation, result });
          }
        } else if (effect.activationType === "reativa" || effect.activationType === "ativa") {
          results.push(await activateAbilityDaEffect({ actor, item, effectId: effect.id, context }));
        }
      }
    }
    return results.filter(Boolean);
  } finally {
    activeEvents.delete(eventKey);
  }
}

export function registerAbilityDaHooks() {
  if (hooksRegistered) return;
  hooksRegistered = true;
  registerMarcoAbilityHooks();
  registerMarcoAuraVisualHooks();
  const reset = async () => {
    for (const actor of game.actors?.contents ?? []) {
      await resetCustomResources(actor, "combatEnd");
      if ([...(actor.items?.contents ?? [])].some((item) => item.type === "habilidadeDa" && item.system?.associatedCharacter === "Noris")) {
        await resetNorisFrenzy(actor);
        await clearNorisCombatEffects(actor);
      }
    }
  };
  Hooks.on("deleteCombat", reset);
  Hooks.on("updateCombat", (combat, changes) => changes.started === false ? reset() : undefined);
  Hooks.on("createCombatant", async (combatant) => {
    if (combatant.actor && [...(combatant.actor.items?.contents ?? [])].some((item) => item.type === "habilidadeDa" && item.system?.associatedCharacter === "Noris")) await ensureNorisFrenzy(combatant.actor);
  });
  Hooks.on("cmetAttackResolved", async ({ actor, item, hit, eventId, melee = true } = {}) => {
    if (hit && melee) await emitAbilityDaEvent({ event: "attackHit", actor, context: { item, eventId, melee } });
  });
}
