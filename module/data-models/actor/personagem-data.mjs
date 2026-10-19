import { ATTRIBUTE_DEFINITIONS } from "../../config/constants.mjs";

const { NumberField, SchemaField, StringField } = foundry.data.fields;
const { TypeDataModel } = foundry.abstract;
const createSkillsSchema = (skills) => Object.fromEntries(skills.map((skill) => [skill, new NumberField({ initial: 10, min: 10, integer: true })]));
const createAttributesSchema = () => Object.fromEntries(ATTRIBUTE_DEFINITIONS.map(({ key, skills }) => [key, new SchemaField({ value: new NumberField({ initial: 0, min: 0, integer: true }), skills: new SchemaField(createSkillsSchema(skills)) })]));

export class PersonagemData extends TypeDataModel {
  static defineSchema() {
    return {
      identity: new SchemaField({ raca: new StringField({ initial: "", blank: true }), idade: new NumberField({ initial: null, nullable: true, min: 0, integer: true }) }),
      progression: new SchemaField({ nivel: new NumberField({ initial: 1, min: 1, integer: true }), experiencia: new NumberField({ initial: 0, min: 0, integer: true }) }),
      attributes: new SchemaField(createAttributesSchema()),
      resources: new SchemaField({ vida: new SchemaField({ value: new NumberField({ initial: 10, min: 0, integer: true }) }), mana: new SchemaField({ value: new NumberField({ initial: 10, min: 0, integer: true }) }), sanidade: new SchemaField({ value: new NumberField({ initial: 10, min: 0, integer: true }) }) }),
      actions: new SchemaField({ max: new NumberField({ initial: 1, min: 0, integer: true }) }),
      currency: new SchemaField({ gyllen: new NumberField({ initial: 0, min: 0, integer: true }) }),
      biography: new SchemaField({ historia: new StringField({ initial: "", blank: true }), personalidade: new StringField({ initial: "", blank: true }), ideais: new StringField({ initial: "", blank: true }), defeitos: new StringField({ initial: "", blank: true }) })
    };
  }
}
