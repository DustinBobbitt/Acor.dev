(() => {
  const modules = (window.WarehouseModules = window.WarehouseModules || {});

  function defaultClamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function isInspectorVisible(state) {
    return state?.viewMode === "rack" && !!state?.inspector?.open && !state?.rackPendingAdd;
  }

  function closeInspector(state, el) {
    if (!state?.inspector || !el?.floatingInspector) {
      return;
    }
    state.inspector.open = false;
    state.inspector.anchorRect = null;
    el.floatingInspector.classList.add("hidden");
  }

  function clampInspectorToViewport(left, top, width, height, clampFn = defaultClamp) {
    const margin = 8;
    const maxLeft = window.innerWidth - width - margin;
    const maxTop = window.innerHeight - height - margin;
    return {
      left: clampFn(left, margin, Math.max(margin, maxLeft)),
      top: clampFn(top, margin, Math.max(margin, maxTop))
    };
  }

  function syncInspectorFromSelection(state, el) {
    const cell = state?.selectedCell;
    if (!cell || state?.viewMode !== "rack" || !el) {
      return;
    }
    if (el.fiLocation) {
      el.fiLocation.textContent = cell.location_code || `B${cell.bay}-L${cell.level}`;
    }
    if (el.fiItemInput) {
      el.fiItemInput.value = cell.item_number || "";
    }
    if (el.fiQtyInput) {
      el.fiQtyInput.value = String(cell.qty || 0);
    }
    if (el.fiRecordedInput) {
      el.fiRecordedInput.value = cell.recorded_location || "";
    }
    if (el.fiMixedToggle) {
      el.fiMixedToggle.checked = !!cell.is_mixed;
    }
  }

  function openInspectorNearSelection({ state, el, clamp }) {
    if (!state || !el || !el.gridWrap || !el.floatingInspector) {
      return;
    }
    if (state.viewMode !== "rack" || !state.selectedCellKey) {
      closeInspector(state, el);
      return;
    }
    const anchor = el.gridWrap.querySelector(`.rack-slot[data-cell-key="${state.selectedCellKey}"]`);
    const rect = anchor ? anchor.getBoundingClientRect() : state.inspector.anchorRect;
    if (!rect) {
      closeInspector(state, el);
      return;
    }
    state.inspector.open = true;
    state.inspector.anchorRect = rect;
    syncInspectorFromSelection(state, el);
    el.floatingInspector.classList.remove("hidden");
    const inspectorRect = el.floatingInspector.getBoundingClientRect();
    let left = rect.right + 10;
    let top = rect.top;
    if (left + inspectorRect.width > window.innerWidth - 8) {
      left = rect.left - inspectorRect.width - 10;
    }
    if (left < 8) {
      left = window.innerWidth - inspectorRect.width - 12;
    }
    const clamped = clampInspectorToViewport(left, top, inspectorRect.width, inspectorRect.height, clamp || defaultClamp);
    el.floatingInspector.style.left = `${clamped.left}px`;
    el.floatingInspector.style.top = `${clamped.top}px`;
  }

  function keepSelectedRackSlotInView({ state, el, options = {} }) {
    if (!state || !el?.gridWrap || state.viewMode !== "rack" || !state.selectedCellKey) {
      return;
    }
    const slot = el.gridWrap.querySelector(`.rack-slot[data-cell-key="${state.selectedCellKey}"]`);
    if (!slot) {
      return;
    }
    const behavior = options.smooth ? "smooth" : "auto";
    slot.scrollIntoView({ behavior, block: "nearest", inline: "nearest" });
  }

  modules.inspector = {
    clampInspectorToViewport,
    closeInspector,
    isInspectorVisible,
    keepSelectedRackSlotInView,
    openInspectorNearSelection,
    syncInspectorFromSelection
  };
})();
