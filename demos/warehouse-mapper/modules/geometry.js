/*
 * Geometry module — the single source of truth for rendering math.
 *
 * Responsibilities:
 *   1. World-coordinate rects for every overview entity type (one pipeline).
 *   2. Overview viewport transforms: zoom, pan, fit-to-view, reset.
 *   3. Rack front-view layout: bay columns, level heights from cross-member
 *      (beam) positions, per-bay overrides, upright/support placement.
 *
 * Everything in this file is pure and deterministic: the same input data
 * always produces the same geometry. No DOM access, no Date, no random.
 * That property is verified by tests/geometry/golden.test.js.
 *
 * Loadable in the browser (window.WarehouseModules.geometry) and in Node
 * (module.exports) so the golden tests exercise the exact shipping code.
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = mod;
  }
  if (root) {
    root.WarehouseModules = root.WarehouseModules || {};
    root.WarehouseModules.geometry = mod;
  }
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";

  function toNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  /* ------------------------------------------------------------------ *
   * 1. World-coordinate entity rects (top-down overview)
   *
   * World units are "canvas pixels at zoom 1". One world unit is roughly
   * half an inch of real warehouse space in the shipped maps, but the
   * renderer never assumes a physical scale — only relative geometry.
   * ------------------------------------------------------------------ */

  // Per-type floors and fallbacks. An entity narrower than its minimum is
  // still clickable and its label remains legible at fit zoom.
  const ENTITY_DEFAULTS = {
    row: { minWidth: 24, minHeight: 24 },
    zone: { minWidth: 24, minHeight: 24 },
    null_space: { defaultWidth: 160, defaultHeight: 120, minWidth: 20, minHeight: 20 },
    movable_item: { defaultWidth: 48, defaultHeight: 36, minWidth: 20, minHeight: 20 },
    slotted_pallet: { defaultWidth: 280, defaultHeight: 160, minWidth: 80, minHeight: 80 },
    area_box: { defaultWidth: 260, defaultHeight: 180, minWidth: 120, minHeight: 100 }
  };

  // Derived-size constants for entities that predate explicit width/height.
  // Kept bit-identical to the legacy formulas so old maps render unchanged.
  const DERIVED = {
    ROW_BAY_UNIT: 22,      // px of rack length per bay
    ROW_DEPTH: 58,         // px across the rack (horizontal orientation)
    ROW_DEPTH_VERTICAL: 60,
    ROW_MIN_LENGTH: 140,
    ROW_MIN_DEPTH: 70,
    ZONE_SLOT_UNIT: 16,    // px per slot in line layout
    ZONE_GRID_UNIT: 24,    // px per slot cell in grid layout
    ZONE_PADDING: 20
  };

  function rotationOf(entity) {
    // Rotation is stored in degrees, clockwise, about the rect center.
    // Legacy data has no rotation field; treat missing/invalid as 0.
    return toNumber(entity && entity.rotation, 0) % 360;
  }

  function explicitRect(entity, defaults) {
    const width = toNumber(entity.width, 0);
    const height = toNumber(entity.height, 0);
    if (width > 0 && height > 0) {
      return {
        x: toNumber(entity.x, 0),
        y: toNumber(entity.y, 0),
        width: Math.max(defaults.minWidth, width),
        height: Math.max(defaults.minHeight, height),
        rotation: rotationOf(entity)
      };
    }
    return null;
  }

  function rowRect(row) {
    const explicit = explicitRect(row, ENTITY_DEFAULTS.row);
    if (explicit) {
      return explicit;
    }
    // Legacy racks without stored width/height derive their footprint from
    // bay count: each bay contributes ROW_BAY_UNIT px of length, scaled by
    // the author's scale factors.
    const sx = toNumber(row.scale_x, 1);
    const sy = toNumber(row.scale_y, 1);
    const bayCount = Math.max(1, toNumber(row.bay_count, 1));
    if (row.orientation === "vertical") {
      return {
        x: toNumber(row.x, 0),
        y: toNumber(row.y, 0),
        width: Math.max(DERIVED.ROW_MIN_DEPTH, DERIVED.ROW_DEPTH_VERTICAL * sx),
        height: Math.max(DERIVED.ROW_MIN_LENGTH, bayCount * DERIVED.ROW_BAY_UNIT * sy),
        rotation: rotationOf(row)
      };
    }
    return {
      x: toNumber(row.x, 0),
      y: toNumber(row.y, 0),
      width: Math.max(DERIVED.ROW_MIN_LENGTH, bayCount * DERIVED.ROW_BAY_UNIT * sx),
      height: Math.max(DERIVED.ROW_MIN_DEPTH, DERIVED.ROW_DEPTH * sy),
      rotation: rotationOf(row)
    };
  }

  function zoneRect(zone) {
    const explicit = explicitRect(zone, ENTITY_DEFAULTS.zone);
    if (explicit) {
      return explicit;
    }
    const sx = toNumber(zone.scale_x, 1);
    const sy = toNumber(zone.scale_y, 1);
    const slots = Math.max(1, toNumber(zone.slot_count, 1));
    const cols = Math.max(1, toNumber(zone.columns, 4));
    if (zone.layout === "grid") {
      const rows = Math.ceil(slots / cols);
      return {
        x: toNumber(zone.x, 0),
        y: toNumber(zone.y, 0),
        width: Math.max(140, cols * DERIVED.ZONE_GRID_UNIT * sx + DERIVED.ZONE_PADDING),
        height: Math.max(90, rows * DERIVED.ZONE_GRID_UNIT * sy + DERIVED.ZONE_PADDING),
        rotation: rotationOf(zone)
      };
    }
    return {
      x: toNumber(zone.x, 0),
      y: toNumber(zone.y, 0),
      width: Math.max(140, slots * DERIVED.ZONE_SLOT_UNIT * sx + 30),
      height: Math.max(72, 54 * sy),
      rotation: rotationOf(zone)
    };
  }

  function simpleRect(entity, defaults) {
    return {
      x: toNumber(entity.x, 100),
      y: toNumber(entity.y, 100),
      width: Math.max(defaults.minWidth, toNumber(entity.width, defaults.defaultWidth)),
      height: Math.max(defaults.minHeight, toNumber(entity.height, defaults.defaultHeight)),
      rotation: rotationOf(entity)
    };
  }

  /**
   * The one coordinate pipeline for all overview entities.
   * type: "row" | "zone" | "null_space" | "movable_item" | "slotted_pallet" | "area_box"
   * Returns {x, y, width, height, rotation} in world coordinates.
   */
  function entityRect(type, entity) {
    if (!entity) {
      return { x: 0, y: 0, width: 1, height: 1, rotation: 0 };
    }
    switch (type) {
      case "row":
        return rowRect(entity);
      case "zone":
        return zoneRect(entity);
      case "null_space":
        return simpleRect(entity, ENTITY_DEFAULTS.null_space);
      case "movable_item":
        return simpleRect(entity, ENTITY_DEFAULTS.movable_item);
      case "slotted_pallet":
        return simpleRect(entity, ENTITY_DEFAULTS.slotted_pallet);
      case "area_box":
        return simpleRect(entity, ENTITY_DEFAULTS.area_box);
      default:
        return simpleRect(entity, ENTITY_DEFAULTS.movable_item);
    }
  }

  /**
   * Axis-aligned bounding box of a rotated rect. For rotation 0 this is the
   * rect itself; otherwise the AABB of its four rotated corners, so
   * fit-to-view always contains the full drawn shape.
   */
  function rectAabb(rect) {
    const rotation = toNumber(rect.rotation, 0);
    if (!rotation) {
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    }
    const rad = (rotation * Math.PI) / 180;
    const cos = Math.abs(Math.cos(rad));
    const sin = Math.abs(Math.sin(rad));
    // Rotating about the center keeps the center fixed; the AABB grows to
    // |w·cos| + |h·sin| wide and |w·sin| + |h·cos| tall.
    const width = rect.width * cos + rect.height * sin;
    const height = rect.width * sin + rect.height * cos;
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;
    return { x: cx - width / 2, y: cy - height / 2, width, height };
  }

  /** Union AABB of many rects. Returns null for an empty list. */
  function boundsOf(rects) {
    if (!Array.isArray(rects) || !rects.length) {
      return null;
    }
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    rects.forEach((rect) => {
      const aabb = rectAabb(rect);
      minX = Math.min(minX, aabb.x);
      minY = Math.min(minY, aabb.y);
      maxX = Math.max(maxX, aabb.x + aabb.width);
      maxY = Math.max(maxY, aabb.y + aabb.height);
    });
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
  }

  /* ------------------------------------------------------------------ *
   * 2. Viewport transforms
   *
   * A transform is {zoom, panX, panY}. Screen = world * zoom + pan.
   * The canvas element gets: translate(panX, panY) scale(zoom) with
   * transform-origin top-left, which is exactly this mapping.
   * ------------------------------------------------------------------ */

  function worldToScreen(point, transform) {
    return {
      x: point.x * transform.zoom + transform.panX,
      y: point.y * transform.zoom + transform.panY
    };
  }

  function screenToWorld(point, transform) {
    return {
      x: (point.x - transform.panX) / transform.zoom,
      y: (point.y - transform.panY) / transform.zoom
    };
  }

  /**
   * Compute the transform that fits `rect` (world coords) inside a
   * viewport, centered, with `margin` px of breathing room, honoring the
   * zoom limits. Deterministic replacement for fitOverviewRect/fitOverview.
   */
  function fitTransform(rect, viewport, options) {
    const opts = options || {};
    const margin = toNumber(opts.margin, 24);
    const minZoom = toNumber(opts.minZoom, 0.05);
    const maxZoom = toNumber(opts.maxZoom, 10);
    if (!rect || rect.width <= 0 || rect.height <= 0 || !viewport) {
      return null;
    }
    const vw = Math.max(1, toNumber(viewport.width, 1));
    const vh = Math.max(1, toNumber(viewport.height, 1));
    const zx = (vw - margin * 2) / rect.width;
    const zy = (vh - margin * 2) / rect.height;
    const zoom = clamp(Math.min(zx, zy), minZoom, maxZoom);
    // Center the rect: place its scaled center at the viewport center.
    return {
      zoom,
      panX: (vw - rect.width * zoom) / 2 - rect.x * zoom,
      panY: (vh - rect.height * zoom) / 2 - rect.y * zoom
    };
  }

  /**
   * Zoom about a fixed screen point (mouse cursor or viewport center): the
   * world point under `point` stays under it after the zoom change.
   * Derivation: worldAtPoint = (point - pan) / zoom must be equal before
   * and after, so pan' = point - (point - pan) * zoom' / zoom.
   */
  function zoomAtPoint(transform, point, nextZoom, options) {
    const opts = options || {};
    const minZoom = toNumber(opts.minZoom, 0.05);
    const maxZoom = toNumber(opts.maxZoom, 10);
    const zoom = clamp(nextZoom, minZoom, maxZoom);
    if (zoom === transform.zoom) {
      return { zoom: transform.zoom, panX: transform.panX, panY: transform.panY };
    }
    return {
      zoom,
      panX: point.x - ((point.x - transform.panX) * zoom) / transform.zoom,
      panY: point.y - ((point.y - transform.panY) * zoom) / transform.zoom
    };
  }

  /**
   * Keep the canvas from being panned fully out of sight. Only clamps when
   * the canvas overflows the viewport on that axis (when it fits entirely,
   * any position within the margins is allowed).
   */
  function clampPanWithin(transform, canvas, viewport, options) {
    const margin = toNumber(options && options.margin, 60);
    const result = { zoom: transform.zoom, panX: transform.panX, panY: transform.panY };
    const cw = Math.max(1, toNumber(canvas.width, 1)) * transform.zoom;
    const ch = Math.max(1, toNumber(canvas.height, 1)) * transform.zoom;
    const vw = Math.max(1, toNumber(viewport.width, 1));
    const vh = Math.max(1, toNumber(viewport.height, 1));
    const maxPanX = margin;
    const minPanX = vw - cw - margin;
    const maxPanY = margin;
    const minPanY = vh - ch - margin;
    if (maxPanX > minPanX) {
      result.panX = clamp(result.panX, minPanX, maxPanX);
    }
    if (maxPanY > minPanY) {
      result.panY = clamp(result.panY, minPanY, maxPanY);
    }
    return result;
  }

  /** Reset pan to the home position without changing zoom. */
  function resetPanTransform(transform, options) {
    const margin = toNumber(options && options.margin, 20);
    return { zoom: transform.zoom, panX: margin, panY: margin };
  }

  /* ------------------------------------------------------------------ *
   * 3. Rack front view (elevation)
   *
   * The front view is a CSS grid. Columns: level-label gutter, left
   * upright, one column per bay (with optional support-post columns
   * between bay groups), right upright. Rows: one per level, top level
   * first. All pixel constants live here so the grid template, headers,
   * and slot geometry can never drift apart.
   * ------------------------------------------------------------------ */

  const RACK_VIEW = {
    LEVEL_LABEL_COL: "54px",   // left gutter showing L1/L2/...
    POST_COL: "14px",          // upright / support post column width
    BAY_COL: "minmax(126px, 1fr)", // each bay column
    BODY_HEIGHT_PX: 420,       // total pixel height budget for all levels
    LEVEL_MIN_PX: 40,          // a level never collapses below this
    SLOT_MIN_PX: 28            // an override slot never collapses below this
  };

  /**
   * Which bays have a support post immediately after them. Explicit
   * support_after_bays wins; otherwise every Nth bay (support_every_bays).
   * The last bay never carries an inner support (the right upright is
   * rendered separately).
   */
  function supportSet(row, bays) {
    const supports = new Set();
    if (!row || !Array.isArray(bays) || bays.length <= 1) {
      return supports;
    }
    const lastBay = bays[bays.length - 1];
    const explicit = Array.isArray(row.support_after_bays)
      ? row.support_after_bays.map((v) => Number(v))
      : [];
    if (explicit.length) {
      explicit.forEach((bay) => {
        if (Number.isFinite(bay) && bay !== lastBay && bays.includes(bay)) {
          supports.add(bay);
        }
      });
      return supports;
    }
    const every = Math.max(1, toNumber(row && row.support_every_bays, 2));
    bays.forEach((bay, idx) => {
      if (bay === lastBay) {
        return;
      }
      if ((idx + 1) % every === 0) {
        supports.add(bay);
      }
    });
    return supports;
  }

  /** Bays grouped into segments delimited by support posts. */
  function levelSegments(bays, supports) {
    const segments = [];
    let current = [];
    bays.forEach((bay) => {
      current.push(bay);
      if (supports.has(bay) || bay === bays[bays.length - 1]) {
        segments.push(current);
        current = [];
      }
    });
    return segments;
  }

  /**
   * Post visibility per level: a post is drawn only if a bay adjacent to it
   * actually has a configured cell at that level (levelBays). Prevents
   * floating posts above short bays.
   */
  function postVisibility(bays, supports, levelBays) {
    const segments = levelSegments(bays, supports);
    const segmentActive = segments.map((segment) => segment.some((bay) => levelBays.has(bay)));
    const visibility = {
      left: !!segmentActive[0],
      right: !!segmentActive[segmentActive.length - 1],
      supports: new Map()
    };
    let segmentIndex = 0;
    bays.forEach((bay) => {
      if (!supports.has(bay)) {
        return;
      }
      visibility.supports.set(bay, !!segmentActive[segmentIndex] || !!segmentActive[segmentIndex + 1]);
      segmentIndex += 1;
    });
    return visibility;
  }

  /** CSS grid-template-columns string shared by header and level rows. */
  function trackTemplate(bays, supports) {
    const parts = [RACK_VIEW.LEVEL_LABEL_COL, RACK_VIEW.POST_COL];
    bays.forEach((bay) => {
      parts.push(RACK_VIEW.BAY_COL);
      if (supports.has(bay)) {
        parts.push(RACK_VIEW.POST_COL);
      }
    });
    parts.push(RACK_VIEW.POST_COL);
    return parts.join(" ");
  }

  /** Shared beam positions, sanitized: within (0, rackHeight), ascending. */
  function normalizedBeams(row) {
    const rackHeight = toNumber(row && row.rack_height, 144) || 144;
    const raw = Array.isArray(row && row.beam_positions) ? row.beam_positions : [];
    const beams = raw
      .map((v) => Number(v))
      .filter((v) => Number.isFinite(v) && v > 0 && v < rackHeight)
      .sort((a, b) => a - b);
    return { rackHeight, beams, hasBeamData: beams.length > 0 };
  }

  /** Effective beam positions for one bay: shared positions + overrides. */
  function bayBeamPositions(row, bay) {
    const { beams, hasBeamData } = normalizedBeams(row);
    if (!hasBeamData) {
      return [];
    }
    const overrides =
      row.beam_position_overrides && typeof row.beam_position_overrides === "object"
        ? row.beam_position_overrides[String(bay)] || {}
        : {};
    return beams.map((shared, idx) => {
      const override = Number(overrides[String(idx)]);
      return Number.isFinite(override) ? override : shared;
    });
  }

  function bayHasOverrideAt(row, bay, beamIdx) {
    const overrides =
      row && row.beam_position_overrides && typeof row.beam_position_overrides === "object"
        ? row.beam_position_overrides[String(bay)] || {}
        : {};
    return Number.isFinite(Number(overrides[String(beamIdx)]));
  }

  /**
   * Full front-view layout for a rack. Pure data out — the renderer only
   * turns this into DOM. Levels are listed top-first (as drawn).
   *
   * Level heights: without beam data every level gets an equal share of
   * BODY_HEIGHT_PX. With beam data a level's share is proportional to its
   * real-world span in inches (beam-to-beam distance), floored at
   * LEVEL_MIN_PX. Per-bay overrides shift an individual bay's shelf within
   * its level row: the cell keeps the row's pixel-per-inch scale, offset
   * from the top of the row by the distance between the row's shared upper
   * boundary and the bay's overridden upper boundary.
   */
  function rackFrontLayout(row, bays, maxLevels) {
    const safeBays = Array.isArray(bays) ? bays : [];
    const levels = Math.max(1, toNumber(maxLevels, 1));
    const supports = supportSet(row, safeBays);
    const { rackHeight, beams, hasBeamData } = normalizedBeams(row);
    // Level boundaries in inches from the floor: [0, beam1, ..., rackHeight]
    const boundaries = hasBeamData ? [0, ...beams, rackHeight] : null;

    function levelHeightPx(level) {
      if (!hasBeamData) {
        if (level < 1 || level > levels) {
          return null;
        }
        return Math.max(RACK_VIEW.LEVEL_MIN_PX, Math.round(RACK_VIEW.BODY_HEIGHT_PX / levels));
      }
      if (level < 1 || level > boundaries.length - 1) {
        return null;
      }
      const fraction = (boundaries[level] - boundaries[level - 1]) / rackHeight;
      return Math.max(RACK_VIEW.LEVEL_MIN_PX, Math.round(fraction * RACK_VIEW.BODY_HEIGHT_PX));
    }

    const levelRows = [];
    for (let level = levels; level >= 1; level -= 1) {
      const rowHeightPx = levelHeightPx(level);
      const sharedLower = boundaries && level >= 1 && level < boundaries.length ? boundaries[level - 1] : null;
      const sharedUpper = boundaries && level >= 1 && level < boundaries.length ? boundaries[level] : null;
      const spanInches = sharedUpper !== null && sharedLower !== null ? sharedUpper - sharedLower : null;
      // Pixel-per-inch scale for this level row; used both for slot
      // geometry and for beam-handle drag math so they always agree.
      const pxPerInch = spanInches && spanInches > 0 && rowHeightPx ? rowHeightPx / spanInches : null;

      const cells = {};
      safeBays.forEach((bay) => {
        const lowerOverridden = level > 1 && bayHasOverrideAt(row, bay, level - 2);
        const upperOverridden = level < levels && bayHasOverrideAt(row, bay, level - 1);
        let topPx = 0;
        let heightPx = rowHeightPx;
        let inches = spanInches;
        if (hasBeamData && pxPerInch) {
          const positions = bayBeamPositions(row, bay);
          const bayBoundaries = [0, ...positions, rackHeight];
          if (level >= 1 && level < bayBoundaries.length) {
            const lower = bayBoundaries[level - 1];
            const upper = bayBoundaries[level];
            inches = upper - lower;
            // Offset from the row top: the row spans [sharedLower, sharedUpper]
            // top-down, so a bay whose shelf sits lower than the shared beam
            // starts (sharedUpper - upper) inches below the row top.
            topPx = Math.round((sharedUpper - upper) * pxPerInch);
            heightPx = Math.max(RACK_VIEW.SLOT_MIN_PX, Math.round(inches * pxPerInch));
          }
        }
        cells[bay] = {
          bay,
          level,
          topPx,
          heightPx,
          inches: inches === null ? null : Math.round(inches * 100) / 100,
          lowerOverridden,
          upperOverridden,
          hasOverride: lowerOverridden || upperOverridden
        };
      });

      levelRows.push({
        level,
        rowHeightPx,
        spanInches: spanInches === null ? null : Math.round(spanInches * 100) / 100,
        pxPerInch: pxPerInch === null ? null : Math.round(pxPerInch * 10000) / 10000,
        cells
      });
    }

    return {
      rackHeight,
      hasBeamData,
      beamPositions: beams,
      supports: Array.from(supports),
      trackTemplate: trackTemplate(safeBays, supports),
      bays: safeBays.slice(),
      maxLevels: levels,
      levels: levelRows
    };
  }

  return {
    // entity rects
    ENTITY_DEFAULTS,
    DERIVED,
    entityRect,
    rectAabb,
    boundsOf,
    // transforms
    worldToScreen,
    screenToWorld,
    fitTransform,
    zoomAtPoint,
    clampPanWithin,
    resetPanTransform,
    // rack front view
    RACK_VIEW,
    supportSet,
    levelSegments,
    postVisibility,
    trackTemplate,
    normalizedBeams,
    bayBeamPositions,
    bayHasOverrideAt,
    rackFrontLayout
  };
});
