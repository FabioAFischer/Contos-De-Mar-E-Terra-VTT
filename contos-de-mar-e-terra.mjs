import { registerDataModels } from "./module/data-models/register.mjs";
import { registerSheets } from "./module/sheets/register.mjs";
import { migrateWeaponRanges } from "./module/hooks/migrate-weapon-range.mjs";
import { registerCombatInitiative } from "./module/combat-initiative.mjs";
import { registerCombatHooks } from "./module/cmet-combat-tracker.mjs";
import { registerCombatAttackHooks, registerCombatAttackSocket } from "./module/services/combat-attack-service.mjs";
import { registerDamageApplicationSocket } from "./module/services/damage-application-service.mjs";

Hooks.once("init", () => {
  registerDataModels();
  registerSheets();
  registerCombatInitiative();
  registerCombatHooks();
  registerCombatAttackSocket();
  registerDamageApplicationSocket();
  registerCombatAttackHooks();
  CONFIG.contosDeMarETerra = {
    systemId: "contos-de-mar-e-terra"
  };
  console.log("CMET | Contos de Mar e Terra inicializado");
});

Hooks.once("ready", migrateWeaponRanges);
