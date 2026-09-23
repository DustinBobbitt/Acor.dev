(() => {
  const modules = (window.WarehouseModules = window.WarehouseModules || {});
  // Geometry is the single source of truth for coordinate math; renderers
  // only turn geometry output into DOM. Loaded before this file.
  const geometry = modules.geometry;

  function bindOverviewInteraction(ctx) {
    const { state, viewport, canvas, applyOverviewTransform, minZoom, maxZoom } = ctx;
    function clampPan() {
      const clamped = geometry.clampPanWithin(
        state.overview,
        { width: parseFloat(canvas.style.width) || 1200, height: parseFloat(canvas.style.height) || 800 },
        { width: viewport.clientWidth || 600, height: viewport.clientHeight || 400 },
        { margin: 60 }
      );
      state.overview.panX = clamped.panX;
      state.overview.panY = clamped.panY;
    }
    viewport.onmousedown = (event) => {
      if (event.button !== 0) {
        return;
      }
      if (event.target.closest(".overview-entity,.overview-area-box")) {
        return;
      }
      state.overview.dragging = true;
      state.overview.dragStartX = event.clientX;
      state.overview.dragStartY = event.clientY;
      state.overview.dragPanX = state.overview.panX;
      state.overview.dragPanY = state.overview.panY;
      viewport.classList.add("dragging");
    };
    viewport.onmousemove = (event) => {
      if (!state.overview.dragging) {
        return;
      }
      const dx = event.clientX - state.overview.dragStartX;
      const dy = event.clientY - state.overview.dragStartY;
      state.overview.panX = state.overview.dragPanX + dx;
      state.overview.panY = state.overview.dragPanY + dy;
      clampPan();
      applyOverviewTransform(canvas);
    };
    viewport.onmouseup = () => {
      state.overview.dragging = false;
      viewport.classList.remove("dragging");
    };
    viewport.onmouseleave = () => {
      state.overview.dragging = false;
      viewport.classList.remove("dragging");
    };
    viewport.onwheel = (event) => {
      event.preventDefault();
      const rect = viewport.getBoundingClientRect();
      // Zoom about the cursor: the world point under the mouse stays put.
      const next = geometry.zoomAtPoint(
        state.overview,
        { x: event.clientX - rect.left, y: event.clientY - rect.top },
        state.overview.zoom * (event.deltaY < 0 ? 1.1 : 0.9),
        { minZoom, maxZoom }
      );
      if (next.zoom === state.overview.zoom) {
        return;
      }
      state.overview.zoom = next.zoom;
      state.overview.panX = next.panX;
      state.overview.panY = next.panY;
      clampPan();
      applyOverviewTransform(canvas);
    };
  }

  function renderOverview(ctx) {
    const {
      state, el, inAuditWorkspace, overviewAreaBoxes, loadAreasAndRacks, loadRackModel, loadZoneModel,
      renderGrid, fitOverviewRect, overviewAreaBoxByName, setStatus, rowRect, applyHeatClass,
      entityHeatBucket, applyAuditClass, auditAggregateStatus, isSearchModeActive, rackSearchHitSet,
      zoneRect, slottedPalletRect, escapeHtml, selectCell, syncControlVisibility, movableItemRect, nullSpaceRect,
      configMovableItemKind, movableItemKey, configToolSpec, applyOverviewTransform, overviewBounds,
      updateOverviewSummary, OVERVIEW_MIN_ZOOM, OVERVIEW_MAX_ZOOM, startOverviewMovableDrag, isAdmin,
      persistUserLastArea
    } = ctx;

    function nullSpaceStyle(space, miniature = false) {
      const fill = String(space.color || "#e5e7eb").trim() || "#e5e7eb";
      const stripe = String(space.stripe || "none").trim() || "none";
      const density = Math.max(4, Number(space.stripe_density || 12));
      const stripeSpacing = miniature ? Math.max(6, Math.min(16, density * 0.65)) : density;
      const stripeColor = miniature ? "rgba(107, 114, 128, 0.35)" : "rgba(107, 114, 128, 0.55)";
      let backgroundImage = "none";
      if (stripe === "horizontal") {
        backgroundImage = `repeating-linear-gradient(180deg, transparent 0, transparent ${Math.max(1, stripeSpacing - 2)}px, ${stripeColor} ${Math.max(1, stripeSpacing - 2)}px, ${stripeColor} ${stripeSpacing}px)`;
      } else if (stripe === "vertical") {
        backgroundImage = `repeating-linear-gradient(90deg, transparent 0, transparent ${Math.max(1, stripeSpacing - 2)}px, ${stripeColor} ${Math.max(1, stripeSpacing - 2)}px, ${stripeColor} ${stripeSpacing}px)`;
      } else if (stripe === "diagonal") {
        backgroundImage = `repeating-linear-gradient(135deg, transparent 0, transparent ${Math.max(1, stripeSpacing - 2)}px, ${stripeColor} ${Math.max(1, stripeSpacing - 2)}px, ${stripeColor} ${stripeSpacing}px)`;
      }
      return { fill, backgroundImage, shape: String(space.shape || "rectangle").trim() || "rectangle" };
    }

    function applyNullSpaceVisual(node, space, miniature = false) {
      const style = nullSpaceStyle(space, miniature);
      node.style.backgroundColor = style.fill;
      node.style.backgroundImage = style.backgroundImage;
      node.style.backgroundRepeat = "repeat";
      node.style.overflow = "hidden";
      node.style.borderRadius = style.shape === "oval" ? "999px" : miniature ? "2px" : "8px";
      node.style.clipPath = "none";
      if (style.shape === "diamond") {
        node.style.clipPath = "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)";
      } else if (style.shape === "triangle") {
        node.style.clipPath = "polygon(50% 0%, 100% 100%, 0% 100%)";
      }
    }

    function renderMiniPreview(areaNode, box) {
      const fixedRects = [];
      state.racks
        .filter((row) => String(row.area || "").trim() === box.name)
        .forEach((row) => fixedRects.push({ rect: rowRect(row), kind: "row" }));
      state.zones
        .filter((zone) => String(zone.area || "").trim() === box.name)
        .forEach((zone) => fixedRects.push({ rect: zoneRect(zone), kind: "zone" }));
      (state.nullSpaces || [])
        .filter((space) => String(space.area || "").trim() === box.name)
        .forEach((space) => fixedRects.push({
          rect: nullSpaceRect(space),
          kind: `null-space kind-${String(space.kind || "obstruction").trim().toLowerCase() || "obstruction"}`,
          space
        }));

      const preview = document.createElement("div");
      preview.className = "overview-area-preview";
      areaNode.appendChild(preview);

      if (!fixedRects.length) {
        const empty = document.createElement("div");
        empty.className = "overview-area-preview-empty";
        empty.textContent = "No items";
        preview.appendChild(empty);
        return;
      }

      let minX = Number.POSITIVE_INFINITY;
      let minY = Number.POSITIVE_INFINITY;
      let maxX = Number.NEGATIVE_INFINITY;
      let maxY = Number.NEGATIVE_INFINITY;
      fixedRects.forEach(({ rect }) => {
        minX = Math.min(minX, rect.x);
        minY = Math.min(minY, rect.y);
        maxX = Math.max(maxX, rect.x + rect.width);
        maxY = Math.max(maxY, rect.y + rect.height);
      });
      const boundsWidth = Math.max(1, maxX - minX);
      const boundsHeight = Math.max(1, maxY - minY);
      const previewWidth = Math.max(1, box.width - 24);
      const previewHeight = Math.max(1, box.height - 42);
      const scale = Math.min(previewWidth / boundsWidth, previewHeight / boundsHeight);
      const scaledWidth = boundsWidth * scale;
      const scaledHeight = boundsHeight * scale;
      const offsetX = (previewWidth - scaledWidth) / 2;
      const offsetY = (previewHeight - scaledHeight) / 2;

      fixedRects.forEach(({ rect, kind, space }) => {
        const node = document.createElement("div");
        node.className = `overview-area-preview-entity ${kind}`;
        node.style.left = `${offsetX + (rect.x - minX) * scale}px`;
        node.style.top = `${offsetY + (rect.y - minY) * scale}px`;
        node.style.width = `${Math.max(6, rect.width * scale)}px`;
        node.style.height = `${Math.max(4, rect.height * scale)}px`;
        if (space) {
          applyNullSpaceVisual(node, space, true);
        }
        preview.appendChild(node);
      });
    }

    el.gridWrap.innerHTML = "";
    const auditWorkspace = inAuditWorkspace();
    el.viewTitle.textContent = auditWorkspace ? `Audit Overview - ${state.area}` : `Overview - ${state.area}`;
    const viewport = document.createElement("div");
    viewport.className = "overview-viewport";
    const canvas = document.createElement("div");
    canvas.className = "overview-canvas";
    const canvasSize = typeof ctx.overviewCanvasSize === "function"
      ? ctx.overviewCanvasSize()
      : {
        width: Math.max(Number(state.layout?.width || 1200), 600),
        height: Math.max(Number(state.layout?.height || 800), 500)
      };
    canvas.style.width = `${canvasSize.width}px`;
    canvas.style.height = `${canvasSize.height}px`;

    const areaBoxes = overviewAreaBoxes();
    if (state.overview.selectedArea && !areaBoxes.some((box) => box.name === state.overview.selectedArea)) {
      state.overview.selectedArea = "";
    }
    if (state.overview.focusedArea && !areaBoxes.some((box) => box.name === state.overview.focusedArea)) {
      state.overview.focusedArea = "";
    }

    const showingAreaContents = Boolean(String(state.overview.focusedArea || "").trim());
    if (showingAreaContents) {
      canvas.classList.add("area-floor");
      const floorLabel = document.createElement("div");
      floorLabel.className = "overview-floor-label";
      floorLabel.textContent = state.overview.focusedArea || state.area;
      canvas.appendChild(floorLabel);
    }

    if (!showingAreaContents) {
      areaBoxes.forEach((box) => {
        const areaNode = document.createElement("div");
        areaNode.className = "overview-area-box";
        areaNode.title = `Open ${box.name}`;
        if (state.overview.selectedArea === box.name) {
          areaNode.classList.add("selected");
        }
        areaNode.dataset.areaName = box.name;
        areaNode.style.left = `${box.x}px`;
        areaNode.style.top = `${box.y}px`;
        areaNode.style.width = `${box.width}px`;
        areaNode.style.height = `${box.height}px`;
        const label = document.createElement("div");
        label.className = "overview-area-label";
        label.textContent = box.name;
        areaNode.appendChild(label);
        renderMiniPreview(areaNode, box);
        areaNode.addEventListener("click", async (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (state.overview.areaTransfer && state.overview.areaTransfer.active && state.overview.areaTransfer.phase === "pick_area") {
            const sourceArea = state.overview.areaTransfer.sourceArea;
            if (box.name === sourceArea) {
              setStatus(`That is the source area. Pick a different area, or press Escape to cancel.`);
              return;
            }
            try {
              await ctx.enterTransferPlacingPhase(box.name);
            } catch (error) {
              setStatus(`Transfer failed: ${error.message}`);
            }
            return;
          }
          state.area = box.name;
          el.areaSelect.value = box.name;
          state.overview.selectedArea = box.name;
          state.overview.focusedArea = box.name;
          if (typeof persistUserLastArea === "function") {
            persistUserLastArea(box.name);
          }
          state.management.filters.area = state.area;
          try {
            await loadAreasAndRacks();
            await loadRackModel();
            await loadZoneModel();
            renderGrid();
            requestAnimationFrame(() => {
              const bounds = overviewBounds();
              if (bounds) {
                fitOverviewRect({ x: bounds.minX, y: bounds.minY, width: bounds.width, height: bounds.height });
              } else {
                const focusedBox = overviewAreaBoxByName(box.name) || box;
                fitOverviewRect(focusedBox);
              }
            });
            setStatus(`Focused area ${box.name}. The area filter and aisle dropdowns are now scoped to it, and you can return to overview from the toolbar.`);
          } catch (error) {
            setStatus(`Area focus failed: ${error.message}`);
          }
        });
        canvas.appendChild(areaNode);
      });
    }

    if (showingAreaContents) {
      state.racks.filter((row) => String(row.area || "").trim() === state.overview.focusedArea).forEach((row) => {
      const rect = rowRect(row);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "overview-entity row";
      applyHeatClass(btn, entityHeatBucket("row", row));
      applyAuditClass(btn, auditAggregateStatus("row", row));
      if (isSearchModeActive() && rackSearchHitSet(row.name).size > 0) {
        btn.classList.add("search-hit");
      }
      btn.style.left = `${rect.x}px`;
      btn.style.top = `${rect.y}px`;
      btn.style.width = `${rect.width}px`;
      btn.style.height = `${rect.height}px`;
      const c = row.counts || {};
      btn.innerHTML = `<div class="overview-title">${row.name}</div><div class="overview-meta">Rack | ${row.area || "No area"}</div><div class="overview-badges"><span class="badge">Occ ${c.occupied || 0}</span><span class="badge">Emp ${c.empty || 0}</span><span class="badge">Mix ${c.mixed || 0}</span></div>`;
      btn.addEventListener("click", async () => {
        if (auditWorkspace) {
          state.audit.subview = "rack";
        } else {
          state.viewMode = "rack";
          el.viewMode.value = "rack";
        }
        state.selectedRack = row.name;
        el.rackSelect.value = row.name;
        await loadRackModel();
        selectCell(null);
        syncControlVisibility();
        renderGrid();
        setStatus(auditWorkspace ? `Opened rack ${row.name} in Audit Tool.` : `Opened rack ${row.name} from overview.`);
      });
      canvas.appendChild(btn);
      });

      state.zones.filter((zone) => String(zone.area || "").trim() === state.overview.focusedArea).forEach((zone) => {
      const rect = zoneRect(zone);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "overview-entity zone";
      applyHeatClass(btn, entityHeatBucket("zone", zone));
      applyAuditClass(btn, auditAggregateStatus("zone", zone));
      btn.style.left = `${rect.x}px`;
      btn.style.top = `${rect.y}px`;
      btn.style.width = `${rect.width}px`;
      btn.style.height = `${rect.height}px`;
      const c = zone.counts || {};
      btn.innerHTML = `<div class="overview-title">${zone.zone_id}</div><div class="overview-meta">Floor | ${zone.area || "No area"}</div><div class="overview-badges"><span class="badge">Occ ${c.occupied || 0}</span><span class="badge">Emp ${c.empty || 0}</span></div>`;
      btn.addEventListener("click", async () => {
        if (!auditWorkspace && !isAdmin) {
          setStatus("Floor zone details are managed from the visual overview.");
          return;
        }
        if (auditWorkspace) {
          state.audit.subview = "floor";
        } else {
          state.viewMode = "floor";
          el.viewMode.value = "floor";
        }
        state.selectedZone = zone.zone_id;
        el.zoneSelect.value = zone.zone_id;
        await loadZoneModel();
        selectCell(null);
        syncControlVisibility();
        renderGrid();
        setStatus(auditWorkspace ? `Opened floor zone ${zone.zone_id} in Audit Tool.` : `Opened floor zone ${zone.zone_id} from overview.`);
      });
      canvas.appendChild(btn);
      });

      (state.nullSpaces || [])
      .filter((space) => String(space.area || "").trim() === state.overview.focusedArea)
      .forEach((space) => {
        const rect = nullSpaceRect(space);
        const kind = String(space.kind || "obstruction").trim().toLowerCase() || "obstruction";
        // Custom assets (uploaded image + clickable grid) open a front view;
        // plain fixtures stay non-interactive background context.
        const isCustomAsset = kind.startsWith("custom-asset:") && typeof ctx.openCustomAssetViewer === "function";
        const node = document.createElement(isCustomAsset ? "button" : "div");
        if (isCustomAsset) {
          node.type = "button";
        }
        node.className = `overview-entity ${isCustomAsset ? "custom-asset" : "fixed-context"} null-space kind-${kind.replace(/[^a-z0-9_-]/g, "-")}`;
        node.style.left = `${rect.x}px`;
        node.style.top = `${rect.y}px`;
        node.style.width = `${rect.width}px`;
        node.style.height = `${rect.height}px`;
        applyNullSpaceVisual(node, space, false);
        node.innerHTML = `<div class="overview-title">${escapeHtml(space.label || space.space_id || "Obstruction")}</div><div class="overview-meta">${isCustomAsset ? "Custom Asset | click to open" : "Fixed Layout"} | ${escapeHtml(space.area || "No area")}</div>`;
        if (isCustomAsset) {
          node.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            ctx.openCustomAssetViewer(space);
          });
        }
        canvas.appendChild(node);
      });

      state.slottedPallets.filter((pallet) => String(pallet.area || "").trim() === state.overview.focusedArea).forEach((pallet) => {
      const rect = slottedPalletRect(pallet);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "overview-entity slotted-pallet";
      applyHeatClass(btn, entityHeatBucket("slotted", pallet));
      applyAuditClass(btn, auditAggregateStatus("slotted", pallet));
      btn.style.left = `${rect.x}px`;
      btn.style.top = `${rect.y}px`;
      btn.style.width = `${rect.width}px`;
      btn.style.height = `${rect.height}px`;
      const c = pallet.counts || {};
      btn.innerHTML = `<div class="overview-title">${escapeHtml(pallet.label || pallet.group_id)}</div><div class="overview-meta">Slotted Pallet | ${escapeHtml(pallet.area || "No area")}</div><div class="overview-badges"><span class="badge">Occ ${c.occupied || 0}</span><span class="badge">Emp ${c.empty || 0}</span><span class="badge">Mix ${c.mixed || 0}</span></div>`;
      btn.addEventListener("click", async () => {
        if (!auditWorkspace && !isAdmin) {
          setStatus("Use pallet stacks and movable pallets from the overview instead of Slotted Pallet View.");
          return;
        }
        if (auditWorkspace) {
          state.audit.subview = "slotted";
        } else {
          state.viewMode = "slotted";
          el.viewMode.value = "slotted";
        }
        state.selectedSlottedPallet = pallet.group_id;
        el.slottedSelect.value = pallet.group_id;
        await loadSlottedModel();
        selectCell(null);
        syncControlVisibility();
        renderGrid();
        setStatus(auditWorkspace ? `Opened slotted pallet ${pallet.label || pallet.group_id} in Audit Tool.` : `Opened slotted pallet ${pallet.label || pallet.group_id}.`);
      });
      canvas.appendChild(btn);
      });

      state.movableItems.filter((item) => String(item.area || "").trim() === state.overview.focusedArea).forEach((item) => {
      const rect = movableItemRect(item);
      const btn = document.createElement("div");
      const kind = configMovableItemKind(item);
      btn.className = `overview-entity movable-item kind-${kind}`;
      btn.dataset.itemId = item.id;
      btn.setAttribute("role", "button");
      btn.tabIndex = 0;
      applyHeatClass(btn, entityHeatBucket("movable", item));
      applyAuditClass(btn, auditAggregateStatus("movable", item));
      if (state.selectedCellKey === movableItemKey(item.id)) {
        btn.classList.add("selected");
      }
      btn.style.left = `${rect.x}px`;
      btn.style.top = `${rect.y}px`;
      btn.style.width = `${rect.width}px`;
      btn.style.height = `${rect.height}px`;
      const mixedCount = Number(item.mixed_items_count || (Array.isArray(item.mixed_items) ? item.mixed_items.length : 0));
      const qtyBadge = mixedCount > 0 ? `Mix ${mixedCount}` : `Qty ${Number(item.qty || 0)}`;
      if (kind === "pallet_stack") {
        const sizeLabel = item.stack_size || "4x4";
        btn.innerHTML = `<div class="stack-layers"></div><div class="overview-title">${escapeHtml(item.label || item.id)}</div><div class="overview-meta">${escapeHtml(sizeLabel)}</div><button type="button" class="stack-action-trigger" data-item-id="${escapeHtml(item.id)}" title="Stack actions">Actions</button><div class="stack-dispense-handle" data-item-id="${escapeHtml(item.id)}" title="Drag to dispense a pallet">+</div>`;
      } else {
        btn.innerHTML = `<div class="overview-title">${escapeHtml(item.label || item.id)}</div><div class="overview-meta">${escapeHtml(configToolSpec(kind).label)} | ${escapeHtml(item.area || "No area")}</div><div class="overview-badges"><span class="badge">${qtyBadge}</span></div>`;
      }
      btn.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          selectCell(item);
          syncControlVisibility();
          renderGrid();
        }
      });
      canvas.appendChild(btn);
      });

      canvas.addEventListener("mousedown", (event) => {
        if (event.button !== 0) {
          return;
        }
        const actionTrigger = event.target.closest(".stack-action-trigger");
        if (actionTrigger) {
          event.preventDefault();
          event.stopPropagation();
          const stackItemId = String(actionTrigger.dataset.itemId || "").trim();
          const stackItem = state.movableItems.find((entry) => String(entry.id || "").trim() === stackItemId);
          if (stackItem && typeof ctx.openPalletStackMenu === "function") {
            selectCell(stackItem);
            syncControlVisibility();
            ctx.openPalletStackMenu(event, stackItem);
          }
          return;
        }
        // Intercept dispense handle: drag from "+" on pallet stack to spawn a new pallet
        const dispenseHandle = event.target.closest(".stack-dispense-handle");
        if (dispenseHandle) {
          event.preventDefault();
          event.stopPropagation();
          const stackItemId = String(dispenseHandle.dataset.itemId || "").trim();
          const stackItem = state.movableItems.find((entry) => String(entry.id || "").trim() === stackItemId);
          if (stackItem && typeof ctx.dispensePalletFromStack === "function") {
            ctx.dispensePalletFromStack(event, stackItem);
          }
          return;
        }
        const node = event.target.closest(".overview-entity.movable-item");
        if (!node) {
          return;
        }
        const itemId = String(node.dataset.itemId || "").trim();
        const item = state.movableItems.find((entry) => String(entry.id || "").trim() === itemId);
        if (!item) {
          return;
        }
        startOverviewMovableDrag(event, item, node);
      });
      canvas.addEventListener("contextmenu", (event) => {
        const node = event.target.closest(".overview-entity.movable-item");
        if (!node) {
          return;
        }
        const itemId = String(node.dataset.itemId || "").trim();
        const item = state.movableItems.find((entry) => String(entry.id || "").trim() === itemId);
        if (!item || configMovableItemKind(item) !== "pallet_stack" || typeof ctx.openPalletStackMenu !== "function") {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        selectCell(item);
        syncControlVisibility();
        ctx.openPalletStackMenu(event, item);
      });
    }

    viewport.appendChild(canvas);
    el.gridWrap.appendChild(viewport);
    applyOverviewTransform(canvas);
    bindOverviewInteraction({
      state,
      viewport,
      canvas,
      applyOverviewTransform,
      clamp: ctx.clamp,
      minZoom: OVERVIEW_MIN_ZOOM,
      maxZoom: OVERVIEW_MAX_ZOOM
    });
    syncControlVisibility();
    updateOverviewSummary();
  }

  function renderRackGrid(ctx) {
    const {
      state, el, inAuditWorkspace, closeInspector, setStatus, selectCell, renderGrid,
      openInspectorNearSelection, rackLevelPostVisibility, findCell,
      rackCellKey, isSearchModeActive, rackSearchHitSet, applyHeatClass, inventoryAgeInfo,
      applyAuditClass, auditStatusForCell, updateRackSummary, isInspectorVisible,
      isAdmin, apiPost
    } = ctx;

    el.gridWrap.innerHTML = "";
    if (!state.rackModel) {
      el.viewTitle.textContent = "Rack View";
      el.viewSummary.textContent = "No rack locations loaded.";
      const p = document.createElement("p");
      p.className = "empty-state";
      p.textContent = "Select a rack to view bays and levels.";
      el.gridWrap.appendChild(p);
      return;
    }

    const auditWorkspace = inAuditWorkspace();
    el.viewTitle.textContent = auditWorkspace ? `Audit Rack View - ${state.rackModel.row.name}` : `Rack View - ${state.rackModel.row.name}`;
    const rack = document.createElement("div");
    rack.className = "rack-physical";
    if (state.rackBeamEdit) {
      rack.classList.add("beam-edit-mode");
    }
    const handleRackSlotClick = async (slotNode, cellData, bay, level, options = {}) => {
      const isVirtual = !!options.isVirtual;
      if (state.rackPendingAdd) {
        closeInspector();
        if (isVirtual) {
          setStatus("That slot is not configured. Choose a bay with a full location code and Qty 0.");
          return;
        }
        if (!cellData) {
          setStatus("Select an empty bay to add the pallet.");
          return;
        }
        selectCell(cellData);
        renderGrid();
        if (!cellData.is_empty) {
          setStatus("The selected bay is occupied. Resolve occupancy first or choose an empty bay.");
        }
        return;
      }
      if (isVirtual) {
        const virtualCell = {
          bay,
          level,
          location_code: `${state.rackModel.row.name}-B${String(bay).padStart(2, "0")}-L${level}`,
          item_number: "",
          qty: 0,
          recorded_location: "",
          po_number: "",
          mixed_items: [],
          is_mixed: false,
          is_empty: true,
          is_virtual: true
        };
        state.inspector.anchorRect = slotNode.getBoundingClientRect();
        selectCell(virtualCell);
        renderGrid();
        openInspectorNearSelection();
        return;
      }
      state.inspector.anchorRect = slotNode.getBoundingClientRect();
      selectCell(cellData);
      renderGrid();
      openInspectorNearSelection();
    };
    // All front-view geometry (columns, level heights, per-bay overrides)
    // comes from one deterministic layout computation. See geometry.js.
    const rackRow = state.rackModel.row;
    const layout = geometry.rackFrontLayout(rackRow, state.rackModel.bays, state.rackModel.max_levels);
    const layoutLevelByNumber = new Map(layout.levels.map((entry) => [entry.level, entry]));
    const supports = new Set(layout.supports);
    const trackTemplate = layout.trackTemplate;

    const bayHeader = document.createElement("div");
    bayHeader.className = "rack-physical-header";
    bayHeader.style.gridTemplateColumns = trackTemplate;
    const headerSpacer = document.createElement("div");
    headerSpacer.className = "rack-level-spacer";
    bayHeader.appendChild(headerSpacer);
    const leftSpacer = document.createElement("div");
    leftSpacer.className = "rack-post-spacer";
    bayHeader.appendChild(leftSpacer);
    state.rackModel.bays.forEach((bay) => {
      const bayPlacard = document.createElement("div");
      bayPlacard.className = "rack-bay-placard";
      bayPlacard.textContent = `Bay ${bay}`;
      bayHeader.appendChild(bayPlacard);
      if (supports.has(bay)) {
        const supportSpacer = document.createElement("div");
        supportSpacer.className = "rack-inner-post-spacer";
        bayHeader.appendChild(supportSpacer);
      }
    });
    const rightSpacer = document.createElement("div");
    rightSpacer.className = "rack-post-spacer";
    bayHeader.appendChild(rightSpacer);
    rack.appendChild(bayHeader);

    const rackHeight = layout.rackHeight;
    const beamPositions = layout.beamPositions;
    const hasBeamData = layout.hasBeamData;
    const bayBeamPositions = (bay) => geometry.bayBeamPositions(rackRow, bay);
    const bayHasOverrideAt = (bay, beamIdx) => geometry.bayHasOverrideAt(rackRow, bay, beamIdx);
    const rowHasAnyOverride = (beamIdx) => layout.bays.some((bay) => bayHasOverrideAt(bay, beamIdx));

    for (let level = state.rackModel.max_levels; level >= 1; level -= 1) {
      const layoutLevel = layoutLevelByNumber.get(level);
      const levelBays = new Set((state.rackModel.cells || []).filter((cell) => cell.level === level).map((cell) => cell.bay));
      const postVisibility = rackLevelPostVisibility(state.rackModel.bays, supports, levelBays);
      const beamRow = document.createElement("div");
      beamRow.className = "beam-row";
      if (level === state.rackModel.max_levels) {
        beamRow.classList.add("top-beam-row");
      }
      beamRow.style.gridTemplateColumns = trackTemplate;
      const rowMaxPx = layoutLevel ? layoutLevel.rowHeightPx : null;
      if (rowMaxPx !== null) {
        beamRow.style.minHeight = `${rowMaxPx}px`;
      }

      const levelLabel = document.createElement("div");
      levelLabel.className = "physical-level-label";
      levelLabel.textContent = `L${level}`;
      if (layoutLevel && layoutLevel.spanInches !== null) {
        levelLabel.title = `Level ${level} \u2013 ${Math.round(layoutLevel.spanInches)}" tall`;
      }
      beamRow.appendChild(levelLabel);
      const leftPost = document.createElement("div");
      leftPost.className = "upright-post";
      if (!postVisibility.left) {
        leftPost.classList.add("hidden-level-post");
      }
      beamRow.appendChild(leftPost);

      const pxPerInchRow = layoutLevel ? layoutLevel.pxPerInch : null;
      // Cell geometry comes precomputed from the layout: topPx offsets a
      // bay's shelf within the level row when a per-bay override moves it
      // off the shared beam line; heightPx keeps the row's px-per-inch scale.
      const applySlotGeometry = (el, bay) => {
        if (!hasBeamData || !pxPerInchRow || !layoutLevel) return;
        const cellGeom = layoutLevel.cells[bay];
        if (!cellGeom) return;
        el.style.marginTop = `${cellGeom.topPx}px`;
        el.style.height = `${cellGeom.heightPx}px`;
        el.style.minHeight = `${cellGeom.heightPx}px`;
        el.style.maxHeight = `${cellGeom.heightPx}px`;
        el.style.alignSelf = "start";
      };

      state.rackModel.bays.forEach((bay) => {
        const cellData = findCell(bay, level);
        const slot = document.createElement("button");
        slot.type = "button";
        slot.className = "rack-slot";
        const key = rackCellKey(bay, level);
        const isSearchHit = isSearchModeActive() && rackSearchHitSet(state.rackModel.row.name).has(key);
        slot.dataset.cellKey = key;
        slot.dataset.bay = String(bay);
        slot.dataset.level = String(level);
        const cellGeom = layoutLevel ? layoutLevel.cells[bay] : null;
        const lowerOverridden = !!(cellGeom && cellGeom.lowerOverridden);
        const upperOverridden = !!(cellGeom && cellGeom.upperOverridden);
        const cellHasOverride = lowerOverridden || upperOverridden;
        const upperBeamIsOverridden = upperOverridden;
        if (!cellData) {
          const gap = document.createElement("div");
          gap.className = "rack-slot-gap";
          gap.dataset.bay = String(bay);
          gap.dataset.level = String(level);
          if (upperBeamIsOverridden && state.rackBeamEdit) {
            gap.classList.add("has-beam-override-upper");
          }
          applySlotGeometry(gap, bay);
          beamRow.appendChild(gap);
        } else {
          if (cellData.is_mixed) {
            slot.classList.add("mixed");
          } else if (cellData.is_empty) {
            slot.classList.add("empty");
          } else {
            slot.classList.add("occupied");
          }
          if (state.selectedCellKey === key) {
            slot.classList.add("selected");
          }
          if (state.rackPendingAdd) {
            slot.classList.add(cellData.is_empty ? "pending-target" : "pending-blocked");
          }
          if (isSearchHit) {
            slot.classList.add("search-hit");
          }
          applyHeatClass(slot, inventoryAgeInfo(cellData.last_inventory_at).bucket);
          applyAuditClass(slot, auditStatusForCell(cellData));
          const primary = cellData.is_mixed ? `Mixed (${cellData.mixed_items.length})` : (cellData.item_number || "(empty)");
          if (cellHasOverride && state.rackBeamEdit) {
            slot.classList.add("has-beam-override");
          }
          if (upperOverridden && state.rackBeamEdit) {
            slot.classList.add("has-beam-override-upper");
          }
          const overrideBadgeHTML = cellHasOverride && state.rackBeamEdit
            ? `<div class="slot-override-badge" title="Per-bay cross-member override active">${Math.round((cellGeom && cellGeom.inches) || 0)}\u2033</div>`
            : "";
          slot.innerHTML = `<div class="slot-placard">${cellData.location_code || `B${bay}-L${level}`}</div><div class="slot-item">${primary}</div><div class="slot-qty">Qty ${cellData.qty}</div>${overrideBadgeHTML}`;
          applySlotGeometry(slot, bay);
          slot.addEventListener("click", async () => {
            if (auditWorkspace) {
              selectCell(cellData);
              renderGrid();
              return;
            }
            await handleRackSlotClick(slot, cellData, bay, level);
          });
          beamRow.appendChild(slot);
        }
        if (supports.has(bay)) {
          const innerPost = document.createElement("div");
          innerPost.className = "upright-post inner";
          if (!postVisibility.supports.get(bay)) {
            innerPost.classList.add("hidden-level-post");
          }
          beamRow.appendChild(innerPost);
        }
      });

      const rightPost = document.createElement("div");
      rightPost.className = "upright-post";
      if (!postVisibility.right) {
        rightPost.classList.add("hidden-level-post");
      }
      beamRow.appendChild(rightPost);
      rack.appendChild(beamRow);

      if (isAdmin && hasBeamData && level > 1) {
        const beamIndex = level - 1;
        const sharedBeamIdx = beamIndex - 1;
        if (state.rackBeamEdit) {
          const perBayRow = document.createElement("div");
          perBayRow.className = "per-bay-handle-row";
          perBayRow.style.gridTemplateColumns = trackTemplate;
          perBayRow.appendChild(document.createElement("div"));
          perBayRow.appendChild(document.createElement("div"));
          const groupSize = Math.max(1, Number(state.rackModel.row.support_every_bays) || 2);
          const groups = [];
          for (let i = 0; i < state.rackModel.bays.length; i += groupSize) {
            groups.push(state.rackModel.bays.slice(i, i + groupSize));
          }
          groups.forEach((group) => {
            const handle = document.createElement("div");
            handle.className = "per-bay-beam-handle";
            const groupSpansSupport = group.some((b, gi) => gi < group.length - 1 && supports.has(b));
            const columnSpan = group.length + (groupSpansSupport ? group.filter((b, gi) => gi < group.length - 1 && supports.has(b)).length : 0);
            handle.style.gridColumn = `span ${columnSpan}`;
            const primaryBay = group[0];
            const positions = bayBeamPositions(primaryBay);
            const overridesInGroup = group.filter((b) => bayHasOverrideAt(b, sharedBeamIdx));
            const hasOverride = overridesInGroup.length > 0;
            if (hasOverride) {
              handle.classList.add("has-override");
            }
            const currentPos = Math.round(positions[sharedBeamIdx] || 0);
            const sharedPos = Math.round(beamPositions[sharedBeamIdx] || 0);
            if (hasOverride && currentPos !== sharedPos && pxPerInchRow) {
              const offsetPx = -((currentPos - sharedPos) * pxPerInchRow);
              handle.dataset.persistOffsetPx = String(Math.round(offsetPx));
            }
            const groupLabel = group.length === 1 ? `Bay ${group[0]}` : `Bays ${group[0]}\u2013${group[group.length - 1]}`;
            handle.title = hasOverride
              ? `${groupLabel} beam at ${currentPos}\u2033 (override) \u2014 drag to adjust, right-click to reset.`
              : `${groupLabel} beam at ${currentPos}\u2033 (shared) \u2014 drag to override just this bay. Shift+drag = all bays at this level.`;
            handle.dataset.bays = group.join(",");
            handle.dataset.beamIndex = String(sharedBeamIdx);
            const labelSpan = document.createElement("span");
            labelSpan.textContent = groupLabel;
            handle.appendChild(labelSpan);
            handle.addEventListener("mousedown", (startEvent) => {
              if (startEvent.button !== 0) {
                return;
              }
              startEvent.preventDefault();
              startEvent.stopPropagation();
              const moveAllBays = startEvent.shiftKey;
              const startY = startEvent.clientY;
              const origPos = positions[sharedBeamIdx];
              const lower = sharedBeamIdx > 0 ? Math.max(...state.rackModel.bays.map((b) => bayBeamPositions(b)[sharedBeamIdx - 1] || 0)) + 1 : 1;
              const upper = sharedBeamIdx + 1 < positions.length ? Math.min(...state.rackModel.bays.map((b) => bayBeamPositions(b)[sharedBeamIdx + 1] || rackHeight)) - 1 : rackHeight - 1;
              const perBayLower = sharedBeamIdx > 0 ? positions[sharedBeamIdx - 1] + 1 : 1;
              const perBayUpper = sharedBeamIdx + 1 < positions.length ? positions[sharedBeamIdx + 1] - 1 : rackHeight - 1;
              const lo = moveAllBays ? lower : perBayLower;
              const hi = moveAllBays ? upper : perBayUpper;
              const rackRect = rack.getBoundingClientRect();
              const pxPerInch = pxPerInchRow || (rackRect.height / rackHeight);
              const initialOffsetPx = Number(handle.dataset.persistOffsetPx) || 0;
              handle.classList.add("dragging");
              if (moveAllBays) {
                handle.classList.add("dragging-shared");
              }
              const onMove = (moveEvent) => {
                const dy = moveEvent.clientY - startY;
                const deltaInches = -(dy / Math.max(pxPerInch, 0.1));
                const newPos = Math.round(Math.max(lo, Math.min(hi, origPos + deltaInches)));
                handle.title = moveAllBays
                  ? `All bays beam ${sharedBeamIdx + 1} \u2192 ${newPos}\u2033`
                  : `${groupLabel} beam ${sharedBeamIdx + 1} \u2192 ${newPos}\u2033`;
                handle.dataset.pendingPos = String(newPos);
                const liveDeltaInches = newPos - origPos;
                const translateY = initialOffsetPx + (-liveDeltaInches * pxPerInch);
                handle.style.transform = `translateY(${translateY}px)`;
                if (!handle.querySelector(".per-bay-live-readout")) {
                  const readout = document.createElement("div");
                  readout.className = "per-bay-live-readout";
                  handle.appendChild(readout);
                }
                handle.querySelector(".per-bay-live-readout").textContent = `${newPos}\u2033`;
              };
              const onUp = async () => {
                document.removeEventListener("mousemove", onMove);
                document.removeEventListener("mouseup", onUp);
                handle.classList.remove("dragging");
                handle.classList.remove("dragging-shared");
                handle.style.transform = "";
                const liveReadout = handle.querySelector(".per-bay-live-readout");
                if (liveReadout) {
                  liveReadout.remove();
                }
                const pending = handle.dataset.pendingPos;
                if (pending == null) {
                  return;
                }
                const target = Number(pending);
                if (target === Math.round(origPos)) {
                  return;
                }
                if (moveAllBays) {
                  const updatedBeams = [...beamPositions];
                  updatedBeams[sharedBeamIdx] = target;
                  updatedBeams.sort((a, b) => a - b);
                  try {
                    const response = await apiPost("/api/config/row/beams", {
                      name: state.rackModel.row.name,
                      beam_positions: updatedBeams
                    });
                    if (response.row) {
                      state.rackModel.row = response.row;
                    }
                    renderGrid();
                    setStatus(`All bays beam ${sharedBeamIdx + 1} moved to ${target}\u2033.`);
                  } catch (error) {
                    setStatus(`Beam update failed: ${error.message}`);
                  }
                  return;
                }
                const sharedAtIdx = beamPositions[sharedBeamIdx];
                const payload = {
                  name: state.rackModel.row.name,
                  bays: group,
                  beam_index: sharedBeamIdx,
                  position: target === Math.round(sharedAtIdx) ? null : target
                };
                try {
                  const response = await apiPost("/api/config/row/beam-override", payload);
                  if (response.row) {
                    state.rackModel.row = response.row;
                  }
                  renderGrid();
                  setStatus(payload.position == null
                    ? `${groupLabel} beam ${sharedBeamIdx + 1} reset to shared (${Math.round(sharedAtIdx)}\u2033).`
                    : `${groupLabel} beam ${sharedBeamIdx + 1} set to ${target}\u2033.`);
                } catch (error) {
                  setStatus(`Per-bay beam update failed: ${error.message}`);
                }
              };
              document.addEventListener("mousemove", onMove);
              document.addEventListener("mouseup", onUp);
            });
            handle.addEventListener("contextmenu", async (event) => {
              event.preventDefault();
              event.stopPropagation();
              if (overridesInGroup.length === 0) {
                setStatus(`${groupLabel} beam ${sharedBeamIdx + 1} already uses the shared position.`);
                return;
              }
              try {
                const response = await apiPost("/api/config/row/beam-override", {
                  name: state.rackModel.row.name,
                  bays: group,
                  beam_index: sharedBeamIdx,
                  position: null
                });
                if (response.row) {
                  state.rackModel.row = response.row;
                }
                renderGrid();
                setStatus(`${groupLabel} beam ${sharedBeamIdx + 1} reset to shared.`);
              } catch (error) {
                setStatus(`Reset override failed: ${error.message}`);
              }
            });
            perBayRow.appendChild(handle);
            const lastBayInGroup = group[group.length - 1];
            if (supports.has(lastBayInGroup)) {
              perBayRow.appendChild(document.createElement("div"));
            }
          });
          perBayRow.appendChild(document.createElement("div"));
          rack.appendChild(perBayRow);
        }
        const beamHandle = document.createElement("div");
        beamHandle.className = "beam-drag-handle";
        if (rowHasAnyOverride(sharedBeamIdx)) {
          beamHandle.classList.add("has-overrides");
        }
        if (state.rackBeamEdit) {
          beamHandle.classList.add("display-only");
          beamHandle.title = `Beam at ${Math.round(beamPositions[beamIndex - 1] || 0)}" \u2014 use the per-bay pills above (Shift+drag = all bays).`;
          rack.appendChild(beamHandle);
          continue;
        }
        beamHandle.title = `Beam at ${Math.round(beamPositions[beamIndex - 1] || 0)}" \u2014 drag to adjust all bays`;
        beamHandle.dataset.beamIndex = String(beamIndex - 1);
        beamHandle.addEventListener("mousedown", (startEvent) => {
          startEvent.preventDefault();
          startEvent.stopPropagation();
          const startY = startEvent.clientY;
          const origPos = beamPositions[beamIndex - 1];
          const minPos = beamIndex > 1 ? beamPositions[beamIndex - 2] + 6 : 6;
          const maxPos = beamIndex < beamPositions.length ? beamPositions[beamIndex] - 6 : rackHeight - 6;
          const rackEl = rack;
          const rackRect = rackEl.getBoundingClientRect();
          const pxPerInch = rackRect.height / rackHeight;
          beamHandle.classList.add("dragging");

          const onMove = (moveEvent) => {
            const dy = moveEvent.clientY - startY;
            const deltaInches = -(dy / Math.max(pxPerInch, 0.1));
            const newPos = Math.round(Math.max(minPos, Math.min(maxPos, origPos + deltaInches)));
            beamHandle.title = `Beam at ${newPos}"`;
            beamHandle.dataset.pendingPos = String(newPos);
          };
          const onUp = async () => {
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
            beamHandle.classList.remove("dragging");
            const pending = beamHandle.dataset.pendingPos;
            if (pending == null || Number(pending) === origPos) {
              return;
            }
            const updatedBeams = [...beamPositions];
            updatedBeams[beamIndex - 1] = Number(pending);
            updatedBeams.sort((a, b) => a - b);
            try {
              const response = await apiPost("/api/config/row/beams", {
                name: state.rackModel.row.name,
                beam_positions: updatedBeams
              });
              if (response.row) {
                state.rackModel.row = response.row;
              }
              renderGrid();
              setStatus(`Beam moved to ${pending}".`);
            } catch (error) {
              setStatus(`Beam update failed: ${error.message}`);
            }
          };
          document.addEventListener("mousemove", onMove);
          document.addEventListener("mouseup", onUp);
        });
        rack.appendChild(beamHandle);
      }
    }

    if (isAdmin && !state.rackPendingAdd) {
      const beamToolbar = document.createElement("div");
      beamToolbar.className = "beam-toolbar";
      if (state.rackBeamEdit) {
        beamToolbar.classList.add("editing");
      }
      if (!hasBeamData) {
        const initBtn = document.createElement("button");
        initBtn.type = "button";
        initBtn.className = "beam-init-btn";
        initBtn.textContent = "Edit Cross Members";
        initBtn.addEventListener("click", async () => {
          const maxLevels = state.rackModel.max_levels;
          const evenSpacing = rackHeight / maxLevels;
          const initialBeams = [];
          for (let i = 1; i < maxLevels; i += 1) {
            initialBeams.push(Math.round(evenSpacing * i));
          }
          try {
            const response = await apiPost("/api/config/row/beams", {
              name: state.rackModel.row.name,
              beam_positions: initialBeams,
              rack_height: rackHeight
            });
            if (response.row) {
              state.rackModel.row = response.row;
            }
            renderGrid();
            setStatus(`Cross members initialized with even spacing for ${maxLevels} levels.`);
          } catch (error) {
            setStatus(`Failed to initialize beams: ${error.message}`);
          }
        });
        beamToolbar.appendChild(initBtn);
      } else if (state.rackBeamEdit) {
        const hint = document.createElement("span");
        hint.className = "beam-edit-hint";
        hint.textContent = "Cross-member edit mode \u2014 drag a Bay pill to offset just that bay. Shift+drag a pill to move all bays at that level. Right-click a pill to reset.";
        beamToolbar.appendChild(hint);
        const doneBtn = document.createElement("button");
        doneBtn.type = "button";
        doneBtn.className = "beam-done-btn";
        doneBtn.textContent = "Done Editing";
        doneBtn.addEventListener("click", () => {
          state.rackBeamEdit = false;
          renderGrid();
          setStatus("Cross-member edit mode off. Panning enabled.");
        });
        beamToolbar.appendChild(doneBtn);
      } else {
        const editBtn = document.createElement("button");
        editBtn.type = "button";
        editBtn.className = "beam-edit-btn";
        editBtn.textContent = "Edit Cross Members";
        editBtn.title = "Switch to cross-member edit mode (disables panning so you can grab beams).";
        editBtn.addEventListener("click", () => {
          state.rackBeamEdit = true;
          renderGrid();
          setStatus("Cross-member edit mode on. Drag any orange beam to change its height.");
        });
        beamToolbar.appendChild(editBtn);
        const resetBtn = document.createElement("button");
        resetBtn.type = "button";
        resetBtn.className = "beam-reset-btn";
        resetBtn.textContent = "Reset Cross Members";
        resetBtn.addEventListener("click", async () => {
          if (!window.confirm("Reset all beam positions to even spacing?")) {
            return;
          }
          const maxLevels = state.rackModel.max_levels;
          const evenSpacing = rackHeight / maxLevels;
          const evenBeams = [];
          for (let i = 1; i < maxLevels; i += 1) {
            evenBeams.push(Math.round(evenSpacing * i));
          }
          try {
            const response = await apiPost("/api/config/row/beams", {
              name: state.rackModel.row.name,
              beam_positions: evenBeams,
              clear_overrides: true
            });
            if (response.row) {
              state.rackModel.row = response.row;
            }
            renderGrid();
            setStatus("Cross members reset to even spacing (overrides cleared).");
          } catch (error) {
            setStatus(`Reset failed: ${error.message}`);
          }
        });
        beamToolbar.appendChild(resetBtn);
        const clearBtn = document.createElement("button");
        clearBtn.type = "button";
        clearBtn.className = "beam-clear-btn";
        clearBtn.textContent = "Remove Cross Members";
        clearBtn.addEventListener("click", async () => {
          if (!window.confirm("Remove all beam positions? Levels will return to equal height.")) {
            return;
          }
          try {
            const response = await apiPost("/api/config/row/beams", {
              name: state.rackModel.row.name,
              beam_positions: []
            });
            if (response.row) {
              state.rackModel.row = response.row;
            }
            state.rackBeamEdit = false;
            renderGrid();
            setStatus("Cross members removed.");
          } catch (error) {
            setStatus(`Remove failed: ${error.message}`);
          }
        });
        beamToolbar.appendChild(clearBtn);
      }
      el.gridWrap.appendChild(beamToolbar);
    }
    if (state.rackPendingAdd) {
      const banner = document.createElement("div");
      banner.className = "slotted-add-banner";
      banner.textContent = `Adding pallet ${state.rackPendingAdd.item_label} to rack ${state.rackPendingAdd.row}. Select an empty bay to place it or an occupied bay to merge it.`;
      el.gridWrap.appendChild(banner);
    }
    if (auditWorkspace) {
      const banner = document.createElement("div");
      banner.className = "slotted-add-banner";
      banner.textContent = state.audit.session
        ? `Audit session ${state.audit.session.name} is active. Select a bay to record a count.`
        : "Start an audit session to begin counting this rack.";
      el.gridWrap.appendChild(banner);
    }
    updateRackSummary();
    el.gridWrap.appendChild(rack);
    rack.querySelectorAll(".per-bay-beam-handle[data-persist-offset-px]").forEach((handle) => {
      if (handle.classList.contains("dragging")) {
        return;
      }
      const offsetPx = Number(handle.dataset.persistOffsetPx) || 0;
      handle.style.transform = `translateY(${offsetPx}px)`;
    });
    if (isInspectorVisible()) {
      openInspectorNearSelection();
    }
  }

  function renderFloorGrid(ctx) {
    const { state, el, inAuditWorkspace, floorCellKey, applyHeatClass, inventoryAgeInfo, applyAuditClass, auditStatusForCell, selectCell, renderGrid, updateFloorSummary } = ctx;
    el.gridWrap.innerHTML = "";
    if (!state.zoneModel) {
      el.viewTitle.textContent = "Floor Zone View";
      el.viewSummary.textContent = "No floor locations loaded.";
      const p = document.createElement("p");
      p.className = "empty-state";
      p.textContent = "Select a floor zone to view slots.";
      el.gridWrap.appendChild(p);
      return;
    }
    const zone = state.zoneModel.zone;
    const columns = Math.max(1, zone.columns || 4);
    const auditWorkspace = inAuditWorkspace();
    el.viewTitle.textContent = auditWorkspace ? `Audit Floor View - ${zone.zone_id}` : `Floor Zone View - ${zone.zone_id}`;
    const grid = document.createElement("div");
    grid.className = "rack-grid";
    grid.style.gridTemplateColumns = `repeat(${columns}, minmax(120px, 1fr))`;
    state.zoneModel.cells.forEach((cellData) => {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "rack-cell";
      const key = floorCellKey(cellData.slot);
      cell.classList.add(cellData.is_empty ? "empty" : "occupied");
      if (state.selectedCellKey === key) {
        cell.classList.add("selected");
      }
      applyHeatClass(cell, inventoryAgeInfo(cellData.last_inventory_at).bucket);
      applyAuditClass(cell, auditStatusForCell(cellData));
      if (cellData.is_mixed) cell.classList.add("mixed");
      cell.innerHTML = '<div class="cell-top"></div><div class="cell-item"></div><div class="cell-qty"></div>';
      cell.querySelector('.cell-top').textContent = `Slot ${cellData.slot}`;
      cell.querySelector('.cell-item').textContent = cellData.is_mixed ? `Mixed (${cellData.mixed_items.length})` : cellData.item_number || '(empty)';
      cell.querySelector('.cell-qty').textContent = `Qty ${cellData.qty}`;
      cell.addEventListener("click", () => {
        selectCell(cellData);
        renderGrid();
      });
      grid.appendChild(cell);
    });
    updateFloorSummary();
    if (auditWorkspace) {
      const banner = document.createElement("div");
      banner.className = "slotted-add-banner";
      banner.textContent = state.audit.session
        ? `Audit session ${state.audit.session.name} is active. Select a floor slot to record a count.`
        : "Start an audit session to begin counting this floor zone.";
      el.gridWrap.appendChild(banner);
    }
    el.gridWrap.appendChild(grid);
  }

  function renderSlottedGrid(ctx) {
    const {
      state, el, inAuditWorkspace, slottedCellKey, applyHeatClass, inventoryAgeInfo, applyAuditClass,
      auditStatusForCell, slottedHasEmptySlot, completeSlottedPendingAdd, setStatus, selectCell,
      renderGrid, apiPost, jumpToMovableItemResult, loadAreasAndRacks, syncControlVisibility, fitOverview
    } = ctx;
    el.gridWrap.innerHTML = "";
    if (!state.slottedModel) {
      el.viewTitle.textContent = "Slotted Pallet View";
      el.viewSummary.textContent = "No slotted pallet loaded.";
      const p = document.createElement("p");
      p.className = "empty-state";
      p.textContent = "Select a slotted pallet to view slots.";
      el.gridWrap.appendChild(p);
      return;
    }
    const pallet = state.slottedModel.slotted_pallet;
    const columns = Math.max(1, pallet.columns || 4);
    const auditWorkspace = inAuditWorkspace();
    el.viewTitle.textContent = auditWorkspace ? `Audit Slotted Pallet View - ${pallet.label || pallet.group_id}` : `Slotted Pallet View - ${pallet.label || pallet.group_id}`;
    const grid = document.createElement("div");
    grid.className = "rack-grid";
    grid.style.gridTemplateColumns = `repeat(${columns}, minmax(120px, 1fr))`;
    state.slottedModel.cells.forEach((cellData) => {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "rack-cell";
      const key = slottedCellKey(cellData.slot);
      if (cellData.is_mixed) {
        cell.classList.add("mixed");
      } else if (cellData.is_empty) {
        cell.classList.add("empty");
      } else {
        cell.classList.add("occupied");
      }
      if (state.selectedCellKey === key) {
        cell.classList.add("selected");
      }
      applyHeatClass(cell, inventoryAgeInfo(cellData.last_inventory_at).bucket);
      applyAuditClass(cell, auditStatusForCell(cellData));
      if (state.slottedPendingAdd) {
        if (cellData.is_empty) {
          cell.classList.add("pending-target");
        } else if (!slottedHasEmptySlot()) {
          cell.classList.add("pending-expand");
        }
      }
      cell.innerHTML = `<div class="cell-top">Slot ${cellData.slot}</div><div class="cell-item">${cellData.is_mixed ? `Mixed (${cellData.mixed_items.length})` : (cellData.item_number || "(empty)")}</div><div class="cell-qty">Qty ${cellData.qty}</div>`;
      cell.addEventListener("click", async () => {
        if (auditWorkspace) {
          selectCell(cellData);
          renderGrid();
          return;
        }
        if (state.slottedPendingAdd) {
          try {
            await completeSlottedPendingAdd(cellData.slot);
          } catch (error) {
            setStatus(`Add to slotted pallet failed: ${error.message}`);
          }
          return;
        }
        selectCell(cellData);
        renderGrid();
      });
      grid.appendChild(cell);
    });
    const counts = pallet.counts || {};
    el.viewSummary.textContent = `Slots ${counts.total || 0} | Empty ${counts.empty || 0} | Occupied ${counts.occupied || 0} | Mixed ${counts.mixed || 0}`;
    if (auditWorkspace) {
      el.viewSummary.textContent += state.audit.session ? ` | Audit ${state.audit.session.name}` : " | No active audit";
    }
    if (state.slottedPendingAdd) {
      const banner = document.createElement("div");
      banner.className = "slotted-add-banner";
      const suffix = slottedHasEmptySlot() ? "Select an empty slot." : "No empty slots. Click any slot to create a new one.";
      banner.textContent = `Adding pallet ${state.slottedPendingAdd.item_label}. ${suffix}`;
      el.gridWrap.appendChild(banner);
    }
    if (auditWorkspace) {
      const banner = document.createElement("div");
      banner.className = "slotted-add-banner";
      banner.textContent = state.audit.session
        ? `Audit session ${state.audit.session.name} is active. Select a slot to record a count.`
        : "Start an audit session to begin counting this slotted pallet.";
      el.gridWrap.appendChild(banner);
    }
    if (auditWorkspace) {
      el.gridWrap.appendChild(grid);
      return;
    }
    const breakApartBtn = document.createElement("button");
    breakApartBtn.type = "button";
    breakApartBtn.textContent = "Break Apart";
    breakApartBtn.className = "detail-back-inline";
    breakApartBtn.addEventListener("click", async () => {
      try {
        const response = await apiPost("/api/config/slotted-pallet/break-apart", { group_id: pallet.group_id });
        state.viewMode = "overview";
        el.viewMode.value = "overview";
        state.selectedSlottedPallet = "";
        const firstCreated = Array.isArray(response.created_items) ? response.created_items[0] : null;
        if (firstCreated) {
          await jumpToMovableItemResult(firstCreated);
        } else {
          selectCell(null);
          await loadAreasAndRacks();
          syncControlVisibility();
          renderGrid();
          fitOverview();
        }
        setStatus("Slotted pallet broken apart into individual pallets.");
      } catch (error) {
        setStatus(`Break apart failed: ${error.message}`);
      }
    });
    el.gridWrap.appendChild(breakApartBtn);
    el.gridWrap.appendChild(grid);
  }

  modules.renderers = {
    bindOverviewInteraction,
    renderFloorGrid,
    renderOverview
    ,
    renderRackGrid,
    renderSlottedGrid
  };
})();
