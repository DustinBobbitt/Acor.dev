(() => {
  const modules = (window.WarehouseModules = window.WarehouseModules || {});

  function fallbackToSafeInt(value, fallback = 0) {
    const n = Number.parseInt(value, 10);
    return Number.isFinite(n) ? n : fallback;
  }

  function fallbackIsTrue(value) {
    if (typeof value === "boolean") {
      return value;
    }
    const text = String(value || "").trim().toLowerCase();
    return text === "1" || text === "true" || text === "yes" || text === "on";
  }

  function fallbackInventoryAgeInfo() {
    return { bucket: "never", days: null };
  }

  function fallbackParseInventoryTimestamp(value) {
    const text = String(value || "").trim();
    if (!text) {
      return null;
    }
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function fallbackParseInventoryBoundary(value, endOfDay = false) {
    const text = String(value || "").trim();
    if (!text) {
      return null;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      const parsed = new Date(`${text}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    return fallbackParseInventoryTimestamp(text);
  }

  function parseSmartQuery(query) {
    const includes = [];
    const excludes = [];
    String(query || "")
      .split(",")
      .map((token) => token.trim())
      .filter(Boolean)
      .forEach((token) => {
        const negated = token.startsWith("-");
        const cleaned = (negated ? token.slice(1) : token).trim();
        if (!cleaned) {
          return;
        }
        let field = "";
        let value = cleaned;
        const sep = cleaned.indexOf(":");
        if (sep > 0 && sep < cleaned.length - 1) {
          field = cleaned.slice(0, sep).trim().toLowerCase();
          value = cleaned.slice(sep + 1).trim();
        }
        const item = { field, value: value.toLowerCase() };
        if (negated) {
          excludes.push(item);
        } else {
          includes.push(item);
        }
      });
    return { includes, excludes };
  }

  function managementDefaultExportPath(format, area = "all", now = new Date()) {
    const safeArea = String(area || "all").replace(/[^a-z0-9_-]/gi, "_");
    const date = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
    const stamp = date.toISOString().replace(/[:.]/g, "-");
    return `management_report_${safeArea}_${stamp}.${format}`;
  }

  function managementRowsFromWarehouse(warehouse, movableItems = [], utils = {}) {
    const toSafeInt = utils.toSafeInt || fallbackToSafeInt;
    const inventoryAgeInfo = utils.inventoryAgeInfo || fallbackInventoryAgeInfo;
    const now = new Date();
    const rowArea = {};
    (warehouse?.rows || []).forEach((row) => {
      rowArea[row.name] = row.area || "";
    });
    const zoneArea = {};
    (warehouse?.zones || []).forEach((zone) => {
      zoneArea[zone.zone_id] = zone.area || "";
    });
    const slottedArea = {};
    (warehouse?.slotted_pallets || []).forEach((group) => {
      slottedArea[group.group_id] = group.area || "";
    });
    const rows = [];
    (warehouse?.rack_locations || []).forEach((loc) => {
      const mixedItems = Array.isArray(loc.mixed_items) ? loc.mixed_items : [];
      const mixedNames = mixedItems.map((item) => String(item.item_number || "").trim()).filter(Boolean);
      let itemDisplay = String(loc.item_number || "").trim();
      if (!itemDisplay && mixedNames.length) {
        itemDisplay = `Mixed: ${mixedNames.slice(0, 3).join(", ")}${mixedNames.length > 3 ? "..." : ""}`;
      }
      rows.push({
        location_type: "rack",
        area: rowArea[loc.row] || "",
        container_id: loc.row || "",
        bay_or_slot: loc.bay ?? "",
        level: loc.level ?? "",
        location_code: `${loc.row || ""}-B${String(loc.bay || "").padStart(2, "0")}-L${loc.level || ""}`,
        item_number: itemDisplay,
        qty: toSafeInt(loc.qty, 0),
        recorded_location: loc.recorded_location || "",
        po_number: loc.po_number || "",
        last_inventory_at: loc.last_inventory_at || "",
        last_inventory_source: loc.last_inventory_source || "",
        inventory_age_bucket: inventoryAgeInfo(loc.last_inventory_at, now).bucket,
        inventory_age_days: inventoryAgeInfo(loc.last_inventory_at, now).days,
        is_mixed: mixedItems.length > 0,
        mixed_items_count: mixedItems.length,
        _mixed_terms: mixedNames.join(" ").toLowerCase()
      });
    });
    (warehouse?.floor_locations || []).forEach((loc) => {
      rows.push({
        location_type: "floor",
        area: zoneArea[loc.zone] || "",
        container_id: loc.zone || "",
        bay_or_slot: loc.slot ?? "",
        level: "",
        location_code: `${loc.zone || ""}-S${String(loc.slot || "").padStart(3, "0")}`,
        item_number: loc.item_number || "",
        qty: toSafeInt(loc.qty, 0),
        recorded_location: loc.recorded_location || "",
        po_number: loc.po_number || "",
        last_inventory_at: loc.last_inventory_at || "",
        last_inventory_source: loc.last_inventory_source || "",
        inventory_age_bucket: inventoryAgeInfo(loc.last_inventory_at, now).bucket,
        inventory_age_days: inventoryAgeInfo(loc.last_inventory_at, now).days,
        is_mixed: false,
        mixed_items_count: 0,
        _mixed_terms: ""
      });
    });
    (warehouse?.slotted_pallet_locations || []).forEach((loc) => {
      const mixedItems = Array.isArray(loc.mixed_items) ? loc.mixed_items : [];
      const mixedNames = mixedItems.map((entry) => String(entry.item_number || "").trim()).filter(Boolean);
      let itemDisplay = String(loc.item_number || "").trim();
      if (!itemDisplay && mixedNames.length) {
        itemDisplay = `Mixed: ${mixedNames.slice(0, 3).join(", ")}${mixedNames.length > 3 ? "..." : ""}`;
      }
      rows.push({
        location_type: "slotted_pallet",
        area: slottedArea[loc.group_id] || "",
        container_id: loc.group_id || "",
        bay_or_slot: loc.slot ?? "",
        level: "",
        location_code: `${loc.group_id || ""}-S${String(loc.slot || "").padStart(2, "0")}`,
        item_number: itemDisplay,
        qty: toSafeInt(loc.qty, 0),
        recorded_location: loc.recorded_location || "",
        po_number: loc.po_number || "",
        last_inventory_at: loc.last_inventory_at || "",
        last_inventory_source: loc.last_inventory_source || "",
        inventory_age_bucket: inventoryAgeInfo(loc.last_inventory_at, now).bucket,
        inventory_age_days: inventoryAgeInfo(loc.last_inventory_at, now).days,
        is_mixed: mixedItems.length > 0,
        mixed_items_count: mixedItems.length,
        _mixed_terms: mixedNames.join(" ").toLowerCase()
      });
    });
    (movableItems || []).forEach((item) => {
      const mixedItems = Array.isArray(item.mixed_items) ? item.mixed_items : [];
      const mixedNames = mixedItems.map((entry) => String(entry.item_number || "").trim()).filter(Boolean);
      let itemDisplay = String(item.item_number || "").trim();
      if (!itemDisplay && mixedNames.length) {
        itemDisplay = `Mixed: ${mixedNames.slice(0, 3).join(", ")}${mixedNames.length > 3 ? "..." : ""}`;
      }
      rows.push({
        location_type: "movable",
        area: item.area || "",
        container_id: item.id || "",
        bay_or_slot: "",
        level: "",
        location_code: item.location_code || item.id || "",
        item_number: itemDisplay,
        qty: toSafeInt(item.qty, 0),
        recorded_location: item.recorded_location || "",
        po_number: item.po_number || "",
        last_inventory_at: item.last_inventory_at || "",
        last_inventory_source: item.last_inventory_source || "",
        inventory_age_bucket: inventoryAgeInfo(item.last_inventory_at, now).bucket,
        inventory_age_days: inventoryAgeInfo(item.last_inventory_at, now).days,
        is_mixed: mixedItems.length > 0,
        mixed_items_count: mixedItems.length,
        _mixed_terms: mixedNames.join(" ").toLowerCase()
      });
    });
    return rows;
  }

  function rowFieldValueForTerm(row, field) {
    if (field === "item") {
      return `${String(row.item_number || "").toLowerCase()} ${String(row._mixed_terms || "").toLowerCase()}`;
    }
    if (field === "po") {
      return String(row.po_number || "").toLowerCase();
    }
    if (field === "rack") {
      return row.location_type === "rack" ? String(row.container_id || "").toLowerCase() : "";
    }
    if (field === "zone") {
      if (row.location_type === "floor" || row.location_type === "slotted_pallet") {
        return String(row.container_id || "").toLowerCase();
      }
      if (row.location_type === "movable" && String(row.container_id || "").toUpperCase().startsWith("PAL-")) {
        return String(row.container_id || "").toLowerCase();
      }
      return "";
    }
    if (field === "area") {
      return String(row.area || "").toLowerCase();
    }
    if (field === "location") {
      return String(row.location_code || "").toLowerCase();
    }
    return [
      String(row.item_number || "").toLowerCase(),
      String(row._mixed_terms || "").toLowerCase(),
      String(row.container_id || "").toLowerCase(),
      String(row.area || "").toLowerCase(),
      String(row.location_code || "").toLowerCase(),
      String(row.po_number || "").toLowerCase(),
      String(row.recorded_location || "").toLowerCase()
    ].join(" ");
  }

  function rowMatchesSmartQuery(row, parsedQuery) {
    const includes = parsedQuery?.includes || [];
    const excludes = parsedQuery?.excludes || [];
    for (const term of excludes) {
      const value = String(term.value || "").toLowerCase();
      if (!value) {
        continue;
      }
      if (rowFieldValueForTerm(row, String(term.field || "").toLowerCase()).includes(value)) {
        return false;
      }
    }
    if (!includes.length) {
      return true;
    }
    return includes.some((term) => {
      const value = String(term.value || "").toLowerCase();
      if (!value) {
        return false;
      }
      return rowFieldValueForTerm(row, String(term.field || "").toLowerCase()).includes(value);
    });
  }

  function applyManagementFilters(rows, filters, parsedQuery, utils = {}) {
    const toSafeInt = utils.toSafeInt || fallbackToSafeInt;
    const isTrue = utils.isTrue || fallbackIsTrue;
    const parseInventoryTimestamp = utils.parseInventoryTimestamp || fallbackParseInventoryTimestamp;
    const parseInventoryBoundary = utils.parseInventoryBoundary || fallbackParseInventoryBoundary;
    const inventoryAgeInfo = utils.inventoryAgeInfo || fallbackInventoryAgeInfo;
    const area = String(filters.area || "All Areas");
    const locationType = String(filters.location_type || "all").toLowerCase();
    const containerQuery = String(filters.container_id || "").trim().toLowerCase();
    const poQuery = String(filters.po_number || "").trim().toLowerCase();
    const recordedQuery = String(filters.recorded_location || "").trim().toLowerCase();
    const inventorySourceQuery = String(filters.inventory_source || "").trim().toLowerCase();
    const ageBucket = String(filters.age_bucket || "all").trim().toLowerCase();
    const minQty = String(filters.min_qty ?? "").trim();
    const maxQty = String(filters.max_qty ?? "").trim();
    const inventoryAfter = parseInventoryBoundary(filters.inventory_after ?? filters.inventory_from);
    const inventoryBefore = parseInventoryBoundary(filters.inventory_before ?? filters.inventory_to, true);
    const olderThanDays = String(filters.older_than_days ?? "").trim();
    const olderThanCutoff = olderThanDays !== ""
      ? new Date(Date.now() - (Math.max(0, toSafeInt(olderThanDays, 0)) * 24 * 60 * 60 * 1000))
      : null;
    const chips = filters.chips || {};
    const lowQtyThreshold = toSafeInt(filters.low_qty_threshold, 5);
    return (rows || []).filter((row) => {
      if (area !== "All Areas" && String(row.area || "") !== area) {
        return false;
      }
      if ((locationType === "rack" || locationType === "floor" || locationType === "movable" || locationType === "slotted_pallet") && row.location_type !== locationType) {
        return false;
      }
      if (containerQuery && !String(row.container_id || "").toLowerCase().includes(containerQuery)) {
        return false;
      }
      if (poQuery && !String(row.po_number || "").toLowerCase().includes(poQuery)) {
        return false;
      }
      if (recordedQuery && !String(row.recorded_location || "").toLowerCase().includes(recordedQuery)) {
        return false;
      }
      const qty = toSafeInt(row.qty, 0);
      if (minQty !== "" && qty < toSafeInt(minQty, 0)) {
        return false;
      }
      if (maxQty !== "" && qty > toSafeInt(maxQty, 0)) {
        return false;
      }
      const inventoryAt = parseInventoryTimestamp(row.last_inventory_at);
      const rowAgeInfo = {
        bucket: String(row.inventory_age_bucket || "").trim() || inventoryAgeInfo(row.last_inventory_at).bucket,
        days: row.inventory_age_days
      };
      const inventorySource = String(row.last_inventory_source || "").toLowerCase();
      if (isTrue(chips.never_inventoried)) {
        if (inventoryAt) {
          return false;
        }
      } else {
        if (inventorySourceQuery && !inventorySource.includes(inventorySourceQuery)) {
          return false;
        }
        if (inventoryAfter && (!inventoryAt || inventoryAt < inventoryAfter)) {
          return false;
        }
        if (inventoryBefore && (!inventoryAt || inventoryAt > inventoryBefore)) {
          return false;
        }
        if (olderThanCutoff && (!inventoryAt || inventoryAt >= olderThanCutoff)) {
          return false;
        }
      }
      if (ageBucket !== "all" && rowAgeInfo.bucket !== ageBucket) {
        return false;
      }
      if (isTrue(chips.empty_only) && qty > 0) {
        return false;
      }
      if (isTrue(chips.mixed_only) && !isTrue(row.is_mixed)) {
        return false;
      }
      if (isTrue(chips.has_po) && !String(row.po_number || "").trim()) {
        return false;
      }
      if (isTrue(chips.rack_only) && row.location_type !== "rack") {
        return false;
      }
      if (isTrue(chips.floor_only) && row.location_type !== "floor") {
        return false;
      }
      if (isTrue(chips.low_qty) && !(qty > 0 && qty <= lowQtyThreshold)) {
        return false;
      }
      return rowMatchesSmartQuery(row, parsedQuery);
    });
  }

  function summarizeManagementRows(rows, utils = {}) {
    const toSafeInt = utils.toSafeInt || fallbackToSafeInt;
    const isTrue = utils.isTrue || fallbackIsTrue;
    const inventoryAgeInfo = utils.inventoryAgeInfo || fallbackInventoryAgeInfo;
    const uniqueItems = new Set();
    const uniqueAreas = new Set();
    const uniqueLocations = new Set();
    let totalQty = 0;
    let mixedLocations = 0;
    let emptyLocations = 0;
    let occupiedLocations = 0;
    const inventoryAgeCounts = {
      never: 0,
      "0_7_days": 0,
      "8_30_days": 0,
      "31_90_days": 0,
      over_90_days: 0
    };
    (rows || []).forEach((row) => {
      const qty = toSafeInt(row.qty, 0);
      totalQty += qty;
      if (String(row.item_number || "").trim()) {
        uniqueItems.add(String(row.item_number || "").trim().toLowerCase());
      }
      if (String(row.area || "").trim()) {
        uniqueAreas.add(String(row.area || "").trim().toLowerCase());
      }
      uniqueLocations.add(String(row.location_code || "").trim());
      if (isTrue(row.is_mixed)) {
        mixedLocations += 1;
      }
      if (qty <= 0) {
        emptyLocations += 1;
      } else {
        occupiedLocations += 1;
      }
      const bucket = String(row.inventory_age_bucket || "").trim() || inventoryAgeInfo(row.last_inventory_at).bucket;
      if (Object.prototype.hasOwnProperty.call(inventoryAgeCounts, bucket)) {
        inventoryAgeCounts[bucket] += 1;
      }
    });
    return {
      row_count: (rows || []).length,
      total_qty: totalQty,
      unique_items: uniqueItems.size,
      unique_areas: uniqueAreas.size,
      unique_locations: uniqueLocations.size,
      mixed_locations: mixedLocations,
      empty_locations: emptyLocations,
      occupied_locations: occupiedLocations,
      inventory_age_counts: inventoryAgeCounts
    };
  }

  modules.management = {
    applyManagementFilters,
    managementRowsFromWarehouse,
    managementDefaultExportPath,
    parseSmartQuery,
    rowFieldValueForTerm,
    rowMatchesSmartQuery,
    summarizeManagementRows
  };
})();
