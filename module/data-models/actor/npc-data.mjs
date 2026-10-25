import { NPC_ATTRIBUTE_DEFINITIONS, NPC_CREATURE_TYPES } from "../../config/npc-config.mjs";

const { ArrayField, BooleanField, NumberField, SchemaField, StringField } = foundry.data.fields;
const { TypeDataModel } = foundry.abstract;

const createAttributesSchema = () => Object.fromEntries(NPC_ATTRIBUTE_DEFINITIONS.map(({ key }) => [key, new SchemaField({ value: new NumberField({ initial: 0, integer: true }) })]));
const createResourceSchema = () => new SchemaField({ value: new NumberField({ initial: 10, min: 0, integer: true }), max: new NumberField({ initial: 10, min: 0, integer: true }) });

export class NpcData extends TypeDataModel {
  static defineSchema() {
    return {
      classification: new SchemaField({
        type: new StringField({ initial: "humanoides", choices: NPC_CREATURE_TYPES.map(({ key }) => key) }),
        subcategory: new StringField({ initial: "", blank: true }),
        species: new StringField({ initial: "", blank: true })
      }),
      size: new StringField({ initial: "medio", blank: true }),
      attributes: new SchemaField(createAttributesSchema()),
      resources: new SchemaField({ vida: createResourceSchema(), mana: createResourceSchema(), sanidade: createResourceSchema(), custom: new ArrayField(new SchemaField({ id: new StringField({ initial: "", blank: true }), name: new StringField({ initial: "", blank: true }), current: new NumberField({ initial: 0, min: 0, integer: true }), initial: new NumberField({ initial: 0, min: 0, integer: true }), max: new NumberField({ initial: 0, min: 0, integer: true }), resetRule: new StringField({ initial: "manual", blank: true }), description: new StringField({ initial: "", blank: true }), enabled: new BooleanField({ initial: true }) }), { initial: [] }) }),
      actions: new SchemaField({ max: new NumberField({ initial: 1, min: 0, integer: true }) }),
      movement: new SchemaField({ normal: new NumberField({ initial: 0, min: 0, integer: true }), special: new StringField({ initial: "", blank: true }) }),
      naturalAttacks: new ArrayField(new SchemaField({ id: new StringField({ initial: "", blank: true }), name: new StringField({ initial: "", blank: true }), combatSkill: new StringField({ initial: "corpoACorpo", blank: true }), damageFormula: new StringField({ initial: "", blank: true }), description: new StringField({ initial: "", blank: true }) }), { initial: [] }),
      biography: new SchemaField({ appearance: new StringField({ initial: "", blank: true }), behavior: new StringField({ initial: "", blank: true }), history: new StringField({ initial: "", blank: true }), notes: new StringField({ initial: "", blank: true }) }),
      description: new StringField({ initial: "", blank: true })
    };
  }

  static migrateData(source) {
    const data = super.migrateData(source);
    if (!data.size && data.classification?.size) data.size = data.classification.size;
    return data;
  }
}
