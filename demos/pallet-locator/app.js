/* =================================================================
   Cut Palette Locator — Frontend Application
   ================================================================= */

const state = {
  jobs: [],
  reclaimedJobs: [],
  reclaimedMeta: null,
  placements: [],
  jobsFeedStatus: null,
  mapData: { areas: [], landmarks: [], width: 900, height: 500 },
  selectedJob: null,
  selectionPulse: null,
  rackPulse: null,
  hideWip: false,
  jobVisibilityFilter: "all",
  listMode: "upcoming",
  placeMode: null,
  dragState: null,
  panState: null,
  view: { zoom: 1, panX: 0, panY: 0, areaId: "all", fitted: false },
  jobSearch: "",
  undoStack: [],
  jobsManage: { generated_jobs: [], manual_jobs: [] },
  jobEditor: { mode: "create-manual", jobName: "", manualId: "" },
};
let pulseRaf = 0;
const SINGLE_CABINET_RACK_ID = "SINGLE-CABINET-JOBS-RACK";
const SINGLE_CABINET_SLOT_COUNT = 8;
const geometry = window.WarehouseModules && window.WarehouseModules.geometry;

const $ = (id) => document.getElementById(id);
const jobList = $("jobList");
const mapCanvas = $("mapCanvas");
const ctx = mapCanvas.getContext("2d");
const mapStatus = $("mapStatus");
const detailPanel = $("detailPanel");
const jobsFeedWarning = $("jobsFeedWarning");
const hideWipToggle = $("hideWipToggle");
const placeModal = $("placeModal");
const jobFilterSelect = $("jobFilterSelect");
const jobsManageModal = $("jobsManageModal");

async function api(path, opts) {
  const resp = await fetch(path, opts);
  const raw = await resp.text();
  let data = {};
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      data = { error: raw };
    }
  }
  if (!resp.ok) {
    const message = data && typeof data.error === "string"
      ? data.error
      : `Request failed (${resp.status})`;
    throw new Error(message);
  }
  return data;
}
const apiGet = (p) => api(p);
const apiPost = (p, body) =>
  api(p, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

async function loadAll() {
  const [jobs, placements, mapData, jobsFeedStatus, reclaimedMeta] = await Promise.all([
    apiGet("/api/jobs"),
    apiGet("/api/placements"),
    apiGet("/api/map"),
    apiGet("/api/jobs-feed-status").catch(() => null),
    apiGet("/api/reclaimed-jobs").catch((error) => ({ ok: false, jobs: [], error: messageFromError(error) })),
  ]);
  state.jobs = jobs;
  state.placements = placements;
  state.mapData = mapData;
  state.jobsFeedStatus = jobsFeedStatus;
  state.reclaimedMeta = reclaimedMeta;
  state.reclaimedJobs = Array.isArray(reclaimedMeta?.jobs) ? reclaimedMeta.jobs : [];
  render();
}

async function loadJobsManage() {
  state.jobsManage = await apiGet("/api/jobs-manage");
  renderJobsManageModal();
}

function placementFor(jobName) {
  return state.placements.find((p) => placementMatchesJob(p, jobName)) || null;
}

function placementsFor(jobName) {
  return state.placements.filter((p) => placementMatchesJob(p, jobName));
}

function jobFor(jobName) {
  return state.jobs.find((j) => j.job_name === jobName) || null;
}

function reclaimedJobFor(jobName) {
  const target = String(jobName || "").trim().toLowerCase();
  return state.reclaimedJobs.find((job) => String(job.po_number || "").trim().toLowerCase() === target) || null;
}

function normalizeReclaimedCabinet(raw, fallbackJob = "", fallbackOccurrence = 1) {
  if (!raw || typeof raw !== "object") return null;
  const jobName = String(raw.job_name || raw.po_number || fallbackJob || "").trim();
  const itemNumber = String(raw.item_number || raw.item || "").trim().toUpperCase();
  const occurrence = Math.max(1, Number(raw.occurrence || fallbackOccurrence || 1));
  const cabinetId = String(
    raw.cabinet_id || raw.selected_key || raw.id ||
    (jobName && itemNumber ? `${jobName}::${itemNumber}::${occurrence}` : "")
  ).trim();
  if (!cabinetId || !jobName || !itemNumber) return null;
  return {
    cabinet_id: cabinetId,
    job_name: jobName,
    item_number: itemNumber,
    occurrence,
    quantity: Math.max(1, Number(raw.quantity || 1)),
  };
}

function reclaimedCabinetsForJob(job) {
  if (!job) return [];
  const jobName = String(job.po_number || "").trim();
  const supplied = Array.isArray(job.cabinets)
    ? job.cabinets.map((entry) => normalizeReclaimedCabinet(entry, jobName)).filter(Boolean)
    : [];
  if (supplied.length) return supplied;

  const totals = new Map();
  (job.items || []).forEach((item) => {
    const key = String(item || "").trim().toUpperCase();
    if (key) totals.set(key, (totals.get(key) || 0) + 1);
  });
  const seen = new Map();
  return (job.items || []).map((item) => {
    const key = String(item || "").trim().toUpperCase();
    const occurrence = (seen.get(key) || 0) + 1;
    seen.set(key, occurrence);
    return normalizeReclaimedCabinet(
      { item_number: key, occurrence, quantity: totals.get(key) || 1 },
      jobName,
      occurrence
    );
  }).filter(Boolean);
}

function allReclaimedCabinets() {
  return (state.reclaimedJobs || []).flatMap((job) => reclaimedCabinetsForJob(job));
}

function placementReclaimedCabinets(placement) {
  if (!placement || !Array.isArray(placement.reclaimed_cabinets)) return [];
  return placement.reclaimed_cabinets
    .map((entry) => normalizeReclaimedCabinet(entry))
    .filter(Boolean);
}

function placementForCabinet(cabinetId) {
  const target = String(cabinetId || "").trim().toLowerCase();
  if (!target) return null;
  return state.placements.find((placement) => {
    return placementReclaimedCabinets(placement)
      .some((cabinet) => cabinet.cabinet_id.toLowerCase() === target);
  }) || null;
}

function reclaimedCabinetForId(cabinetId) {
  const target = String(cabinetId || "").trim().toLowerCase();
  if (!target) return null;
  return allReclaimedCabinets()
    .find((cabinet) => cabinet.cabinet_id.toLowerCase() === target) || null;
}

function reclaimedCabinetLabel(cabinet) {
  if (!cabinet) return "Cabinet";
  return Number(cabinet.quantity || 1) > 1
    ? `${cabinet.item_number} #${cabinet.occurrence}`
    : cabinet.item_number;
}

function reclaimedPlacementLabel(placement, fallbackIndex = 0) {
  const cabinets = placementReclaimedCabinets(placement);
  if (cabinets.length) {
    const labels = cabinets.map((cabinet) => reclaimedCabinetLabel(cabinet));
    return labels.length <= 2 ? labels.join(" + ") : `${labels[0]} + ${labels.length - 1} more`;
  }
  return `Legacy pallet ${fallbackIndex + 1}`;
}

function searchNeedle() {
  return String(state.jobSearch || "").trim().toLowerCase();
}

function textMatchesSearch(value) {
  const needle = searchNeedle();
  if (!needle) return true;
  return String(value || "").toLowerCase().includes(needle);
}

function jobMatchesSearch(job) {
  if (!job) return false;
  if (textMatchesSearch(job.job_name) || textMatchesSearch(job.customer)) return true;
  return placementsFor(job.job_name).some((placement) => {
    return placementJobNames(placement).some((name) => textMatchesSearch(name))
      || placementReclaimedCabinets(placement).some((cabinet) => textMatchesSearch(reclaimedCabinetLabel(cabinet)));
  });
}

function reclaimedJobMatchesSearch(job) {
  if (!job) return false;
  if (textMatchesSearch(job.po_number) || textMatchesSearch(job.customer)) return true;
  return reclaimedCabinetsForJob(job).some((cabinet) => textMatchesSearch(reclaimedCabinetLabel(cabinet)));
}

function filteredJobs() {
  let items = Array.isArray(state.jobs) ? [...state.jobs] : [];
  if (state.jobVisibilityFilter === "active") {
    items = items.filter((entry) => !entry.is_orphaned);
  } else if (state.jobVisibilityFilter === "orphaned") {
    items = items.filter((entry) => !!entry.is_orphaned);
  }
  if (searchNeedle()) items = items.filter(jobMatchesSearch);
  return items;
}

function canonicalJobNames(values) {
  const seen = new Set();
  const out = [];
  for (const value of values || []) {
    const text = String(value || "").trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

function placementJobNames(placement) {
  if (!placement) return [];
  const names = Array.isArray(placement.job_names) ? placement.job_names : [];
  return canonicalJobNames([...names, placement.job_name]);
}

function placementPrimaryJob(placement) {
  return placementJobNames(placement)[0] || "";
}

function placementMatchesJob(placement, jobName) {
  const target = String(jobName || "").trim().toLowerCase();
  if (!target) return false;
  return placementJobNames(placement).some((name) => name.toLowerCase() === target);
}

function knownPurchaseOrderNames() {
  const fromJobs = (state.jobs || []).map((entry) => String(entry.job_name || "").trim());
  const fromReclaimed = (state.reclaimedJobs || []).map((entry) => String(entry.po_number || "").trim());
  return canonicalJobNames([...fromJobs, ...fromReclaimed]);
}

//: A pallet marker is a fixed 36 square. That is right when a job sits on open
//: floor, and wrong wherever pallets are butted against each other: the marker
//: is then wider than the gap to its neighbour, so each box is drawn over the
//: next one's label and a whole run reads as one smear. These cap a marker at
//: the room it actually has, so a butted run tiles instead of piling up.
const MARKER_BASE = 36;
const MARKER_MIN = 7;
let markerFootprintCache = { key: "", sizes: new Map() };

function markerFootprints(placements) {
  const key = placements.map((p) => `${p.id}:${p.x}:${p.y}`).join("|");
  if (markerFootprintCache.key === key) return markerFootprintCache.sizes;
  const sizes = new Map();
  for (const p of placements) {
    if (p.is_single_cabinet_rack) continue;
    let gapX = Infinity;
    let gapY = Infinity;
    for (const q of placements) {
      if (q === p || q.is_single_cabinet_rack) continue;
      const dx = Math.abs(Number(q.x || 0) - Number(p.x || 0));
      const dy = Math.abs(Number(q.y || 0) - Number(p.y || 0));
      // Far enough on both axes to never touch.
      if (dx >= MARKER_BASE && dy >= MARKER_BASE) continue;
      // Constrain only the axis the neighbour actually sits along. Pallets get
      // nudged a few units off their row by hand, and reading a 4-unit wobble
      // as "stacked" would shrink a whole side-by-side row to nothing.
      if (dx > dy) gapX = Math.min(gapX, dx);
      else if (dy > dx) gapY = Math.min(gapY, dy);
    }
    sizes.set(p.id, {
      width: Math.max(MARKER_MIN, Math.min(MARKER_BASE, gapX)),
      height: Math.max(MARKER_MIN, Math.min(MARKER_BASE, gapY)),
    });
  }
  markerFootprintCache = { key, sizes };
  return sizes;
}

function markerDimensions(placement, scale = 1) {
  if (placement && placement.is_single_cabinet_rack) {
    const baseW = Number(placement.rack_width || placement.width || 104);
    const baseH = Number(placement.rack_height || placement.height || 64);
    return {
      width: Math.max(70, baseW * scale),
      height: Math.max(40, baseH * scale),
    };
  }
  if (placement && placement.is_single_cabinet) {
    // Keep it visibly distinct and easy to grab while still smaller than pallets.
    return {
      width: Math.max(24, 30 * scale),
      height: Math.max(10, 14 * scale),
    };
  }
  const fitted = markerFootprints(state.placements || []).get(placement && placement.id);
  const width = (fitted ? fitted.width : MARKER_BASE) * scale;
  const height = (fitted ? fitted.height : MARKER_BASE) * scale;
  return { width, height };
}

function isSingleCabinetRackRow(row) {
  const rowId = String(row?.id || "").trim();
  return rowId === SINGLE_CABINET_RACK_ID;
}

function singleCabinetRack() {
  return state.placements.find((entry) => !!entry.is_single_cabinet_rack) || null;
}

function nextSingleCabinetSpot() {
  const rack = singleCabinetRack();
  if (!rack) return null;
  const slots = Math.max(1, SINGLE_CABINET_SLOT_COUNT);
  const usedPoints = state.placements
    .filter((entry) => !!entry.is_single_cabinet && !entry.is_single_cabinet_rack)
    .map((entry) => ({ x: Number(entry.x) || 0, y: Number(entry.y) || 0 }));
  const candidatePoints = [];
  const rackWidth = Number(rack.rack_width || rack.width || 104);
  const rackHeight = Number(rack.rack_height || rack.height || 64);
  if (String(rack.orientation || "").toLowerCase() === "vertical") {
    const centerX = rack.x;
    const spacingY = rackHeight / (slots + 1);
    for (let idx = 0; idx < slots; idx++) {
      candidatePoints.push({ x: centerX, y: (rack.y - rackHeight / 2) + spacingY * (idx + 1) });
    }
  } else {
    const centerY = rack.y;
    const spacingX = rackWidth / (slots + 1);
    for (let idx = 0; idx < slots; idx++) {
      candidatePoints.push({ x: (rack.x - rackWidth / 2) + spacingX * (idx + 1), y: centerY });
    }
  }
  let chosen = candidatePoints[candidatePoints.length - 1];
  for (const point of candidatePoints) {
    const occupied = usedPoints.some((used) => {
      return Math.abs(used.x - point.x) < 26 && Math.abs(used.y - point.y) < 26;
    });
    if (!occupied) {
      chosen = point;
      break;
    }
  }
  const area = rack.area || mapAreaAt(chosen.x, chosen.y) || "Cut";
  return { x: Math.round(chosen.x), y: Math.round(chosen.y), area };
}

function startSingleCabinetRackPulse(jobName) {
  const placement = placementFor(jobName);
  if (!placement || !placement.is_single_cabinet) return;
  const rack = singleCabinetRack();
  if (!rack) return;
  state.rackPulse = {
    rackPlacementId: String(rack.id || SINGLE_CABINET_RACK_ID),
    startedAtMs: performance.now(),
    durationMs: 1100,
  };
  ensurePulseAnimation();
}

function startSelectionPulse(jobName) {
  const name = String(jobName || "").trim();
  if (!name) return;
  state.selectionPulse = {
    jobName: name,
    startedAtMs: performance.now(),
    durationMs: 1000,
  };
  ensurePulseAnimation();
}

function startPlacementPulse(placementId) {
  const id = String(placementId || "").trim();
  if (!id) return;
  state.selectionPulse = {
    placementId: id,
    startedAtMs: performance.now(),
    durationMs: 1000,
  };
  ensurePulseAnimation();
}

function pulseStrengthForPlacement(placement, nowMs) {
  const pulse = state.selectionPulse;
  if (!pulse) return 0;
  if (pulse.placementId) {
    if (String(placement.id || "") !== pulse.placementId) return 0;
  } else if (!placementMatchesJob(placement, pulse.jobName)) {
    return 0;
  }
  const elapsed = nowMs - pulse.startedAtMs;
  if (elapsed < 0 || elapsed > pulse.durationMs) return 0;
  const t = elapsed / pulse.durationMs;
  const wave = Math.max(0, Math.sin(t * Math.PI * 6));
  const fade = 1 - t;
  return wave * fade;
}

function pulseStrengthForRackPlacement(placement, nowMs) {
  const pulse = state.rackPulse;
  if (!pulse || !placement || !placement.is_single_cabinet_rack) return 0;
  if (String(placement.id || "") !== String(pulse.rackPlacementId || "")) return 0;
  const elapsed = nowMs - pulse.startedAtMs;
  if (elapsed < 0 || elapsed > pulse.durationMs) return 0;
  const t = elapsed / pulse.durationMs;
  const wave = Math.max(0, Math.sin(t * Math.PI * 6));
  const fade = 1 - t;
  return wave * fade;
}

function ensurePulseAnimation() {
  if (pulseRaf) return;
  const tick = (nowMs) => {
    const selectionPulse = state.selectionPulse;
    const rackPulse = state.rackPulse;
    if (!selectionPulse && !rackPulse) {
      pulseRaf = 0;
      return;
    }
    if (selectionPulse && (nowMs - selectionPulse.startedAtMs) >= selectionPulse.durationMs) {
      state.selectionPulse = null;
    }
    if (rackPulse && (nowMs - rackPulse.startedAtMs) >= rackPulse.durationMs) {
      state.rackPulse = null;
    }
    if (!state.selectionPulse && !state.rackPulse) {
      pulseRaf = 0;
      renderMap();
      return;
    }
    renderMap();
    pulseRaf = requestAnimationFrame(tick);
  };
  pulseRaf = requestAnimationFrame(tick);
}

function formatTimestamp(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

//: Pallets Cut has finished are grouped by their scheduled departure, which is
//: when the floor comes to collect them. Only those the snapshot cannot date
//: get a bucket of their own.
const UNDATED_GROUP = "On Floor - No Departure Date";

function groupJobsByDate(jobs) {
  const groups = {};
  for (const j of jobs) {
    const key = j.group_label || j.po_date || "Unknown";
    if (!groups[key]) groups[key] = [];
    groups[key].push(j);
  }
  // Undated pallets sort last: everything else is a real departure date and
  // reads in the order the floor will work it.
  return Object.entries(groups).sort(([a], [b]) => {
    if (a === UNDATED_GROUP) return 1;
    if (b === UNDATED_GROUP) return -1;
    return a.localeCompare(b);
  });
}

function dayLabel(dateStr) {
  if (dateStr === UNDATED_GROUP) return dateStr;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + "T00:00:00");
  const diff = Math.round((d - today) / 86400000);
  const formatted = d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  if (diff === 0) return `Today — ${formatted}`;
  if (diff === 1) return `Tomorrow — ${formatted}`;
  if (diff === -1) return `Yesterday — ${formatted}`;
  if (diff > 0) return `In ${diff} days — ${formatted}`;
  return formatted;
}

function escapeHtml(s) {
  const el = document.createElement("span");
  el.textContent = s;
  return el.innerHTML;
}

function messageFromError(error, fallback = "Request failed") {
  const text = String(error?.message || "").trim();
  return text || fallback;
}

function renderJobList() {
  if (state.listMode === "reclaimed") {
    renderReclaimedJobList();
    return;
  }
  $("jobPanelSummary").textContent = "Upcoming jobs";
  const groups = groupJobsByDate(filteredJobs());
  let html = "";

  for (const [date, jobs] of groups) {
    const visibleJobs = state.hideWip
      ? jobs.filter((j) => {
          const p = placementFor(j.job_name);
          return !p || !p.is_wip;
        })
      : jobs;

    if (visibleJobs.length === 0 && state.hideWip) continue;

    html += `<div class="day-group">`;
    html += `<div class="day-header"><span class="day-label">${escapeHtml(dayLabel(date))}</span><span class="day-count">(${visibleJobs.length})</span></div>`;

    for (const j of visibleJobs) {
      const placement = placementFor(j.job_name);
      const isPaint = placement ? placement.is_paint_job : j.is_paint_job;
      const isWip = placement ? placement.is_wip : false;
      const selected = state.selectedJob === j.job_name;
      const placed = !!placement;

      const classes = [
        "job-bubble",
        isPaint ? "paint" : "no-paint",
        isWip ? "wip" : "",
        selected ? "selected" : "",
      ].filter(Boolean).join(" ");

      html += `<div class="${classes}" data-job="${escapeHtml(j.job_name)}" draggable="true">`;
      html += `<span class="job-dot ${isPaint ? "paint" : "no-paint"}"></span>`;
      html += `<div class="job-bubble-info">`;
      html += `<div class="job-bubble-name">${escapeHtml(j.job_name)}</div>`;
      html += `<div class="job-bubble-customer">${escapeHtml(j.customer || "")}</div>`;
      html += `</div>`;
      // No badge for a staged pallet: it is grouped under its departure date
      // like everything else, and "orphaned" described the feed, not the work.
      if (j.source === "manual") html += `<span class="job-badge manual">Manual</span>`;
      if (isWip) html += `<span class="wip-badge">WIP</span>`;
      if (placed) html += `<span class="placed-indicator" title="Placed on map"></span>`;
      html += `</div>`;
    }
    html += `</div>`;
  }

  if (!html) {
    html = `<p style="padding:16px;color:#64748b;font-size:13px;">No jobs to display.</p>`;
  }

  jobList.innerHTML = html;
  jobList.querySelectorAll(".job-bubble").forEach((el) => {
    el.addEventListener("click", () => selectJob(el.dataset.job, { fromList: true }));
    wireJobDrag(el);
  });
}

function renderReclaimedJobList() {
  const meta = state.reclaimedMeta || {};
  const jobs = (state.reclaimedJobs || []).filter((job) => !searchNeedle() || reclaimedJobMatchesSearch(job));
  const summary = $("jobPanelSummary");
  if (meta.ok === false) {
    summary.textContent = "Reclaimed list unavailable";
  } else {
    summary.textContent = `${jobs.length} reclaimed job${jobs.length === 1 ? "" : "s"} · ${Number(meta.item_count || 0)} cabinet${Number(meta.item_count || 0) === 1 ? "" : "s"}`;
  }
  if (!jobs.length) {
    const message = meta.ok === false
      ? escapeHtml(meta.error || "Could not load reclaimed cabinets.")
      : "No reclaimed jobs are currently on file.";
    jobList.innerHTML = `<p class="job-list-empty">${message}</p>`;
    return;
  }
  jobList.innerHTML = jobs.map((job) => {
    const jobName = String(job.po_number || "").trim();
    const placed = placementsFor(jobName);
    const cabinets = reclaimedCabinetsForJob(job);
    const placedCount = cabinets.filter((cabinet) => !!placementForCabinet(cabinet.cabinet_id)).length;
    const legacyCount = placed.filter((placement) => !placementReclaimedCabinets(placement).length).length;
    const selected = state.selectedJob === jobName;
    const date = job.sched_departure_date || job.firm_date || "No date";
    const placementBadge = legacyCount
      ? `${placedCount}/${cabinets.length} placed + legacy`
      : `${placedCount}/${cabinets.length} placed`;
    return `
      <div class="job-bubble reclaimed ${selected ? "selected" : ""}" data-job="${escapeHtml(jobName)}" draggable="true">
        <span class="job-dot reclaimed-dot"></span>
        <div class="job-bubble-info">
          <div class="job-bubble-name">${escapeHtml(jobName)}</div>
          <div class="job-bubble-customer">${Number(job.count || 0)} cabinet${Number(job.count || 0) === 1 ? "" : "s"} · ${escapeHtml(date)}</div>
        </div>
        <span class="job-badge reclaimed-badge">${placementBadge}</span>
      </div>`;
  }).join("");
  jobList.querySelectorAll(".job-bubble.reclaimed").forEach((el) => {
    el.addEventListener("click", () => selectJob(el.dataset.job, { fromList: true }));
    wireJobDrag(el);
  });
}

const DPR = window.devicePixelRatio || 1;
let canvasCssW = 900;
let canvasCssH = 500;
const VIEW_MIN_ZOOM = 0.08;
const VIEW_MAX_ZOOM = 8;

function viewportSize() {
  const host = $("mapScroll") || $("mapPanel");
  return {
    width: Math.max(1, host.clientWidth || 1),
    height: Math.max(1, host.clientHeight || 1),
  };
}

function clonePlacement(placement) {
  return JSON.parse(JSON.stringify(placement || {}));
}

function syncUndoButton() {
  const btn = $("undoBtn");
  if (!btn) return;
  btn.disabled = !state.undoStack.length;
  btn.title = state.undoStack.length
    ? "Undo last place, move, or delete (Ctrl+Z)"
    : "Nothing to undo";
}

function pushUndo(entry) {
  if (!entry) return;
  state.undoStack.push(entry);
  if (state.undoStack.length > 40) state.undoStack.shift();
  syncUndoButton();
}

function viewTransform() {
  return { zoom: state.view.zoom, panX: state.view.panX, panY: state.view.panY };
}

function eventToWorld(e) {
  const rect = mapCanvas.getBoundingClientRect();
  const screen = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  if (geometry && geometry.screenToWorld) {
    return geometry.screenToWorld(screen, viewTransform());
  }
  return {
    x: (screen.x - state.view.panX) / state.view.zoom,
    y: (screen.y - state.view.panY) / state.view.zoom,
  };
}

function applyView(next) {
  const mapW = state.mapData.width || 900;
  const mapH = state.mapData.height || 500;
  let transform = {
    zoom: Number(next.zoom || state.view.zoom) || 1,
    panX: Number(next.panX ?? state.view.panX) || 0,
    panY: Number(next.panY ?? state.view.panY) || 0,
  };
  if (geometry && geometry.clampPanWithin) {
    transform = geometry.clampPanWithin(
      transform,
      { width: mapW, height: mapH },
      viewportSize(),
      { margin: 80 }
    );
  }
  state.view.zoom = transform.zoom;
  state.view.panX = transform.panX;
  state.view.panY = transform.panY;
}

function fitRect(rect, extra = {}) {
  if (!rect || !geometry || !geometry.fitTransform) {
    state.view.zoom = 1;
    state.view.panX = 20;
    state.view.panY = 20;
    return;
  }
  const fitted = geometry.fitTransform(rect, viewportSize(), {
    margin: extra.margin ?? 36,
    minZoom: VIEW_MIN_ZOOM,
    maxZoom: VIEW_MAX_ZOOM,
  });
  if (!fitted) return;
  applyView(fitted);
  state.view.fitted = true;
}

function areaById(areaId) {
  const target = String(areaId || "").trim().toLowerCase();
  return (state.mapData.areas || []).find((area) => {
    const id = String(area.id || area.label || "").trim().toLowerCase();
    return id === target;
  }) || null;
}

function fitAllAreas() {
  const mapW = state.mapData.width || 900;
  const mapH = state.mapData.height || 500;
  fitRect({ x: 0, y: 0, width: mapW, height: mapH }, { margin: 28 });
  state.view.areaId = "all";
}

function fitNamedArea(areaId) {
  const area = areaById(areaId);
  if (!area) {
    fitAllAreas();
    return;
  }
  fitRect({ x: area.x, y: area.y, width: area.width, height: area.height }, { margin: 28 });
  state.view.areaId = String(area.id || area.label || areaId);
}

function fitToPlacement(placement) {
  if (!placement) return;
  const dims = markerDimensions(placement, 1);
  const pad = Math.max(90, dims.width * 3, dims.height * 3);
  fitRect({ x: placement.x - pad, y: placement.y - pad, width: pad * 2, height: pad * 2 }, { margin: 48 });
}

function renderAreaTabs() {
  const toolbar = $("mapToolbar");
  if (!toolbar) return;
  const areas = state.mapData.areas || [];
  const current = String(state.view.areaId || "all");
  const buttons = [`<button class="area-tab ${current === "all" ? "active" : ""}" type="button" data-area="all">All areas</button>`];
  areas.forEach((area) => {
    const id = String(area.id || area.label || "").trim();
    if (!id) return;
    const active = current.toLowerCase() === id.toLowerCase() ? "active" : "";
    buttons.push(`<button class="area-tab ${active}" type="button" data-area="${escapeHtml(id)}">${escapeHtml(area.label || id)}</button>`);
  });
  toolbar.innerHTML = buttons.join("");
  toolbar.querySelectorAll(".area-tab").forEach((button) => {
    button.addEventListener("click", () => {
      const areaId = button.dataset.area || "all";
      if (areaId === "all") fitAllAreas();
      else fitNamedArea(areaId);
      renderAreaTabs();
      renderMap();
    });
  });
}

function sizeCanvas() {
  const size = viewportSize();
  canvasCssW = size.width;
  canvasCssH = size.height;
  mapCanvas.width = Math.max(1, Math.floor(canvasCssW * DPR));
  mapCanvas.height = Math.max(1, Math.floor(canvasCssH * DPR));
  mapCanvas.style.width = canvasCssW + "px";
  mapCanvas.style.height = canvasCssH + "px";
  if (!state.view.fitted && (state.mapData.width || 0) > 0) {
    const preferred = String(state.view.areaId || "all");
    if (preferred !== "all") fitNamedArea(preferred);
    else fitAllAreas();
  }
}

function entityRectFor(type, entity) {
  if (geometry) return geometry.entityRect(type, entity);
  return {
    x: Number(entity.x || 0),
    y: Number(entity.y || 0),
    width: Number(entity.width || 1),
    height: Number(entity.height || 1),
    rotation: Number(entity.rotation || 0),
  };
}

function withEntityRect(type, entity, scale, draw) {
  const rect = entityRectFor(type, entity);
  const x = rect.x * scale;
  const y = rect.y * scale;
  const w = rect.width * scale;
  const h = rect.height * scale;
  ctx.save();
  if (rect.rotation) {
    const cx = x + w / 2;
    const cy = y + h / 2;
    ctx.translate(cx, cy);
    ctx.rotate((rect.rotation * Math.PI) / 180);
    ctx.translate(-cx, -cy);
  }
  draw({ x, y, w, h, rect });
  ctx.restore();
  return { x, y, w, h, rect };
}

function renderMap() {
  sizeCanvas();
  const map = state.mapData;
  const nowMs = performance.now();
  const scale = 1;

  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(0, 0, canvasCssW, canvasCssH);
  ctx.setTransform(
    DPR * state.view.zoom,
    0,
    0,
    DPR * state.view.zoom,
    DPR * state.view.panX,
    DPR * state.view.panY
  );

  for (const area of map.areas || []) {
    const x = area.x * scale;
    const y = area.y * scale;
    const w = area.width * scale;
    const h = area.height * scale;
    ctx.fillStyle = area.color || "#e0e7ff";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = "#1e3a8a";
    ctx.font = `bold ${Math.max(11, 14 * scale)}px 'Segoe UI', sans-serif`;
    ctx.fillText(area.label || area.id, x + 8 * scale, y + 18 * scale);
  }

  for (const ns of map.null_spaces || []) {
    const drawn = withEntityRect("null_space", ns, scale, ({ x, y, w, h }) => {
      ctx.fillStyle = ns.color || "#e5e7eb";
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = "#9ca3af";
      ctx.lineWidth = 1;
      ctx.setLineDash(ns.stripe && ns.stripe !== "none" ? [5 * scale, 4 * scale] : []);
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);
    });
    ctx.fillStyle = "#374151";
    ctx.font = `${Math.max(9, 10 * scale)}px 'Segoe UI', sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(ns.label || "", drawn.x + drawn.w / 2, drawn.y + drawn.h / 2 + 4 * scale);
    ctx.textAlign = "start";
  }

  for (const zone of map.zones || []) {
    const drawn = withEntityRect("zone", zone, scale, ({ x, y, w, h }) => {
      ctx.fillStyle = "#dcfce7";
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = "#16a34a";
      ctx.lineWidth = 1.2 * scale;
      ctx.strokeRect(x, y, w, h);
    });
    ctx.fillStyle = "#166534";
    ctx.font = `bold ${Math.max(8, 10 * scale)}px 'Segoe UI', sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(zone.label || zone.id || "", drawn.x + drawn.w / 2, drawn.y + drawn.h / 2);
    ctx.textAlign = "start";
  }

  for (const row of map.rows || []) {
    const drawn = withEntityRect("row", row, scale, ({ x, y, w, h }) => {
      ctx.fillStyle = "#dbeafe";
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = "#2563eb";
      ctx.lineWidth = 1.5 * scale;
      ctx.strokeRect(x, y, w, h);
      const bays = Math.max(1, Number(row.bay_count || 1));
      ctx.strokeStyle = "rgba(37, 99, 235, 0.42)";
      ctx.lineWidth = Math.max(0.5, 0.7 * scale);
      for (let bay = 1; bay < bays; bay += 1) {
        ctx.beginPath();
        if (row.orientation === "vertical") {
          const dividerY = y + (h * bay) / bays;
          ctx.moveTo(x, dividerY);
          ctx.lineTo(x + w, dividerY);
        } else {
          const dividerX = x + (w * bay) / bays;
          ctx.moveTo(dividerX, y);
          ctx.lineTo(dividerX, y + h);
        }
        ctx.stroke();
      }
    });
    ctx.fillStyle = "#1e3a8a";
    const fontSize = Math.max(8, Math.min(10, drawn.w / 6, drawn.h / 3)) * scale;
    ctx.font = `bold ${fontSize}px 'Segoe UI', sans-serif`;
    ctx.textAlign = "center";
    const labelY = drawn.y + drawn.h / 2 + fontSize / 3;
    ctx.fillText(row.label || row.id, drawn.x + drawn.w / 2, labelY);
    ctx.textAlign = "start";
  }

  for (const sp of map.slotted_pallets || []) {
    const drawn = withEntityRect("slotted_pallet", sp, scale, ({ x, y, w, h }) => {
      ctx.fillStyle = "#fef3c7";
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = "#f59e0b";
      ctx.lineWidth = 1.5 * scale;
      ctx.strokeRect(x, y, w, h);
    });
    ctx.fillStyle = "#92400e";
    const spFontSize = Math.max(8, Math.min(10, drawn.w / 8)) * scale;
    ctx.font = `bold ${spFontSize}px 'Segoe UI', sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(sp.label || sp.id, drawn.x + drawn.w / 2, drawn.y + 14 * scale);
    ctx.textAlign = "start";
  }

  for (const label of map.labels || []) {
    ctx.fillStyle = label.color || "#0f172a";
    ctx.font = `bold ${Math.max(9, Number(label.font_size || label.label_size || 12) * scale)}px 'Segoe UI', sans-serif`;
    ctx.fillText(label.text || label.label || "", Number(label.x || 0) * scale, Number(label.y || 0) * scale);
  }

  const visiblePlacements = state.hideWip
    ? state.placements.filter((p) => !p.is_wip)
    : state.placements;

  for (const p of visiblePlacements) {
    drawPallet(p, scale, placementMatchesJob(p, state.selectedJob), nowMs);
  }
}

function drawPallet(p, scale, isSelected, nowMs) {
  const jobs = placementJobNames(p);
  const isMixed = jobs.length > 1;
  const dims = markerDimensions(p, scale);
  const width = dims.width;
  const height = dims.height;
  const x = p.x * scale - width / 2;
  const y = p.y * scale - height / 2;
  const r = Math.max(2 * scale, Math.min(width, height) * 0.16);
  const pulseStrength = pulseStrengthForPlacement(p, nowMs);
  const rackPulse = pulseStrengthForRackPlacement(p, nowMs);

  if (p.is_single_cabinet_rack) {
    if (rackPulse > 0) {
      const alpha = 0.28 + rackPulse * 0.48;
      ctx.fillStyle = `rgba(14, 165, 233, ${alpha.toFixed(3)})`;
    } else {
      ctx.fillStyle = "#0ea5e9";
    }
    ctx.fillRect(x, y, width, height);
    ctx.strokeStyle = rackPulse > 0 ? "#0284c7" : "#0369a1";
    ctx.lineWidth = (rackPulse > 0 ? (2.2 + rackPulse * 2.2) : 1.8) * scale;
    ctx.strokeRect(x, y, width, height);
    if (rackPulse > 0) {
      ctx.save();
      ctx.strokeStyle = `rgba(2, 132, 199, ${(0.35 + rackPulse * 0.45).toFixed(3)})`;
      ctx.lineWidth = (3 + rackPulse * 3) * scale;
      ctx.strokeRect(x - 2 * scale, y - 2 * scale, width + 4 * scale, height + 4 * scale);
      ctx.restore();
    }
    ctx.fillStyle = "#0f172a";
    const fontSize = Math.max(8, Math.min(12, width / 5.5, height / 2.8)) * scale;
    ctx.font = `bold ${fontSize}px 'Segoe UI', sans-serif`;
    ctx.textAlign = "center";
    const lines = ["Single", "Cabinet", "Jobs"];
    const lineHeight = fontSize * 1.12;
    const startY = y + (height / 2) - lineHeight;
    lines.forEach((line, idx) => {
      ctx.fillText(line, x + width / 2, startY + idx * lineHeight);
    });
    ctx.textAlign = "start";
    return;
  }

  if (isSelected) {
    ctx.save();
    ctx.shadowColor = "rgba(37,99,235,0.5)";
    ctx.shadowBlur = 12 * scale;
    ctx.fillStyle = "transparent";
    ctx.fillRect(x, y, width, height);
    ctx.restore();
  }

  ctx.fillStyle = p.is_single_cabinet ? "#bfdbfe" : (p.is_paint_job ? "#bbf7d0" : "#ffffff");
  ctx.beginPath();
  roundRect(ctx, x, y, width, height, r);
  ctx.fill();

  if (p.is_wip) {
    ctx.strokeStyle = "#f97316";
    ctx.lineWidth = 3 * scale;
  } else if (isSelected) {
    ctx.strokeStyle = "#2563eb";
    ctx.lineWidth = 2.5 * scale;
  } else if (p.is_single_cabinet) {
    ctx.strokeStyle = "#2563eb";
    ctx.lineWidth = 1.6 * scale;
  } else {
    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 1 * scale;
  }
  ctx.beginPath();
  roundRect(ctx, x, y, width, height, r);
  ctx.stroke();

  if (pulseStrength > 0) {
    ctx.save();
    const pad = (5 + pulseStrength * 12) * scale;
    const alpha = 0.18 + pulseStrength * 0.42;
    ctx.strokeStyle = `rgba(37, 99, 235, ${alpha.toFixed(3)})`;
    ctx.lineWidth = (1.5 + pulseStrength * 2) * scale;
    ctx.beginPath();
    roundRect(ctx, x - pad, y - pad, width + pad * 2, height + pad * 2, r + pad);
    ctx.stroke();
    ctx.restore();
  }

  ctx.strokeStyle = p.is_single_cabinet ? "#1d4ed8" : (p.is_paint_job ? "#15803d" : "#64748b");
  ctx.lineWidth = 1 * scale;
  if (p.is_single_cabinet) {
    // Give single-cabinet jobs a strong horizontal rectangular identity.
    ctx.fillStyle = "rgba(30, 64, 175, 0.10)";
    ctx.fillRect(x + 1 * scale, y + 1 * scale, width - 2 * scale, height - 2 * scale);
    const iconPadX = 4 * scale;
    const iconPadY = 3 * scale;
    ctx.beginPath();
    ctx.moveTo(x + iconPadX, y + height * 0.5);
    ctx.lineTo(x + width - iconPadX, y + height * 0.5);
    ctx.moveTo(x + width * 0.33, y + iconPadY);
    ctx.lineTo(x + width * 0.33, y + height - iconPadY);
    ctx.moveTo(x + width * 0.66, y + iconPadY);
    ctx.lineTo(x + width * 0.66, y + height - iconPadY);
    ctx.stroke();
  } else {
    const pad = 6 * scale;
    ctx.beginPath();
    ctx.moveTo(x + pad, y + height * 0.35);
    ctx.lineTo(x + width - pad, y + height * 0.35);
    ctx.moveTo(x + pad, y + height * 0.55);
    ctx.lineTo(x + width - pad, y + height * 0.55);
    ctx.moveTo(x + pad, y + height * 0.75);
    ctx.lineTo(x + width - pad, y + height * 0.75);
    ctx.stroke();
  }

  const reclaimedCabinets = placementReclaimedCabinets(p);
  let label = isMixed ? `MIX x${jobs.length}` : shortJobName(placementPrimaryJob(p) || p.job_name);
  if (p.is_reclaimed && reclaimedCabinets.length) {
    label = reclaimedCabinets.length > 1
      ? `MIX x${reclaimedCabinets.length}`
      : reclaimedCabinetLabel(reclaimedCabinets[0]);
  }
  ctx.fillStyle = isSelected ? "#1e40af" : "#475569";
  ctx.font = `bold ${Math.max(8, 9 * scale)}px 'Segoe UI', sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText(label, x + width / 2, y + height + 12 * scale);
  ctx.textAlign = "start";

  if (p.is_wip) {
    const tagW = 24 * scale;
    const tagH = 10 * scale;
    const tagX = x + width / 2 - tagW / 2;
    const tagY = y - 14 * scale;
    ctx.fillStyle = "#fb923c";
    ctx.beginPath();
    roundRect(ctx, tagX, tagY, tagW, tagH, 3 * scale);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = `bold ${Math.max(7, 7 * scale)}px 'Segoe UI', sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("WIP", tagX + tagW / 2, tagY + tagH - 2.5 * scale);
    ctx.textAlign = "start";
  }
}

function shortJobName(name) {
  const parts = name.split("-");
  if (parts.length > 2) return parts.slice(2).join("-");
  return name;
}

function roundRect(c, x, y, w, h, r) {
  c.moveTo(x + r, y);
  c.lineTo(x + w - r, y);
  c.arcTo(x + w, y, x + w, y + r, r);
  c.lineTo(x + w, y + h - r);
  c.arcTo(x + w, y + h, x + w - r, y + h, r);
  c.lineTo(x + r, y + h);
  c.arcTo(x, y + h, x, y + h - r, r);
  c.lineTo(x, y + r);
  c.arcTo(x, y, x + r, y, r);
  c.closePath();
}

function renderDetail() {
  if (!state.selectedJob) {
    detailPanel.classList.add("hidden");
    return;
  }

  const job = jobFor(state.selectedJob);
  const reclaimedJob = reclaimedJobFor(state.selectedJob);
  const matchingPlacements = placementsFor(state.selectedJob);
  const p = matchingPlacements[0] || null;
  const palletJobs = placementJobNames(p);
  const reclaimedCabinets = reclaimedCabinetsForJob(reclaimedJob);
  detailPanel.classList.remove("hidden");
  $("detailJobName").textContent = state.selectedJob;

  let metaHtml = "";
  if (job) {
    metaHtml += `<div><span class="label">Customer</span><br>${escapeHtml(job.customer || "—")}</div>`;
    metaHtml += `<div><span class="label">Items</span><br>${job.item_count || "—"}</div>`;
    metaHtml += `<div><span class="label">Type</span><br>${job.is_paint_job ? "Paint Job" : "Standard (no paint)"}</div>`;
    metaHtml += `<div><span class="label">Source</span><br>${job.is_orphaned ? "On floor - cut complete" : escapeHtml(job.source || "generated")}</div>`;
    if (job.po_date) {
      metaHtml += `<div><span class="label">Firm Date</span><br>${escapeHtml(job.po_date)}</div>`;
    }
  }
  if (p && !reclaimedJob) {
    metaHtml += `<div style="margin-top:8px"><span class="label">Status</span><br>${p.is_wip ? '<span style="color:#f97316;font-weight:600">WIP</span>' : '<span style="color:#15803d;font-weight:600">Complete</span>'}</div>`;
    if (p.is_single_cabinet) {
      metaHtml += `<div><span class="label">Placement Type</span><br>Single Cabinet Jobs Rack</div>`;
    }
    metaHtml += `<div><span class="label">Jobs on Pallet</span><br>${palletJobs.map((name) => escapeHtml(name)).join("<br>")}</div>`;
    metaHtml += `<div><span class="label">Area</span><br>${escapeHtml(p.area || "—")}</div>`;
    metaHtml += `<div><span class="label">Last Placed</span><br><span class="timestamp">${formatTimestamp(p.placed_at)}</span></div>`;
    metaHtml += `<div class="last-known">Last known location as of ${formatTimestamp(p.placed_at)}</div>`;
    if (p.notes) {
      metaHtml += `<div><span class="label">Notes</span><br>${escapeHtml(p.notes)}</div>`;
    }
  } else if (!reclaimedJob) {
    metaHtml += `<div style="margin-top:8px;color:#64748b;font-style:italic">No placement recorded yet.</div>`;
  }
  if (reclaimedJob) {
    const placedCount = reclaimedCabinets
      .filter((cabinet) => !!placementForCabinet(cabinet.cabinet_id)).length;
    const legacyPlacements = matchingPlacements
      .filter((placement) => !placementReclaimedCabinets(placement).length);
    metaHtml += `
      <div class="reclaimed-summary">
        <span class="label">Reclaimed Cabinets</span>
        <strong>${placedCount} of ${reclaimedCabinets.length} placed</strong>
      </div>`;
    metaHtml += `<div class="reclaimed-cabinet-list">`;
    reclaimedCabinets.forEach((cabinet) => {
      const placement = placementForCabinet(cabinet.cabinet_id);
      const area = String(placement?.area || "").trim();
      const location = placement
        ? (area || "Placed on map")
        : "Not placed";
      metaHtml += `
        <article class="reclaimed-cabinet-card ${placement ? "placed" : "unplaced"}">
          <div class="reclaimed-cabinet-copy">
            <strong>${escapeHtml(reclaimedCabinetLabel(cabinet))}</strong>
            <span>${escapeHtml(location)}</span>
          </div>
          <div class="reclaimed-cabinet-actions">
            ${placement
              ? `<button type="button" data-reclaimed-action="find" data-cabinet-id="${escapeHtml(cabinet.cabinet_id)}">Find</button>
                 <button type="button" class="cabinet-unplace" data-reclaimed-action="unplace" data-cabinet-id="${escapeHtml(cabinet.cabinet_id)}">Unplace</button>`
              : `<button type="button" class="cabinet-place" data-reclaimed-action="place" data-cabinet-id="${escapeHtml(cabinet.cabinet_id)}">Place on Map</button>`}
          </div>
        </article>`;
    });
    metaHtml += `</div>`;
    if (legacyPlacements.length) {
      metaHtml += `<div class="reclaimed-legacy-note">${legacyPlacements.length} older whole-job pallet ${legacyPlacements.length === 1 ? "placement needs" : "placements need"} review. Cabinets above remain individually placeable.</div>`;
    }
  }
  $("detailMeta").innerHTML = metaHtml;
  wireReclaimedCabinetActions();

  let actHtml = "";
  if (job) {
    actHtml += `<button onclick="openManageJobsFor('${escapeHtml(state.selectedJob)}')">Manage Upcoming Job</button>`;
    if (job.is_orphaned && job.can_restore) {
      actHtml += `<button onclick="restoreGeneratedJob('${escapeHtml(job.original_job_name || job.job_name)}')">Restore To Upcoming</button>`;
    } else if (job.source === "generated" && !job.is_orphaned) {
      actHtml += `<button onclick="hideGeneratedJob('${escapeHtml(job.original_job_name || job.job_name)}')">Hide From Upcoming</button>`;
    } else if (job.source === "manual") {
      actHtml += `<button class="btn-danger" onclick="deleteManualJobByName('${escapeHtml(job.job_name)}')">Remove Upcoming Job</button>`;
    }
  }
  if (p) {
    matchingPlacements.forEach((placement, index) => {
      const wipLabel = placement.is_wip ? "Complete" : "Mark WIP";
      const placementLabel = reclaimedJob
        ? reclaimedPlacementLabel(placement, index)
        : `Pallet ${index + 1}`;
      const prefix = matchingPlacements.length > 1 || reclaimedJob ? `${placementLabel}: ` : "";
      actHtml += `<button onclick="openEditPlacement('${placement.id}')">${prefix}Edit</button>`;
      actHtml += `<button class="btn-wip-toggle" onclick="toggleWip('${placement.id}')">${prefix}${wipLabel}</button>`;
      actHtml += `<button onclick="startReplacePlacement('${placement.id}')">${prefix}Move</button>`;
      actHtml += `<button class="btn-danger" onclick="deletePlacement('${placement.id}')">${prefix}Remove</button>`;
    });
  } else if (!reclaimedJob) {
    actHtml += `<button onclick="startQuickPlace('${escapeHtml(state.selectedJob)}')">Place on Map</button>`;
    actHtml += `<button onclick="startPlaceFor('${escapeHtml(state.selectedJob)}')">Place details…</button>`;
  }
  $("detailActions").innerHTML = actHtml;
}

function wireReclaimedCabinetActions() {
  detailPanel.querySelectorAll("[data-reclaimed-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const cabinetId = button.dataset.cabinetId;
      const action = button.dataset.reclaimedAction;
      if (action === "place") startReclaimedCabinetPlacement(state.selectedJob, cabinetId);
      else if (action === "find") focusReclaimedCabinet(cabinetId);
      else if (action === "unplace") unplaceReclaimedCabinet(cabinetId);
    });
  });
}

function focusReclaimedCabinet(cabinetId) {
  const cabinet = reclaimedCabinetForId(cabinetId);
  const placement = placementForCabinet(cabinetId);
  if (!placement) {
    showStatus(`${reclaimedCabinetLabel(cabinet)} is not placed yet`);
    return;
  }
  state.selectedJob = cabinet?.job_name || state.selectedJob;
  startPlacementPulse(placement.id);
  fitToPlacement(placement);
  showStatus(`${reclaimedCabinetLabel(cabinet)} · ${placement.area || "placed on map"}`);
  render();
  scrollJobIntoView(state.selectedJob);
}

async function unplaceReclaimedCabinet(cabinetId) {
  const cabinet = reclaimedCabinetForId(cabinetId);
  const label = reclaimedCabinetLabel(cabinet);
  if (!confirm(`Remove ${label} from its current pallet location?`)) return;
  const before = clonePlacement(placementForCabinet(cabinetId));
  try {
    const result = await apiPost("/api/reclaimed-cabinet/unplace", { cabinet_id: cabinetId });
    pushUndo({ type: "unplace", cabinetId, before, result });
    showStatus(`Unplaced ${label}`);
    await loadAll();
  } catch (error) {
    showStatus(messageFromError(error, `Unable to unplace ${label}`), 4000);
  }
}

function scrollJobIntoView(jobName) {
  const target = String(jobName || "").trim();
  if (!target) return;
  const escaped = (window.CSS && CSS.escape) ? CSS.escape(target) : target.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const el = jobList.querySelector(`.job-bubble[data-job="${escaped}"]`);
  if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function selectJob(jobName, options = {}) {
  const name = String(jobName || "").trim();
  if (!name) return;
  state.selectedJob = name;
  startSelectionPulse(name);
  startSingleCabinetRackPulse(name);
  const placement = placementFor(name);
  if (placement) fitToPlacement(placement);
  render();
  scrollJobIntoView(name);
  if (options.fromList && !reclaimedJobFor(name) && !placement) {
    beginQuickPlace(name);
  }
}

function focusJob(jobName) {
  if (!jobName) return;
  selectJob(jobName);
}

function jumpToSearchMatch() {
  const needle = searchNeedle();
  if (!needle) return;
  if (state.listMode === "reclaimed") {
    const jobs = (state.reclaimedJobs || []).filter(reclaimedJobMatchesSearch);
    const first = jobs[0];
    if (!first) {
      showStatus("No reclaimed job matches that search", 2500);
      return;
    }
    const jobName = String(first.po_number || "").trim();
    const cabinet = reclaimedCabinetsForJob(first).find((entry) => textMatchesSearch(reclaimedCabinetLabel(entry)));
    selectJob(jobName);
    if (cabinet && placementForCabinet(cabinet.cabinet_id)) {
      focusReclaimedCabinet(cabinet.cabinet_id);
    }
    return;
  }
  const jobs = filteredJobs();
  if (!jobs.length) {
    showStatus("No job matches that search", 2500);
    return;
  }
  selectJob(jobs[0].job_name, { fromList: false });
}

function resetJobEditor() {
  state.jobEditor = { mode: "create-manual", jobName: "", manualId: "" };
  $("jobEditorTitle").textContent = "Add Manual Job";
  $("jobEditorName").value = "";
  $("jobEditorName").readOnly = false;
  $("jobEditorDate").value = "";
  $("jobEditorIsPaint").checked = false;
  $("jobEditorNotes").value = "";
  $("jobEditorHint").textContent = "Manual jobs live only in the locator overlay.";
}

function renderJobsManageModal() {
  const generatedBody = $("generatedJobsTableBody");
  const manualBody = $("manualJobsTableBody");
  generatedBody.innerHTML = (state.jobsManage.generated_jobs || []).map((job) => `
    <tr class="${job.is_hidden ? "muted-row" : ""}">
      <td>${escapeHtml(job.job_name || "")}</td>
      <td>${escapeHtml(job.effective_po_date || job.po_date || "")}</td>
      <td>${job.is_hidden ? "Hidden locally" : (job.has_override ? "Local override" : "Feed")}</td>
      <td>
        <div class="inline-actions">
          <button class="table-action-btn" onclick="editGeneratedJob('${escapeHtml(job.original_job_name || job.job_name)}')">Edit</button>
          ${job.is_hidden
            ? `<button class="table-action-btn" onclick="restoreGeneratedJob('${escapeHtml(job.original_job_name || job.job_name)}')">Restore</button>`
            : `<button class="table-action-btn danger" onclick="hideGeneratedJob('${escapeHtml(job.original_job_name || job.job_name)}')">Hide</button>`}
        </div>
      </td>
    </tr>
  `).join("") || `<tr><td colspan="4" class="muted-row">No generated feed jobs.</td></tr>`;

  manualBody.innerHTML = (state.jobsManage.manual_jobs || []).map((job) => `
    <tr>
      <td>${escapeHtml(job.job_name || "")}</td>
      <td>${escapeHtml(job.po_date || "")}</td>
      <td>${escapeHtml(job.notes || "")}</td>
      <td>
        <div class="inline-actions">
          <button class="table-action-btn" onclick="editManualJob('${escapeHtml(job.id || "")}')">Edit</button>
          <button class="table-action-btn danger" onclick="deleteManualJob('${escapeHtml(job.id || "")}')">Remove</button>
        </div>
      </td>
    </tr>
  `).join("") || `<tr><td colspan="4" class="muted-row">No manual jobs yet.</td></tr>`;
}

function openJobsManageModal() {
  resetJobEditor();
  jobsManageModal.classList.remove("hidden");
  loadJobsManage().catch((error) => showStatus(messageFromError(error, "Unable to load upcoming jobs"), 4000));
}

function closeJobsManageModal() {
  jobsManageModal.classList.add("hidden");
  resetJobEditor();
}

function setJobEditorForGenerated(job) {
  state.jobEditor = { mode: "edit-generated", jobName: job.original_job_name || job.job_name, manualId: "" };
  $("jobEditorTitle").textContent = "Edit Generated Job";
  $("jobEditorName").value = job.job_name || "";
  $("jobEditorName").readOnly = true;
  $("jobEditorDate").value = job.effective_po_date || job.po_date || "";
  $("jobEditorIsPaint").checked = !!job.effective_is_paint_job;
  $("jobEditorNotes").value = job.effective_notes || "";
  $("jobEditorHint").textContent = "Generated jobs stay in the Cut feed. This saves a local override only.";
}

function setJobEditorForManual(job) {
  state.jobEditor = { mode: "edit-manual", jobName: job.job_name || "", manualId: job.id || "" };
  $("jobEditorTitle").textContent = "Edit Manual Job";
  $("jobEditorName").value = job.job_name || "";
  $("jobEditorName").readOnly = false;
  $("jobEditorDate").value = job.po_date || "";
  $("jobEditorIsPaint").checked = !!job.is_paint_job;
  $("jobEditorNotes").value = job.notes || "";
  $("jobEditorHint").textContent = "Manual jobs are locator-only and can be fully edited here.";
}

async function saveJobEditor() {
  const payload = {
    job_name: $("jobEditorName").value.trim(),
    po_date: $("jobEditorDate").value,
    is_paint_job: $("jobEditorIsPaint").checked,
    notes: $("jobEditorNotes").value.trim(),
  };
  if (!payload.job_name || !payload.po_date) {
    showStatus("Job name and firm date are required.", 3500);
    return;
  }
  try {
    if (state.jobEditor.mode === "edit-generated") {
      payload.job_name = state.jobEditor.jobName;
      await apiPost("/api/job/generated/update", payload);
    } else if (state.jobEditor.mode === "edit-manual") {
      await apiPost("/api/job/manual/update", { id: state.jobEditor.manualId, ...payload });
    } else {
      await apiPost("/api/job/manual", payload);
    }
    resetJobEditor();
    await Promise.all([loadAll(), loadJobsManage()]);
  } catch (error) {
    showStatus(messageFromError(error, "Unable to save job"), 4000);
  }
}

async function editGeneratedJob(jobName) {
  if (!jobsManageModal.classList.contains("hidden") && (!state.jobsManage.generated_jobs || !state.jobsManage.generated_jobs.length)) {
    await loadJobsManage();
  }
  const job = (state.jobsManage.generated_jobs || []).find((entry) => entry.original_job_name === jobName || entry.job_name === jobName);
  if (!job) return;
  setJobEditorForGenerated(job);
  jobsManageModal.classList.remove("hidden");
}

async function editManualJob(manualId) {
  if (!jobsManageModal.classList.contains("hidden") && (!state.jobsManage.manual_jobs || !state.jobsManage.manual_jobs.length)) {
    await loadJobsManage();
  }
  const job = (state.jobsManage.manual_jobs || []).find((entry) => entry.id === manualId);
  if (!job) return;
  setJobEditorForManual(job);
  jobsManageModal.classList.remove("hidden");
}

async function hideGeneratedJob(jobName) {
  try {
    await apiPost("/api/job/generated/hide", { job_name: jobName });
    if (state.selectedJob === jobName) state.selectedJob = null;
    await Promise.all([loadAll(), loadJobsManage()]);
  } catch (error) {
    showStatus(messageFromError(error, "Unable to hide generated job"), 4000);
  }
}

async function restoreGeneratedJob(jobName) {
  try {
    await apiPost("/api/job/generated/restore", { job_name: jobName });
    await Promise.all([loadAll(), loadJobsManage()]);
  } catch (error) {
    showStatus(messageFromError(error, "Unable to restore generated job"), 4000);
  }
}

async function deleteManualJob(manualId) {
  if (!confirm("Remove this manual upcoming job?")) return;
  try {
    await apiPost("/api/job/manual/delete", { id: manualId });
    await Promise.all([loadAll(), loadJobsManage()]);
  } catch (error) {
    showStatus(messageFromError(error, "Unable to remove manual job"), 4000);
  }
}

async function deleteManualJobByName(jobName) {
  const match = (state.jobsManage.manual_jobs || []).find((entry) => entry.job_name === jobName);
  if (!match) {
    await loadJobsManage();
  }
  const item = (state.jobsManage.manual_jobs || []).find((entry) => entry.job_name === jobName);
  if (item) {
    await deleteManualJob(item.id);
  }
}

async function openManageJobsFor(jobName) {
  openJobsManageModal();
  await loadJobsManage();
  const generated = (state.jobsManage.generated_jobs || []).find((entry) => entry.original_job_name === jobName || entry.job_name === jobName);
  if (generated) {
    setJobEditorForGenerated(generated);
    return;
  }
  const manual = (state.jobsManage.manual_jobs || []).find((entry) => entry.job_name === jobName);
  if (manual) {
    setJobEditorForManual(manual);
  }
}

function parseModalJobNames() {
  if (state.placeMode?.is_reclaimed) {
    return canonicalJobNames(
      collectModalReclaimedCabinets().map((cabinet) => cabinet.job_name)
    );
  }
  const primary = $("placeJobName").value.trim();
  const extras = $("placeIsMixed").checked
    ? collectMixedJobRows()
    : [];
  return canonicalJobNames([primary, ...extras]);
}

function clearMixedJobRows() {
  $("placeMixedRows").innerHTML = "";
}

function addMixedJobRow(value = "") {
  const row = document.createElement("div");
  row.className = "mixed-job-row";
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Additional PO / Job";
  input.setAttribute("list", "jobSuggestions");
  input.value = value;
  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "mixed-job-remove";
  removeBtn.textContent = "Remove";
  removeBtn.addEventListener("click", () => row.remove());
  row.appendChild(input);
  row.appendChild(removeBtn);
  $("placeMixedRows").appendChild(row);
}

function collectMixedJobRows() {
  const rows = [];
  $("placeMixedRows").querySelectorAll("input").forEach((input) => {
    const text = String(input.value || "").trim();
    if (text) rows.push(text);
  });
  return canonicalJobNames(rows);
}

function collectReclaimedMixedCabinets() {
  const selectedIds = new Set(
    (state.placeMode?.mixed_reclaimed_cabinet_ids || [])
      .map((value) => String(value || "").trim().toLowerCase())
      .filter(Boolean)
  );
  return allReclaimedCabinets()
    .filter((cabinet) => selectedIds.has(cabinet.cabinet_id.toLowerCase()));
}

function collectModalReclaimedCabinets() {
  if (!state.placeMode?.is_reclaimed) return [];
  const primary = normalizeReclaimedCabinet(state.placeMode.primary_reclaimed_cabinet);
  const additional = $("placeIsMixed").checked ? collectReclaimedMixedCabinets() : [];
  const seen = new Set();
  return [primary, ...additional].filter((cabinet) => {
    if (!cabinet) return false;
    const key = cabinet.cabinet_id.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function setMixedRowsVisible(visible) {
  $("placeMixedRowsWrap").classList.toggle("hidden", !visible);
}

function setMixedRows(values = []) {
  clearMixedJobRows();
  const normalized = canonicalJobNames(values);
  if (!normalized.length) {
    addMixedJobRow("");
    return;
  }
  normalized.forEach((value) => addMixedJobRow(value));
}

function setReclaimedMixedCabinets(values = []) {
  if (!state.placeMode) return;
  const ids = [];
  const seen = new Set();
  for (const value of values || []) {
    const id = String(
      typeof value === "object" ? value?.cabinet_id || value?.selected_key || "" : value || ""
    ).trim();
    const key = id.toLowerCase();
    if (!id || seen.has(key)) continue;
    seen.add(key);
    ids.push(id);
  }
  state.placeMode.mixed_reclaimed_cabinet_ids = ids;
}

function reclaimedMixedOptions() {
  const primaryId = String(
    state.placeMode?.primary_reclaimed_cabinet?.cabinet_id || ""
  ).trim().toLowerCase();
  const currentPlacementId = String(state.placeMode?.placementId || "").trim();
  return allReclaimedCabinets()
    .filter((cabinet) => cabinet.cabinet_id.toLowerCase() !== primaryId)
    .map((cabinet) => {
      const placement = placementForCabinet(cabinet.cabinet_id);
      const placedElsewhere = !!placement && String(placement.id || "") !== currentPlacementId;
      return { ...cabinet, placement, placedElsewhere };
    })
    .sort((a, b) => {
      const byJob = a.job_name.localeCompare(b.job_name);
      if (byJob) return byJob;
      const byItem = a.item_number.localeCompare(b.item_number);
      return byItem || a.occurrence - b.occurrence;
    });
}

function renderReclaimedMixedCount() {
  const selected = collectReclaimedMixedCabinets();
  $("placeReclaimedMixedCount").textContent =
    `${selected.length} additional cabinet${selected.length === 1 ? "" : "s"} selected`;
}

function renderReclaimedMixedChecklist() {
  const container = $("placeReclaimedMixedList");
  const query = $("placeReclaimedMixedSearch").value.trim().toLowerCase();
  const selected = new Set(
    collectReclaimedMixedCabinets().map((cabinet) => cabinet.cabinet_id.toLowerCase())
  );
  const options = reclaimedMixedOptions().filter((entry) => {
    return `${entry.job_name} ${entry.item_number}`.toLowerCase().includes(query);
  });
  container.innerHTML = "";
  if (!options.length) {
    const empty = document.createElement("div");
    empty.className = "reclaimed-mixed-empty";
    empty.textContent = query ? "No reclaimed cabinets match that filter." : "No other reclaimed cabinets are available.";
    container.appendChild(empty);
    renderReclaimedMixedCount();
    return;
  }
  options.forEach((entry) => {
    const label = document.createElement("label");
    label.className = "reclaimed-mixed-option";
    label.classList.toggle("unavailable", entry.placedElsewhere);
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = entry.cabinet_id;
    checkbox.checked = selected.has(entry.cabinet_id.toLowerCase());
    checkbox.disabled = entry.placedElsewhere;
    checkbox.addEventListener("change", () => {
      const current = new Map(
        collectReclaimedMixedCabinets()
          .map((cabinet) => [cabinet.cabinet_id.toLowerCase(), cabinet.cabinet_id])
      );
      if (checkbox.checked) current.set(entry.cabinet_id.toLowerCase(), entry.cabinet_id);
      else current.delete(entry.cabinet_id.toLowerCase());
      setReclaimedMixedCabinets([...current.values()]);
      renderReclaimedMixedCount();
    });
    const name = document.createElement("span");
    name.className = "reclaimed-mixed-name";
    name.innerHTML = `<strong>${escapeHtml(reclaimedCabinetLabel(entry))}</strong><small>${escapeHtml(entry.job_name)}</small>`;
    const status = document.createElement("span");
    status.className = "reclaimed-mixed-cabinets";
    status.textContent = entry.placedElsewhere
      ? `Placed · ${entry.placement?.area || "map"}`
      : "Available";
    label.appendChild(checkbox);
    label.appendChild(name);
    label.appendChild(status);
    container.appendChild(label);
  });
  renderReclaimedMixedCount();
}

function configureMixedJobPicker(values = [], reclaimedCabinets = []) {
  const reclaimed = !!state.placeMode?.is_reclaimed;
  $("placeGenericMixedWrap").classList.toggle("hidden", reclaimed);
  $("placeReclaimedMixedWrap").classList.toggle("hidden", !reclaimed);
  if (reclaimed) {
    clearMixedJobRows();
    $("placeReclaimedMixedSearch").value = "";
    setReclaimedMixedCabinets(reclaimedCabinets);
    renderReclaimedMixedChecklist();
  } else {
    setReclaimedMixedCabinets([]);
    setMixedRows(values);
  }
}

function openPlacementModal({ mode, placementId = "", title, confirmText, hint, primaryJob = "", additionalJobs = [], reclaimedCabinets = [], isPaint = false, isWip = true, isReclaimed = false, allowDuplicate = false, notes = "" }) {
  const normalizedReclaimedCabinets = (reclaimedCabinets || [])
    .map((entry) => normalizeReclaimedCabinet(entry))
    .filter(Boolean);
  const primaryReclaimedCabinet = normalizedReclaimedCabinets[0] || null;
  state.placeMode = {
    mode,
    placementId: String(placementId || "").trim(),
    job_names: [],
    is_paint_job: !!isPaint,
    is_wip: !!isWip,
    is_reclaimed: !!isReclaimed,
    allow_duplicate: !!allowDuplicate,
    mixed_job_names: canonicalJobNames(additionalJobs),
    primary_reclaimed_cabinet: primaryReclaimedCabinet,
    mixed_reclaimed_cabinet_ids: normalizedReclaimedCabinets
      .slice(1)
      .map((cabinet) => cabinet.cabinet_id),
    notes: String(notes || ""),
    default_confirm_text: String(confirmText || ""),
    default_hint_text: String(hint || ""),
  };
  populateJobSuggestions();
  $("placeModalTitle").textContent = title;
  $("placeConfirmBtn").textContent = confirmText;
  $("placeModalHint").textContent = hint;
  $("placeJobName").value = primaryJob;
  $("placeJobName").readOnly = !!isReclaimed;
  $("placeReclaimedCabinetWrap").classList.toggle("hidden", !isReclaimed);
  $("placeReclaimedCabinetLabel").textContent = primaryReclaimedCabinet
    ? reclaimedCabinetLabel(primaryReclaimedCabinet)
    : "Legacy whole-job placement";
  $("placeMixedLabelText").textContent = isReclaimed
    ? "Mixed pallet (multiple reclaimed cabinets)"
    : "Mixed pallet (multiple POs/jobs)";
  $("placeSingleCabinetWrap").classList.toggle("hidden", !!isReclaimed);
  const mixed = isReclaimed
    ? normalizedReclaimedCabinets.length > 1
    : Array.isArray(additionalJobs) && additionalJobs.length > 0;
  $("placeIsMixed").checked = mixed;
  setMixedRowsVisible(mixed);
  configureMixedJobPicker(additionalJobs, normalizedReclaimedCabinets.slice(1));
  $("placeIsPaint").checked = !!isPaint;
  $("placeIsWip").checked = !!isWip;
  $("placeIsSingleCabinet").checked = false;
  $("placeNotes").value = notes || "";
  syncSingleCabinetHint();
  placeModal.classList.remove("hidden");
}

function syncSingleCabinetHint() {
  if (!state.placeMode) return;
  const defaultConfirm = state.placeMode.default_confirm_text || "Confirm & Click Map";
  const defaultHint = state.placeMode.default_hint_text || "";
  const isSingleCabinet = !!$("placeIsSingleCabinet").checked;
  if (state.placeMode.mode === "place" && isSingleCabinet) {
    $("placeConfirmBtn").textContent = "Confirm Placement";
    $("placeModalHint").textContent = "Single cabinet jobs are auto-placed on the Single Cabinet Jobs rack.";
    return;
  }
  $("placeConfirmBtn").textContent = defaultConfirm;
  $("placeModalHint").textContent = defaultHint;
}

async function toggleWip(placementId) {
  const p = state.placements.find((x) => x.id === placementId);
  if (!p) return;
  try {
    pushUndo({ type: "update", before: clonePlacement(p) });
    await apiPost("/api/placement/update", {
      id: placementId,
      is_wip: !p.is_wip,
    });
    await loadAll();
  } catch (error) {
    showStatus(messageFromError(error, "Unable to update pallet"), 4000);
  }
}

async function deletePlacement(placementId) {
  const existing = state.placements.find((x) => x.id === placementId);
  if (!confirm("Remove this pallet placement?")) return;
  try {
    if (existing) pushUndo({ type: "delete", placement: clonePlacement(existing) });
    await apiPost("/api/placement/delete", { id: placementId });
    await loadAll();
  } catch (error) {
    showStatus(messageFromError(error, "Unable to remove pallet"), 4000);
  }
}

function cancelPlaceMode() {
  state.placeMode = null;
  $("mapPanel").classList.remove("placing");
}

function beginQuickPlace(jobName) {
  const name = String(jobName || "").trim();
  const job = jobFor(name);
  if (!name) return;
  state.selectedJob = name;
  state.placeMode = {
    mode: "place",
    placementId: "",
    job_names: [name],
    job_name: name,
    is_paint_job: !!job?.is_paint_job,
    is_wip: false,
    is_single_cabinet: false,
    is_reclaimed: false,
    notes: "",
    quick: true,
  };
  $("mapPanel").classList.add("placing");
  showStatus(`Click the map to place ${name}`);
}

function startQuickPlace(jobName) {
  beginQuickPlace(jobName);
}

function startPlaceFor(jobName) {
  const job = jobFor(jobName);
  openPlacementModal({
    mode: "place",
    title: "Place Pallet",
    confirmText: "Confirm & Click Map",
    hint: "Click a location on the map after confirming.",
    primaryJob: jobName,
    additionalJobs: [],
    isPaint: job ? job.is_paint_job : false,
    isWip: false,
    notes: "",
  });
}

function startReclaimedCabinetPlacement(jobName, cabinetId) {
  const cabinet = reclaimedCabinetForId(cabinetId);
  if (!cabinet) {
    showStatus("That reclaimed cabinet is no longer in the current list.", 4000);
    return;
  }
  openPlacementModal({
    mode: "place",
    title: "Place Reclaimed Cabinet",
    confirmText: "Confirm & Click Map",
    hint: `Click the physical pallet location for ${reclaimedCabinetLabel(cabinet)}. Turn on Mixed pallet only if other cabinets share it.`,
    primaryJob: cabinet.job_name || jobName,
    additionalJobs: [],
    reclaimedCabinets: [cabinet],
    isPaint: false,
    isWip: false,
    isReclaimed: true,
    allowDuplicate: true,
    notes: `Reclaimed cabinet ${reclaimedCabinetLabel(cabinet)}`,
  });
}

function startAdditionalPlacement(jobName) {
  const job = reclaimedJobFor(jobName);
  const cabinet = reclaimedCabinetsForJob(job)
    .find((entry) => !placementForCabinet(entry.cabinet_id));
  if (!cabinet) {
    showStatus("Every reclaimed cabinet for this job is already placed.", 4000);
    return;
  }
  startReclaimedCabinetPlacement(jobName, cabinet.cabinet_id);
}

function startReplace(jobName) {
  const placement = placementFor(jobName);
  const names = placementJobNames(placement);
  const primaryJob = names[0] || jobName;
  openPlacementModal({
    mode: "place",
    placementId: placement?.id || "",
    title: "Re-place Pallet",
    confirmText: "Confirm & Click Map",
    hint: "Click a new location on the map to update this pallet placement.",
    primaryJob,
    additionalJobs: names.slice(1),
    reclaimedCabinets: placementReclaimedCabinets(placement),
    isPaint: placement ? !!placement.is_paint_job : !!jobFor(primaryJob)?.is_paint_job,
    isWip: placement ? !!placement.is_wip : false,
    isReclaimed: !!placement?.is_reclaimed,
    allowDuplicate: !!placement?.is_reclaimed,
    notes: placement?.notes || "",
  });
  $("placeIsSingleCabinet").checked = !!placement?.is_single_cabinet;
  syncSingleCabinetHint();
}

function startReplacePlacement(placementId) {
  const placement = state.placements.find((entry) => entry.id === placementId);
  if (!placement) return;
  const names = placementJobNames(placement);
  const primaryJob = names[0] || placement.job_name;
  openPlacementModal({
    mode: "place",
    placementId: placement.id,
    title: "Move Pallet",
    confirmText: "Confirm & Click Map",
    hint: "Click the pallet's new physical location.",
    primaryJob,
    additionalJobs: names.slice(1),
    reclaimedCabinets: placementReclaimedCabinets(placement),
    isPaint: !!placement.is_paint_job,
    isWip: !!placement.is_wip,
    isReclaimed: !!placement.is_reclaimed,
    allowDuplicate: !!placement.is_reclaimed,
    notes: placement.notes || "",
  });
  $("placeIsSingleCabinet").checked = !!placement.is_single_cabinet;
  syncSingleCabinetHint();
}

function openEditPlacement(placementId) {
  const placement = state.placements.find((entry) => entry.id === placementId);
  if (!placement) return;
  const names = placementJobNames(placement);
  openPlacementModal({
    mode: "edit",
    placementId: placement.id,
    title: "Edit Pallet Details",
    confirmText: "Save Details",
    hint: "Update jobs, notes, and status without moving location.",
    primaryJob: names[0] || "",
    additionalJobs: names.slice(1),
    reclaimedCabinets: placementReclaimedCabinets(placement),
    isPaint: !!placement.is_paint_job,
    isWip: !!placement.is_wip,
    isReclaimed: !!placement.is_reclaimed,
    allowDuplicate: !!placement.is_reclaimed,
    notes: placement.notes || "",
  });
  $("placeIsSingleCabinet").checked = !!placement.is_single_cabinet;
  syncSingleCabinetHint();
}

$("placeModeBtn").addEventListener("click", () => {
  openPlacementModal({
    mode: "place",
    title: "Place Pallet",
    confirmText: "Confirm & Click Map",
    hint: "Click a location on the map after confirming.",
    primaryJob: "",
    additionalJobs: [],
    isPaint: false,
    isWip: false,
    notes: "",
  });
});

$("placeCancelBtn").addEventListener("click", () => {
  placeModal.classList.add("hidden");
  state.placeMode = null;
  $("placeIsMixed").checked = false;
  $("placeIsSingleCabinet").checked = false;
  setMixedRowsVisible(false);
  clearMixedJobRows();
  $("placeReclaimedMixedList").innerHTML = "";
  $("placeReclaimedMixedSearch").value = "";
  $("mapPanel").classList.remove("placing");
});

$("placeConfirmBtn").addEventListener("click", async () => {
  const jobNames = parseModalJobNames();
  if (!jobNames.length) {
    $("placeJobName").focus();
    return;
  }
  const mode = state.placeMode?.mode || "place";
  const reclaimedCabinets = collectModalReclaimedCabinets();
  const payload = {
    job_names: jobNames,
    job_name: jobNames[0],
    is_paint_job: $("placeIsPaint").checked,
    is_wip: $("placeIsWip").checked,
    is_single_cabinet: $("placeIsSingleCabinet").checked,
    is_reclaimed: !!state.placeMode?.is_reclaimed,
    allow_duplicate: !!state.placeMode?.allow_duplicate,
    notes: $("placeNotes").value.trim(),
  };
  if (payload.is_reclaimed) {
    if (!reclaimedCabinets.length && state.placeMode?.primary_reclaimed_cabinet) {
      showStatus("Select at least one reclaimed cabinet.", 4000);
      return;
    }
    payload.reclaimed_cabinets = reclaimedCabinets;
  }

  if (mode === "edit") {
    const placementId = String(state.placeMode?.placementId || "").trim();
    if (!placementId) return;
    const existing = state.placements.find((entry) => entry.id === placementId);
    const updatePayload = { id: placementId, ...payload };
    if (existing) {
      for (const key of ["x", "y", "area", "zone"]) {
        if (existing[key] !== undefined) {
          updatePayload[key] = existing[key];
        }
      }
    }
    try {
      if (existing) pushUndo({ type: "update", before: clonePlacement(existing) });
      await apiPost("/api/placement/update", updatePayload);
    } catch (error) {
      showStatus(messageFromError(error, "Unable to save pallet changes"), 4000);
      return;
    }
    state.selectedJob = payload.job_name;
    placeModal.classList.add("hidden");
    state.placeMode = null;
    showStatus(`Updated ${payload.job_name}`);
    await loadAll();
    return;
  }

  if (payload.is_single_cabinet) {
    const autoSpot = nextSingleCabinetSpot();
    if (!autoSpot) {
      showStatus("Single Cabinet Jobs rack is unavailable on this map.", 4000);
      return;
    }
    try {
      const created = await apiPost("/api/placement", {
        ...payload,
        x: autoSpot.x,
        y: autoSpot.y,
        area: autoSpot.area,
      });
      if (created?.id) pushUndo({ type: "place", id: created.id, jobName: payload.job_name });
      state.placeMode = null;
      placeModal.classList.add("hidden");
      state.selectedJob = payload.job_name;
      showStatus(`Placed ${payload.job_name} on Single Cabinet Jobs`);
      await loadAll();
      return;
    } catch (error) {
      showStatus(messageFromError(error, "Unable to place single cabinet job"), 4000);
      return;
    }
  }

  state.placeMode = {
    mode: "place",
    placementId: String(state.placeMode?.placementId || "").trim(),
    ...payload,
  };
  placeModal.classList.add("hidden");
  $("mapPanel").classList.add("placing");
  showStatus("Click on the map to place the pallet");
});

function populateJobSuggestions() {
  const dl = $("jobSuggestions");
  dl.innerHTML = "";
  for (const name of knownPurchaseOrderNames()) {
    const opt = document.createElement("option");
    opt.value = name;
    dl.appendChild(opt);
  }
}

$("placeIsMixed").addEventListener("change", () => {
  const enabled = $("placeIsMixed").checked;
  setMixedRowsVisible(enabled);
  if (enabled) {
    if (state.placeMode?.is_reclaimed) {
      renderReclaimedMixedChecklist();
    } else if (!$("placeMixedRows").children.length) {
      addMixedJobRow("");
    }
  } else {
    clearMixedJobRows();
    setReclaimedMixedCabinets([]);
    renderReclaimedMixedCount();
  }
});

$("placeIsSingleCabinet").addEventListener("change", () => {
  syncSingleCabinetHint();
});

$("placeAddMixedRowBtn").addEventListener("click", () => {
  addMixedJobRow("");
});

$("placeReclaimedMixedSearch").addEventListener("input", () => {
  renderReclaimedMixedChecklist();
});

function hitTestPallet(worldX, worldY) {
  const visible = state.hideWip
    ? state.placements.filter((p) => !p.is_wip)
    : state.placements;
  for (let i = visible.length - 1; i >= 0; i--) {
    const p = visible[i];
    const dims = markerDimensions(p, 1);
    const halfW = dims.width / 2;
    const halfH = dims.height / 2;
    const pad = p.is_single_cabinet_rack ? 8 : (p.is_single_cabinet ? 10 : 6);
    if (
      worldX >= p.x - halfW - pad &&
      worldX <= p.x + halfW + pad &&
      worldY >= p.y - halfH - pad &&
      worldY <= p.y + halfH + pad
    ) {
      return p;
    }
  }
  return null;
}

function mapAreaAt(mapX, mapY) {
  for (const a of state.mapData.areas || []) {
    if (mapX >= a.x && mapX <= a.x + a.width && mapY >= a.y && mapY <= a.y + a.height) {
      return a.id || a.label;
    }
  }
  return "";
}

function placementPayloadFromMode(worldX, worldY) {
  const body = {
    job_names: state.placeMode.job_names,
    job_name: state.placeMode.job_name,
    is_paint_job: !!state.placeMode.is_paint_job,
    is_wip: !!state.placeMode.is_wip,
    is_single_cabinet: !!state.placeMode.is_single_cabinet,
    is_reclaimed: !!state.placeMode.is_reclaimed,
    allow_duplicate: !!state.placeMode.allow_duplicate,
    notes: state.placeMode.notes || "",
    x: Math.round(worldX),
    y: Math.round(worldY),
    area: mapAreaAt(worldX, worldY),
  };
  if (body.is_reclaimed) {
    body.reclaimed_cabinets = Array.isArray(state.placeMode.reclaimed_cabinets)
      ? state.placeMode.reclaimed_cabinets
      : [];
  }
  return body;
}

async function commitMapPlacement(worldX, worldY) {
  const body = placementPayloadFromMode(worldX, worldY);
  const placementId = String(state.placeMode.placementId || "").trim();
  try {
    if (placementId) {
      const existing = state.placements.find((entry) => entry.id === placementId);
      if (existing) pushUndo({ type: "update", before: clonePlacement(existing) });
      await apiPost("/api/placement/update", { id: placementId, ...body });
    } else {
      const created = await apiPost("/api/placement", body);
      if (created?.id) pushUndo({ type: "place", id: created.id, jobName: body.job_name });
    }
    cancelPlaceMode();
    state.selectedJob = body.job_name;
    showStatus(`Placed ${body.job_name}`);
    await loadAll();
    const placed = placementFor(body.job_name);
    if (placed) fitToPlacement(placed);
    renderMap();
  } catch (error) {
    showStatus(messageFromError(error, "Unable to place pallet"), 4000);
  }
}

async function placeOrMoveJobAt(jobName, worldX, worldY) {
  const existing = placementFor(jobName);
  if (existing && !existing.is_single_cabinet_rack) {
    pushUndo({ type: "update", before: clonePlacement(existing) });
    try {
      await apiPost("/api/placement/update", {
        id: existing.id,
        x: Math.round(worldX),
        y: Math.round(worldY),
        area: mapAreaAt(worldX, worldY),
      });
      state.selectedJob = jobName;
      showStatus(`Moved ${jobName}`);
      await loadAll();
      fitToPlacement(placementFor(jobName) || existing);
      return;
    } catch (error) {
      showStatus(messageFromError(error, "Unable to move pallet"), 4000);
      return;
    }
  }
  const job = jobFor(jobName);
  try {
    const created = await apiPost("/api/placement", {
      job_names: [jobName],
      job_name: jobName,
      is_paint_job: !!job?.is_paint_job,
      is_wip: false,
      x: Math.round(worldX),
      y: Math.round(worldY),
      area: mapAreaAt(worldX, worldY),
    });
    if (created?.id) pushUndo({ type: "place", id: created.id, jobName });
    state.selectedJob = jobName;
    cancelPlaceMode();
    showStatus(`Placed ${jobName}`);
    await loadAll();
    const placed = placementFor(jobName);
    if (placed) fitToPlacement(placed);
  } catch (error) {
    showStatus(messageFromError(error, "Unable to place pallet"), 4000);
  }
}

function wireJobDrag(el) {
  el.addEventListener("dragstart", (event) => {
    const jobName = el.dataset.job || "";
    event.dataTransfer.setData("text/plain", jobName);
    event.dataTransfer.effectAllowed = "copyMove";
    state.draggingJobName = jobName;
  });
  el.addEventListener("dragend", () => {
    state.draggingJobName = "";
  });
}

mapCanvas.addEventListener("dragover", (event) => {
  event.preventDefault();
  event.dataTransfer.dropEffect = "copy";
});

mapCanvas.addEventListener("drop", async (event) => {
  event.preventDefault();
  const jobName = (event.dataTransfer.getData("text/plain") || state.draggingJobName || "").trim();
  if (!jobName) return;
  if (reclaimedJobFor(jobName) && !placementFor(jobName)) {
    selectJob(jobName);
    showStatus("Pick a cabinet, then Place on Map — or drop an upcoming job.");
    return;
  }
  const world = eventToWorld(event);
  await placeOrMoveJobAt(jobName, world.x, world.y);
});

mapCanvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  const rect = mapCanvas.getBoundingClientRect();
  const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
  const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
  const nextZoom = Math.min(VIEW_MAX_ZOOM, Math.max(VIEW_MIN_ZOOM, state.view.zoom * factor));
  const next = geometry && geometry.zoomAtPoint
    ? geometry.zoomAtPoint(viewTransform(), point, nextZoom, { minZoom: VIEW_MIN_ZOOM, maxZoom: VIEW_MAX_ZOOM })
    : { zoom: nextZoom, panX: state.view.panX, panY: state.view.panY };
  applyView(next);
  renderMap();
}, { passive: false });

mapCanvas.addEventListener("mousedown", (e) => {
  const world = eventToWorld(e);
  const hit = state.placeMode?.mode === "place" ? null : hitTestPallet(world.x, world.y);
  if (hit) {
    state.dragState = {
      placementId: hit.id,
      jobName: hit.is_single_cabinet_rack ? "Single Cabinet Jobs rack" : (placementPrimaryJob(hit) || hit.job_name),
      startScreenX: e.clientX,
      startScreenY: e.clientY,
      origX: hit.x,
      origY: hit.y,
      before: clonePlacement(hit),
      moved: false,
    };
    mapCanvas.style.cursor = "grabbing";
    return;
  }
  state.panState = {
    startX: e.clientX,
    startY: e.clientY,
    origPanX: state.view.panX,
    origPanY: state.view.panY,
    moved: false,
    placing: state.placeMode?.mode === "place",
  };
  mapCanvas.style.cursor = "grabbing";
});

mapCanvas.addEventListener("mousemove", (e) => {
  if (state.dragState) {
    const world = eventToWorld(e);
    const startWorld = geometry && geometry.screenToWorld
      ? geometry.screenToWorld({
          x: state.dragState.startScreenX - mapCanvas.getBoundingClientRect().left,
          y: state.dragState.startScreenY - mapCanvas.getBoundingClientRect().top,
        }, viewTransform())
      : eventToWorld({ clientX: state.dragState.startScreenX, clientY: state.dragState.startScreenY });
    const dx = world.x - startWorld.x;
    const dy = world.y - startWorld.y;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) state.dragState.moved = true;
    const p = state.placements.find((x) => x.id === state.dragState.placementId);
    if (p) {
      p.x = Math.round(state.dragState.origX + dx);
      p.y = Math.round(state.dragState.origY + dy);
      renderMap();
    }
    return;
  }
  if (state.panState) {
    const dx = e.clientX - state.panState.startX;
    const dy = e.clientY - state.panState.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) state.panState.moved = true;
    applyView({
      zoom: state.view.zoom,
      panX: state.panState.origPanX + dx,
      panY: state.panState.origPanY + dy,
    });
    renderMap();
    return;
  }
  const world = eventToWorld(e);
  const hit = hitTestPallet(world.x, world.y);
  if (hit) mapCanvas.style.cursor = "grab";
  else if (state.placeMode?.mode === "place") mapCanvas.style.cursor = "crosshair";
  else mapCanvas.style.cursor = "grab";
});

mapCanvas.addEventListener("mouseup", async (e) => {
  if (state.dragState) {
    const ds = state.dragState;
    state.dragState = null;
    mapCanvas.style.cursor = "default";
    if (!ds.moved) {
      const hit = state.placements.find((x) => x.id === ds.placementId);
      if (hit?.is_single_cabinet_rack) {
        showStatus("Single Cabinet Jobs rack — drag to reposition");
        return;
      }
      if (hit) focusJob(placementPrimaryJob(hit) || hit.job_name);
      return;
    }
    const p = state.placements.find((x) => x.id === ds.placementId);
    if (!p) return;
    try {
      pushUndo({ type: "update", before: ds.before });
      await apiPost("/api/placement/update", {
        id: ds.placementId,
        x: p.x,
        y: p.y,
        area: mapAreaAt(p.x, p.y),
      });
      showStatus(`Moved ${ds.jobName}`);
      await loadAll();
      if (!p.is_single_cabinet_rack) startSelectionPulse(ds.jobName);
      renderMap();
    } catch (error) {
      showStatus(messageFromError(error, "Unable to move pallet"), 4000);
      await loadAll();
    }
    return;
  }

  if (state.panState) {
    const pan = state.panState;
    state.panState = null;
    mapCanvas.style.cursor = state.placeMode?.mode === "place" ? "crosshair" : "grab";
    if (pan.moved) return;
    if (pan.placing) {
      const world = eventToWorld(e);
      await commitMapPlacement(world.x, world.y);
      return;
    }
    state.selectedJob = null;
    cancelPlaceMode();
    render();
  }
});

mapCanvas.addEventListener("mouseleave", () => {
  if (state.panState && !state.panState.moved) state.panState = null;
});

function showStatus(msg, duration = 2500) {
  mapStatus.textContent = msg;
  mapStatus.classList.add("visible");
  clearTimeout(showStatus._timer);
  showStatus._timer = setTimeout(() => {
    mapStatus.classList.remove("visible");
  }, duration);
}

function syncJobsFeedWarning() {
  if (!jobsFeedWarning) return;
  const status = state.jobsFeedStatus || {};
  const show = !!status.exists && Number(status.valid_count || 0) === 0;
  if (!show) {
    jobsFeedWarning.classList.remove("visible");
    jobsFeedWarning.classList.add("hidden");
    jobsFeedWarning.textContent = "";
    document.body.classList.remove("jobs-warning-visible");
    return;
  }
  const msg = String(status.message || "").trim()
    || "Recently Encountered Purchase Orders file has zero valid rows.";
  jobsFeedWarning.textContent = msg + " Expected format: JOB_NAME | YYYY-MM-DD";
  jobsFeedWarning.classList.remove("hidden");
  jobsFeedWarning.classList.add("visible");
  document.body.classList.add("jobs-warning-visible");
}

hideWipToggle.addEventListener("change", () => {
  state.hideWip = hideWipToggle.checked;
  render();
});

jobFilterSelect.addEventListener("change", () => {
  state.jobVisibilityFilter = jobFilterSelect.value;
  render();
});

function setListMode(mode) {
  state.listMode = mode === "reclaimed" ? "reclaimed" : "upcoming";
  const reclaimed = state.listMode === "reclaimed";
  $("upcomingTabBtn").classList.toggle("active", !reclaimed);
  $("reclaimedTabBtn").classList.toggle("active", reclaimed);
  $("upcomingTabBtn").setAttribute("aria-selected", String(!reclaimed));
  $("reclaimedTabBtn").setAttribute("aria-selected", String(reclaimed));
  jobFilterSelect.closest("label").classList.toggle("hidden", reclaimed);
  render();
}

$("upcomingTabBtn").addEventListener("click", () => setListMode("upcoming"));
$("reclaimedTabBtn").addEventListener("click", () => setListMode("reclaimed"));

$("detailClose").addEventListener("click", () => {
  state.selectedJob = null;
  cancelPlaceMode();
  render();
});

async function restorePlacement(placement) {
  const body = clonePlacement(placement);
  delete body.id;
  return apiPost("/api/placement", body);
}

async function undoLast() {
  const action = state.undoStack.pop();
  syncUndoButton();
  if (!action) return;
  try {
    if (action.type === "place" && action.id) {
      await apiPost("/api/placement/delete", { id: action.id });
    } else if (action.type === "delete" && action.placement) {
      await restorePlacement(action.placement);
    } else if (action.type === "update" && action.before?.id) {
      await apiPost("/api/placement/update", action.before);
    } else if (action.type === "unplace" && action.before?.id) {
      await apiPost("/api/placement/update", action.before);
    } else {
      showStatus("Nothing to undo");
      return;
    }
    showStatus("Undid last change");
    await loadAll();
  } catch (error) {
    state.undoStack.push(action);
    syncUndoButton();
    showStatus(messageFromError(error, "Unable to undo"), 4000);
  }
}

$("refreshBtn").addEventListener("click", async () => {
  showStatus("Refreshing jobs from live Cut…");
  await loadAll();
  showStatus("Jobs refreshed");
});
$("undoBtn").addEventListener("click", undoLast);
$("printMapBtn").addEventListener("click", () => window.open("/print.html", "_blank", "noopener,noreferrer"));
$("manageJobsBtn").addEventListener("click", openJobsManageModal);
$("jobsManageCloseBtn").addEventListener("click", closeJobsManageModal);
$("jobEditorSaveBtn").addEventListener("click", saveJobEditor);
$("jobEditorCancelBtn").addEventListener("click", resetJobEditor);

const jobSearchInput = $("jobSearchInput");
if (jobSearchInput) {
  jobSearchInput.addEventListener("input", () => {
    state.jobSearch = jobSearchInput.value;
    render();
  });
  jobSearchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      jumpToSearchMatch();
    }
  });
}

function render() {
  syncJobsFeedWarning();
  renderJobList();
  renderDetail();
  renderAreaTabs();
  renderMap();
  syncUndoButton();
}

window.addEventListener("resize", () => {
  if (String(state.view.areaId || "all") === "all") fitAllAreas();
  else fitNamedArea(state.view.areaId);
  renderMap();
});

window.addEventListener("keydown", (event) => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName);
  if ((event.ctrlKey || event.metaKey) && String(event.key).toLowerCase() === "z" && !typing) {
    event.preventDefault();
    undoLast();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && String(event.key).toLowerCase() === "f") {
    event.preventDefault();
    jobSearchInput?.focus();
    jobSearchInput?.select();
    return;
  }
  if (event.key === "/" && !typing) {
    event.preventDefault();
    jobSearchInput?.focus();
    return;
  }
  if (event.key === "Escape") {
    if (state.placeMode) {
      cancelPlaceMode();
      showStatus("Placement cancelled");
      render();
    }
  }
});

window.openManageJobsFor = openManageJobsFor;
window.editGeneratedJob = editGeneratedJob;
window.editManualJob = editManualJob;
window.hideGeneratedJob = hideGeneratedJob;
window.restoreGeneratedJob = restoreGeneratedJob;
window.deleteManualJob = deleteManualJob;
window.deleteManualJobByName = deleteManualJobByName;
window.startQuickPlace = startQuickPlace;
window.startPlaceFor = startPlaceFor;
window.openEditPlacement = openEditPlacement;
window.toggleWip = toggleWip;
window.startReplacePlacement = startReplacePlacement;
window.deletePlacement = deletePlacement;

setInterval(() => {
  if (document.hidden || state.placeMode || state.dragState || state.panState) return;
  if (!jobsManageModal.classList.contains("hidden")) return;
  loadAll().catch(() => {});
}, 60000);

loadAll();

