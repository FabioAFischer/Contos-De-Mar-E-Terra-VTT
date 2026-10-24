import { activateAbilityDaEffect, getAbilityDaEffects } from "./ability-da-service.mjs";
import { resetCustomResources } from "./ability-da-resource-service.mjs";

const activeEvents = new Set();

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
        if (effect.activationType === "reativa" || effect.activationType === "ativa") {
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
  const reset = async () => {
    for (const actor of game.actors?.contents ?? []) await resetCustomResources(actor, "combatEnd");
  };
  Hooks.on("deleteCombat", reset);
  Hooks.on("updateCombat", (combat, changes) => changes.started === false ? reset() : undefined);
}
