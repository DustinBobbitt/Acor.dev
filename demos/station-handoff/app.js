let scenario;
let job;
let station;
let state = "ready";
let events = [];

const $ = (selector) => document.querySelector(selector);
const escapeText = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[character]);

function addEvent(time, message) {
  events.push({ time, message });
}

function reset() {
  state = "ready";
  events = [{ time: "09:03", message: `Station reports prior verified set ${station.active_before.set_id}; no incoming files are active.` }];
  render();
}

function runInterrupted() {
  state = "rolled_back";
  events = [];
  addEvent("09:04", `${job.release_id} resolved to ${job.set_id}; source manifest identity matched.`);
  addEvent("09:05", `Backed up ${station.active_before.set_id} before opening the staging transaction.`);
  addEvent("09:06", `Copied 2 of ${job.source_manifest.program_count} expected files into staging.`);
  addEvent("09:07", "INTERRUPTION: staged manifest was incomplete; commit refused.");
  addEvent("09:08", `Removed partial staging and restored ${station.active_before.set_id} as the active station set.`);
  render();
}

function runRetry() {
  state = "committed";
  events = [];
  addEvent("09:11", `${job.release_id} and ${job.source_manifest.manifest_hash} reverified against the released source.`);
  addEvent("09:12", `Backed up ${station.active_before.set_id}; staged ${job.source_manifest.program_count} of ${job.source_manifest.program_count} expected files.`);
  addEvent("09:13", `Verified ${job.source_manifest.total_bytes} bytes and every expected file hash in staging.`);
  addEvent("09:14", `Committed ${job.set_id} to ${station.station_id}; prior set remains recoverable in backup.`);
  addEvent("09:15", "Custody receipt recorded. Physical controller execution remains outside this simulation.");
  render();
}

function fileRows(files) {
  return files.length ? files.map((file) => `<li class="custody-file-row"><span>${escapeText(file.name)}</span><code>${escapeText(file.bytes)} B</code></li>`).join("") : `<li class="custody-file-row"><span>Empty</span><code>—</code></li>`;
}

function setRow(setId, count) {
  return `<li class="custody-file-row"><span>${escapeText(setId)}</span><code>${escapeText(count)} files</code></li>`;
}

function renderZones() {
  const incoming = job.source_manifest.programs;
  $("#sourceFiles").innerHTML = fileRows(incoming);
  $("#backupFiles").innerHTML = state === "ready" ? fileRows([]) : setRow(station.active_before.set_id, station.active_before.program_count);
  $("#stagingFiles").innerHTML = state === "ready" ? fileRows([]) : state === "rolled_back" ? fileRows([]) : setRow(job.set_id, job.source_manifest.program_count);
  $("#activeFiles").innerHTML = state === "committed" ? setRow(job.set_id, job.source_manifest.program_count) : setRow(station.active_before.set_id, station.active_before.program_count);
  ["sourceZone", "backupZone", "stagingZone", "activeZone"].forEach((id) => $("#" + id).classList.remove("is-highlighted", "is-restored"));
  if (state === "ready") $("#sourceZone").classList.add("is-highlighted");
  if (state === "rolled_back") $("#activeZone").classList.add("is-restored");
  if (state === "committed") $("#activeZone").classList.add("is-highlighted");
}

function renderOutcome() {
  const copy = {
    ready: `No load attempted. ${station.station_id} still presents ${station.active_before.set_id}.`,
    rolled_back: `The incomplete stage never became active. ${station.active_before.set_id} was restored, and the attempted ${job.set_id} load is recorded as refused.`,
    committed: `${job.set_id} became active only after the staged byte count and all file hashes matched the released manifest.`
  };
  const badge = { ready: "Ready to simulate", rolled_back: "Rolled back safely", committed: "Verified custody receipt" };
  $("#outcomeCopy").textContent = copy[state];
  $("#handoffState").textContent = badge[state];
  $("#manifestFacts").innerHTML = `
    <li class="artifact-row"><span>Released identity</span><code>${escapeText(job.release_id)}</code></li>
    <li class="artifact-row"><span>Manifest</span><code>${escapeText(job.source_manifest.manifest_hash)}</code></li>
    <li class="artifact-row"><span>Expected payload</span><code>${job.source_manifest.program_count} files · ${job.source_manifest.total_bytes} B</code></li>
    <li class="artifact-row"><span>Machine run evidence</span><code>not claimed</code></li>`;
}

function renderEvents() {
  $("#eventList").innerHTML = events.map((event) => `<li><time>${event.time}</time><span>${escapeText(event.message)}</span></li>`).join("");
}

function render() {
  $("#handoffTitle").textContent = `${job.job_id} · ${job.set_id}`;
  $("#handoffSummary").textContent = `${job.cabinet_count} cabinets · ${job.source_manifest.program_count} public fixture files · ${station.station_id}`;
  renderZones();
  renderOutcome();
  renderEvents();
  $("#retryButton").disabled = state === "committed";
}

async function init() {
  const response = await fetch("../shared/manufacturing-day.json", { cache: "no-store" });
  if (!response.ok) throw new Error(`Fixture request failed: ${response.status}`);
  scenario = await response.json();
  station = scenario.station;
  job = scenario.jobs.find((candidate) => candidate.job_id === "DEMO-1054");
  $("#scenarioNotice").textContent = `${scenario.notice} Scenario ${scenario.scenario_id}. Reset discards all browser-local transaction state.`;
  $("#failButton").addEventListener("click", runInterrupted);
  $("#retryButton").addEventListener("click", runRetry);
  $("#resetButton").addEventListener("click", reset);
  reset();
}

init().catch((error) => {
  $("#scenarioNotice").textContent = `The local public fixture could not be loaded: ${error.message}`;
});
