import { ARMOR_CATEGORIES, ARMOR_CHARACTERISTICS, ARMOR_ELEMENTS } from "../../config/armor-config.mjs";
import { WEAPON_QUALITIES } from "../../config/weapon-config.mjs";

const { TypeDataModel } = foundry.abstract;
const { BooleanField, NumberField, SchemaField, StringField } = foundry.data.fields;

const createCharacteristicsSchema = () => Object.fromEntries(ARMOR_CHARACTERISTICS.map(({ key, parameters }) => [
  key,
  new SchemaField({
    enabled: new BooleanField({ initial: false }),
    ...Object.fromEntries(parameters.map(({ key: parameter, field }) => [
      parameter,
      field === "number"
        ? new NumberField({ initial: 0, min: 0, integer: true })
        : new StringField({ initial: "", blank: true, choices: ARMOR_ELEMENTS.map(({ key }) => key) })
    ]))
  })
]));

export class ArmaduraData extends TypeDataModel {
  static defineSchema() {
    return {
      category: new StringField({ initial: "armadura", blank: false, choices: ARMOR_CATEGORIES.map(({ key }) => key) }),
      quality: new StringField({ initial: "normal", blank: false, choices: WEAPON_QUALITIES.map(({ key }) => key) }),
      equipped: new BooleanField({ initial: false }),
      characteristics: new SchemaField(createCharacteristicsSchema()),
      description: new StringField({ initial: "", blank: true })
    };
  }
}
