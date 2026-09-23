(() => {
  const modules = (window.WarehouseModules = window.WarehouseModules || {});

  modules.constants = {
    VIEW_MODES: {
      OVERVIEW: "overview",
      RACK: "rack",
      FLOOR: "floor",
      SLOTTED: "slotted",
      AUDIT: "audit",
      MANAGEMENT: "management",
      CONFIG: "config"
    },
    OVERVIEW_MIN_ZOOM: 0.3,
    OVERVIEW_MAX_ZOOM: 2.5,
    OVERVIEW_FOCUS_MAX_ZOOM: 5,
    CONFIG_MIN_ZOOM: 0.25,
    CONFIG_MAX_ZOOM: 3,
    INVENTORY_AGE_BUCKET_ORDER: ["never", "over_90_days", "31_90_days", "8_30_days", "0_7_days"],
    AUDIT_STATUS_ORDER: ["review_needed", "counted_variance", "uncounted", "counted_match"]
  };
})();
