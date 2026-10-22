const STEPS = [
  { id: "source", label: "Source", detail: "Exact job and item identity" },
  { id: "resolve", label: "Resolve", detail: "Recipe and material references" },
  { id: "preflight", label: "Preflight", detail: "All active operations admitted" },
  { id: "geometry", label: "DXF set", detail: "Complete set stages atomically" },
  { id: "nest", label: "Canonical nest", detail: "One sheet definition" },
  { id: "posts", label: "TAP + XPR", detail: "Independent validation outcomes" }
];

let scenario;
let selectedJob;
let completedStep = -1;
let events = [];

const $ = (selector) => document.querySelector(selector);
const escapeText = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[character]);

function scenarioJobs() {
  return scenario.jobs.filter((job) => job.job_id === "DEMO-1042" || job.job_id === "DEMO-1063");
}

function isRefusal() {
  return selectedJob.job_id === "DEMO-1063";
}

function stopIndex() {
  return isRefusal() ? 2 : STEPS.length - 1;
}

function eventTime(index) {
  return `08:${String(12 + index).padStart(2, "0")}`;
}

function eventFor(step, index) {
  const pipeline = selectedJob.pipeline || {};
  const messages = {
    source: `${selectedJob.job_id} resolved to ${selectedJob.item_count} exact item ${selectedJob.item_count === 1 ? "identity" : "identities"}.`,
    resolve: `${pipeline.recipe} and ${selectedJob.material} loaded from the public fixture.`,
    preflight: isRefusal() ? `REFUSED: ${pipeline.unsupported_operation} is active and has no implemented handler.` : "Supported outline, bore, and route operations passed whole-set preflight.",
    geometry: `${pipeline.dxf_count} DXFs staged and published as one complete set.`,
    nest: `${pipeline.sheet_count} canonical sheets created for ${pipeline.set_id}.`,
    posts: `${pipeline.tap?.program_count ?? 0} TAP and ${pipeline.xpr?.program_count ?? 0} XPR/NC programs validated independently.`
  };
  return { time: eventTime(index), message: messages[step.id] };
}

function resetSelected() {
  completedStep = -1;
  events = [];
  render();
}

function selectJob(jobId) {
  selectedJob = scenarioJobs().find((job) => job.job_id === jobId);
  resetSelected();
}

function advance() {
  if (completedStep >= stopIndex()) return;
  completedStep += 1;
  events.push(eventFor(STEPS[completedStep], completedStep));
  render();
}

function runToOutcome() {
  while (completedStep < stopIndex()) {
    completedStep += 1;
    events.push(eventFor(STEPS[completedStep], completedStep));
  }
  render();
}

function renderPicker() {
  $("#jobPicker").innerHTML = scenarioJobs().map((job) => `
    <button class="job-option" type="button" data-job="${escapeText(job.job_id)}" aria-pressed="${job.job_id === selectedJob.job_id}">
      <strong>${escapeText(job.job_id)}</strong>
      <span>${escapeText(job.purpose)}</span>
    </button>`).join("");
  document.querySelectorAll("[data-job]").forEach((button) => button.addEventListener("click", () => selectJob(button.dataset.job)));
}

function renderSummary() {
  const pipeline = selectedJob.pipeline || {};
  const cells = [
    ["Cabinets", selectedJob.cabinet_count],
    ["Exact items", selectedJob.item_count],
    ["Recipe", pipeline.recipe],
    [isRefusal() ? "Expected stop" : "Plan identity", isRefusal() ? "Recipe preflight" : pipeline.plan_hash]
  ];
  $("#scenarioSummary").innerHTML = cells.map(([label, value]) => `<article><span>${escapeText(label)}</span><strong>${escapeText(value)}</strong></article>`).join("");
}

function renderTrack() {
  $("#pipelineTrack").innerHTML = STEPS.map((step, index) => {
    let state = "";
    if (index <= completedStep) state = "is-complete";
    if (index === completedStep + 1 && completedStep < stopIndex()) state = "is-active";
    if (isRefusal() && completedStep >= 2 && index === 2) state = "is-failed";
    const status = isRefusal() && completedStep >= 2 && index === 2 ? "Refused" : index <= completedStep ? "Recorded" : index === completedStep + 1 ? "Next" : "Pending";
    return `<article class="pipeline-step ${state}"><span>${String(index + 1).padStart(2, "0")} · ${status}</span><strong>${escapeText(step.label)}</strong><small>${escapeText(step.detail)}</small></article>`;
  }).join("");
}

function renderOutcome() {
  const pipeline = selectedJob.pipeline || {};
  const finished = completedStep >= stopIndex();
  if (!finished) {
    $("#outcomeCopy").textContent = completedStep < 0 ? "Nothing has been generated. Source identity exists, but no downstream state may be implied yet." : `Recorded through ${STEPS[completedStep].label}. Later states remain pending.`;
    $("#artifactList").innerHTML = "";
    return;
  }
  if (isRefusal()) {
    $("#outcomeCopy").textContent = "The set stopped before geometry publication. The prior output remains untouched; no partial files, nest, TAP, or XPR/NC result exists.";
    $("#artifactList").innerHTML = `<li class="artifact-row"><span>Guarded refusal</span><code>${escapeText(pipeline.expected_stop)}</code></li><li class="artifact-row"><span>Published files</span><code>0</code></li>`;
    return;
  }
  $("#outcomeCopy").textContent = "The complete geometry set and canonical sheets were recorded before either controller-format outcome. Both format results are explicit siblings, not renamed copies.";
  $("#artifactList").innerHTML = `
    <li class="artifact-row"><span>${pipeline.dxf_count} DXFs · ${pipeline.sheet_count} sheets</span><code>${escapeText(pipeline.set_id)}</code></li>
    <li class="artifact-row"><span>TAP · ${pipeline.tap.program_count} programs</span><code>${escapeText(pipeline.tap.hash)}</code></li>
    <li class="artifact-row"><span>XPR/NC · ${pipeline.xpr.program_count} programs</span><code>${escapeText(pipeline.xpr.hash)}</code></li>`;
}

function renderEvents() {
  $("#eventList").innerHTML = events.length ? events.map((event) => `<li><time>${event.time}</time><span>${escapeText(event.message)}</span></li>`).join("") : "<li><time>08:11</time><span>Reset from the immutable public fixture.</span></li>";
}

function render() {
  renderPicker();
  $("#selectedJob").textContent = selectedJob.job_id;
  $("#selectedPurpose").textContent = selectedJob.purpose;
  $("#jobState").textContent = isRefusal() ? "Expected guarded refusal" : "Expected complete set";
  renderSummary();
  renderTrack();
  renderOutcome();
  renderEvents();
  $("#advanceButton").disabled = completedStep >= stopIndex();
  $("#runButton").disabled = completedStep >= stopIndex();
}

async function init() {
  const response = await fetch("../shared/manufacturing-day.json", { cache: "no-store" });
  if (!response.ok) throw new Error(`Fixture request failed: ${response.status}`);
  scenario = await response.json();
  $("#scenarioNotice").textContent = `${scenario.notice} Scenario ${scenario.scenario_id}. Reset always reconstructs this seed.`;
  selectedJob = scenarioJobs()[0];
  $("#advanceButton").addEventListener("click", advance);
  $("#runButton").addEventListener("click", runToOutcome);
  $("#resetButton").addEventListener("click", resetSelected);
  render();
}

init().catch((error) => {
  $("#scenarioNotice").textContent = `The local public fixture could not be loaded: ${error.message}`;
});
