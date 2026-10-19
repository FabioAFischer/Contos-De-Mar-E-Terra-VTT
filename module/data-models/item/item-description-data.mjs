const { StringField } = foundry.data.fields;
const { TypeDataModel } = foundry.abstract;

export class ItemDescriptionData extends TypeDataModel {
  static defineSchema() {
    return {
      description: new StringField({ initial: "", blank: true })
    };
  }
}
