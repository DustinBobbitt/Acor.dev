const data = window.WOOD_USAGE_DEMO_DATA;
let jobView = "all";
let lastLines = [];

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch])
  );
}

function metricCard(label, value, sub = "") {
  return `<article class="metric"><div class="label">${escapeHtml(label)}</div><div class="value">${value}</div><div class="sub">${escapeHtml(sub)}</div></article>`;
}

function parseSkuLines(raw) {
  const chunks = String(raw || "")
    .split(/[\n,]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const lines = [];
  for (const chunk of chunks) {
    const match = chunk.match(/^([A-Za-z0-9_-]+)(?:\[(\d+)\])?$/);
    if (!match) {
      lines.push({ sku: chunk.toUpperCase(), qty: 1, unknown: true, bad: true });
      continue;
    }
    const sku = match[1].toUpperCase();
    const qty = Math.max(1, Number(match[2] || 1));
    const entry = data.catalog[sku];
    if (!entry) {
      lines.push({ sku, qty, unknown: true });
    } else {
      lines.push({
        sku,
        qty,
        type: entry.type,
        pw05: entry.pw05 * qty,
        pw075: entry.pw075 * qty,
        machineMin: entry.machineMin * qty,
      });
    }
  }
  return lines;
}

function renderHero() {
  document.getElementById("heroMetrics").innerHTML = [
    metricCard("Product mappings", data.hero.mappings, "active catalog maps"),
    metricCard("Pending cabinets", data.hero.pending, "awaiting lookup"),
    metricCard("Recent calculations", data.hero.recent, "this week"),
  ].join("");
}

function renderJobs() {
  const needle = (document.getElementById("jobSearch").value || "").trim().toLowerCase();
  const jobs = data.jobs.filter((job) => {
    if (jobView !== "all" && job.stage !== jobView) return false;
    if (!needle) return true;
    return job.id.toLowerCase().includes(needle);
  });
  document.getElementById("jobPricingTable").innerHTML = `
    <table>
      <thead><tr><th>Job</th><th>Due</th><th>Status</th><th>Cabinets</th><th>Forecast</th><th>Readiness</th></tr></thead>
      <tbody>
        ${jobs
          .map((job) => {
            const price = job.forecast == null ? "Needs mapping" : `$${job.forecast.toFixed(2)}`;
            const ready = job.ready
              ? `<span class="pill ok">Ready</span>`
              : `<span class="pill warn">Partial · ${job.coverage}%</span>`;
            return `<tr>
              <td><strong>${escapeHtml(job.id)}</strong></td>
              <td>${escapeHtml(job.due)}</td>
              <td>${escapeHtml(job.stage)}</td>
              <td>${job.cabinets}</td>
              <td><strong>${escapeHtml(price)}</strong></td>
              <td>${ready}</td>
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>`;
}

function renderHistory() {
  document.getElementById("historyTable").innerHTML = `
    <table>
      <thead><tr><th>When</th><th>SKUs</th><th>PW 1/2</th><th>PW 3/4</th></tr></thead>
      <tbody>
        ${data.history
          .map(
            (row) => `<tr>
              <td>${escapeHtml(new Date(row.at).toLocaleString())}</td>
              <td>${row.skus}</td>
              <td>${row.pw05.toFixed(2)}</td>
              <td>${row.pw075.toFixed(2)}</td>
            </tr>`
          )
          .join("")}
      </tbody>
    </table>`;
}

function renderMissing() {
  document.getElementById("missingTable").innerHTML = `
    <table>
      <thead><tr><th>SKU</th><th>Searches</th><th>Status</th></tr></thead>
      <tbody>
        ${data.missing
          .map(
            (row) => `<tr>
              <td>${escapeHtml(row.sku)}</td>
              <td>${row.searches}</td>
              <td>${escapeHtml(row.status)}</td>
            </tr>`
          )
          .join("")}
      </tbody>
    </table>`;
}

function renderCalculation(lines) {
  lastLines = lines;
  const known = lines.filter((line) => !line.unknown && !line.bad);
  const unknown = lines.filter((line) => line.unknown || line.bad);
  const pw05 = known.reduce((sum, line) => sum + line.pw05, 0);
  const pw075 = known.reduce((sum, line) => sum + line.pw075, 0);
  const minutes = known.reduce((sum, line) => sum + line.machineMin, 0);
  const material =
    pw05 * data.rates.pw05Sheet + pw075 * data.rates.pw075Sheet;
  const machine = (minutes / 60) * data.rates.machineHour;
  const total = material + machine;

  document.getElementById("calculateResults").innerHTML = `
    <table>
      <thead><tr><th>SKU</th><th>Qty</th><th>Type</th><th>PW 1/2</th><th>PW 3/4</th><th>Machine min</th></tr></thead>
      <tbody>
        ${lines
          .map((line) => {
            if (line.unknown || line.bad) {
              return `<tr><td>${escapeHtml(line.sku)}</td><td>${line.qty}</td><td colspan="4"><span class="pill warn">${line.bad ? "Invalid syntax" : "Unknown SKU"}</span></td></tr>`;
            }
            return `<tr>
              <td>${escapeHtml(line.sku)}</td>
              <td>${line.qty}</td>
              <td>${escapeHtml(line.type)}</td>
              <td>${line.pw05.toFixed(2)}</td>
              <td>${line.pw075.toFixed(2)}</td>
              <td>${line.machineMin}</td>
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>`;

  document.getElementById("calculatePricing").innerHTML = `
    <div class="pricing-card">
      <p class="section-label">Forecast total</p>
      <div class="metric-band">
        ${metricCard("Sheets 1/2", pw05.toFixed(2), "PW05")}
        ${metricCard("Sheets 3/4", pw075.toFixed(2), "PW075")}
        ${metricCard("Machine time", `${minutes} min`, `$${data.rates.machineHour}/hr`)}
        ${metricCard("Forecast price", `$${total.toFixed(2)}`, `mat $${material.toFixed(2)} + mach $${machine.toFixed(2)}`)}
      </div>
      ${
        unknown.length
          ? `<p class="task-note">${unknown.length} SKU(s) need catalog follow-up and were excluded from the forecast total.</p>`
          : `<p class="task-note">All SKUs resolved against the mock catalog.</p>`
      }
    </div>`;

  document.getElementById("actionStatus").textContent =
    `Calculated ${known.length} mapped line(s)` +
    (unknown.length ? `, ${unknown.length} unknown.` : ".");
}

function exportCsv() {
  if (!lastLines.length) {
    document.getElementById("actionStatus").textContent = "Calculate first, then export.";
    return;
  }
  const rows = [["sku", "qty", "type", "pw05", "pw075", "machine_min"]];
  for (const line of lastLines) {
    rows.push([
      line.sku,
      line.qty,
      line.type || "",
      line.pw05 != null ? line.pw05.toFixed(2) : "",
      line.pw075 != null ? line.pw075.toFixed(2) : "",
      line.machineMin != null ? line.machineMin : "",
    ]);
  }
  const csv = rows.map((row) => row.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "wood-usage-demo.csv";
  a.click();
  URL.revokeObjectURL(url);
  document.getElementById("actionStatus").textContent = "Exported demo CSV.";
}

document.getElementById("jobViewFilters").addEventListener("click", (event) => {
  const btn = event.target.closest("[data-view]");
  if (!btn) return;
  jobView = btn.dataset.view;
  document.querySelectorAll("#jobViewFilters .button").forEach((node) => {
    node.classList.toggle("secondary", node.dataset.view !== jobView);
  });
  renderJobs();
});

document.getElementById("jobSearch").addEventListener("input", renderJobs);

document.getElementById("calculateForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const lines = parseSkuLines(document.getElementById("skuInput").value);
  if (!lines.length) {
    document.getElementById("actionStatus").textContent = "Enter at least one SKU.";
    return;
  }
  renderCalculation(lines);
});

document.getElementById("similarForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const prefix = (document.getElementById("similarInput").value || "").trim().toUpperCase();
  const matches = Object.entries(data.catalog)
    .filter(([sku]) => !prefix || sku.startsWith(prefix))
    .slice(0, 12);
  document.getElementById("similarResults").innerHTML = `
    <table>
      <thead><tr><th>SKU</th><th>Type</th><th>PW 1/2</th><th>PW 3/4</th><th>Min</th></tr></thead>
      <tbody>
        ${matches
          .map(
            ([sku, entry]) => `<tr>
              <td>${escapeHtml(sku)}</td>
              <td>${escapeHtml(entry.type)}</td>
              <td>${entry.pw05.toFixed(2)}</td>
              <td>${entry.pw075.toFixed(2)}</td>
              <td>${entry.machineMin}</td>
            </tr>`
          )
          .join("") || `<tr><td colspan="5">No matches</td></tr>`}
      </tbody>
    </table>`;
});

document.getElementById("resetSampleBtn").addEventListener("click", () => {
  document.getElementById("skuInput").value = data.sampleInput;
  renderCalculation(parseSkuLines(data.sampleInput));
});

document.getElementById("exportCsvBtn").addEventListener("click", exportCsv);

renderHero();
renderJobs();
renderHistory();
renderMissing();
document.getElementById("skuInput").value = data.sampleInput;
renderCalculation(parseSkuLines(data.sampleInput));
