import { CmetItemSheet } from "./item-sheet.mjs";

export class CmetTabbedItemSheet extends CmetItemSheet {
  constructor(...args) {
    super(...args);
    this._uiState = { scrollByTab: { configuracao: 0, descricao: 0 } };
    this._onScroll = (event) => {
      if (this._restoringScroll) return;
      this._uiState.scrollByTab[this.tabGroups.primary ?? "configuracao"] = event.currentTarget.scrollTop;
    };
  }

  static TABS = {
    primary: {
      initial: "configuracao",
      tabs: [
        { id: "configuracao", label: "CMET.Weapon.Tabs.Configuration" },
        { id: "descricao", label: "CMET.Weapon.Tabs.Description" }
      ]
    }
  };

  async _preRender(context, options) {
    this.#captureScroll();
    this._scrollContainer?.removeEventListener("scroll", this._onScroll);
    this._scrollContainer = null;
    this._renderListeners?.abort();
    await super._preRender(context, options);
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    const content = this.element.querySelector(".window-content");
    if (content) {
      this._scrollContainer = content;
      content.addEventListener("scroll", this._onScroll, { passive: true });
      this.#restoreScroll(this.tabGroups.primary ?? "configuracao");
    }
    this._renderListeners = new AbortController();
    this.element.querySelector(".cmet-config-tabs")?.addEventListener("click", (event) => {
      const button = event.target.closest('button[data-group="primary"][data-tab]');
      if (!button) return;
      // O listener do core pode estar em um ancestral: só usar o fallback se ele não atualizou tabGroups.
      queueMicrotask(() => {
        if (this.tabGroups.primary !== button.dataset.tab) this.changeTab(button.dataset.tab, "primary", { event, navElement: button.closest("nav") });
      });
    }, { signal: this._renderListeners.signal });
    this.element.addEventListener("change", (event) => this.#onChange(event), { signal: this._renderListeners.signal });
  }

  changeTab(tab, group, options) {
    if (group === "primary" && tab !== this.tabGroups.primary) this.#captureScroll();
    super.changeTab(tab, group, options);
    if (group === "primary") this.#restoreScroll(tab);
  }

  #captureScroll() {
    if (!this._scrollContainer || this._restoringScroll) return;
    this._uiState.scrollByTab[this.tabGroups.primary ?? "configuracao"] = this._scrollContainer.scrollTop;
  }

  #restoreScroll(tab) {
    const content = this._scrollContainer;
    if (!content) return;
    const saved = this._uiState.scrollByTab[tab] ?? 0;
    const restoreId = this._restoreId = (this._restoreId ?? 0) + 1;
    this._restoringScroll = true;
    requestAnimationFrame(() => {
      if (this._restoreId !== restoreId || this._scrollContainer !== content) return;
      content.scrollTop = saved;
      requestAnimationFrame(() => {
        if (this._restoreId === restoreId) this._restoringScroll = false;
      });
    });
  }

  async #onChange(event) {
    const input = event.target.closest("[name]");
    if (!input) return;
    const path = input.name;
    const value = input.type === "checkbox" ? input.checked : input.type === "number" ? Number(input.value) : input.value;
    const update = path === "name" ? { name: value } : { [path]: value };
    this.#captureScroll();
    await this.item.update(update);
    if (input.matches("[data-parameter-toggle]")) await this.render();
  }
}
