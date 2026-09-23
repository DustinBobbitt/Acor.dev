(() => {
  const modules = (window.WarehouseModules = window.WarehouseModules || {});

  function isRackPanInteractiveTarget(target, interactiveSelector = ".rack-slot, #floatingInspector, input, select, textarea, button, a") {
    if (!target) {
      return false;
    }
    return !!target.closest(interactiveSelector);
  }

  function startRackPan({ state, gridWrap, event, isInteractiveTarget }) {
    if (!state || !gridWrap || !event) {
      return;
    }
    const inRackView = state.viewMode === "rack";
    if (!inRackView || event.button !== 0) {
      return;
    }
    if ((isInteractiveTarget || isRackPanInteractiveTarget)(event.target)) {
      return;
    }
    state.rackPan.active = true;
    state.rackPan.moved = false;
    state.rackPan.startX = event.clientX;
    state.rackPan.startY = event.clientY;
    state.rackPan.startScrollLeft = gridWrap.scrollLeft;
    state.rackPan.startScrollTop = gridWrap.scrollTop;
    event.preventDefault();
  }

  function moveRackPan({ state, gridWrap, event, threshold = 5 }) {
    if (!state?.rackPan?.active || !gridWrap || !event) {
      return;
    }
    const dx = event.clientX - state.rackPan.startX;
    const dy = event.clientY - state.rackPan.startY;
    if (!state.rackPan.moved && Math.abs(dx) < threshold && Math.abs(dy) < threshold) {
      return;
    }
    state.rackPan.moved = true;
    gridWrap.classList.add("rack-pan-dragging");
    gridWrap.scrollLeft = state.rackPan.startScrollLeft - dx;
    gridWrap.scrollTop = state.rackPan.startScrollTop - dy;
  }

  function endRackPan({ state, gridWrap }) {
    if (!state?.rackPan?.active || !gridWrap) {
      return;
    }
    state.rackPan.active = false;
    state.rackPan.moved = false;
    gridWrap.classList.remove("rack-pan-dragging");
  }

  modules.rackPan = {
    endRackPan,
    isRackPanInteractiveTarget,
    moveRackPan,
    startRackPan
  };
})();
