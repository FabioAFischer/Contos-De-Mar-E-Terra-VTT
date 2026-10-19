import { ATTRIBUTE_DEFINITIONS } from "../../config/constants.mjs";

const { BooleanField, NumberField, SchemaField, StringField } = foundry.data.fields;
const { TypeDataModel } = foundry.abstract;
const magicSchools = ATTRIBUTE_DEFINITIONS.find(({ key }) => key === "magia").skills;

export class MagiaData extends TypeDataModel {
  static defineSchema() {
    return {
      school: new StringField({ initial: "", blank: true, choices: ["", ...magicSchools] }),
      manaCost: new NumberField({ initial: 0, min: 0, integer: true }),
      casting: new SchemaField({
        verbal: new BooleanField({ initial: false }),
        somatic: new BooleanField({ initial: false }),
        material: new BooleanField({ initial: false }),
        details: new StringField({ initial: "", blank: true }),
        materialDescription: new StringField({ initial: "", blank: true })
      }),
      target: new StringField({ initial: "", blank: true }),
      range: new StringField({ initial: "", blank: true }),
      concentration: new StringField({ initial: "", blank: true }),
      duration: new StringField({ initial: "", blank: true }),
      description: new StringField({ initial: "", blank: true }),
      effect: new StringField({ initial: "", blank: true }),
      upgrade: new StringField({ initial: "", blank: true })
    };
  }
}
