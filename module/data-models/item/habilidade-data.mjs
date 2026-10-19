const { NumberField, StringField } = foundry.data.fields;
const { TypeDataModel } = foundry.abstract;

export class HabilidadeData extends TypeDataModel {
  static defineSchema() {
    return {
      category: new StringField({ initial: "", blank: true }),
      rollSkill: new StringField({ initial: "", blank: true }),
      path: new StringField({ initial: "", blank: true }),
      cost: new NumberField({ initial: 0, min: 0, integer: true }),
      requirements: new StringField({ initial: "", blank: true }),
      description: new StringField({ initial: "", blank: true }),
      effect: new StringField({ initial: "", blank: true }),
      upgrade: new StringField({ initial: "", blank: true })
    };
  }
}
