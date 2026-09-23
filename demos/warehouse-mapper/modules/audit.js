(() => {
  const modules = (window.WarehouseModules = window.WarehouseModules || {});

  function auditEntryMap(entries = []) {
    const mapped = {};
    (entries || []).forEach((entry) => {
      const key = String(entry.location_id || "").trim();
      if (key) {
        mapped[key] = entry;
      }
    });
    return mapped;
  }

  function auditStatusFromEntry(entry) {
    if (!entry) {
      return "uncounted";
    }
    if (entry.review_status === "recount_requested") return "uncounted";
    const result = String(entry.result_status || "").trim().toLowerCase();
    if (result === "match" || result === "empty_confirmed") {
      return "counted_match";
    }
    if (result === "review_needed") {
      return "review_needed";
    }
    return "counted_variance";
  }

  function worstAuditStatus(statuses, auditStatusOrder = []) {
    const values = Array.isArray(statuses) ? statuses : [];
    const order = Array.isArray(auditStatusOrder) && auditStatusOrder.length
      ? auditStatusOrder
      : ["review_needed", "counted_variance", "uncounted", "counted_match"];
    for (const status of order) {
      if (values.includes(status)) {
        return status;
      }
    }
    return "uncounted";
  }

  function auditExpectedDisplay(cellData) {
    if (!cellData) {
      return { item: "-", qty: "-" };
    }
    const mixedItems = Array.isArray(cellData.mixed_items) ? cellData.mixed_items : [];
    if (mixedItems.length) {
      return { item: `Mixed (${mixedItems.length})`, qty: String(Number(cellData.qty || 0)) };
    }
    return {
      item: String(cellData.item_number || "").trim() || "(empty)",
      qty: String(Number(cellData.qty || 0))
    };
  }

  function auditScopeForCurrentView(state, currentAuditSubview) {
    const subview = typeof currentAuditSubview === "function" ? currentAuditSubview() : "";
    if (subview === "rack" && state?.selectedRack) {
      return { scopeType: "row", scopeValue: state.selectedRack, label: `rack ${state.selectedRack}` };
    }
    if (subview === "floor" && state?.selectedZone) {
      return { scopeType: "zone", scopeValue: state.selectedZone, label: `zone ${state.selectedZone}` };
    }
    if (subview === "slotted" && state?.selectedSlottedPallet) {
      return { scopeType: "slotted_pallet", scopeValue: state.selectedSlottedPallet, label: `slotted pallet ${state.selectedSlottedPallet}` };
    }
    if (state?.area && state.area !== "All Areas") {
      return { scopeType: "area", scopeValue: state.area, label: `area ${state.area}` };
    }
    return null;
  }

  modules.audit = {
    auditEntryMap,
    auditExpectedDisplay,
    auditScopeForCurrentView,
    auditStatusFromEntry,
    worstAuditStatus
  };
})();
