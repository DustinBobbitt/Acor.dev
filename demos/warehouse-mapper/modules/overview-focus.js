(() => {
  const modules = (window.WarehouseModules = window.WarehouseModules || {});

  const OVERVIEW_CANVAS_PADDING = 40;

  function overviewAreaOverviewMap(state) {
    const raw = state.layout?.area_overview;
    return raw && typeof raw === "object" ? raw : {};
  }

  function overviewAreaNames(state) {
    const authoredAreas = (state.areas || []).map((name) => String(name || "").trim()).filter(Boolean);
    if (authoredAreas.length) {
      return authoredAreas;
    }
    const names = new Set(
      Object.keys(overviewAreaOverviewMap(state)).map((name) => String(name || "").trim()).filter(Boolean)
    );
    return Array.from(names);
  }

  function createOverviewFocusHelpers(deps) {
    const {
      state,
      geometry,
      rowRect,
      zoneRect,
      nullSpaceRect,
      slottedPalletRect,
      movableItemRect
    } = deps;

    function overviewAreaBoxes() {
      const areaOverviewMap = overviewAreaOverviewMap(state);
      const visibleArea = String(state.overview.focusedArea || "").trim() || (state.area === "All Areas" ? "" : state.area);
      const areaNames = overviewAreaNames(state).filter((name) => !visibleArea || name === visibleArea);
      const padding = 18;
      return areaNames.map((areaName, index) => {
        const entry = areaOverviewMap[areaName] || {};
        const rects = [];
        state.racks.filter((row) => String(row.area || "").trim() === areaName).forEach((row) => rects.push(rowRect(row)));
        state.zones.filter((zone) => String(zone.area || "").trim() === areaName).forEach((zone) => rects.push(zoneRect(zone)));
        if (rects.length) {
          const minX = Math.min(...rects.map((rect) => rect.x));
          const minY = Math.min(...rects.map((rect) => rect.y));
          const maxX = Math.max(...rects.map((rect) => rect.x + rect.width));
          const maxY = Math.max(...rects.map((rect) => rect.y + rect.height));
          return {
            name: areaName,
            x: Number.isFinite(Number(entry.x)) ? Number(entry.x) : (minX - padding),
            y: Number.isFinite(Number(entry.y)) ? Number(entry.y) : (minY - padding - 22),
            width: Math.max(120, Number(entry.width || (maxX - minX + padding * 2))),
            height: Math.max(100, Number(entry.height || (maxY - minY + padding * 2 + 22)))
          };
        }
        return {
          name: areaName,
          x: Number.isFinite(Number(entry.x)) ? Number(entry.x) : (40 + (index % 3) * 360),
          y: Number.isFinite(Number(entry.y)) ? Number(entry.y) : (40 + Math.floor(index / 3) * 260),
          width: Math.max(120, Number(entry.width || 260)),
          height: Math.max(100, Number(entry.height || 180))
        };
      });
    }

    function overviewAreaBoxByName(areaName) {
      return overviewAreaBoxes().find((box) => box.name === areaName) || null;
    }

    function overviewBounds() {
      const rects = [];
      if (!state.overview.focusedArea) {
        overviewAreaBoxes().forEach((box) => {
          rects.push({ x: box.x, y: box.y, width: box.width, height: box.height });
        });
      }
      if (state.overview.focusedArea) {
        state.racks
          .filter((row) => String(row.area || "").trim() === state.overview.focusedArea)
          .forEach((row) => rects.push(rowRect(row)));
        state.zones
          .filter((zone) => String(zone.area || "").trim() === state.overview.focusedArea)
          .forEach((zone) => rects.push(zoneRect(zone)));
        state.nullSpaces
          .filter((space) => String(space.area || "").trim() === state.overview.focusedArea)
          .forEach((space) => rects.push(nullSpaceRect(space)));
        state.slottedPallets
          .filter((pallet) => String(pallet.area || "").trim() === state.overview.focusedArea)
          .forEach((pallet) => rects.push(slottedPalletRect(pallet)));
        state.movableItems
          .filter((item) => String(item.area || "").trim() === state.overview.focusedArea)
          .forEach((item) => rects.push(movableItemRect(item)));
      }
      return geometry.boundsOf(rects);
    }

    function overviewCanvasSize() {
      const bounds = overviewBounds();
      const padding = OVERVIEW_CANVAS_PADDING;
      if (bounds && bounds.width > 0 && bounds.height > 0) {
        return {
          width: Math.max(Math.ceil(bounds.maxX + padding), Math.ceil(bounds.minX + bounds.width + padding)),
          height: Math.max(Math.ceil(bounds.maxY + padding), Math.ceil(bounds.minY + bounds.height + padding))
        };
      }
      return {
        width: Math.max(Number(state.layout?.width || 1200), 600),
        height: Math.max(Number(state.layout?.height || 800), 500)
      };
    }

    return {
      OVERVIEW_CANVAS_PADDING,
      overviewAreaBoxByName,
      overviewAreaBoxes,
      overviewAreaNames,
      overviewBounds,
      overviewCanvasSize
    };
  }

  modules.overviewFocus = {
    OVERVIEW_CANVAS_PADDING,
    createOverviewFocusHelpers,
    overviewAreaNames,
    overviewAreaOverviewMap
  };
})();
