import { WEAPON_CHARACTERISTICS } from "../../config/weapon-config.mjs";

const { ArrayField, BooleanField, NumberField, SchemaField, StringField } = foundry.data.fields;
const { TypeDataModel } = foundry.abstract;
const createCharacteristicsSchema = () => Object.fromEntries(WEAPON_CHARACTERISTICS.map(({ key, parameters = [] }) => [key, new SchemaField({ enabled: new BooleanField({ initial: false }), ...Object.fromEntries(parameters.map((parameter) => [parameter.key, parameter.field === "number" || parameter.field === "select" ? new NumberField({ initial: 0, min: 0, integer: true }) : new StringField({ initial: key === "armaDeHaste" && parameter.key === "damageFormula" ? "1d8" : "", blank: true })])) })]));
const createDamageSchema = () => new SchemaField({
  formula: new StringField({ initial: "1d6", blank: false }),
  nature: new StringField({ initial: "physical", blank: false }),
  type: new StringField({ initial: "cortante", blank: false }),
  availableTypes: new ArrayField(new StringField({ blank: false }), { initial: [] })
});

export class ArmaData extends TypeDataModel {
  static defineSchema() {
    return {
      quality: new StringField({ initial: "normal", blank: false }),
      combatSkill: new StringField({ initial: "", blank: true }),
      damage: new ArrayField(createDamageSchema(), { initial: [{ formula: "1d6", nature: "physical", type: "cortante" }] }),
      // Campo legado mantido para que fontes antigas ainda possam ser lidas pela migração.
      damageFormula: new StringField({ initial: "", blank: true }),
      // Legado preservado para a migração de armas existentes; não usar em novas interfaces.
      range: new SchemaField({ ranged: new BooleanField({ initial: false }), max: new NumberField({ initial: 0, min: 0, integer: true }) }),
      characteristics: new SchemaField(createCharacteristicsSchema()),
      equipped: new BooleanField({ initial: false }),
      loaded: new BooleanField({ initial: true }),
      thrown: new BooleanField({ initial: false }),
      description: new StringField({ initial: "", blank: true })
    };
  }
}
