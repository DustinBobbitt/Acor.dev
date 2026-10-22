let scenario;
let job;
let request;
let state = "selecting";
let selected = new Set();
let events = [];

const $ = (selector) => document.querySelector(selector);
const escapeText = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[character]);

function reset() {
  state = "selecting";
  selected = new Set(request.requested_items);
  events = [{time:"10:20", message:"Reconstructed the exact public request seed; no claim or output exists."}];
  render();
}

function toggleItem(itemId) {
  if (state !== "selecting") return;
  selected.has(itemId) ? selected.delete(itemId) : selected.add(itemId);
  render();
}

function freeze() {
  if (!selected.size) return;
  state = "frozen";
  events.push({time:"10:21", message:`Frozen ${selected.size} exact item identities as ${request.request_id}.`});
  events.push({time:"10:22", message:`Captured request ${request.request_hash} and input ${request.frozen_input_hash}.`});
  render();
}

function makeStale() {
  state = "refused";
  events.push({time:"10:23", message:"Simulated source revision changed after plan review."});
  events.push({time:"10:24", message:"REFUSED: current input hash did not match the frozen plan; no artifacts were generated."});
  render();
}

function generate() {
  state = "received";
  events.push({time:"10:23", message:"Claimed the frozen request identity and reverified the input hash."});
  events.push({time:"10:24", message:`Verified ${request.artifact_count} artifacts and ${request.artifact_bytes} total bytes.`});
  events.push({time:"10:25", message:`Recorded ${request.receipt_id} with ${request.receipt_hash}.`});
  render();
}

function renderItems() {
  $("#requestItems").innerHTML = job.items.map((item) => `<label class="request-item"><input type="checkbox" value="${escapeText(item)}" ${selected.has(item) ? "checked" : ""} ${state !== "selecting" ? "disabled" : ""}><span>${escapeText(job.job_id)} / ${escapeText(item)}</span></label>`).join("");
  document.querySelectorAll("#requestItems input").forEach((input) => input.addEventListener("change", () => toggleItem(input.value)));
}

function renderFacts() {
  $("#planFacts").innerHTML = state === "selecting" ? `<li class="artifact-row"><span>Not frozen</span><code>${selected.size} selected</code></li>` : `<li class="artifact-row"><span>Request</span><code>${escapeText(request.request_id)}</code></li><li class="artifact-row"><span>Plan hash</span><code>${escapeText(request.request_hash)}</code></li><li class="artifact-row"><span>Input hash</span><code>${escapeText(request.frozen_input_hash)}</code></li>`;
  $("#receiptFacts").innerHTML = state === "received" ? `<li class="artifact-row"><span>Receipt</span><code>${escapeText(request.receipt_id)}</code></li><li class="artifact-row"><span>Artifacts</span><code>${request.artifact_count} · ${request.artifact_bytes} B</code></li><li class="artifact-row"><span>Receipt hash</span><code>${escapeText(request.receipt_hash)}</code></li>` : `<li class="artifact-row"><span>Receipt</span><code>not recorded</code></li>`;
}

function renderDecision() {
  const copy = {
    selecting: "Choose the exact item identities included in the request.",
    frozen: "The plan is frozen. You can now test a stale-input refusal or generate against the unchanged input.",
    refused: "The stale plan was rejected before generation. No receipt exists and no partial result is represented as success.",
    received: "The immutable request, frozen input, artifact verification and receipt identity now form one traceable chain."
  };
  const badge = {selecting:"Exact selection",frozen:"Plan frozen",refused:"Stale plan refused",received:"Receipt verified"};
  $("#outcomeCopy").textContent = copy[state];
  $("#requestState").textContent = badge[state];
  $("#decisionFacts").innerHTML = `<li class="artifact-row"><span>Selected items</span><code>${selected.size}</code></li><li class="artifact-row"><span>Generated artifacts</span><code>${state === "received" ? request.artifact_count : 0}</code></li>`;
}

function render() {
  $("#requestTitle").textContent = `${job.job_id} · ${request.request_id}`;
  $("#requestSummary").textContent = `${job.cabinet_count} cabinets · ${job.item_count} candidate identities · invented public data`;
  renderItems();
  renderFacts();
  renderDecision();
  $("#eventList").innerHTML = events.map((event) => `<li><time>${event.time}</time><span>${escapeText(event.message)}</span></li>`).join("");
  $("#freezeButton").disabled = state !== "selecting" || !selected.size;
  $("#staleButton").disabled = state !== "frozen";
  $("#generateButton").disabled = state !== "frozen";
}

async function init() {
  const response = await fetch("../shared/manufacturing-day.json", {cache:"no-store"});
  if (!response.ok) throw new Error(`Fixture request failed: ${response.status}`);
  scenario = await response.json();
  job = scenario.jobs.find((candidate) => candidate.job_id === "DEMO-1042");
  request = job.request;
  $("#scenarioNotice").textContent = `${scenario.notice} Scenario ${scenario.scenario_id}. Reset reconstructs the reviewed request seed.`;
  $("#freezeButton").addEventListener("click", freeze);
  $("#staleButton").addEventListener("click", makeStale);
  $("#generateButton").addEventListener("click", generate);
  $("#resetButton").addEventListener("click", reset);
  reset();
}

init().catch((error) => { $("#scenarioNotice").textContent = `The local public fixture could not be loaded: ${error.message}`; });
