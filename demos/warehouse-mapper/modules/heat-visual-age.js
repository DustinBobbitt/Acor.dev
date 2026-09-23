(() => {
  const modules = (window.WarehouseModules = window.WarehouseModules || {});

  function fallbackInventoryAgeInfo() {
    return { bucket: "never", days: null };
  }

  function worstInventoryAgeBucket(buckets, bucketOrder = []) {
    const order = Array.isArray(bucketOrder) && bucketOrder.length
      ? bucketOrder
      : ["never", "over_90_days", "31_90_days", "8_30_days", "0_7_days"];
    for (const bucket of order) {
      if ((buckets || []).includes(bucket)) {
        return bucket;
      }
    }
    return "never";
  }

  function buildVisualAgeCache(warehouse, movableItems = [], utils = {}) {
    const inventoryAgeInfo = utils.inventoryAgeInfo || fallbackInventoryAgeInfo;
    const isDeprecatedPalletZoneId = utils.isDeprecatedPalletZoneId || (() => false);
    const bucketOrder = utils.bucketOrder || ["never", "over_90_days", "31_90_days", "8_30_days", "0_7_days"];
    const cache = {
      rows: {},
      zones: {},
      slotted: {},
      movable: {}
    };
    const now = new Date();
    (warehouse?.rack_locations || []).forEach((loc) => {
      const rowName = String(loc.row || "").trim();
      if (!rowName) {
        return;
      }
      const bucket = inventoryAgeInfo(loc.last_inventory_at, now).bucket;
      cache.rows[rowName] = worstInventoryAgeBucket([cache.rows[rowName], bucket].filter(Boolean), bucketOrder);
    });
    (warehouse?.floor_locations || []).forEach((loc) => {
      const zoneId = String(loc.zone || "").trim();
      if (!zoneId || isDeprecatedPalletZoneId(zoneId)) {
        return;
      }
      const bucket = inventoryAgeInfo(loc.last_inventory_at, now).bucket;
      cache.zones[zoneId] = worstInventoryAgeBucket([cache.zones[zoneId], bucket].filter(Boolean), bucketOrder);
    });
    (warehouse?.slotted_pallet_locations || []).forEach((loc) => {
      const groupId = String(loc.group_id || "").trim();
      if (!groupId) {
        return;
      }
      const bucket = inventoryAgeInfo(loc.last_inventory_at, now).bucket;
      cache.slotted[groupId] = worstInventoryAgeBucket([cache.slotted[groupId], bucket].filter(Boolean), bucketOrder);
    });
    (movableItems || []).forEach((item) => {
      const itemId = String(item.id || item.item_id || "").trim();
      if (!itemId) {
        return;
      }
      cache.movable[itemId] = inventoryAgeInfo(item.last_inventory_at, now).bucket;
    });
    return cache;
  }

  function updateVisualAgeForRackModel(state, rackModel, utils = {}) {
    const inventoryAgeInfo = utils.inventoryAgeInfo || fallbackInventoryAgeInfo;
    const bucketOrder = utils.bucketOrder || ["never", "over_90_days", "31_90_days", "8_30_days", "0_7_days"];
    const rowName = String(rackModel?.row?.name || "").trim();
    if (!rowName || !state?.visualAge?.rows) {
      return;
    }
    const buckets = (rackModel?.cells || []).map((cell) => inventoryAgeInfo(cell.last_inventory_at).bucket);
    state.visualAge.rows[rowName] = worstInventoryAgeBucket(buckets, bucketOrder);
  }

  function updateVisualAgeForZoneModel(state, zoneModel, utils = {}) {
    const inventoryAgeInfo = utils.inventoryAgeInfo || fallbackInventoryAgeInfo;
    const bucketOrder = utils.bucketOrder || ["never", "over_90_days", "31_90_days", "8_30_days", "0_7_days"];
    const zoneId = String(zoneModel?.zone?.zone_id || "").trim();
    if (!zoneId || !state?.visualAge?.zones) {
      return;
    }
    const buckets = (zoneModel?.cells || []).map((cell) => inventoryAgeInfo(cell.last_inventory_at).bucket);
    state.visualAge.zones[zoneId] = worstInventoryAgeBucket(buckets, bucketOrder);
  }

  function updateVisualAgeForSlottedModel(state, slottedModel, utils = {}) {
    const inventoryAgeInfo = utils.inventoryAgeInfo || fallbackInventoryAgeInfo;
    const bucketOrder = utils.bucketOrder || ["never", "over_90_days", "31_90_days", "8_30_days", "0_7_days"];
    const groupId = String(slottedModel?.slotted_pallet?.group_id || "").trim();
    if (!groupId || !state?.visualAge?.slotted) {
      return;
    }
    const buckets = (slottedModel?.cells || []).map((cell) => inventoryAgeInfo(cell.last_inventory_at).bucket);
    state.visualAge.slotted[groupId] = worstInventoryAgeBucket(buckets, bucketOrder);
  }

  function updateVisualAgeForMovableItems(state, items = [], utils = {}) {
    const inventoryAgeInfo = utils.inventoryAgeInfo || fallbackInventoryAgeInfo;
    if (!state?.visualAge?.movable) {
      return;
    }
    (items || []).forEach((item) => {
      const itemId = String(item.id || item.item_id || "").trim();
      if (!itemId) {
        return;
      }
      state.visualAge.movable[itemId] = inventoryAgeInfo(item.last_inventory_at).bucket;
    });
  }

  function entityHeatBucket(state, type, entity, utils = {}) {
    const inventoryAgeInfo = utils.inventoryAgeInfo || fallbackInventoryAgeInfo;
    if (!entity || !state?.visualAge) {
      return "never";
    }
    if (type === "row") {
      return state.visualAge.rows[String(entity.name || "").trim()] || "never";
    }
    if (type === "zone") {
      return state.visualAge.zones[String(entity.zone_id || "").trim()] || "never";
    }
    if (type === "slotted") {
      return state.visualAge.slotted[String(entity.group_id || "").trim()] || "never";
    }
    if (type === "movable") {
      const itemId = String(entity.id || entity.item_id || "").trim();
      return state.visualAge.movable[itemId] || inventoryAgeInfo(entity.last_inventory_at).bucket;
    }
    return "never";
  }

  function applyHeatClass(state, node, bucket, utils = {}) {
    const heatBucketClass = utils.heatBucketClass || ((value) => (value ? `heat-${value}` : ""));
    if (!state?.heatMapEnabled || !node || !bucket) {
      return;
    }
    node.classList.add("heat-mode", heatBucketClass(bucket));
  }

  modules.heatVisualAge = {
    applyHeatClass,
    buildVisualAgeCache,
    entityHeatBucket,
    updateVisualAgeForMovableItems,
    updateVisualAgeForRackModel,
    updateVisualAgeForSlottedModel,
    updateVisualAgeForZoneModel,
    worstInventoryAgeBucket
  };
})();
