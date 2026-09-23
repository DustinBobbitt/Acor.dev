(() => {
  const modules = (window.WarehouseModules = window.WarehouseModules || {});

  function toSafeInt(value, fallback = 0) {
    const n = Number.parseInt(value, 10);
    return Number.isFinite(n) ? n : fallback;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function rackCellKey(bay, level) {
    return `${bay}:${level}`;
  }

  function floorCellKey(slot) {
    return `S:${slot}`;
  }

  function slottedCellKey(slot) {
    return `SP:${slot}`;
  }

  function movableItemKey(itemId) {
    return `M:${itemId}`;
  }

  function formatInteger(value) {
    return new Intl.NumberFormat("en-US").format(Math.max(0, Math.round(Number(value) || 0)));
  }

  function parseInventoryTimestamp(value) {
    const text = String(value || "").trim();
    if (!text) {
      return null;
    }
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function parseInventoryBoundary(value, endOfDay = false) {
    const text = String(value || "").trim();
    if (!text) {
      return null;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      const parsed = new Date(`${text}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    return parseInventoryTimestamp(text);
  }

  function formatInventoryTimestamp(value) {
    const parsed = parseInventoryTimestamp(value);
    return parsed ? parsed.toLocaleString() : "Never";
  }

  function normalizedHeatMapSettings(raw) {
    const fresh = Math.max(0, toSafeInt(raw?.fresh_max_days, 7));
    const aging = Math.max(fresh + 1, toSafeInt(raw?.aging_max_days, 30));
    const stale = Math.max(aging + 1, toSafeInt(raw?.stale_max_days, 90));
    return {
      fresh_max_days: fresh,
      aging_max_days: aging,
      stale_max_days: stale
    };
  }

  function inventoryAgeBucketLabels(settings) {
    const normalized = normalizedHeatMapSettings(settings);
    return {
      never: "Never",
      "0_7_days": `0-${normalized.fresh_max_days} days`,
      "8_30_days": `${normalized.fresh_max_days + 1}-${normalized.aging_max_days} days`,
      "31_90_days": `${normalized.aging_max_days + 1}-${normalized.stale_max_days} days`,
      over_90_days: `${normalized.stale_max_days + 1}+ days`
    };
  }

  function inventoryAgeInfo(value, now = new Date(), settings = {}) {
    const parsed = parseInventoryTimestamp(value);
    if (!parsed) {
      return { bucket: "never", days: null };
    }
    const thresholds = normalizedHeatMapSettings(settings);
    const current = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
    const elapsedMs = Math.max(0, current.getTime() - parsed.getTime());
    const days = Math.floor(elapsedMs / (24 * 60 * 60 * 1000));
    if (days <= thresholds.fresh_max_days) {
      return { bucket: "0_7_days", days };
    }
    if (days <= thresholds.aging_max_days) {
      return { bucket: "8_30_days", days };
    }
    if (days <= thresholds.stale_max_days) {
      return { bucket: "31_90_days", days };
    }
    return { bucket: "over_90_days", days };
  }

  function inventoryAgeDisplay(days) {
    return Number.isFinite(days) ? `${days} day${days === 1 ? "" : "s"}` : "Never";
  }

  function heatBucketClass(bucket) {
    return bucket ? `heat-${bucket}` : "";
  }

  modules.helpers = {
    clamp,
    floorCellKey,
    formatInteger,
    formatInventoryTimestamp,
    heatBucketClass,
    inventoryAgeBucketLabels,
    inventoryAgeDisplay,
    inventoryAgeInfo,
    movableItemKey,
    normalizedHeatMapSettings,
    parseInventoryBoundary,
    parseInventoryTimestamp,
    rackCellKey,
    slottedCellKey,
    toSafeInt
  };
})();
