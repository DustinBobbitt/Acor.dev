/*
 * Asset template registry.
 *
 * A template describes everything needed to place a warehouse asset on the
 * overview map and (optionally) open a front-facing inventory view of it:
 *
 *   id         stable identifier ("pallet_rack")
 *   label      human name shown in pickers
 *   category   "rack" | "storage" | "zone" | "fixture" | "movable"
 *   entity     which existing map entity implements it:
 *              "row"            rack rows: full bay/level inventory + front view
 *              "zone"           floor zones: slot inventory
 *              "slotted_pallet" slot-grid pallet
 *              "movable_item"   draggable items (pallet/cart/custom kinds)
 *              "null_space"     fixed, non-inventory footprint (machine, wall...)
 *   kind       entity sub-kind persisted on the record
 *   footprint  default top-down size in world units
 *   frontView  null, or { bays, levels, rackHeightInches } for rack-like assets
 *   create     extra fields merged into the create payload
 *   color/stripe/shape  visual defaults for null-space fixtures
 *   notes      one-line guidance shown in the picker tooltip
 *
 * Custom templates (user-uploaded image + clickable grid) are stored on the
 * server and merged in at runtime via setCustomTemplates().
 *
 * Loadable in browser and Node (same UMD pattern as geometry.js).
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = mod;
  }
  if (root) {
    root.WarehouseModules = root.WarehouseModules || {};
    root.WarehouseModules.assetTemplates = mod;
  }
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";

  // World units are canvas px at zoom 1 (~0.5in each in shipped maps).
  const TEMPLATES = [
    // ---- Racks and rack-like storage (entity: row → front view for free) ----
    {
      id: "pallet_rack",
      label: "Pallet Rack",
      category: "rack",
      entity: "row",
      idPrefix: "RACK-",
      footprint: { width: 264, height: 58 },
      frontView: { bays: 6, levels: 3, rackHeightInches: 144 },
      create: { bay_count: 6, levels_default: 3, rack_height: 144, support_every_bays: 2 },
      notes: "Standard selective pallet rack: 6 bays x 3 levels, 144\" uprights."
    },
    {
      id: "shelf_rack",
      label: "Shelf Rack",
      category: "rack",
      entity: "row",
      idPrefix: "SHELF-",
      footprint: { width: 176, height: 48 },
      frontView: { bays: 4, levels: 4, rackHeightInches: 84 },
      create: { bay_count: 4, levels_default: 4, rack_height: 84, support_every_bays: 2 },
      notes: "Light-duty shelving: 4 bays x 4 shelves."
    },
    {
      id: "bulk_storage_rack",
      label: "Bulk Storage Rack",
      category: "rack",
      entity: "row",
      idPrefix: "BULK-",
      footprint: { width: 220, height: 90 },
      frontView: { bays: 3, levels: 2, rackHeightInches: 120 },
      create: { bay_count: 3, levels_default: 2, rack_height: 120, support_every_bays: 1 },
      notes: "Deep bulk rack: 3 wide bays x 2 tall levels."
    },
    {
      id: "sheet_goods_rack",
      label: "Sheet Goods Rack",
      category: "rack",
      entity: "row",
      idPrefix: "SHEET-",
      footprint: { width: 200, height: 40 },
      frontView: { bays: 5, levels: 2, rackHeightInches: 96 },
      create: { bay_count: 5, levels_default: 2, rack_height: 96, support_every_bays: 1 },
      notes: "Vertical sheet/panel storage with narrow slots."
    },
    {
      id: "lumber_rack",
      label: "Lumber Rack",
      category: "rack",
      entity: "row",
      idPrefix: "LMBR-",
      footprint: { width: 280, height: 44 },
      frontView: { bays: 4, levels: 3, rackHeightInches: 96 },
      create: { bay_count: 4, levels_default: 3, rack_height: 96, support_every_bays: 2 },
      notes: "Cantilever-style lumber storage: long horizontal arms."
    },
    {
      id: "bin_shelf",
      label: "Bin Shelf",
      category: "storage",
      entity: "row",
      idPrefix: "BIN-",
      footprint: { width: 120, height: 36 },
      frontView: { bays: 3, levels: 5, rackHeightInches: 72 },
      create: { bay_count: 3, levels_default: 5, rack_height: 72, support_every_bays: 3 },
      notes: "Small-parts bin shelving: 3 bays x 5 shelves."
    },
    {
      id: "tool_cabinet",
      label: "Tool Cabinet",
      category: "storage",
      entity: "row",
      idPrefix: "TOOL-",
      footprint: { width: 60, height: 30 },
      frontView: { bays: 1, levels: 4, rackHeightInches: 60 },
      create: { bay_count: 1, levels_default: 4, rack_height: 60, support_every_bays: 1 },
      notes: "Single-bay cabinet with 4 shelves; tracks tool inventory per shelf."
    },
    {
      id: "parts_cabinet",
      label: "Parts Cabinet",
      category: "storage",
      entity: "row",
      idPrefix: "PARTS-",
      footprint: { width: 60, height: 30 },
      frontView: { bays: 1, levels: 6, rackHeightInches: 72 },
      create: { bay_count: 1, levels_default: 6, rack_height: 72, support_every_bays: 1 },
      notes: "Single-bay cabinet with 6 shelves for small parts."
    },

    // ---- Floor zones (entity: zone → slot inventory) ----
    {
      id: "staging_zone",
      label: "Staging Zone",
      category: "zone",
      entity: "zone",
      idPrefix: "STAGE-",
      footprint: { width: 260, height: 140 },
      frontView: null,
      create: { slot_count: 8, layout: "grid", columns: 4 },
      notes: "Floor staging area with 8 counted slots."
    },
    {
      id: "shipping_zone",
      label: "Shipping Zone",
      category: "zone",
      entity: "zone",
      idPrefix: "SHIP-",
      footprint: { width: 260, height: 140 },
      frontView: null,
      create: { slot_count: 6, layout: "grid", columns: 3 },
      notes: "Outbound shipping lanes; slots hold staged orders."
    },
    {
      id: "receiving_zone",
      label: "Receiving Zone",
      category: "zone",
      entity: "zone",
      idPrefix: "RECV-",
      footprint: { width: 260, height: 140 },
      frontView: null,
      create: { slot_count: 6, layout: "grid", columns: 3 },
      notes: "Inbound receiving lanes; slots hold unprocessed receipts."
    },

    // ---- Movable items ----
    {
      id: "pallet",
      label: "Pallet",
      category: "movable",
      entity: "movable_item",
      kind: "pallet",
      idPrefix: "PAL-",
      footprint: { width: 48, height: 36 },
      frontView: null,
      notes: "Single movable pallet; carries its own inventory."
    },
    {
      id: "cart",
      label: "Cart",
      category: "movable",
      entity: "movable_item",
      kind: "cart",
      idPrefix: "CART-",
      footprint: { width: 44, height: 32 },
      frontView: null,
      notes: "Rolling cart; movable like a pallet."
    },
    {
      id: "slotted_pallet",
      label: "Slotted Pallet",
      category: "movable",
      entity: "slotted_pallet",
      idPrefix: "SP-",
      footprint: { width: 280, height: 160 },
      frontView: null,
      create: { slot_count: 6, layout: "grid", columns: 3 },
      notes: "Pallet with numbered slots; open it to manage per-slot inventory."
    },

    // ---- Fixed, non-inventory fixtures (entity: null_space) ----
    {
      id: "workbench",
      label: "Workbench",
      category: "fixture",
      entity: "null_space",
      kind: "workbench",
      idPrefix: "WB-",
      footprint: { width: 120, height: 50 },
      frontView: null,
      color: "#d9c8a9",
      stripe: "none",
      notes: "Work surface; blocks placement, holds no inventory."
    },
    {
      id: "machine",
      label: "Machine",
      category: "fixture",
      entity: "null_space",
      kind: "machine",
      idPrefix: "MCH-",
      footprint: { width: 110, height: 90 },
      frontView: null,
      color: "#cbd5e1",
      stripe: "diagonal",
      notes: "Fixed machinery footprint (saw, CNC, press...)."
    },
    {
      id: "door",
      label: "Door",
      category: "fixture",
      entity: "null_space",
      kind: "door",
      idPrefix: "DOOR-",
      footprint: { width: 90, height: 14 },
      frontView: null,
      color: "#bfdbfe",
      stripe: "none",
      notes: "Doorway / dock door opening. Keep clear."
    },
    {
      id: "wall",
      label: "Wall",
      category: "fixture",
      entity: "null_space",
      kind: "wall",
      idPrefix: "WALL-",
      footprint: { width: 300, height: 10 },
      frontView: null,
      color: "#6b7280",
      stripe: "none",
      notes: "Interior wall segment; resize/rotate to trace the floor plan."
    },
    {
      id: "aisle",
      label: "Aisle",
      category: "fixture",
      entity: "null_space",
      kind: "aisle",
      idPrefix: "AISLE-",
      footprint: { width: 260, height: 60 },
      frontView: null,
      color: "#f3f4f6",
      stripe: "horizontal",
      notes: "Travel lane. Visual only — keeps walkways obvious on the map."
    }
  ];

  const byId = new Map(TEMPLATES.map((tpl) => [tpl.id, tpl]));

  // Server-stored custom templates (image + clickable grid), merged at runtime.
  let customTemplates = [];

  function setCustomTemplates(list) {
    customTemplates = Array.isArray(list) ? list.slice() : [];
  }

  function allTemplates() {
    return TEMPLATES.concat(customTemplates);
  }

  function templateById(id) {
    if (byId.has(id)) {
      return byId.get(id);
    }
    return customTemplates.find((tpl) => tpl.id === id) || null;
  }

  function templatesByCategory() {
    const groups = {};
    allTemplates().forEach((tpl) => {
      const key = tpl.category || "other";
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(tpl);
    });
    return groups;
  }

  return {
    TEMPLATES,
    allTemplates,
    templateById,
    templatesByCategory,
    setCustomTemplates
  };
});
