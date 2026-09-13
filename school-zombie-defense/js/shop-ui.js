(function (root) {
  "use strict";

  const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);

  function create({ host, getView, onSelect, onBuy, onReset, onExit, initialOpen = false }) {
    const layer = document.createElement("section");
    layer.className = "school-shop";
    layer.setAttribute("aria-label", "암시장 정비소");
    layer.innerHTML = `
      <header class="school-shop__header">
        <div><span class="school-shop__eyebrow">FIELD ARMORY</span><h1>암시장 정비소</h1></div>
        <p class="school-shop__credit">보유 보급<strong data-credit></strong></p>
      </header>
      <div class="school-shop__actions">
        <p class="school-shop__status" role="status" aria-live="polite"></p>
        <button type="button" class="school-shop__open" aria-haspopup="dialog">캐릭터 정비<span>캐릭터 선택 · 영구 강화</span></button>
        <button type="button" class="school-shop__exit">상점 나가기</button>
      </div>`;
    const dialog = document.createElement("dialog");
    dialog.className = "school-shop-dialog";
    dialog.setAttribute("aria-labelledby", "shop-maintenance-title");
    dialog.innerHTML = `
      <header class="school-shop-dialog__header">
        <div><span class="school-shop__eyebrow">MAINTENANCE</span><h2 id="shop-maintenance-title">캐릭터 정비</h2></div>
        <button type="button" data-close aria-label="정비창 닫기">×</button>
        <p>보유 보급 <strong data-credit></strong></p>
      </header>
      <div class="school-shop-dialog__scroll">
        <p class="school-shop-dialog__hint">정비할 캐릭터를 선택하세요.</p>
        <div class="school-shop-dialog__characters" role="group" aria-label="정비할 캐릭터"></div>
        <h3 class="school-shop-dialog__selected"></h3>
        <div class="school-shop-dialog__upgrades"></div>
      </div>
      <footer class="school-shop-dialog__footer">
        <p class="school-shop-dialog__status" role="status" aria-live="polite"></p>
        <button type="button" data-reset>강화 초기화</button>
        <button type="button" data-close>정비 마치기</button>
      </footer>`;
    layer.append(dialog);
    host.append(layer);
    const openButton = layer.querySelector(".school-shop__open");
    const status = dialog.querySelector('[role="status"]');
    let busy = false;
    let destroyed = false;
    let confirmation = null;
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
      dialog.querySelector(".school-shop-dialog__selected").textContent = `${view.selectedName} · ${view.weapon} 정비`;
      dialog.querySelector(".school-shop-dialog__upgrades").innerHTML = view.upgrades.map((upgrade) => `
        <article class="school-shop-upgrade">
          <div class="school-shop-upgrade__copy"><h4>${escape(upgrade.title)}</h4><p>${escape(upgrade.part)}</p>
            <p class="school-shop-upgrade__stats">${escape(upgrade.stats)}</p></div>
          <div class="school-shop-upgrade__purchase"><span>Lv.${upgrade.level}/${view.maxLevel}</span>
            <progress max="${view.maxLevel}" value="${upgrade.level}" aria-label="${escape(upgrade.title)} 강화 단계"></progress>
            <button type="button" data-upgrade="${escape(upgrade.id)}" data-focus-key="upgrade-${escape(upgrade.id)}"
              aria-label="${escape(upgrade.title)} ${upgrade.maxed ? "최대 강화" : `$${escape(upgrade.cost)} 구매`}" ${upgrade.maxed ? "data-maxed disabled" : ""}
              class="${upgrade.canAfford && !upgrade.maxed ? "can-afford" : ""}">${upgrade.maxed ? "MAX" : `$${escape(upgrade.cost)}`}</button>
          </div>
        </article>`).join("");
      dialog.querySelector("[data-reset]").textContent = view.refund > 0 ? `초기화 +$${view.refund}` : "강화 초기화";
      updateBusyControls();
      if (focusKey) Array.from(dialog.querySelectorAll("[data-focus-key]")).find((item) => item.dataset.focusKey === focusKey)?.focus({ preventScroll: true });
    }

    function updateBusyControls() {
      dialog.setAttribute("aria-busy", String(busy));
      dialog.querySelectorAll("button").forEach((button) => { button.disabled = busy || button.hasAttribute("data-maxed"); });
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
      confirmation = document.createElement("dialog");
      confirmation.className = "school-shop-confirm";
      confirmation.setAttribute("aria-labelledby", "shop-reset-title");
      confirmation.innerHTML = `<h2 id="shop-reset-title">${refund > 0 ? "강화를 초기화할까요?" : "초기화할 강화가 없습니다"}</h2>
        <p>${refund > 0 ? `구매한 영구 강화가 모두 사라지고<br>보급 $${escape(refund)}이 반환됩니다.` : "강화를 구매한 뒤 다시 시도하세요."}</p>
        <div><button type="button" data-cancel>${refund > 0 ? "취소" : "확인"}</button>${refund > 0 ? '<button type="button" data-confirm>초기화</button>' : ""}</div>`;
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

    // Keep keyboard navigation inside the active layer and block game hotkeys.
    dialog.addEventListener("keydown", (event) => containKeys(event, dialog));
    dialog.addEventListener("cancel", (event) => { event.preventDefault(); close(); });
    dialog.addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (busy) return;
      if (button?.hasAttribute("data-close")) return close();
      if (button?.dataset.character) { onSelect(button.dataset.character); refresh(); notify(""); return; }
      if (button?.dataset.upgrade) { onBuy(button.dataset.upgrade); return; }
      if (button?.hasAttribute("data-reset")) { onReset(); return; }
      const bounds = dialog.getBoundingClientRect();
      if (event.target === dialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) close();
    });
    openButton.addEventListener("click", open);
    layer.querySelector(".school-shop__exit").addEventListener("click", onExit);
    layer.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.code === "Escape" && !dialog.open) { event.preventDefault(); onExit(); }
    });
    refresh();
    if (initialOpen) open();
    else openButton.focus({ preventScroll: true });

    return {
      refresh, open, close, notify, setBusy, confirmReset,
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
