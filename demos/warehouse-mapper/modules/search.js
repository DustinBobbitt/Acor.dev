(() => {
  const modules = (window.WarehouseModules = window.WarehouseModules || {});

  function searchResultLocationKey(result) {
    const type = String(result.location_type || "");
    const container = String(result.container_id || "");
    const bayOrSlot = String(result.bay_or_slot ?? "");
    const level = String(result.level ?? "");
    return `${type}|${container}|${bayOrSlot}|${level}`;
  }

  function buildRackMatches(results, rackCellKey) {
    const rackMatches = {};
    (results || []).forEach((result) => {
      if (result.location_type !== "rack") {
        return;
      }
      const rowName = String(result.container_id || "");
      const bay = Number(result.bay_or_slot);
      const level = Number(result.level);
      if (!rowName || !Number.isFinite(bay) || !Number.isFinite(level)) {
        return;
      }
      if (!rackMatches[rowName]) {
        rackMatches[rowName] = new Set();
      }
      rackMatches[rowName].add(rackCellKey(bay, level));
    });
    return rackMatches;
  }

  function rackSearchStats(results, rowName, searchResultLocationKeyFn = searchResultLocationKey) {
    if (!rowName) {
      return { qty: 0, uniqueLocations: 0 };
    }
    let qty = 0;
    const locationKeys = new Set();
    (results || []).forEach((result) => {
      if (result.location_type !== "rack") {
        return;
      }
      if (String(result.container_id || "") !== String(rowName)) {
        return;
      }
      const parsedQty = Number(result.qty || 0);
      qty += Number.isFinite(parsedQty) ? parsedQty : 0;
      locationKeys.add(searchResultLocationKeyFn(result));
    });
    return { qty, uniqueLocations: locationKeys.size };
  }

  modules.search = {
    buildRackMatches,
    rackSearchStats,
    searchResultLocationKey
  };
})();
