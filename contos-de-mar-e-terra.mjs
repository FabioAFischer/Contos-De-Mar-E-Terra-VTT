import { registerDataModels } from "./module/data-models/register.mjs";
import { registerSheets } from "./module/sheets/register.mjs";
import { migrateWeaponRanges } from "./module/hooks/migrate-weapon-range.mjs";
import { registerCombatInitiative } from "./module/combat-initiative.mjs";
import { registerCombatHooks } from "./module/cmet-combat-tracker.mjs";
import { registerCombatAttackHooks, registerCombatAttackSocket } from "./module/services/combat-attack-service.mjs";
import { registerDamageApplicationSocket } from "./module/services/damage-application-service.mjs";
import { registerItemHotbarApi, registerItemHotbarHook } from "./module/services/item-hotbar-service.mjs";
import { registerAbilityDaHooks } from "./module/services/ability-da-trigger-service.mjs";
import { migrateAbilityDaCopies, registerAbilityDaSocket } from "./module/services/ability-da-service.mjs";
import { ensureNorisFrenzyResource } from "./module/services/ability-da-noris-service.mjs";

Hooks.once("init", () => {
  registerDataModels();
  registerSheets();
  registerCombatInitiative();
  registerCombatHooks();
  registerCombatAttackSocket();
  registerDamageApplicationSocket();
  registerCombatAttackHooks();
  registerItemHotbarApi();
  registerItemHotbarHook();
  registerAbilityDaHooks();
  registerAbilityDaSocket();
  CONFIG.contosDeMarETerra = {
    systemId: "contos-de-mar-e-terra"
  };
  console.log("CMET | Contos de Mar e Terra inicializado");
});

Hooks.once("ready", async () => {
  await migrateWeaponRanges();
  await migrateAbilityDaCopies();
  for (const actor of game.actors?.contents ?? []) {
    if ([...(actor.items?.contents ?? [])].some((item) => item.type === "habilidadeDa" && item.system?.associatedCharacter === "Noris")) await ensureNorisFrenzyResource(actor);
  }
});
