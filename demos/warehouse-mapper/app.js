/**
 * Warehouse Mapper — sanitized static portfolio demo.
 * Loads demo-map.json + demo-items.json; no backend.
 */

const ROW_BAY_UNIT = 22;
const ROW_DEPTH = 58;
const ROW_DEPTH_VERTICAL = 60;
const ROW_MIN_LENGTH = 140;
const ROW_MIN_DEPTH = 70;

const PAD = 24;
const VIEW = { x: 40, y: 40, w: 1040, h: 460 };

const state = {
  map: null,
  items: [],
  counts: new Map(), // key: "ROW|bay|level" → { sku, qty }
  catalog: [],
  selectedRow: null,
  selectedBay: null,
  selectedLevel: null,
  search: "",
  hitKeys: new Set(),
  seedSnapshot: null,
};

const canvas = document.getElementById("mapCanvas");
const ctx = canvas.getContext("2d");
const $ = (id) => document.getElementById(id);

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch])
  );
}

function bayKey(row, bay, level) {
  return `${row}|${bay}|${level}`;
}

/** Sanitize fixture item numbers into DEMO-* portfolio SKUs. */
function toDemoSku(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  if (s.startsWith("DEMO-")) return s;
  if (s.startsWith("BLK-")) return `DEMO-${s.slice(4)}`;
  if (s.startsWith("STG-")) return `DEMO-STG-${s.slice(4)}`;
  if (s.startsWith("SLOT-")) return `DEMO-SLOT-${s.slice(5)}`;
  if (s.startsWith("PAL-ITEM-")) return `DEMO-PAL-${s.slice(9)}`;
  return `DEMO-${s.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

function rowRect(row) {
  const sx = Number(row.scale_x) || 1;
  const sy = Number(row.scale_y) || 1;
  const bayCount = Math.max(1, Number(row.bay_count) || 1);
  if (row.orientation === "vertical") {
    return {
      x: Number(row.x) || 0,
      y: Number(row.y) || 0,
      w: Math.max(ROW_MIN_DEPTH, ROW_DEPTH_VERTICAL * sx),
      h: Math.max(ROW_MIN_LENGTH, bayCount * ROW_BAY_UNIT * sy),
    };
  }
  return {
    x: Number(row.x) || 0,
    y: Number(row.y) || 0,
    w: Math.max(ROW_MIN_LENGTH, bayCount * ROW_BAY_UNIT * sx),
    h: Math.max(ROW_MIN_DEPTH, ROW_DEPTH * sy),
  };
}

function levelsFor(row, bay) {
  const overrides = row.bay_levels || {};
  const n = overrides[bay] ?? overrides[String(bay)] ?? row.levels_default ?? 1;
  return Math.max(1, Number(n) || 1);
}

function worldToCanvas(x, y) {
  const sx = canvas.width / VIEW.w;
  const sy = canvas.height / VIEW.h;
  return {
    x: (x - VIEW.x) * sx,
    y: (y - VIEW.y) * sy,
  };
}

function scaleLen(n) {
  return n * (canvas.width / VIEW.w);
}

function setStatus(msg) {
  $("mapStatus").textContent = msg;
}

function seedCountsFromMap(map) {
  state.counts.clear();
  const skus = new Set();
  for (const loc of map.rack_locations || []) {
    const sku = toDemoSku(loc.item_number);
    const qty = Number(loc.qty) || 0;
    if (!sku && qty <= 0) continue;
    if (sku) skus.add(sku);
    state.counts.set(bayKey(loc.row, loc.bay, loc.level), {
      sku: sku || "",
      qty,
    });
  }
  // Ensure a few empty DEMO SKUs exist for demo entry even if not on map.
  ["DEMO-100", "DEMO-200", "DEMO-300"].forEach((s) => skus.add(s));
  state.catalog = [...skus].sort((a, b) => a.localeCompare(b));
  state.seedSnapshot = JSON.stringify([...state.counts.entries()]);
}

function occupiedCount(rowName) {
  let n = 0;
  for (const [key, val] of state.counts) {
    if (key.startsWith(`${rowName}|`) && val.qty > 0) n += 1;
  }
  return n;
}

function refreshHits() {
  const needle = state.search.trim().toUpperCase();
  state.hitKeys.clear();
  if (!needle) return;
  for (const [key, val] of state.counts) {
    if (val.sku && val.sku.toUpperCase().includes(needle)) {
      state.hitKeys.add(key);
    }
  }
}

function hitRows() {
  const rows = new Set();
  for (const key of state.hitKeys) {
    rows.add(key.split("|")[0]);
  }
  return rows;
}

function drawNullSpace(space) {
  const p = worldToCanvas(space.x, space.y);
  const w = scaleLen(space.width);
  const h = scaleLen(space.height);
  const kind = space.kind || "space";
  const fills = {
    machine: "#24352c",
    wall: "#1a2220",
    aisle: "#141a17",
    door: "#2a3a48",
  };
  ctx.fillStyle = fills[kind] || "#1e2a24";
  ctx.fillRect(p.x, p.y, w, h);
  ctx.strokeStyle = "#385042";
  ctx.lineWidth = 1;
  ctx.strokeRect(p.x, p.y, w, h);
  if (space.label && h > 10 && w > 40) {
    ctx.fillStyle = "#aebcad";
    ctx.font = "600 11px Segoe UI, sans-serif";
    ctx.fillText(space.label, p.x + 6, p.y + Math.min(16, h - 4));
  }
}

function drawZone(zone) {
  const cols = Math.max(1, Number(zone.columns) || 4);
  const slots = Math.max(1, Number(zone.slot_count) || 1);
  const unit = 24;
  const pad = 20;
  const rows = Math.ceil(slots / cols);
  const w = zone.width || cols * unit + pad;
  const h = zone.height || rows * unit + pad;
  const p = worldToCanvas(zone.x, zone.y);
  const cw = scaleLen(w);
  const ch = scaleLen(h);
  ctx.fillStyle = "#1a2820";
  ctx.strokeStyle = "#4a6a55";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 3]);
  ctx.fillRect(p.x, p.y, cw, ch);
  ctx.strokeRect(p.x, p.y, cw, ch);
  ctx.setLineDash([]);
  ctx.fillStyle = "#aebcad";
  ctx.font = "600 11px Segoe UI, sans-serif";
  ctx.fillText(zone.zone_id || "ZONE", p.x + 6, p.y + 14);
}

function drawSlotted(sp) {
  const p = worldToCanvas(sp.x, sp.y);
  const w = scaleLen(sp.width || 280);
  const h = scaleLen(sp.height || 160);
  ctx.fillStyle = "#1f2e27";
  ctx.strokeStyle = "#508060";
  ctx.lineWidth = 1.5;
  ctx.fillRect(p.x, p.y, w, h);
  ctx.strokeRect(p.x, p.y, w, h);
  ctx.fillStyle = "#c7f6d7";
  ctx.font = "600 11px Segoe UI, sans-serif";
  ctx.fillText(sp.label || sp.group_id || "Slots", p.x + 6, p.y + 14);
}

function drawMovable(item) {
  const p = worldToCanvas(item.x, item.y);
  const w = scaleLen(item.width || 48);
  const h = scaleLen(item.height || 36);
  const empty = item.is_empty;
  ctx.fillStyle = empty ? "#1a2420" : "#2a4a38";
  ctx.strokeStyle = empty ? "#385042" : "#43b67f";
  ctx.lineWidth = 1;
  ctx.fillRect(p.x, p.y, w, h);
  ctx.strokeRect(p.x, p.y, w, h);
  ctx.fillStyle = "#aebcad";
  ctx.font = "10px Segoe UI, sans-serif";
  ctx.fillText(item.label || item.id, p.x + 3, p.y + 12);
}

function drawRack(row) {
  const r = rowRect(row);
  const p = worldToCanvas(r.x, r.y);
  const w = scaleLen(r.w);
  const h = scaleLen(r.h);
  const selected = state.selectedRow === row.name;
  const hits = hitRows().has(row.name);
  const occupied = occupiedCount(row.name) > 0;

  ctx.fillStyle = selected ? "#2a4f3d" : occupied ? "#1e3a2c" : "#1a2a22";
  ctx.strokeStyle = selected ? "#60c6ba" : hits ? "#e7b95b" : "#3a6b52";
  ctx.lineWidth = selected || hits ? 2.5 : 1.5;
  ctx.fillRect(p.x, p.y, w, h);
  ctx.strokeRect(p.x, p.y, w, h);

  const bayCount = Math.max(1, Number(row.bay_count) || 1);
  const horizontal = row.orientation !== "vertical";
  ctx.strokeStyle = "#2f4a3c";
  ctx.lineWidth = 1;
  for (let i = 1; i < bayCount; i++) {
    if (horizontal) {
      const bx = p.x + (w * i) / bayCount;
      ctx.beginPath();
      ctx.moveTo(bx, p.y);
      ctx.lineTo(bx, p.y + h);
      ctx.stroke();
    } else {
      const by = p.y + (h * i) / bayCount;
      ctx.beginPath();
      ctx.moveTo(p.x, by);
      ctx.lineTo(p.x + w, by);
      ctx.stroke();
    }
  }

  // Highlight bays that match search
  if (state.hitKeys.size) {
    for (const key of state.hitKeys) {
      const [rn, bayStr] = key.split("|");
      if (rn !== row.name) continue;
      const bay = Number(bayStr);
      const start = bay - (Number(row.bay_start) || 1);
      if (horizontal) {
        const bw = w / bayCount;
        ctx.fillStyle = "rgba(231, 185, 91, 0.28)";
        ctx.fillRect(p.x + start * bw, p.y, bw, h);
      } else {
        const bh = h / bayCount;
        ctx.fillStyle = "rgba(231, 185, 91, 0.28)";
        ctx.fillRect(p.x, p.y + start * bh, w, bh);
      }
    }
  }

  ctx.fillStyle = "#c7f6d7";
  ctx.font = "700 12px Segoe UI, sans-serif";
  ctx.fillText(row.name, p.x + 6, p.y + 14);
  ctx.fillStyle = "#aebcad";
  ctx.font = "10px Segoe UI, sans-serif";
  ctx.fillText(
    `${bayCount} bay · L${row.levels_default || 1}`,
    p.x + 6,
    p.y + h - 6
  );

  return { row, ...p, w, h, r };
}

function drawMap() {
  if (!state.map) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#0c100e";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Area backdrop
  const overview = state.map.layout?.area_overview?.["Bulk Demo"];
  if (overview) {
    const p = worldToCanvas(overview.x, overview.y);
    const w = scaleLen(overview.width);
    const h = scaleLen(overview.height);
    ctx.fillStyle = "#17221c";
    ctx.strokeStyle = "#385042";
    ctx.lineWidth = 2;
    ctx.fillRect(p.x, p.y, w, h);
    ctx.strokeRect(p.x, p.y, w, h);
    ctx.fillStyle = "#aebcad";
    ctx.font = "600 13px Segoe UI, sans-serif";
    ctx.fillText("Bulk Demo", p.x + 10, p.y + 18);
  }

  for (const space of state.map.null_spaces || []) drawNullSpace(space);
  for (const zone of state.map.zones || []) drawZone(zone);
  for (const sp of state.map.slotted_pallets || []) drawSlotted(sp);
  for (const item of state.items || []) drawMovable(item);

  state._hitTargets = [];
  for (const row of state.map.rows || []) {
    state._hitTargets.push(drawRack(row));
  }
}

function pickRack(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const x = ((clientX - rect.left) / rect.width) * canvas.width;
  const y = ((clientY - rect.top) / rect.height) * canvas.height;
  for (let i = (state._hitTargets || []).length - 1; i >= 0; i--) {
    const t = state._hitTargets[i];
    if (x >= t.x && x <= t.x + t.w && y >= t.y && y <= t.y + t.h) {
      return t.row;
    }
  }
  return null;
}

function renderSkuChips() {
  $("skuChips").innerHTML = state.catalog
    .map(
      (sku) =>
        `<button type="button" class="sku-chip${
          state.search.toUpperCase() === sku ? " active" : ""
        }" data-sku="${escapeHtml(sku)}">${escapeHtml(sku)}</button>`
    )
    .join("");
}

function renderSearchHits() {
  refreshHits();
  const needle = state.search.trim();
  const hits = [];
  for (const key of state.hitKeys) {
    const [row, bay, level] = key.split("|");
    const val = state.counts.get(key);
    hits.push({ key, row, bay, level, sku: val.sku, qty: val.qty });
  }
  hits.sort((a, b) => a.key.localeCompare(b.key));

  if (!needle) {
    $("searchSummary").textContent = `${state.catalog.length} DEMO-* SKUs in catalog`;
    $("hitList").innerHTML = "";
  } else if (!hits.length) {
    $("searchSummary").textContent = `No hits for “${needle}”`;
    $("hitList").innerHTML = `<p class="panel-summary">Try DEMO-022 or pick a catalog chip.</p>`;
  } else {
    $("searchSummary").textContent = `${hits.length} hit${hits.length === 1 ? "" : "s"}`;
    $("hitList").innerHTML = hits
      .map(
        (h) => `
      <button class="hit-card" type="button" data-key="${escapeHtml(h.key)}">
        <strong>${escapeHtml(h.sku)}</strong>
        <div class="row">
          <span>${escapeHtml(h.row)} · B${escapeHtml(h.bay)} · L${escapeHtml(h.level)}</span>
          <span>qty ${h.qty}</span>
        </div>
      </button>`
      )
      .join("");
  }
  renderSkuChips();
  drawMap();
}

function fillSkuSelect() {
  const sel = $("countSkuSelect");
  const current = sel.value;
  sel.innerHTML = state.catalog
    .map((sku) => `<option value="${escapeHtml(sku)}">${escapeHtml(sku)}</option>`)
    .join("");
  if (current && state.catalog.includes(current)) sel.value = current;
}

function renderBayGrid() {
  const row = (state.map.rows || []).find((r) => r.name === state.selectedRow);
  const wrap = $("bayGridWrap");
  const form = $("countForm");
  if (!row) {
    $("detailEyebrow").textContent = "Selection";
    $("detailTitle").textContent = "Pick a rack";
    $("detailHint").hidden = false;
    wrap.hidden = true;
    form.hidden = true;
    return;
  }

  $("detailEyebrow").textContent = row.area || "Rack";
  $("detailTitle").textContent = row.name;
  $("detailHint").hidden = true;
  wrap.hidden = false;
  form.hidden = false;

  const bayStart = Number(row.bay_start) || 1;
  const bayCount = Math.max(1, Number(row.bay_count) || 1);
  const maxLevels = Math.max(
    ...Array.from({ length: bayCount }, (_, i) => levelsFor(row, bayStart + i))
  );

  $("bayGridMeta").textContent = `${bayCount} bays × up to ${maxLevels} levels · ${occupiedCount(
    row.name
  )} occupied`;

  const grid = $("bayGrid");
  grid.style.gridTemplateColumns = `repeat(${bayCount}, minmax(0, 1fr))`;

  // Render top level first (warehouse convention: L-high at top)
  const cells = [];
  for (let level = maxLevels; level >= 1; level--) {
    for (let i = 0; i < bayCount; i++) {
      const bay = bayStart + i;
      const maxL = levelsFor(row, bay);
      if (level > maxL) {
        cells.push(`<div class="bay-cell empty" style="visibility:hidden"></div>`);
        continue;
      }
      const key = bayKey(row.name, bay, level);
      const val = state.counts.get(key) || { sku: "", qty: 0 };
      const occupied = val.qty > 0 && val.sku;
      const hit = state.hitKeys.has(key);
      const active =
        state.selectedBay === bay && state.selectedLevel === level ? "active" : "";
      cells.push(`
        <button type="button" class="bay-cell ${occupied ? "occupied" : "empty"} ${
          hit ? "hit" : ""
        } ${active}" data-bay="${bay}" data-level="${level}">
          <span class="bay-loc">B${bay} · L${level}</span>
          <span class="bay-sku">${
            occupied
              ? `${escapeHtml(val.sku)} · ${val.qty}`
              : "empty"
          }</span>
        </button>`);
    }
  }
  grid.innerHTML = cells.join("");
  fillSkuSelect();

  if (state.selectedBay != null && state.selectedLevel != null) {
    const key = bayKey(row.name, state.selectedBay, state.selectedLevel);
    const val = state.counts.get(key) || { sku: "", qty: 0 };
    if (val.sku && state.catalog.includes(val.sku)) {
      $("countSkuSelect").value = val.sku;
    }
    $("countQtyInput").value = val.qty || 0;
    $("countFeedback").textContent = `Editing ${row.name} B${state.selectedBay} L${state.selectedLevel}`;
    $("countFeedback").className = "count-feedback";
  } else {
    $("countFeedback").textContent = "Select a bay cell, then apply a DEMO-* count.";
    $("countFeedback").className = "count-feedback";
  }
}

function selectRow(rowName, bay, level) {
  state.selectedRow = rowName;
  state.selectedBay = bay ?? null;
  state.selectedLevel = level ?? null;
  renderBayGrid();
  drawMap();
  setStatus(`Selected ${rowName}${bay != null ? ` · B${bay} L${level}` : ""}`);
}

function applyCount() {
  if (!state.selectedRow || state.selectedBay == null || state.selectedLevel == null) {
    $("countFeedback").textContent = "Select a bay cell first.";
    $("countFeedback").className = "count-feedback err";
    return;
  }
  const sku = $("countSkuSelect").value;
  const qty = Math.max(0, Math.floor(Number($("countQtyInput").value) || 0));
  if (!sku.startsWith("DEMO-")) {
    $("countFeedback").textContent = "Only DEMO-* SKUs are allowed in this demo.";
    $("countFeedback").className = "count-feedback err";
    return;
  }
  const key = bayKey(state.selectedRow, state.selectedBay, state.selectedLevel);
  if (qty <= 0) {
    state.counts.delete(key);
  } else {
    state.counts.set(key, { sku, qty });
  }
  $("countFeedback").textContent =
    qty > 0
      ? `Saved ${sku} × ${qty} at ${state.selectedRow} B${state.selectedBay} L${state.selectedLevel}`
      : `Cleared ${state.selectedRow} B${state.selectedBay} L${state.selectedLevel}`;
  $("countFeedback").className = "count-feedback ok";
  renderSearchHits();
  renderBayGrid();
}

function clearBay() {
  if (!state.selectedRow || state.selectedBay == null || state.selectedLevel == null) return;
  const key = bayKey(state.selectedRow, state.selectedBay, state.selectedLevel);
  state.counts.delete(key);
  $("countQtyInput").value = 0;
  $("countFeedback").textContent = `Cleared bay`;
  $("countFeedback").className = "count-feedback ok";
  renderSearchHits();
  renderBayGrid();
}

function resetCounts() {
  if (!state.seedSnapshot) return;
  state.counts = new Map(JSON.parse(state.seedSnapshot));
  renderSearchHits();
  renderBayGrid();
  setStatus("Counts reset to fixture seed");
}

function bindEvents() {
  canvas.addEventListener("click", (e) => {
    const row = pickRack(e.clientX, e.clientY);
    if (row) selectRow(row.name);
    else setStatus("Click a rack to inspect bays");
  });

  $("skuSearchInput").addEventListener("input", (e) => {
    state.search = e.target.value;
    renderSearchHits();
  });

  $("skuChips").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-sku]");
    if (!btn) return;
    state.search = btn.dataset.sku;
    $("skuSearchInput").value = state.search;
    renderSearchHits();
  });

  $("hitList").addEventListener("click", (e) => {
    const card = e.target.closest("[data-key]");
    if (!card) return;
    const [row, bay, level] = card.dataset.key.split("|");
    selectRow(row, Number(bay), Number(level));
  });

  $("bayGrid").addEventListener("click", (e) => {
    const cell = e.target.closest("[data-bay]");
    if (!cell) return;
    state.selectedBay = Number(cell.dataset.bay);
    state.selectedLevel = Number(cell.dataset.level);
    renderBayGrid();
    drawMap();
  });

  $("applyCountBtn").addEventListener("click", applyCount);
  $("clearBayBtn").addEventListener("click", clearBay);
  $("resetCountsBtn").addEventListener("click", resetCounts);

  $("countQtyInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") applyCount();
  });
}

async function boot() {
  try {
    const [mapRes, itemsRes] = await Promise.all([
      fetch("demo-map.json"),
      fetch("demo-items.json"),
    ]);
    if (!mapRes.ok || !itemsRes.ok) {
      throw new Error("Could not load demo fixtures (serve this folder over HTTP).");
    }
    state.map = await mapRes.json();
    const itemsPayload = await itemsRes.json();
    state.items = itemsPayload.items || [];

    seedCountsFromMap(state.map);

    const rowCount = (state.map.rows || []).length;
    const occ = [...state.counts.values()].filter((v) => v.qty > 0).length;
    $("mapMeta").textContent = `${state.map.name} · ${rowCount} racks · ${occ} stocked bays`;
    $("mapTitle").textContent = state.map.name || "Floor overview";

    canvas.width = VIEW.w + PAD;
    canvas.height = VIEW.h + PAD;

    bindEvents();
    renderSearchHits();
    renderBayGrid();
    drawMap();
    setStatus("Ready — click a rack or search a DEMO-* SKU");
  } catch (err) {
    setStatus(err.message || String(err));
    $("mapMeta").textContent = "Load failed";
    $("detailHint").textContent =
      "Open this demo via a local static server so fetch can load the JSON fixtures.";
  }
}

boot();
