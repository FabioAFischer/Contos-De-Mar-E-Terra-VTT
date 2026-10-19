/**
 * Persist an image selected through the Foundry File Picker.
 *
 * The document is deliberately taken from the owning ApplicationV2 instance
 * so this works for both World Items and Embedded Items.
 */
export async function editDocumentImage(_event, target) {
  const document = this.document;
  const path = target.dataset.edit;
  if (!document || path !== "img") return;

  const current = foundry.utils.getProperty(document._source, path);
  const defaultArtwork = document.constructor.getDefaultArtwork?.(document._source) ?? {};
  const defaultImage = foundry.utils.getProperty(defaultArtwork, path);
  const FilePicker = foundry.applications.apps.FilePicker.implementation;

  const picker = new FilePicker({
    current,
    type: target.dataset.type || "image",
    redirectToRoot: defaultImage ? [defaultImage] : [],
    callback: async (selectedPath) => {
      if (!selectedPath || selectedPath === document.img) return;
      await document.update({ img: selectedPath });
    },
    position: {
      top: this.position.top + 40,
      left: this.position.left + 10
    },
    document
  });

  await picker.browse();
}
