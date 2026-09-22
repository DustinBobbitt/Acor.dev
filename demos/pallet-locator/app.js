const seed = window.PALLET_LOCATOR_DEMO_DATA;

const state = {
  jobs: seed.jobs.map((job) => ({ ...job })),
  placements: seed.placements.map((p) => ({ ...p })),
  map: seed.map,
  selectedJobId: null,
  hideWip: false,
  filter: "all",
  search: "",
  placeMode: null,
  undoStack: [],
};

const canvas = document.getElementById("mapCanvas");
const ctx = canvas.getContext("2d");
const $ = (id) => document.getElementById(id);

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch])
  );
}

function placementFor(jobId) {
  return state.placements.find((p) => p.jobId === jobId) || null;
}

function jobFor(jobId) {
  return state.jobs.find((j) => j.id === jobId) || null;
}

function rackFor(rackId) {
  return state.map.racks.find((r) => r.id === rackId) || null;
}

function slotOccupant(rackId, slot) {
  return state.placements.find((p) => p.rackId === rackId && p.slot === slot) || null;
}

function pushUndo(label, apply) {
  state.undoStack.push({ label, apply });
  $("undoBtn").disabled = false;
}

function filteredJobs() {
  const needle = state.search.trim().toLowerCase();
  return state.jobs.filter((job) => {
    if (state.hideWip && job.wip) return false;
    const placed = Boolean(placementFor(job.id));
    if (state.filter === "active" && job.status !== "active") return false;
    if (state.filter === "orphaned" && job.status !== "orphaned") return false;
    if (state.filter === "unplaced" && placed) return false;
    if (!needle) return true;
    return `${job.id} ${job.name} ${job.firmDate}`.toLowerCase().includes(needle);
  });
}

function setStatus(message) {
  $("mapStatus").textContent = message;
}

function renderJobList() {
  const jobs = filteredJobs();
  $("jobPanelSummary").textContent = `${jobs.length} job${jobs.length === 1 ? "" : "s"} · ${state.placements.length} on map`;
  $("jobList").innerHTML = jobs
    .map((job) => {
      const placed = placementFor(job.id);
      const rack = placed ? rackFor(placed.rackId) : null;
      const active = state.selectedJobId === job.id ? "active" : "";
      const loc = placed
        ? `<span class="pill ok">${escapeHtml(rack?.label || placed.rackId)} · slot ${placed.slot}</span>`
        : `<span class="pill muted">Not placed</span>`;
      const flags = [
        job.paint ? `<span class="pill ok">Paint</span>` : "",
        job.wip ? `<span class="pill warn">WIP</span>` : "",
        job.status === "orphaned" ? `<span class="pill warn">Cut complete</span>` : "",
      ].join(" ");
      return `
        <button class="job-card ${active}" type="button" data-job="${escapeHtml(job.id)}">
          <strong>${escapeHtml(job.name)}</strong>
          <div class="row"><span>Firm ${escapeHtml(job.firmDate)}</span><span>${job.cabinets} cab</span></div>
          <div class="row">${loc}${flags}</div>
        </button>`;
    })
    .join("");
}

function showDetail(jobId) {
  const job = jobFor(jobId);
  const panel = $("detailPanel");
  if (!job) {
    panel.hidden = true;
    return;
  }
  const placed = placementFor(jobId);
  const rack = placed ? rackFor(placed.rackId) : null;
  panel.hidden = false;
  $("detailJobName").textContent = job.name;
  $("detailMeta").innerHTML = `
    <div><strong>Firm date</strong>${escapeHtml(job.firmDate)}</div>
    <div><strong>Cabinets</strong>${job.cabinets}</div>
    <div><strong>Location</strong>${
      placed
        ? `${escapeHtml(rack?.label || placed.rackId)} · slot ${placed.slot}`
        : "Not placed"
    }</div>
    <div><strong>Flags</strong>${[
      job.paint ? "Paint" : null,
      job.wip ? "WIP" : null,
      placed?.mixed ? "Mixed pallet" : null,
      placed?.notes || null,
    ]
      .filter(Boolean)
      .join(" · ") || "None"}</div>
  `;
  $("detailClearBtn").disabled = !placed;
}

function slotRect(rack, slot) {
  const pad = 8;
  const innerW = rack.width - pad * 2;
  const slotW = innerW / rack.slots;
  return {
    x: rack.x + pad + (slot - 1) * slotW,
    y: rack.y + 22,
    w: slotW - 3,
    h: rack.height - 30,
  };
}

function drawMap() {
  const { width, height, areas, racks, landmarks } = state.map;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#0c100e";
  ctx.fillRect(0, 0, width, height);

  for (const area of areas) {
    ctx.fillStyle = "#17221c";
    ctx.strokeStyle = "#385042";
    ctx.lineWidth = 2;
    ctx.fillRect(area.x, area.y, area.width, area.height);
    ctx.strokeRect(area.x, area.y, area.width, area.height);
    ctx.fillStyle = "#aebcad";
    ctx.font = "600 13px Segoe UI, sans-serif";
    ctx.fillText(area.label, area.x + 10, area.y + 18);
  }

  for (const mark of landmarks) {
    ctx.fillStyle = "#24352c";
    ctx.fillRect(mark.x, mark.y, mark.width, mark.height);
    ctx.fillStyle = "#8ea392";
    ctx.font = "11px Segoe UI, sans-serif";
    ctx.fillText(mark.label, mark.x + 6, mark.y + 13);
  }

  for (const rack of racks) {
    ctx.fillStyle = "#1c2a23";
    ctx.strokeStyle = "#456352";
    ctx.lineWidth = 1.5;
    ctx.fillRect(rack.x, rack.y, rack.width, rack.height);
    ctx.strokeRect(rack.x, rack.y, rack.width, rack.height);
    ctx.fillStyle = "#c7d6c8";
    ctx.font = "600 12px Segoe UI, sans-serif";
    ctx.fillText(rack.label, rack.x + 8, rack.y + 16);

    for (let slot = 1; slot <= rack.slots; slot += 1) {
      const rect = slotRect(rack, slot);
      const occ = slotOccupant(rack.id, slot);
      const job = occ ? jobFor(occ.jobId) : null;
      const selected = job && job.id === state.selectedJobId;
      if (occ && job) {
        if (selected) ctx.fillStyle = "#2f6f66";
        else if (job.paint) ctx.fillStyle = "#2f6b4d";
        else if (job.wip) ctx.fillStyle = "#6d5a2a";
        else ctx.fillStyle = "#3a6b52";
      } else {
        ctx.fillStyle = "#121a16";
      }
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      ctx.strokeStyle = selected ? "#60c6ba" : "#2a3d33";
      ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
      if (occ && job) {
        ctx.fillStyle = "#f3f7f2";
        ctx.font = "600 10px Segoe UI, sans-serif";
        const label = job.id.replace("JOB-", "");
        ctx.fillText(label, rect.x + 4, rect.y + Math.min(16, rect.h - 4));
      } else {
        ctx.fillStyle = "#4d6356";
        ctx.font = "10px Segoe UI, sans-serif";
        ctx.fillText(String(slot), rect.x + 4, rect.y + 12);
      }
    }
  }

  if (state.placeMode) {
    ctx.fillStyle = "rgba(67,182,127,0.12)";
    ctx.fillRect(0, 0, width, height);
  }
}

function hitTest(mx, my) {
  for (const rack of state.map.racks) {
    for (let slot = 1; slot <= rack.slots; slot += 1) {
      const r = slotRect(rack, slot);
      if (mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h) {
        return { rack, slot, placement: slotOccupant(rack.id, slot) };
      }
    }
  }
  return null;
}

function canvasPoint(event) {
  const bounds = canvas.getBoundingClientRect();
  const scaleX = canvas.width / bounds.width;
  const scaleY = canvas.height / bounds.height;
  return {
    x: (event.clientX - bounds.left) * scaleX,
    y: (event.clientY - bounds.top) * scaleY,
  };
}

function selectJob(jobId) {
  state.selectedJobId = jobId;
  showDetail(jobId);
  render();
  const placed = placementFor(jobId);
  if (placed) {
    const rack = rackFor(placed.rackId);
    setStatus(`Selected ${jobId} at ${rack?.label || placed.rackId}, slot ${placed.slot}.`);
  } else {
    setStatus(`Selected ${jobId} — not on the map yet. Use Place pallet.`);
  }
}

function placeAt(rackId, slot) {
  const mode = state.placeMode;
  if (!mode) return;
  if (slotOccupant(rackId, slot)) {
    setStatus("That slot is occupied. Pick an empty one.");
    return;
  }
  const previous = placementFor(mode.jobId);
  const snapshot = state.placements.map((p) => ({ ...p }));
  pushUndo("place", () => {
    state.placements = snapshot;
  });
  state.placements = state.placements.filter((p) => p.jobId !== mode.jobId);
  state.placements.push({
    id: `p-${Date.now()}`,
    jobId: mode.jobId,
    rackId,
    slot,
    mixed: Boolean(mode.mixed),
    notes: previous?.notes || "",
    placedAt: new Date().toISOString(),
  });
  const job = jobFor(mode.jobId);
  if (job) {
    job.paint = Boolean(mode.paint);
    job.wip = Boolean(mode.wip);
  }
  state.placeMode = null;
  selectJob(mode.jobId);
  setStatus(`Placed ${mode.jobId} on ${rackId} slot ${slot}.`);
}

function clearPlacement(jobId) {
  const snapshot = state.placements.map((p) => ({ ...p }));
  if (!placementFor(jobId)) return;
  pushUndo("clear", () => {
    state.placements = snapshot;
  });
  state.placements = state.placements.filter((p) => p.jobId !== jobId);
  render();
  showDetail(jobId);
  setStatus(`Cleared placement for ${jobId}.`);
}

function openPlaceModal() {
  const unplaced = state.jobs.filter((j) => !placementFor(j.id));
  const select = $("placeJobSelect");
  const options = (unplaced.length ? unplaced : state.jobs)
    .map((j) => `<option value="${escapeHtml(j.id)}">${escapeHtml(j.name)}${placementFor(j.id) ? " (move)" : ""}</option>`)
    .join("");
  select.innerHTML = options;
  if (state.selectedJobId) select.value = state.selectedJobId;
  const job = jobFor(select.value);
  $("placeIsPaint").checked = Boolean(job?.paint);
  $("placeIsWip").checked = Boolean(job?.wip);
  $("placeIsMixed").checked = false;
  $("placeModal").hidden = false;
}

function render() {
  renderJobList();
  drawMap();
  showDetail(state.selectedJobId);
}

$("jobList").addEventListener("click", (event) => {
  const btn = event.target.closest("[data-job]");
  if (!btn) return;
  selectJob(btn.dataset.job);
});

$("jobSearchInput").addEventListener("input", (event) => {
  state.search = event.target.value;
  renderJobList();
});

$("jobFilterSelect").addEventListener("change", (event) => {
  state.filter = event.target.value;
  renderJobList();
});

$("hideWipToggle").addEventListener("change", (event) => {
  state.hideWip = event.target.checked;
  renderJobList();
  drawMap();
});

$("placeModeBtn").addEventListener("click", openPlaceModal);
$("placeCancelBtn").addEventListener("click", () => {
  $("placeModal").hidden = true;
  state.placeMode = null;
  drawMap();
  setStatus("Place cancelled.");
});
$("placeConfirmBtn").addEventListener("click", () => {
  const jobId = $("placeJobSelect").value;
  if (!jobId) return;
  state.placeMode = {
    jobId,
    paint: $("placeIsPaint").checked,
    wip: $("placeIsWip").checked,
    mixed: $("placeIsMixed").checked,
  };
  state.selectedJobId = jobId;
  $("placeModal").hidden = true;
  drawMap();
  setStatus(`Place mode: click an empty slot for ${jobId}.`);
});

$("detailClose").addEventListener("click", () => {
  state.selectedJobId = null;
  showDetail(null);
  drawMap();
  renderJobList();
});

$("detailClearBtn").addEventListener("click", () => {
  if (state.selectedJobId) clearPlacement(state.selectedJobId);
});

$("undoBtn").addEventListener("click", () => {
  const entry = state.undoStack.pop();
  if (!entry) return;
  entry.apply();
  $("undoBtn").disabled = state.undoStack.length === 0;
  render();
  setStatus(`Undid ${entry.label}.`);
});

canvas.addEventListener("click", (event) => {
  const pt = canvasPoint(event);
  const hit = hitTest(pt.x, pt.y);
  if (!hit) return;
  if (state.placeMode) {
    placeAt(hit.rack.id, hit.slot);
    return;
  }
  if (hit.placement) {
    selectJob(hit.placement.jobId);
  } else {
    setStatus(`${hit.rack.label} · empty slot ${hit.slot}`);
  }
});

window.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
    event.preventDefault();
    $("undoBtn").click();
  }
});

render();
setStatus("Ready — search a job or click a pallet on the map.");
