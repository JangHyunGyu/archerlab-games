(function (root) {
  "use strict";

  const SchoolI18n = root.SchoolI18n;
  const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);

  function create({ host, getView, onSelect, onBuy, onReset, onExit, onLocale, initialOpen = false }) {
    const layer = document.createElement("section");
    layer.className = "school-shop";
    layer.innerHTML = `
      <header class="school-shop__header">
        <div><span class="school-shop__eyebrow">FIELD ARMORY</span><h1 data-i18n="shop.title"></h1></div>
        <div class="school-shop__tools">
          <div class="school-shop__lang" role="group" data-i18n-aria="lang.group">
            <button type="button" data-lang="ko">KO</button>
            <button type="button" data-lang="en">EN</button>
          </div>
          <p class="school-shop__credit"><span data-i18n="shop.supplies"></span><strong data-credit></strong></p>
        </div>
      </header>
      <div class="school-shop__actions">
        <p class="school-shop__status" role="status" aria-live="polite"></p>
        <button type="button" class="school-shop__open" aria-haspopup="dialog"><span data-i18n="shop.open"></span><span data-i18n="shop.openHint"></span></button>
        <button type="button" class="school-shop__exit" data-i18n="shop.exit"></button>
      </div>`;
    const dialog = document.createElement("dialog");
    dialog.className = "school-shop-dialog";
    dialog.setAttribute("aria-labelledby", "shop-maintenance-title");
    dialog.innerHTML = `
      <header class="school-shop-dialog__header">
        <div><span class="school-shop__eyebrow">MAINTENANCE</span><h2 id="shop-maintenance-title" data-i18n="shop.maintenance"></h2></div>
        <button type="button" data-close data-i18n-aria="shop.close">×</button>
        <p><span data-i18n="shop.suppliesInline"></span> <strong data-credit></strong></p>
        <div class="school-shop__lang" role="group" data-i18n-aria="lang.group">
          <button type="button" data-lang="ko">KO</button>
          <button type="button" data-lang="en">EN</button>
        </div>
      </header>
      <div class="school-shop-dialog__scroll">
        <p class="school-shop-dialog__hint" data-i18n="shop.pick"></p>
        <div class="school-shop-dialog__characters" role="group" data-i18n-aria="shop.characters"></div>
        <h3 class="school-shop-dialog__selected"></h3>
        <div class="school-shop-dialog__upgrades"></div>
      </div>
      <footer class="school-shop-dialog__footer">
        <p class="school-shop-dialog__status" role="status" aria-live="polite"></p>
        <button type="button" data-reset></button>
        <button type="button" data-close data-i18n="shop.done"></button>
      </footer>`;
    layer.append(dialog);
    host.append(layer);
    const openButton = layer.querySelector(".school-shop__open");
    const status = dialog.querySelector('[role="status"]');
    let busy = false;
    let destroyed = false;
    let confirmation = null;
    let confirmRefund = 0;
    let confirmAction = null;
    let busyFocus = null;

    function notify(message) {
      if (destroyed) return;
      status.textContent = message;
      layer.querySelector(".school-shop__status").textContent = dialog.open ? "" : message;
    }

    function refresh() {
      if (destroyed) return;
      const view = getView();
      layer.querySelectorAll("[data-credit]").forEach((item) => { item.textContent = `$${view.coins}`; });
      // Keep focus and scroll position when the server refreshes a purchase.
      const focusKey = document.activeElement?.dataset?.focusKey;
      dialog.querySelector(".school-shop-dialog__characters").innerHTML = view.characters.map((character) => `
        <button type="button" data-character="${escape(character.id)}" data-focus-key="character-${escape(character.id)}"
          aria-label="${escape(character.name)}" aria-pressed="${character.id === view.selectedId}">
          <img src="${escape(character.portrait)}" alt="" width="46" height="46" draggable="false">
          <strong>${escape(character.weapon)}</strong><span>${escape(character.total)}</span>
        </button>`).join("");
      dialog.querySelector(".school-shop-dialog__selected").textContent = SchoolI18n.t("shop.selected", {
        name: view.selectedName,
        weapon: view.weapon
      });
      dialog.querySelector(".school-shop-dialog__upgrades").innerHTML = view.upgrades.map((upgrade) => `
        <article class="school-shop-upgrade">
          <div class="school-shop-upgrade__copy"><h4>${escape(upgrade.title)}</h4><p>${escape(upgrade.part)}</p>
            <p class="school-shop-upgrade__stats">${escape(upgrade.stats)}</p></div>
          <div class="school-shop-upgrade__purchase"><span>Lv.${upgrade.level}/${view.maxLevel}</span>
            <progress max="${view.maxLevel}" value="${upgrade.level}" aria-label="${escape(SchoolI18n.t("shop.levelAria", { title: upgrade.title }))}"></progress>
            <button type="button" data-upgrade="${escape(upgrade.id)}" data-focus-key="upgrade-${escape(upgrade.id)}"
              aria-label="${escape(upgrade.title)} ${upgrade.maxed ? escape(SchoolI18n.t("shop.maxed")) : escape(SchoolI18n.t("shop.buy", { cost: upgrade.cost }))}" ${upgrade.maxed ? "data-maxed disabled" : ""}
              class="${upgrade.canAfford && !upgrade.maxed ? "can-afford" : ""}">${upgrade.maxed ? "MAX" : `$${escape(upgrade.cost)}`}</button>
          </div>
        </article>`).join("");
      dialog.querySelector("[data-reset]").textContent = view.refund > 0
        ? SchoolI18n.t("shop.resetRefund", { refund: `$${view.refund}` })
        : SchoolI18n.t("shop.reset");
      updateBusyControls();
      if (focusKey) Array.from(dialog.querySelectorAll("[data-focus-key]")).find((item) => item.dataset.focusKey === focusKey)?.focus({ preventScroll: true });
    }

    function localize() {
      if (destroyed) return;
      layer.querySelectorAll("[data-i18n]").forEach((node) => {
        node.textContent = SchoolI18n.t(node.getAttribute("data-i18n"));
      });
      layer.querySelectorAll("[data-i18n-aria]").forEach((node) => {
        node.setAttribute("aria-label", SchoolI18n.t(node.getAttribute("data-i18n-aria")));
      });
      const lang = SchoolI18n.getLang();
      layer.querySelectorAll("[data-lang]").forEach((button) => {
        button.setAttribute("aria-pressed", String(button.dataset.lang === lang));
      });
      layer.setAttribute("aria-label", SchoolI18n.t("shop.title"));
      refresh();
      if (confirmation && confirmAction) {
        const refund = confirmRefund;
        const action = confirmAction;
        closeConfirmation();
        confirmReset(refund, action);
      }
    }

    function updateBusyControls() {
      dialog.setAttribute("aria-busy", String(busy));
      dialog.querySelectorAll("button").forEach((button) => {
        if (button.dataset.lang) return;
        button.disabled = busy || button.hasAttribute("data-maxed");
      });
    }

    function setBusy(message = "") {
      if (message && !busy) busyFocus = document.activeElement;
      busy = Boolean(message);
      if (destroyed) return;
      updateBusyControls();
      notify(message);
      if (!busy && busyFocus?.isConnected && !busyFocus.disabled) busyFocus.focus({ preventScroll: true });
      if (!busy) busyFocus = null;
    }

    function open() {
      if (destroyed || dialog.open) return;
      refresh();
      layer.classList.add("is-maintaining");
      dialog.showModal();
      dialog.querySelector('[aria-pressed="true"]')?.focus({ preventScroll: true });
    }

    function closeConfirmation() {
      if (!confirmation) return;
      confirmation.close();
      confirmation.remove();
      confirmation = null;
      dialog.querySelector("[data-reset]").focus({ preventScroll: true });
    }

    function close() {
      if (busy || destroyed) return;
      if (confirmation) return closeConfirmation();
      dialog.close();
      layer.classList.remove("is-maintaining");
      openButton.focus({ preventScroll: true });
    }

    function confirmReset(refund, confirm) {
      if (destroyed || busy || confirmation) return;
      confirmRefund = refund;
      confirmAction = confirm;
      confirmation = document.createElement("dialog");
      confirmation.className = "school-shop-confirm";
      confirmation.setAttribute("aria-labelledby", "shop-reset-title");
      confirmation.innerHTML = `<h2 id="shop-reset-title">${refund > 0 ? SchoolI18n.t("shop.resetAsk") : SchoolI18n.t("shop.resetEmpty")}</h2>
        <p>${refund > 0 ? SchoolI18n.t("shop.resetBody", { refund }) : SchoolI18n.t("shop.resetNeedBuy")}</p>
        <div><button type="button" data-cancel>${refund > 0 ? SchoolI18n.t("shop.cancel") : SchoolI18n.t("shop.ok")}</button>${refund > 0 ? `<button type="button" data-confirm>${SchoolI18n.t("shop.resetConfirm")}</button>` : ""}</div>`;
      layer.append(confirmation);
      confirmation.addEventListener("keydown", (event) => containKeys(event, confirmation));
      confirmation.addEventListener("cancel", (event) => { event.preventDefault(); closeConfirmation(); });
      confirmation.querySelector("[data-cancel]").addEventListener("click", closeConfirmation);
      confirmation.querySelector("[data-confirm]")?.addEventListener("click", () => { closeConfirmation(); confirm(); });
      confirmation.showModal();
      confirmation.querySelector("[data-cancel]").focus();
    }

    function moveFocus(direction) {
      const container = confirmation || (dialog.open ? dialog : layer);
      const buttons = Array.from(container.querySelectorAll("button:not(:disabled)")).filter((button) => button.getClientRects().length);
      const index = buttons.indexOf(document.activeElement);
      const target = buttons[(index + direction + buttons.length) % buttons.length];
      target?.focus();
      target?.scrollIntoView({ block: "nearest" });
    }

    function containKeys(event, container) {
      event.stopPropagation();
      if (event.key !== "Tab") return;
      const buttons = Array.from(container.querySelectorAll("button:not(:disabled)"));
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || !container.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !container.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    }

    function chooseLanguage(lang) {
      if (lang !== "ko" && lang !== "en") return;
      if (SchoolI18n.getLang() === lang) return;
      SchoolI18n.setLang(lang);
      localize();
      if (typeof onLocale === "function") onLocale(lang);
    }

    // Keep keyboard navigation inside the active layer and block game hotkeys.
    dialog.addEventListener("keydown", (event) => containKeys(event, dialog));
    dialog.addEventListener("cancel", (event) => { event.preventDefault(); close(); });
    dialog.addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (button?.dataset.lang) return;
      if (busy) return;
      if (button?.hasAttribute("data-close")) return close();
      if (button?.dataset.character) { onSelect(button.dataset.character); refresh(); notify(""); return; }
      if (button?.dataset.upgrade) { onBuy(button.dataset.upgrade); return; }
      if (button?.hasAttribute("data-reset")) { onReset(); return; }
      const bounds = dialog.getBoundingClientRect();
      if (event.target === dialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) close();
    });
    layer.addEventListener("click", (event) => {
      const langButton = event.target.closest("[data-lang]");
      if (!langButton || !layer.contains(langButton)) return;
      chooseLanguage(langButton.dataset.lang);
    });
    openButton.addEventListener("click", open);
    layer.querySelector(".school-shop__exit").addEventListener("click", onExit);
    layer.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.code === "Escape" && !dialog.open) { event.preventDefault(); onExit(); }
    });
    localize();
    if (initialOpen) open();
    else openButton.focus({ preventScroll: true });

    return {
      refresh, open, close, notify, setBusy, confirmReset, localize,
      isOpen: () => dialog.open,
      gamepad(action) {
        if (action === "back") { if (dialog.open) close(); else onExit(); }
        else if (action === "previous" || action === "next") moveFocus(action === "previous" ? -1 : 1);
        else if (action === "accept" && !busy) {
          const focused = document.activeElement;
          if (focused?.tagName === "BUTTON" && layer.contains(focused)) focused.click();
          else if (!dialog.open) open();
        }
      },
      destroy() {
        destroyed = true;
        if (confirmation) { confirmation.close(); confirmation.remove(); confirmation = null; }
        dialog.close();
        layer.remove();
        host.querySelector("canvas")?.focus({ preventScroll: true });
      }
    };
  }

  root.SchoolZombieShop = Object.freeze({ create });
})(typeof window === "undefined" ? globalThis : window);
