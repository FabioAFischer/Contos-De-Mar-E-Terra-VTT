import { ATTRIBUTE_DEFINITIONS } from "../../config/constants.mjs";

const { ArrayField, BooleanField, NumberField, SchemaField, StringField } = foundry.data.fields;
const { TypeDataModel } = foundry.abstract;
const createSkillsSchema = (skills) => Object.fromEntries(skills.map((skill) => [skill, new NumberField({ initial: 10, min: 10, integer: true })]));
const createAttributesSchema = () => Object.fromEntries(ATTRIBUTE_DEFINITIONS.map(({ key, skills }) => [key, new SchemaField({ value: new NumberField({ initial: 0, min: 0, integer: true }), skills: new SchemaField(createSkillsSchema(skills)) })]));

export class PersonagemData extends TypeDataModel {
  static defineSchema() {
    return {
      identity: new SchemaField({ raca: new StringField({ initial: "", blank: true }), idade: new NumberField({ initial: null, nullable: true, min: 0, integer: true }) }),
      progression: new SchemaField({ nivel: new NumberField({ initial: 1, min: 1, integer: true }), experiencia: new NumberField({ initial: 0, min: 0, integer: true }) }),
      size: new StringField({ initial: "medio", blank: true }),
      attributes: new SchemaField(createAttributesSchema()),
      resources: new SchemaField({ vida: new SchemaField({ value: new NumberField({ initial: 10, min: 0, integer: true }) }), mana: new SchemaField({ value: new NumberField({ initial: 10, min: 0, integer: true }) }), sanidade: new SchemaField({ value: new NumberField({ initial: 10, min: 0, integer: true }) }), custom: new ArrayField(new SchemaField({ id: new StringField({ initial: "", blank: true }), name: new StringField({ initial: "", blank: true }), current: new NumberField({ initial: 0, min: 0, integer: true }), initial: new NumberField({ initial: 0, min: 0, integer: true }), max: new NumberField({ initial: 0, min: 0, integer: true }), resetRule: new StringField({ initial: "manual", blank: true }), description: new StringField({ initial: "", blank: true }), enabled: new BooleanField({ initial: true }) }), { initial: [] }) }),
      actions: new SchemaField({ max: new NumberField({ initial: 1, min: 0, integer: true }) }),
      hands: new SchemaField({ mainHand: new StringField({ initial: "", blank: true }), offHand: new StringField({ initial: "", blank: true }), mainHandGrip: new StringField({ initial: "duasMaos", blank: true }), offHandGrip: new StringField({ initial: "umaMao", blank: true }) }),
      currency: new SchemaField({ gyllen: new NumberField({ initial: 0, min: 0, integer: true }) }),
      biography: new SchemaField({ historia: new StringField({ initial: "", blank: true }), personalidade: new StringField({ initial: "", blank: true }), ideais: new StringField({ initial: "", blank: true }), defeitos: new StringField({ initial: "", blank: true }) })
    };
  }
}
