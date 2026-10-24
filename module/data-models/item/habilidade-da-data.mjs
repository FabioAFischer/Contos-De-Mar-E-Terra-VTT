const { ArrayField, BooleanField, NumberField, SchemaField, StringField } = foundry.data.fields;
const { TypeDataModel } = foundry.abstract;

const text = (initial = "") => new StringField({ initial, blank: true });
const id = () => new StringField({ initial: () => foundry.utils.randomID(), blank: true });

const createCondition = () => new SchemaField({ key: text(), operator: text("equals"), value: text() });
const createCost = () => new SchemaField({ id: id(), type: text("actions"), amount: new NumberField({ initial: 0, min: 0, integer: true }), resourceId: text(), timing: text("activation"), allowInsufficient: new BooleanField({ initial: false }), description: text() });
const createRoll = () => new SchemaField({ id: id(), type: text("skill"), skillKey: text(), difficulty: new NumberField({ initial: 0, integer: true }), targetSkillKey: text(), resultMode: text("success") });
const createOperation = () => new SchemaField({ id: id(), type: text("manual"), amount: new NumberField({ initial: 0, integer: true }), formula: text(), skillKey: text(), resourceId: text(), conditionKey: text(), durationId: text(), description: text(), manual: new BooleanField({ initial: false }) });
const createBranch = () => new SchemaField({ id: id(), name: text(), selection: text("manual"), exclusive: new BooleanField({ initial: true }), effectIds: new ArrayField(text(), { initial: [] }), condition: text() });
const createEffect = () => new SchemaField({
  id: id(), name: text(), activationType: text("passiva"), enabled: new BooleanField({ initial: true }), active: new BooleanField({ initial: false }), summary: text(),
  trigger: new SchemaField({ event: text("manual"), phase: text(), oncePolicy: text("always"), confirmation: new BooleanField({ initial: false }) }),
  conditions: new ArrayField(createCondition(), { initial: [] }), costs: new ArrayField(createCost(), { initial: [] }), rolls: new ArrayField(createRoll(), { initial: [] }),
  targets: new SchemaField({ relation: text("self"), count: new NumberField({ initial: 1, min: 1, integer: true }), requiresSelection: new BooleanField({ initial: false }), range: new NumberField({ initial: 0, min: 0, integer: true }), manualConfirmation: new BooleanField({ initial: false }) }),
  operations: new ArrayField(createOperation(), { initial: [] }), branches: new ArrayField(createBranch(), { initial: [] }),
  duration: new SchemaField({ type: text("instant"), amount: new NumberField({ initial: 0, min: 0, integer: true }), reference: text(), endEvent: text(), manual: new BooleanField({ initial: false }) }),
  limits: new SchemaField({ type: text("none"), maximum: new NumberField({ initial: 0, min: 0, integer: true }), resetRule: text(), consequence: text() }),
  stacking: new SchemaField({ policy: text("replace"), key: text() }), description: text()
});

export class HabilidadeDaData extends TypeDataModel {
  static defineSchema() {
    return {
      activationType: text("passiva"),
      origin: text(),
      category: text(),
      associatedCharacter: text(),
      description: text(),
      notes: text(),
      functioning: text(),
      gmNotes: text(),
      manualResolution: text(),
      effects: new ArrayField(createEffect(), { initial: [] })
    };
  }
}
