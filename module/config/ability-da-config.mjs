export const DA_ACTIVATION_TYPES = Object.freeze([
  { key: "passiva", label: "CMET.AbilityDa.Activation.Passive" },
  { key: "ativa", label: "CMET.AbilityDa.Activation.Active" },
  { key: "reativa", label: "CMET.AbilityDa.Activation.Reactive" }
]);

export const DA_TRIGGER_EVENTS = Object.freeze([
  { key: "manual", label: "CMET.AbilityDa.Triggers.Manual" },
  { key: "attackDeclared", label: "CMET.AbilityDa.Triggers.AttackDeclared" },
  { key: "attackHit", label: "CMET.AbilityDa.Triggers.AttackHit" },
  { key: "attackMiss", label: "CMET.AbilityDa.Triggers.AttackMiss" },
  { key: "damageReceived", label: "CMET.AbilityDa.Triggers.DamageReceived" },
  { key: "resourceChanged", label: "CMET.AbilityDa.Triggers.ResourceChanged" },
  { key: "turnStart", label: "CMET.AbilityDa.Triggers.TurnStart" },
  { key: "turnEnd", label: "CMET.AbilityDa.Triggers.TurnEnd" },
  { key: "combatEnd", label: "CMET.AbilityDa.Triggers.CombatEnd" }
]);

export const DA_COST_TYPES = Object.freeze([
  { key: "actions", label: "CMET.AbilityDa.Costs.Actions" },
  { key: "reservedActions", label: "CMET.AbilityDa.Costs.ReservedActions" },
  { key: "vida", label: "CMET.AbilityDa.Costs.Health" },
  { key: "mana", label: "CMET.AbilityDa.Costs.Mana" },
  { key: "sanidade", label: "CMET.AbilityDa.Costs.Sanity" },
  { key: "custom", label: "CMET.AbilityDa.Costs.CustomResource" }
]);

export const DA_COST_TIMINGS = Object.freeze([
  { key: "activation", label: "CMET.AbilityDa.Costs.OnActivation" },
  { key: "success", label: "CMET.AbilityDa.Costs.OnSuccess" },
  { key: "event", label: "CMET.AbilityDa.Costs.OnEvent" }
]);

export const DA_OPERATION_TYPES = Object.freeze([
  { key: "resource", label: "CMET.AbilityDa.Operations.Resource" },
  { key: "weaponGrip", label: "CMET.AbilityDa.Operations.WeaponGrip" },
  { key: "skillModifier", label: "CMET.AbilityDa.Operations.SkillModifier" },
  { key: "damage", label: "CMET.AbilityDa.Operations.Damage" },
  { key: "heal", label: "CMET.AbilityDa.Operations.Heal" },
  { key: "conditionAdd", label: "CMET.AbilityDa.Operations.ConditionAdd" },
  { key: "conditionRemove", label: "CMET.AbilityDa.Operations.ConditionRemove" },
  { key: "armorBonus", label: "CMET.AbilityDa.Operations.ArmorBonus" },
  { key: "sizeIncrease", label: "CMET.AbilityDa.Operations.SizeIncrease" },
  { key: "marcoChildOfHel", label: "CMET.AbilityDa.Marco.ChildOfHel" },
  { key: "marcoManifestation", label: "CMET.AbilityDa.Marco.ManifestationOfHel" },
  { key: "marcoProfaneConversion", label: "CMET.AbilityDa.Marco.ProfaneConversion" },
  { key: "marcoLastSpark", label: "CMET.AbilityDa.Marco.LastSpark" },
  { key: "norisFrenzy", label: "CMET.AbilityDa.Noris.Frenzy" },
  { key: "norisFistsAttack", label: "CMET.AbilityDa.Noris.FistsAttack" },
  { key: "norisFistsAmplification", label: "CMET.AbilityDa.Noris.FistsAmplification" },
  { key: "norisHalfMoonAttack", label: "CMET.AbilityDa.Noris.HalfMoonAttack" },
  { key: "norisHalfMoonAmplification", label: "CMET.AbilityDa.Noris.HalfMoonAmplification" },
  { key: "norisAbsorption", label: "CMET.AbilityDa.Noris.Absorption" },
  { key: "norisAbsorptionAmplification", label: "CMET.AbilityDa.Noris.AbsorptionAmplification" },
  { key: "norisArmorProtection", label: "CMET.AbilityDa.Noris.ArmorProtection" },
  { key: "norisHeavyWeight", label: "CMET.AbilityDa.Noris.HeavyWeight" },
  { key: "norisGuard", label: "CMET.AbilityDa.Noris.Guard" },
  { key: "manual", label: "CMET.AbilityDa.Operations.Manual" }
]);

/** The editor and executor must use the same operation registry. */
export const DA_EXECUTABLE_OPERATION_TYPES = Object.freeze(new Set(
  DA_OPERATION_TYPES.map(({ key }) => key).filter((key) => key !== "manual")
));

export const DA_TARGET_RELATIONS = Object.freeze([
  { key: "self", label: "CMET.AbilityDa.Targets.Self" },
  { key: "ally", label: "CMET.AbilityDa.Targets.Ally" },
  { key: "enemy", label: "CMET.AbilityDa.Targets.Enemy" },
  { key: "any", label: "CMET.AbilityDa.Targets.Any" },
  { key: "manual", label: "CMET.AbilityDa.Targets.Manual" }
]);

export const DA_DEFAULT_EFFECT = Object.freeze({
  id: "",
  name: "",
  activationType: "passiva",
  enabled: true,
  active: false,
  summary: "",
  trigger: { event: "manual", phase: "", oncePolicy: "always", confirmation: false },
  conditions: [],
  costs: [],
  rolls: [],
  targets: { relation: "self", count: 1, requiresSelection: false, range: 0, manualConfirmation: false },
  operations: [],
  branches: [],
  duration: { type: "instant", amount: 0, reference: "", endEvent: "", manual: false },
  limits: { type: "none", maximum: 0, resetRule: "", consequence: "" },
  stacking: { policy: "replace", key: "" },
  description: ""
});
