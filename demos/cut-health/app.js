async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!response.ok) {
    const text = await response.text();
    if (response.status === 404 || response.status === 501) {
      throw new Error('This dashboard feature needs a server restart. Close and reopen the Cut Health Dashboard, then try again.');
    }
    let message = text || `Request failed: ${response.status}`;
    try {
      const payload = JSON.parse(text);
      if (payload?.error) {
        message = payload.error;
      }
    } catch {
      if (/<!DOCTYPE|<html|Error response/i.test(text)) {
        throw new Error('This dashboard feature needs a server restart. Close and reopen the Cut Health Dashboard, then try again.');
      }
      // keep raw message
    }
    if (message.length > 240) {
      message = `${message.slice(0, 240)}?`;
    }
    // Carry the status so callers can tell a refusal (409, overridable) from a
    // failure, instead of pattern-matching the wording of the message.
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

// A 409 from the dispatch endpoints is always a protection the office can
// knowingly override, never a breakage.
function isOmniConflict(error) {
  return error?.status === 409;
}

const NEW_HIRE_TASK_COLLAPSED_KEY = 'newHireTaskCollapsedV2';
const OPERATOR_DATE_BASIS_KEY = 'cutHealthOperatorDateBasis';
const OVERVIEW_CACHE_KEY = 'cutHealthOverviewCacheV1';

let machineIssueSortField = 'date';
let machineIssueSortAsc = false;
let paletteLabelsMode = 'ready';
let _completedTodayDay = '';
let _overviewToday = null;
let currentSnapshotTrainee = '';
let _lastMachineIssueData = null;
let _departmentRecordSummary = {
  machineIssues: { total: 0, open: 0 },
  training: { trainees: 0, observations: 0 },
};

const MODAL_IDS = [
  'machineIssuesModal',
  'trainingMatrixModal',
  'itemLookupModal',
  'paletteLabelsModal',
  'completedTodayModal',
  'aheadGoalModal',
  'manualAddedModal',
  'walkupRequestModal',
  'snapshotHistoryModal',
  'mdbWizardModal',
  'pqWizardModal',
  'pqFloorAddModal',
  'pqJobCardModal',
  'trimChecklistModal',
  'trimChecklistPreviewModal',
  'cabinetWelcomeGuideModal',
  'poChangesModal',
  'notesModal',
  'eodReviewModal',
  'eodEmailModal',
  'restockViewerModal',
  'previewCheckModal',
  'routerStockModal',
  'morningPlanModal',
  'reclaimedViewerModal',
];

function syncModalBodyLock() {
  const anyOpen = MODAL_IDS.some((id) => {
    const node = document.getElementById(id);
    return node && !node.hidden;
  });
  document.body.classList.toggle('modal-open', anyOpen);
}

function setMachineIssueFormExpanded(expanded) {
  const body = document.getElementById('machineIssueFormBody');
  const toggle = document.getElementById('toggleMachineIssueForm');
  if (!body || !toggle) return;
  if (!expanded) {
    resetMachineIssueForm();
  }
  body.hidden = !expanded;
  toggle.textContent = expanded ? 'Hide add form' : 'Add issue';
  toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
}

function resetMachineIssueForm() {
  const form = document.getElementById('machineIssueForm');
  if (!form) return;
  form.reset();
  const idField = document.getElementById('machineIssueId');
  if (idField) idField.value = '';
  const dateField = document.getElementById('machineIssueDate');
  if (dateField) dateField.value = new Date().toISOString().slice(0, 10);
  const submitBtn = document.getElementById('machineIssueSubmitBtn');
  if (submitBtn) submitBtn.textContent = 'Add Issue';
  const cancelBtn = document.getElementById('cancelMachineIssueEdit');
  if (cancelBtn) cancelBtn.hidden = true;
}

function beginMachineIssueEdit(entry) {
  const form = document.getElementById('machineIssueForm');
  if (!form || !entry) return;
  setMachineIssueFormExpanded(true);
  document.getElementById('machineIssueId').value = entry.id || '';
  document.getElementById('machineIssueDate').value = entry.date || '';
  document.getElementById('machineIssueMachine').value = entry.machine || '';
  document.getElementById('machineIssueStatus').value = entry.status || '';
  form.querySelector('[name="issue"]').value = entry.issue || '';
  const notified = Array.isArray(entry.notified) ? entry.notified.join(', ') : String(entry.notified || '');
  document.getElementById('machineIssueNotified').value = notified;
  form.querySelector('[name="summary"]').value = entry.summary || '';
  form.querySelector('[name="actions"]').value = entry.actions || '';
  form.querySelector('[name="result"]').value = entry.result || '';
  document.getElementById('machineIssueSubmitBtn').textContent = 'Update Issue';
  document.getElementById('cancelMachineIssueEdit').hidden = false;
  document.getElementById('machineIssueFormBody').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function metricCard(label, value, sub = '') {
  return `
    <article class="metric">
      <div class="label">${label}</div>
      <div class="value">${value}</div>
      <div class="sub">${sub}</div>
    </article>
  `;
}

function walkupHeroSubtitle(manual) {
  const names = (manual.names || []).filter(Boolean);
  const count = Number(manual.request_count || 0);
  if (names.length) {
    const shown = names.slice(0, 2).join(' · ');
    return names.length > 2 ? `${shown} · +${names.length - 2}` : shown;
  }
  return `${count} request${count === 1 ? '' : 's'}`;
}

function actionMetricCard(id, label, value, sub = '') {
  return `
    <button id="${id}" class="metric metric-action" type="button">
      <div class="label">${label}</div>
      <div class="value">${value}</div>
      <div class="sub">${sub}</div>
    </button>
  `;
}

function formatTimestamp(value) {
  if (!value) return '--';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

function aheadGoalHorizonSubtitle(backlog) {
  const days = backlog?.ahead_goal_days || 14;
  const start = backlog?.goal_horizon_start;
  const end = backlog?.goal_horizon_end;
  if (start && end) {
    return `Through SDD ${formatDateUS(end)} · ${days} calendar days ahead`;
  }
  return `${days} calendar days ahead by SDD`;
}

function renderHeroMetrics(data) {
  const today = data.today;
  _overviewToday = today;
  const manual = today.manual_added || {};
  const backlog = data.backlog || {};
  document.getElementById('heroMetrics').innerHTML = [
    actionMetricCard(
      'completedTodayTile',
      'Completed Today',
      today.total,
      today.warehouse_pull
        ? `${today.carcass} carcass / ${today.trim} trim · ${today.warehouse_pull} warehouse pull`
        : `${today.carcass} carcass / ${today.trim} trim`,
    ),
    actionMetricCard(
      'manualAddedTile',
      'Walk-up Requests',
      manual.item_count || 0,
      walkupHeroSubtitle(manual),
    ),
    actionMetricCard(
      'aheadGoalTile',
      'Jobs To Reach Goal',
      backlog.jobs_needed_to_reach_goal ?? 0,
      aheadGoalHorizonSubtitle(backlog),
    ),
  ].join('');
  document.getElementById('completedTodayTile').addEventListener('click', () => {
    openCompletedTodayFromHero().catch((error) => alert(error.message));
  });
  document.getElementById('manualAddedTile').addEventListener('click', () => {
    openManualAddedModal().catch((error) => alert(error.message));
  });
  document.getElementById('aheadGoalTile').addEventListener('click', () => {
    openAheadGoalModal().catch((error) => alert(error.message));
  });
  document.getElementById('sourceState').textContent = `Source: ${today.source_state || 'Unknown'}`;
  document.getElementById('refreshState').textContent = `Latest refresh: ${formatTimestamp(today.latest_refresh_timestamp)}`;
  api(`/api/manual-added?day=${encodeURIComponent(new Date().toISOString().slice(0, 10))}`).then((data) => {
    const tile = document.getElementById('manualAddedTile');
    if (!tile) return;
    const names = (data.requests || []).map((entry) => entry.description).filter(Boolean);
    const value = tile.querySelector('.value');
    const sub = tile.querySelector('.sub');
    if (value) value.textContent = String(data.summary?.item_count || 0);
    if (sub) sub.textContent = walkupHeroSubtitle({
      request_count: data.request_count || data.summary?.request_count,
      names,
    });
  }).catch(() => {});
}

function readOverviewCache() {
  try {
    const raw = localStorage.getItem(OVERVIEW_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const data = parsed && parsed.data;
    if (!data || !data.recent_performance || !data.today) return null;
    return data;
  } catch (_err) {
    return null;
  }
}

function writeOverviewCache(data) {
  if (!data || !data.recent_performance) return;
  try {
    localStorage.setItem(OVERVIEW_CACHE_KEY, JSON.stringify({
      saved_at: Date.now(),
      refreshed_at: data?.today?.latest_refresh_timestamp || data?.backlog?.snapshot_refreshed_at || null,
      data,
    }));
  } catch (_err) {
    // Ignore quota / private-mode failures.
  }
}

function applyOverview(data) {
  renderHeroMetrics(data);
  rpEnsureInit();
  renderPerformance(data);
  renderAheadRing(data);
  renderBacklog(data);
  renderReports(data);
  if (_rpWorkloadLoaded) loadWorkloadDistribution().catch(() => {});
}

function paintOverviewFromCache() {
  const cached = readOverviewCache();
  if (!cached) return false;
  applyOverview(cached);
  return true;
}

// An average over zero eligible days is not "0 cabinets a day" -- it is "not
// measured yet". Printing 0 would read as the floor having produced nothing.
function averageValue(window) {
  return Number(window?.days) > 0 ? window.average_per_day : '--';
}

function averageCaption(window) {
  if (!(Number(window?.days) > 0)) {
    return Number(window?.catch_up_days) > 0
      ? 'catch-up day excluded · awaiting fresh days'
      : 'awaiting fresh days';
  }
  const excluded = Number(window.excluded_days) || 0;
  const base = `daily completed average · ${window.days} day${window.days === 1 ? '' : 's'}`;
  const parts = [base];
  if (Number(window.in_progress_days) > 0) parts.push('today not counted');
  if (excluded) parts.push(`${excluded} excluded`);
  return parts.join(' · ');
}

function renderPerformance(data) {
  const perf = data.recent_performance;
  if (!perf || !perf.last_7_days || !perf.last_30_days || !Array.isArray(perf.trend_7_days)) return;
  document.getElementById('performanceMetrics').innerHTML = [
    metricCard('Last 7 Days', perf.last_7_days.total, `${perf.last_7_days.carcass} carcass / ${perf.last_7_days.trim} trim`),
    metricCard('Last 30 Days', perf.last_30_days.total, `${perf.last_30_days.carcass} carcass / ${perf.last_30_days.trim} trim`),
    metricCard('7-Day Avg', averageValue(perf.last_7_days), averageCaption(perf.last_7_days)),
    metricCard('30-Day Avg', averageValue(perf.last_30_days), averageCaption(perf.last_30_days)),
  ].join('');

  const maxTotal = Math.max(...perf.trend_7_days.map((entry) => entry.total), 1);
  const chart = document.getElementById('trendChart');
  chart.classList.remove('is-loading');
  chart.removeAttribute('aria-busy');
  chart.innerHTML = perf.trend_7_days.map((entry) => {
    const excluded = String(entry.excluded_from_average || '');
    const why = excluded === 'catch_up'
      ? 'Backlog that landed on this date, not work performed on it. Not counted in the average.'
      : 'Before the fresh start. Not counted in the average.';
    return `
    <button class="trend-row trend-row-action${excluded ? ' is-excluded' : ''}" type="button" data-day="${escapeHtml(entry.day)}" title="${escapeHtml(excluded ? why : `View completed jobs for ${entry.label}`)}">
      <span>${escapeHtml(entry.label)}</span>
      <div class="trend-track">
        <div class="trend-fill" style="width:${(entry.total / maxTotal) * 100}%"></div>
      </div>
      <strong>${entry.total}${excluded === 'catch_up' ? ' <em class="trend-flag">catch-up</em>' : ''}</strong>
    </button>
  `;
  }).join('');
  updateTrendDaySelection(_completedTodayDay);
}

function updateTrendDaySelection(day) {
  document.querySelectorAll('.trend-row-action').forEach((button) => {
    button.classList.toggle('active', Boolean(day) && button.dataset.day === day);
  });
}

/* ── Recent Performance carousel (Output trends / Ahead goal / Workload) ── */
const RP_SLIDES = [
  { title: 'Output trends', copy: 'Click a day to view completed jobs for that date.' },
  { title: 'Ahead of scheduled departure', copy: 'Clear all In Cutting work due through 14 calendar days from today.' },
  { title: 'Workload distribution', copy: 'In-cutting lines by firm date or scheduled departure.' },
];
let _rpIndex = 0;
let _rpInit = false;
let _rpWorkloadLoaded = false;
let _rpWorkloadBasis = 'firm_date';

function rpShow(index) {
  _rpIndex = (index + RP_SLIDES.length) % RP_SLIDES.length;
  document.querySelectorAll('.rp-slide').forEach((slide) => {
    slide.hidden = Number(slide.dataset.rp) !== _rpIndex;
  });
  const meta = RP_SLIDES[_rpIndex];
  const titleEl = document.getElementById('rpTitle');
  const copyEl = document.getElementById('rpCopy');
  if (titleEl) titleEl.textContent = meta.title;
  if (copyEl) copyEl.textContent = meta.copy;
  document.querySelectorAll('#rpDots .rp-dot').forEach((dot, i) => {
    dot.classList.toggle('active', i === _rpIndex);
  });
  if (_rpIndex === 2 && !_rpWorkloadLoaded) {
    loadWorkloadDistribution().catch(() => {});
  }
}

function rpEnsureInit() {
  if (_rpInit) return;
  _rpInit = true;
  const dots = document.getElementById('rpDots');
  if (dots) {
    dots.innerHTML = RP_SLIDES.map((_, i) =>
      `<button class="rp-dot${i === 0 ? ' active' : ''}" type="button" data-rp-dot="${i}" aria-label="Tile ${i + 1}"></button>`
    ).join('');
    dots.querySelectorAll('[data-rp-dot]').forEach((btn) =>
      btn.addEventListener('click', () => rpShow(Number(btn.dataset.rpDot)))
    );
  }
  const prev = document.getElementById('rpPrev');
  const next = document.getElementById('rpNext');
  if (prev) prev.addEventListener('click', () => rpShow(_rpIndex - 1));
  if (next) next.addEventListener('click', () => rpShow(_rpIndex + 1));
}

function renderAheadRing(data) {
  const host = document.getElementById('aheadRing');
  if (!host) return;
  const backlog = data.backlog || {};
  const days = Number(backlog.ahead_goal_days || (data.settings && data.settings.ahead_goal_days) || 14);
  const avg = Number((data.recent_performance && data.recent_performance.last_7_days.average_per_day) || 0);
  const remainingLines = Number(backlog.items_needed_to_reach_goal || 0);
  const remainingJobs = Number(backlog.jobs_needed_to_reach_goal || 0);
  const capacity = avg > 0 ? Math.ceil(avg * days) : (remainingLines || 1);
  const done = Math.max(capacity - remainingLines, 0);
  const met = remainingLines === 0;
  const pct = met ? 1 : (capacity > 0 ? Math.min(done / capacity, 1) : 0);
  const r = 70;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - pct);
  const color = met ? 'var(--accent)'
    : pct >= 0.66 ? 'var(--accent)'
    : pct >= 0.33 ? 'var(--warn, #f0b44c)'
    : 'var(--danger, #d86c6c)';
  host.innerHTML = `
    <div class="ring-wrap">
      <svg viewBox="0 0 180 180" class="ring-svg" aria-hidden="true">
        <circle class="ring-bg" cx="90" cy="90" r="${r}"></circle>
        <circle class="ring-fg" cx="90" cy="90" r="${r}"
          style="stroke:${color};stroke-dasharray:${circ.toFixed(1)};stroke-dashoffset:${offset.toFixed(1)}"></circle>
      </svg>
      <div class="ring-center">
        <strong>${met ? '&#10003;' : Math.round(pct * 100) + '%'}</strong>
        <span>${met ? 'goal met' : remainingLines + ' lines to go'}</span>
      </div>
    </div>
    <div class="performance-grid ring-stats">
      ${metricCard('Jobs to goal', remainingJobs, `through SDD ${formatDateUS(backlog.goal_horizon_end)}`)}
      ${metricCard('Lines to goal', remainingLines, `~${capacity} line capacity`)}
      ${metricCard('Daily avg', avg, 'completed, last 7 days')}
    </div>`;
}

function rpWorkloadToggleHtml() {
  const basis = _rpWorkloadBasis;
  return `
    <div class="wl-basis-toggle">
      <button class="wl-basis-btn${basis === 'firm_date' ? ' active' : ''}" type="button" data-basis="firm_date">Firm date</button>
      <button class="wl-basis-btn${basis === 'scheduled_departure' ? ' active' : ''}" type="button" data-basis="scheduled_departure">SDD</button>
    </div>`;
}

function rpBindWorkloadToggle(host) {
  host.querySelectorAll('.wl-basis-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const next = btn.dataset.basis;
      if (next === _rpWorkloadBasis) return;
      _rpWorkloadBasis = next;
      loadWorkloadDistribution(next).catch(() => {});
    });
  });
}

async function loadWorkloadDistribution(basis) {
  const host = document.getElementById('workloadDist');
  if (!host) return;
  if (basis) _rpWorkloadBasis = basis;
  try {
    const data = await api(`/api/workload-distribution?date_basis=${encodeURIComponent(_rpWorkloadBasis)}`);
    _rpWorkloadLoaded = true;
    if (data.date_basis) _rpWorkloadBasis = data.date_basis;
    const dist = data.distribution || [];
    if (!dist.length) {
      host.innerHTML = rpWorkloadToggleHtml() + '<p class="rp-empty">No in-cutting work scheduled.</p>';
      rpBindWorkloadToggle(host);
      return;
    }
    const max = Math.max(...dist.map((d) => Number(d.total) || 0), 1);
    const cells = dist.map((b) => {
      const intensity = Math.min((Number(b.total) || 0) / max, 1);
      const cls = b.is_overdue ? 'hm-overdue' : b.is_today ? 'hm-today' : '';
      const bg = b.is_overdue
        ? `rgba(216,108,108,${(0.15 + intensity * 0.55).toFixed(3)})`
        : b.is_today
          ? `rgba(77,181,255,${(0.15 + intensity * 0.55).toFixed(3)})`
          : `rgba(47,166,124,${(0.08 + intensity * 0.52).toFixed(3)})`;
      return `
        <div class="hm-cell ${cls}" style="background:${bg}" title="${escapeHtml(b.weekday)} ${escapeHtml(b.label)} — ${b.total} lines (${b.carcass} carc / ${b.trim} trim) · ${b.po_count} POs">
          <span class="hm-date">${escapeHtml(b.label)}</span>
          <span class="hm-count">${b.total}</span>
          <span class="hm-day">${escapeHtml(b.weekday)}</span>
        </div>`;
    }).join('');
    const totalLines = dist.reduce((s, b) => s + (Number(b.total) || 0), 0);
    const basisNoun = _rpWorkloadBasis === 'scheduled_departure' ? 'sched departures' : 'firm dates';
    host.innerHTML = `
      ${rpWorkloadToggleHtml()}
      <div class="heatmap-chart">${cells}</div>
      <div class="heatmap-legend">
        <span class="hm-legend-item"><span class="legend-swatch" style="background:rgba(216,108,108,0.55)"></span> Overdue</span>
        <span class="hm-legend-item"><span class="legend-swatch" style="background:rgba(77,181,255,0.55)"></span> Today</span>
        <span class="hm-legend-item"><span class="legend-swatch" style="background:rgba(47,166,124,0.45)"></span> Upcoming</span>
        <span class="hm-legend-item hm-legend-note">${dist.length} ${basisNoun} · ${totalLines} total lines</span>
      </div>`;
    rpBindWorkloadToggle(host);
  } catch (err) {
    host.innerHTML = '<p class="rp-empty">Workload data unavailable.</p>';
  }
}

function renderBacklog(data) {
  const backlog = data.backlog;
  document.getElementById('aheadGoalDays').value = data.settings.ahead_goal_days;
  document.getElementById('backlogMetrics').innerHTML = [
    metricCard('Due Within Goal', backlog.due_within_goal, `${backlog.carcass_due_within_goal} carcass / ${backlog.trim_due_within_goal} trim`),
    metricCard('Overdue', backlog.overdue, 'past firm date'),
    metricCard('Due Today', backlog.due_today, 'current day demand'),
    metricCard('Snapshot Rows', backlog.snapshot_row_count, `snapshot: ${formatTimestamp(backlog.snapshot_refreshed_at)}`),
    actionMetricCard(
      'paletteLabelsReadyCard',
      'Pallet Labels Ready',
      '<span id="paletteLabelsReadyValue">--</span>',
      '<span id="paletteLabelsReadySub">completed jobs awaiting labels</span>'
    ),
  ].join('');
  document.getElementById('paletteLabelsReadyCard').addEventListener('click', () => {
    openPaletteLabelsModal('ready');
  });
  loadPaletteLabelSummary().catch(() => {});
}

function renderReports(data) {
  const tbody = document.getElementById('reportsTable');
  tbody.innerHTML = data.reports.map((report, index) => `
    <tr>
      <td><input type="checkbox" class="report-checkbox" data-path="${report.report_path}"></td>
      <td>${report.day}</td>
      <td>${report.file_name || ''}</td>
      <td>${formatTimestamp(report.finalized_at)}</td>
      <td>
        <div class="inline-actions">
          <button class="button secondary open-report" data-path="${report.report_path}" ${report.exists ? '' : 'disabled'}>Open</button>
        </div>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('.open-report').forEach((button) => {
    button.addEventListener('click', async () => {
      await api('/api/open-report', {
        method: 'POST',
        body: JSON.stringify({ report_path: button.dataset.path }),
      });
    });
  });
}

function renderManualAdded(data) {
  const summary = data.summary || {};
  const requests = data.requests || [];
  const isToday = data.day === new Date().toISOString().slice(0, 10);
  document.getElementById('manualAddedTitle').textContent =
    isToday ? 'Walk-ups today' : `Walk-ups ${formatDateUS(data.day)}`;
  document.getElementById('manualAddedSummary').textContent =
    `${summary.item_count || 0} item${Number(summary.item_count || 0) === 1 ? '' : 's'} ? `
    + `${summary.request_count || 0} request${Number(summary.request_count || 0) === 1 ? '' : 's'} ? `
    + `PW .5 ${Number(summary.pw05 || 0).toFixed(2)} ? PW .75 ${Number(summary.pw075 || 0).toFixed(2)}`;

  const tbody = document.getElementById('manualAddedTable');
  if (!requests.length) {
    tbody.innerHTML = `
      <tr>
        <td class="empty-row" colspan="7">
          ${isToday ? 'No walk-up requests logged yet today.' : 'No walk-up requests recorded for this day.'}
        </td>
      </tr>
    `;
    return;
  }
  tbody.innerHTML = requests.map((entry) => `
    <tr>
      <td>${escapeHtml(formatTimestamp(entry.created_at))}</td>
      <td>${escapeHtml(entry.description)}</td>
      <td>${escapeHtml(entry.po_number || '')}</td>
      <td><span class="pill">${escapeHtml(entry.work_type)}</span></td>
      <td>${Number(entry.item_count || 0)}</td>
      <td>${Number(entry.pw05 || 0).toFixed(2)}</td>
      <td>${Number(entry.pw075 || 0).toFixed(2)}</td>
    </tr>
  `).join('');
}

async function loadManualAddedToday(day = '') {
  const targetDay = day || new Date().toISOString().slice(0, 10);
  const data = await api(`/api/manual-added?day=${encodeURIComponent(targetDay)}`);
  renderManualAdded(data);
  return data;
}

function openManualAddedModal() {
  document.getElementById('manualAddedModal').hidden = false;
  syncModalBodyLock();
  document.getElementById('manualAddedTable').innerHTML =
    '<tr><td class="empty-row" colspan="7">Loading...</td></tr>';
  return loadManualAddedToday();
}

function closeManualAddedModal() {
  document.getElementById('manualAddedModal').hidden = true;
  syncModalBodyLock();
}

// The morning checklist lives on the Morning tab, so its visibility has two
// inputs: the active workflow view and whether the checklist is enabled at all.
// Both go through applyNewHireTaskVisibility so neither can clobber the other.
let _newHireTaskEnabled = true;

function applyNewHireTaskVisibility() {
  const panel = document.getElementById('newHireTaskPanel');
  if (!panel) return;
  panel.hidden = _cncWorkflowView !== 'morning' || !_newHireTaskEnabled;
}

function renderNewHireTask(data) {
  _newHireTaskEnabled = !(data && data.enabled === false);
  applyNewHireTaskVisibility();
  if (data && data.enabled === false) return;
  document.getElementById('newHireTaskTitle').textContent = data.weekday || '--';
  document.getElementById('newHireTaskList').innerHTML = (data.tasks || []).map((task) => `
    <li>${escapeHtml(task)}</li>
  `).join('');
  document.getElementById('waitingForWorkList').innerHTML = (data.waiting_for_work || []).map((task) => `
    <li>${escapeHtml(task)}</li>
  `).join('');
  document.getElementById('scrapPriorityList').innerHTML = (data.scrap_conversion_priority || []).map((task) => `
    <li>${escapeHtml(task)}</li>
  `).join('');
  document.getElementById('scrapPriorityNote').textContent = data.scrap_conversion_note || '';
}

function renderDepartmentRecordTiles() {
  const summary = _departmentRecordSummary;
  document.getElementById('departmentRecordTiles').innerHTML = [
    actionMetricCard(
      'machineIssuesTile',
      'Machine Issues',
      summary.machineIssues.total,
      `${summary.machineIssues.open} open / follow-up`,
    ),
    actionMetricCard(
      'trainingMatrixTile',
      'New Hire Training',
      summary.training.trainees || 0,
      `${summary.training.observations || 0} observation${(summary.training.observations || 0) === 1 ? '' : 's'} logged`,
    ),
    actionMetricCard(
      'itemLookupTile',
      'Item Search',
      'Look up',
      'dimensions, TAP, and skins',
    ),
  ].join('');

  document.getElementById('machineIssuesTile').addEventListener('click', () => {
    openMachineIssuesModal().catch((error) => alert(error.message));
  });
  document.getElementById('trainingMatrixTile').addEventListener('click', () => {
    openTrainingMatrixModal().catch((error) => alert(error.message));
  });
  document.getElementById('itemLookupTile').addEventListener('click', () => {
    openItemLookupModal();
  });
}

function updateDepartmentRecordSummary(partial) {
  _departmentRecordSummary = {
    ..._departmentRecordSummary,
    ...partial,
  };
  renderDepartmentRecordTiles();
}

function openMachineIssuesModal() {
  return loadMachineIssues().then(() => {
    setMachineIssueFormExpanded(false);
    document.getElementById('machineIssuesModal').hidden = false;
    syncModalBodyLock();
  });
}

function closeMachineIssuesModal() {
  document.getElementById('machineIssuesModal').hidden = true;
  syncModalBodyLock();
}

function openItemLookupModal(initialQuery = '') {
  document.getElementById('itemLookupModal').hidden = false;
  document.getElementById('itemLookupResults').innerHTML = '';
  document.getElementById('itemLookupSummary').textContent =
    'Search an item to see dimensions, generate TAP/MDB/DXF, or produce a skin.';
  const input = document.getElementById('itemLookupQuery');
  input.value = String(initialQuery || '').trim();
  syncModalBodyLock();
  input.focus();
  if (input.value) {
    runItemLookup(input.value).catch((error) => alert(error.message));
  }
}

function closeItemLookupModal() {
  document.getElementById('itemLookupModal').hidden = true;
  syncModalBodyLock();
}

function formatDimension(value) {
  if (value == null || value === '') return '?';
  const number = Number(value);
  return Number.isFinite(number) ? String(number) : String(value);
}

function skinBadgeHtml(skin) {
  if (!skin) return '';
  if (skin.found) {
    return `<span class="pq-status-badge pq-paperwork-ready" title="${escapeHtml(skin.path || skin.filename || '')}">Skin in library</span>`;
  }
  return `<span class="pq-status-badge pq-paperwork-missing" title="${escapeHtml(skin.filename || '')}">No skin</span>`;
}

function renderItemLookupResults(data) {
  const container = document.getElementById('itemLookupResults');
  const summary = document.getElementById('itemLookupSummary');
  const query = data.query || data.item_number || '';
  const candidates = data.candidates || [];
  const matchMode = data.match_mode || 'none';

  if (data.found_in_components) {
    const matchedFrom = query && query.toUpperCase() !== String(data.item_number || '').toUpperCase()
      ? ` (matched from ${query})`
      : '';
    summary.textContent = `${data.item_number || ''} · ${data.cabinet_type || 'Cabinet'} · W ${formatDimension(data.width)} · H ${formatDimension(data.height)} · D ${formatDimension(data.depth)}${matchedFrom}`;
  } else if (candidates.length) {
    summary.textContent = `"${query}" matched ${candidates.length} items (${matchMode}). Pick one:`;
  } else {
    summary.textContent = `No component data found for ${query || 'that item'}.`;
  }

  let html = '';
  if (candidates.length > 1 && !data.found_in_components) {
    html += `<div class="table-wrap modal-table-wrap">
      <table class="lookup-candidate-table">
        <thead><tr>
          <th>Item</th><th>Type</th><th>W</th><th>H</th><th>D</th><th>Parts</th><th>Skin</th><th></th>
        </tr></thead>
        <tbody>${candidates.map((candidate) => `<tr>
          <td><strong>${escapeHtml(candidate.item_number || '')}</strong></td>
          <td>${escapeHtml(candidate.cabinet_type || '')}</td>
          <td>${formatDimension(candidate.width)}</td>
          <td>${formatDimension(candidate.height)}</td>
          <td>${formatDimension(candidate.depth)}</td>
          <td>${candidate.part_count ?? ''}</td>
          <td>${skinBadgeHtml(candidate.skin)}</td>
          <td>
            <div class="lookup-item-actions is-compact">
              <button type="button" class="button secondary lookup-candidate-btn" data-item="${escapeHtml(candidate.item_number || '')}">Open</button>
              <button type="button" class="button secondary item-cut-generate" data-item="${escapeHtml(candidate.item_number || '')}">TAP / MDB / DXF</button>
              ${candidate.skin && candidate.skin.found ? '' : `<button type="button" class="button secondary item-skin-generate" data-item="${escapeHtml(candidate.item_number || '')}">Skin</button>`}
            </div>
          </td>
        </tr>`).join('')}</tbody>
      </table>
    </div>`;
  }

  if (data.found_in_components) {
    html += `<div class="lookup-meta-grid">
      <div><span class="lookup-meta-label">Construction</span><strong>${escapeHtml(data.construction || '?')}</strong></div>
      <div><span class="lookup-meta-label">Cabinet type</span><strong>${escapeHtml(data.cabinet_type || '?')}</strong></div>
      <div><span class="lookup-meta-label">Width</span><strong>${formatDimension(data.width)}</strong></div>
      <div><span class="lookup-meta-label">Height</span><strong>${formatDimension(data.height)}</strong></div>
      <div><span class="lookup-meta-label">Depth</span><strong>${formatDimension(data.depth)}</strong></div>
      <div><span class="lookup-meta-label">Parts</span><strong>${(data.parts || []).length}</strong></div>
      <div><span class="lookup-meta-label">Skin</span>${skinBadgeHtml(data.skin)}</div>
    </div>`;
    html += `<div class="lookup-item-actions">
      <button type="button" class="button item-cut-generate" id="itemLookupGenerateTap" data-item="${escapeHtml(data.item_number || '')}">Generate TAP / MDB / DXF</button>
      ${data.skin && data.skin.found
        ? ''
        : `<button type="button" class="button secondary item-skin-generate" id="itemLookupGenerateSkin" data-item="${escapeHtml(data.item_number || '')}">Produce skin</button>`}
    </div>`;
    html += `<div class="table-wrap modal-table-wrap">
      <table class="mdb-parts-subtable">
        <thead><tr>
          <th>Part Name</th><th>Qty</th><th>Length</th><th>Width</th><th>Material</th>
        </tr></thead>
        <tbody>${(data.parts || []).map((part) => `<tr>
          <td>${escapeHtml(part.part_name)}</td>
          <td>${part.quantity ?? ''}</td>
          <td>${formatDimension(part.length)}</td>
          <td>${formatDimension(part.width)}</td>
          <td>${escapeHtml(part.material || '')}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>`;
  }

  const queueRows = data.queue_rows || [];
  const showQueueItem = queueRows.some((row) => row.item_number);
  html += `<div class="lookup-section">
    <h3 class="lookup-section-title">In current Cut snapshot</h3>`;
  if (!queueRows.length) {
    html += `<p class="lookup-empty">No matching rows in the current Cut queue snapshot.</p>`;
  } else {
    html += `<div class="table-wrap modal-table-wrap">
      <table>
        <thead><tr>
          ${showQueueItem ? '<th>Item</th>' : ''}
          <th>PO</th><th>Sched departure</th><th>Firm date</th><th>Status</th><th>Line</th><th>Product</th>
        </tr></thead>
        <tbody>${queueRows.map((row) => `<tr>
          ${showQueueItem ? `<td>${escapeHtml(row.item_number || '')}</td>` : ''}
          <td>${escapeHtml(row.po_number || '')}</td>
          <td>${escapeHtml(row.sched_departure_date || row.scheduled_departure || row.display_date || '')}</td>
          <td>${escapeHtml(row.firm_date || '')}</td>
          <td>${escapeHtml(row.status || '')}</td>
          <td>${escapeHtml(row.line_number || '')}</td>
          <td>${escapeHtml(row.product || '')}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>`;
  }
  html += '</div>';
  html += `<div class="lookup-cut-dest" data-item-cut-dest hidden>
    <p>This cut has no production-set encoding. Where should the TAP go?</p>
    <div class="lookup-item-actions">
      <button type="button" class="button" data-item-cut-dest="walkup">Walk-up Requests</button>
      <button type="button" class="button secondary" data-item-cut-dest="day">Today's CNC folder</button>
      <button type="button" class="button secondary" data-item-cut-dest="cancel">Cancel</button>
    </div>
  </div>`;
  container.innerHTML = html;

  container.querySelectorAll('.lookup-candidate-btn').forEach((button) => {
    button.addEventListener('click', () => {
      const item = button.dataset.item || '';
      const input = document.getElementById('itemLookupQuery');
      if (input) input.value = item;
      runItemLookup(item).catch((error) => alert(error.message));
    });
  });
  container.querySelectorAll('.item-cut-generate').forEach((button) => {
    button.addEventListener('click', () => {
      askItemCutDestination(button.dataset.item || '');
    });
  });
  container.querySelectorAll('.item-skin-generate').forEach((button) => {
    button.addEventListener('click', () => {
      generateItemSkin(button.dataset.item || '').catch((error) => alert(error.message));
    });
  });
  const destBox = container.querySelector('[data-item-cut-dest]');
  destBox?.querySelectorAll('button[data-item-cut-dest]').forEach((button) => {
    button.addEventListener('click', () => {
      const dest = button.getAttribute('data-item-cut-dest');
      const item = destBox.dataset.item || '';
      destBox.hidden = true;
      if (dest === 'cancel' || !item) return;
      generateItemCutFiles(item, dest).catch((error) => alert(error.message));
    });
  });
}

function askItemCutDestination(itemNumber) {
  const item = String(itemNumber || '').trim();
  if (!item) return;
  const box = document.querySelector('#itemLookupResults [data-item-cut-dest]');
  if (!box) {
    generateItemCutFiles(item, 'day').catch((error) => alert(error.message));
    return;
  }
  box.dataset.item = item;
  box.hidden = false;
  box.scrollIntoView({ block: 'nearest' });
}

async function generateItemCutFiles(itemNumber, destination = 'day') {
  const item = String(itemNumber || '').trim();
  if (!item) return;
  const summary = document.getElementById('itemLookupSummary');
  summary.textContent = `Generating TAP / MDB / DXF for ${item}…`;
  const result = await api('/api/item-cut/generate', {
    method: 'POST',
    body: JSON.stringify({
      item_number: item,
      destination,
      output_route: getProductionOutputRoute(),
    }),
  });
  const where = result.destination === 'walkup'
    ? 'Walk-up Requests'
    : (result.fallback ? 'Desktop (share unavailable)' : "today's CNC folder");
  summary.textContent = result.ok
    ? `${item} written to ${where}: ${result.output_dir || ''}`
    : (result.error || 'Generation failed.');
  if (result.ok && result.output_dir) {
    _walkupLastOutputDir = result.output_dir;
  }
}

async function generateItemSkin(itemNumber) {
  const item = String(itemNumber || '').trim();
  if (!item) return;
  const summary = document.getElementById('itemLookupSummary');
  summary.textContent = `Producing skin for ${item}…`;
  const result = await api('/api/item-cut/generate-skin', {
    method: 'POST',
    body: JSON.stringify({ item_number: item }),
  });
  if (!result.ok) {
    summary.textContent = result.error || 'Skin generation failed.';
    return;
  }
  summary.textContent = result.already_existed
    ? `${item} already has ${result.skin?.filename || 'a skin'} in the library.`
    : `${item} skin filed as ${result.file || result.skin?.filename || 'library TAP'}.`;
  await runItemLookup(item);
}

async function runItemLookup(rawQuery) {
  const query = String(rawQuery || '').trim();
  if (!query) return;
  document.getElementById('itemLookupSummary').textContent = `Looking up ${query}?`;
  document.getElementById('itemLookupResults').innerHTML = '';
  const data = await api(`/api/item-lookup?item_number=${encodeURIComponent(query)}`);
  renderItemLookupResults(data);
}

function formatPartDimension(value) {
  if (value == null || value === '') return '?';
  const number = Number(value);
  return Number.isFinite(number) ? String(number) : String(value);
}

function renderSelectablePartsTable(parts, {
  po = '',
  item = '',
  excludedParts = [],
  checkboxClass = 'part-include-cb',
  showRecalcStatus = false,
  emptyMessage = 'No components found.',
} = {}) {
  if (!parts || !parts.length) {
    return `<p class="lookup-empty">${emptyMessage}</p>`;
  }
  const excluded = new Set(excludedParts.map((name) => String(name || '').trim()).filter(Boolean));
  return `<table class="mdb-parts-subtable pq-dimension-parts-table part-selection-table">
    <thead><tr>
      <th></th><th>Part</th><th>Qty</th><th>Length</th><th>Width</th><th>Material</th>${showRecalcStatus ? '<th></th>' : ''}
    </tr></thead>
    <tbody>${parts.map((part) => {
      const partName = String(part.part_name || '').trim();
      const checked = !excluded.has(partName);
      return `<tr class="${part.recalculated ? 'pq-part-recalculated' : ''}">
        <td><input type="checkbox" class="${checkboxClass}" data-po="${escapeHtml(po)}" data-item="${escapeHtml(item)}" data-part="${escapeHtml(partName)}"${checked ? ' checked' : ''} aria-label="Include ${escapeHtml(partName)}"></td>
        <td>${escapeHtml(partName)}</td>
        <td>${part.quantity ?? ''}</td>
        <td>${formatPartDimension(part.length)}</td>
        <td>${formatPartDimension(part.width)}</td>
        <td>${escapeHtml(part.material || '')}</td>
        ${showRecalcStatus ? `<td>${part.recalculated ? '<span class="pq-part-updated">updated</span>' : ''}</td>` : ''}
      </tr>`;
    }).join('')}</tbody>
  </table>`;
}

function setPartExcluded(editStore, key, partName, included) {
  const edit = editStore.get(key) || {};
  const excluded = new Set(edit.excludedParts || []);
  const normalized = String(partName || '').trim();
  if (!normalized) return;
  if (included) excluded.delete(normalized);
  else excluded.add(normalized);
  editStore.set(key, { ...edit, excludedParts: [...excluded] });
}

function wirePartIncludeCheckboxes(container, { editStore, keyFor, checkboxClass }) {
  if (!container) return;
  container.querySelectorAll(`.${checkboxClass}`).forEach((checkbox) => {
    checkbox.addEventListener('change', () => {
      const po = checkbox.dataset.po || '';
      const item = checkbox.dataset.item || '';
      const part = checkbox.dataset.part || '';
      if (!item || !part) return;
      setPartExcluded(editStore, keyFor(po, item), part, checkbox.checked);
    });
  });
}

function capturePartIncludeCheckboxes(checkboxClass, editStore, keyFor) {
  document.querySelectorAll(`.${checkboxClass}`).forEach((checkbox) => {
    const po = checkbox.dataset.po || '';
    const item = checkbox.dataset.item || '';
    const part = checkbox.dataset.part || '';
    if (!item || !part) return;
    setPartExcluded(editStore, keyFor(po, item), part, checkbox.checked);
  });
}

let _walkupSelectedItems = [];
let _walkupFolderTitleManual = false;
let _walkupLastOutputDir = '';
let _walkupStep = 'search';
let _walkupReviewEdits = new Map();
let _walkupExpandedItem = '';
let _walkupRecalcTimer = null;

function walkupItemKey(itemNumber) {
  return String(itemNumber || '').trim().toUpperCase();
}

function walkupDimsCustomized(item, edit) {
  if (!edit) return false;
  return ['width', 'height', 'depth'].some((axis) => {
    const base = item[axis];
    const value = edit[axis];
    return value != null && base != null && Number(value) !== Number(base);
  });
}

function getWalkupReviewEdit(item) {
  const key = walkupItemKey(item.item_number);
  const existing = _walkupReviewEdits.get(key);
  if (existing) return existing;
  return {
    width: item.width,
    height: item.height,
    depth: item.depth,
    parts: [],
    excludedParts: [],
  };
}

function renderWalkupReviewPartsTable(itemNumber, parts, excludedParts = []) {
  return renderSelectablePartsTable(parts, {
    item: itemNumber,
    excludedParts,
    checkboxClass: 'walkup-part-cb',
    showRecalcStatus: true,
    emptyMessage: 'Loading components…',
  });
}

function setWalkupReviewStep(step) {
  _walkupStep = step;
  const searchPane = document.getElementById('walkupRequestSearchPane');
  const reviewPane = document.getElementById('walkupRequestReviewPane');
  const searchActions = document.getElementById('walkupRequestSearchActions');
  const reviewActions = document.getElementById('walkupRequestReviewActions');
  if (searchPane) searchPane.hidden = step !== 'search';
  if (reviewPane) reviewPane.hidden = step !== 'review';
  if (searchActions) searchActions.hidden = step !== 'search';
  if (reviewActions) reviewActions.hidden = step !== 'review';
}

function renderWalkupReviewList() {
  const container = document.getElementById('walkupRequestReviewList');
  if (!container) return;
  container.innerHTML = _walkupSelectedItems.map((item) => {
    const key = walkupItemKey(item.item_number);
    const edit = getWalkupReviewEdit(item);
    const width = edit.width ?? item.width;
    const height = edit.height ?? item.height;
    const depth = edit.depth ?? item.depth;
    const expanded = _walkupExpandedItem === key;
    const customized = walkupDimsCustomized(item, edit);
    return `
      <article class="walkup-review-card pq-dimension-card" data-item="${escapeHtml(item.item_number)}">
        <div class="walkup-review-head pq-dimension-card-head">
          <div>
            <strong>${escapeHtml(item.item_number)}</strong>
            <span class="pq-dimension-sub">${escapeHtml(item.cabinet_type || 'Cabinet')}</span>
          </div>
          <div class="walkup-review-summary">
            <span class="${customized ? 'pq-dim-customized' : ''}">W ${formatPqDimension(width)} ? H ${formatPqDimension(height)} ? D ${formatPqDimension(depth)}</span>
            <button type="button" class="button secondary walkup-adjust-btn" data-item="${escapeHtml(item.item_number)}">${expanded ? 'Hide dims' : 'Adjust dims'}</button>
          </div>
        </div>
        ${expanded ? `
          <p class="pq-dimension-library">Library: W ${formatPqDimension(item.width)} ? H ${formatPqDimension(item.height)} ? D ${formatPqDimension(item.depth)}</p>
          <div class="pq-dimension-inputs">
            <label>W<input class="walkup-dim-input" data-axis="width" data-item="${escapeHtml(item.item_number)}" type="number" step="0.125" min="0" value="${formatPqDimension(width)}"></label>
            <label>H<input class="walkup-dim-input" data-axis="height" data-item="${escapeHtml(item.item_number)}" type="number" step="0.125" min="0" value="${formatPqDimension(height)}"></label>
            <label>D<input class="walkup-dim-input" data-axis="depth" data-item="${escapeHtml(item.item_number)}" type="number" step="0.125" min="0" value="${formatPqDimension(depth)}"></label>
          </div>
        ` : ''}
        <div class="walkup-review-parts" id="walkupParts-${CSS.escape(key)}">
          ${renderWalkupReviewPartsTable(item.item_number, edit.parts || [], edit.excludedParts || [])}
        </div>
      </article>`;
  }).join('');

  container.querySelectorAll('.walkup-adjust-btn').forEach((button) => {
    button.addEventListener('click', () => {
      const itemNumber = button.dataset.item || '';
      const key = walkupItemKey(itemNumber);
      _walkupExpandedItem = _walkupExpandedItem === key ? '' : key;
      renderWalkupReviewList();
      if (_walkupExpandedItem === key) {
        recalculateWalkupItem(itemNumber).catch((error) => alert(error.message));
      }
    });
  });
  container.querySelectorAll('.walkup-dim-input').forEach((input) => {
    input.addEventListener('change', () => {
      scheduleWalkupDimensionRecalc(input.dataset.item || '');
    });
  });
  wirePartIncludeCheckboxes(container, {
    editStore: _walkupReviewEdits,
    keyFor: (_po, item) => walkupItemKey(item),
    checkboxClass: 'walkup-part-cb',
  });
}

async function recalculateWalkupItem(itemNumber) {
  const item = _walkupSelectedItems.find(
    (entry) => walkupItemKey(entry.item_number) === walkupItemKey(itemNumber),
  );
  if (!item) return;
  const key = walkupItemKey(itemNumber);
  const prev = _walkupReviewEdits.get(key) || getWalkupReviewEdit(item);
  const card = document.querySelector(`.walkup-review-card[data-item="${CSS.escape(itemNumber)}"]`);
  const readAxis = (axis) => {
    const input = card?.querySelector(`.walkup-dim-input[data-axis="${axis}"]`);
    if (input) return Number(input.value);
    return Number(prev[axis] ?? item[axis]);
  };
  const width = readAxis('width');
  const height = readAxis('height');
  const depth = readAxis('depth');
  if (![width, height, depth].every(Number.isFinite)) return;

  capturePartIncludeCheckboxes('walkup-part-cb', _walkupReviewEdits, (_po, walkupItem) => walkupItemKey(walkupItem));

  const partsWrap = document.getElementById(`walkupParts-${CSS.escape(key)}`);
  if (partsWrap) partsWrap.innerHTML = '<p class="lookup-empty">Recalculating parts?</p>';
  const data = await api('/api/production-queue/recalculate-parts', {
    method: 'POST',
    body: JSON.stringify({ item_number: itemNumber, width, height, depth }),
  });
  _walkupReviewEdits.set(key, {
    ...prev,
    width: data.width ?? width,
    height: data.height ?? height,
    depth: data.depth ?? depth,
    parts: data.parts || [],
    excludedParts: prev.excludedParts || [],
  });
  if (partsWrap) {
    partsWrap.innerHTML = renderWalkupReviewPartsTable(
      itemNumber,
      data.parts || [],
      prev.excludedParts || [],
    );
    wirePartIncludeCheckboxes(partsWrap, {
      editStore: _walkupReviewEdits,
      keyFor: (_po, walkupItem) => walkupItemKey(walkupItem),
      checkboxClass: 'walkup-part-cb',
    });
  } else {
    renderWalkupReviewList();
  }
}

function scheduleWalkupDimensionRecalc(itemNumber) {
  clearTimeout(_walkupRecalcTimer);
  _walkupRecalcTimer = setTimeout(() => {
    recalculateWalkupItem(itemNumber).catch((error) => alert(error.message));
  }, 250);
}

function seedWalkupReviewEdits() {
  _walkupReviewEdits = new Map();
  for (const item of _walkupSelectedItems) {
    const key = walkupItemKey(item.item_number);
    _walkupReviewEdits.set(key, {
      width: item.width,
      height: item.height,
      depth: item.depth,
      parts: [],
      excludedParts: [],
    });
  }
}

async function preloadWalkupReviewParts() {
  await Promise.all(_walkupSelectedItems.map(async (item) => {
    const key = walkupItemKey(item.item_number);
    const edit = _walkupReviewEdits.get(key) || getWalkupReviewEdit(item);
    if (edit.parts && edit.parts.length) return;
    const width = Number(edit.width ?? item.width);
    const height = Number(edit.height ?? item.height);
    const depth = Number(edit.depth ?? item.depth);
    if (![width, height, depth].every(Number.isFinite)) return;
    const data = await api('/api/production-queue/recalculate-parts', {
      method: 'POST',
      body: JSON.stringify({
        item_number: item.item_number,
        width,
        height,
        depth,
      }),
    });
    _walkupReviewEdits.set(key, {
      ...edit,
      width: data.width ?? width,
      height: data.height ?? height,
      depth: data.depth ?? depth,
      parts: data.parts || [],
      excludedParts: edit.excludedParts || [],
    });
  }));
}

function openWalkupReview() {
  if (!_walkupSelectedItems.length) {
    alert('Add at least one item first.');
    return;
  }
  document.getElementById('walkupRequestResult').hidden = true;
  _walkupExpandedItem = '';
  seedWalkupReviewEdits();
  renderWalkupReviewList();
  setWalkupReviewStep('review');
  preloadWalkupReviewParts()
    .then(() => renderWalkupReviewList())
    .catch((error) => alert(error.message));
}

function backFromWalkupReview() {
  _walkupExpandedItem = '';
  setWalkupReviewStep('search');
}

function buildWalkupGenerateItems() {
  capturePartIncludeCheckboxes('walkup-part-cb', _walkupReviewEdits, (_po, item) => walkupItemKey(item));
  return _walkupSelectedItems.map((item) => {
    const key = walkupItemKey(item.item_number);
    const edit = _walkupReviewEdits.get(key) || getWalkupReviewEdit(item);
    const payload = { item_number: item.item_number };
    if (Number.isFinite(Number(edit.width))) payload.width_override = Number(edit.width);
    if (Number.isFinite(Number(edit.height))) payload.height_override = Number(edit.height);
    if (Number.isFinite(Number(edit.depth))) payload.depth_override = Number(edit.depth);
    if (edit.excludedParts && edit.excludedParts.length) {
      payload.excluded_parts = [...edit.excludedParts];
    }
    if (edit.parts && edit.parts.length) {
      const excludedSet = new Set(edit.excludedParts || []);
      payload.part_overrides = edit.parts
        .filter((part) => part.recalculated && !excludedSet.has(String(part.part_name || '').trim()))
        .map((part) => ({
          part_name: part.part_name,
          width: part.width,
          length: part.length,
          quantity: part.quantity,
        }));
    }
    return payload;
  });
}

function buildWalkupFolderTitle(items) {
  const seen = new Set();
  const titles = [];
  for (const item of items) {
    const text = String(item.item_number || '').trim().toUpperCase();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    titles.push(text);
  }
  return titles.join(', ');
}

function syncWalkupFolderTitleField() {
  const field = document.getElementById('walkupRequestFolderTitle');
  if (!field || _walkupFolderTitleManual) return;
  field.value = buildWalkupFolderTitle(_walkupSelectedItems);
}

function renderWalkupSelectedItems() {
  const container = document.getElementById('walkupRequestSelected');
  if (!container) return;
  if (!_walkupSelectedItems.length) {
    container.innerHTML = '';
    syncWalkupFolderTitleField();
    return;
  }
  container.innerHTML = _walkupSelectedItems.map((item) => `
    <div class="walkup-selected-item">
      <strong>${escapeHtml(item.item_number)}</strong>
      <span>${escapeHtml(item.cabinet_type || 'Cabinet')}</span>
      <button type="button" class="walkup-remove-item" data-item="${escapeHtml(item.item_number)}" aria-label="Remove ${escapeHtml(item.item_number)}">?</button>
    </div>
  `).join('');
  container.querySelectorAll('.walkup-remove-item').forEach((button) => {
    button.addEventListener('click', () => {
      const itemNumber = button.dataset.item || '';
      _walkupSelectedItems = _walkupSelectedItems.filter(
        (entry) => String(entry.item_number || '').toUpperCase() !== String(itemNumber).toUpperCase(),
      );
      renderWalkupSelectedItems();
    });
  });
  syncWalkupFolderTitleField();
}

function addWalkupSelectedItem(data) {
  const itemNumber = String(data.item_number || '').trim();
  if (!itemNumber) return;
  const exists = _walkupSelectedItems.some(
    (entry) => String(entry.item_number || '').toUpperCase() === itemNumber.toUpperCase(),
  );
  if (exists) return;
  _walkupSelectedItems.push({
    item_number: itemNumber,
    cabinet_type: data.cabinet_type || '',
    width: data.width,
    height: data.height,
    depth: data.depth,
  });
  renderWalkupSelectedItems();
}

function renderWalkupRequestResults(data) {
  const container = document.getElementById('walkupRequestResults');
  const summary = document.getElementById('walkupRequestSummary');
  const query = data.query || data.item_number || '';
  const candidates = data.candidates || [];

  if (data.found_in_components) {
    summary.textContent = `${data.item_number || ''} · ${data.cabinet_type || 'Cabinet'} · W ${formatDimension(data.width)} · H ${formatDimension(data.height)} · D ${formatDimension(data.depth)}`;
  } else if (candidates.length) {
    summary.textContent = `"${query}" matched ${candidates.length} items. Add one to the request:`;
  } else {
    summary.textContent = `No component data found for ${query || 'that item'}.`;
  }

  let html = '';
  if (candidates.length > 1 && !data.found_in_components) {
    html += `<div class="table-wrap modal-table-wrap">
      <table class="lookup-candidate-table">
        <thead><tr>
          <th>Item</th><th>Type</th><th>W</th><th>H</th><th>D</th><th>Parts</th><th></th>
        </tr></thead>
        <tbody>${candidates.map((candidate) => `<tr>
          <td><strong>${escapeHtml(candidate.item_number || '')}</strong></td>
          <td>${escapeHtml(candidate.cabinet_type || '')}</td>
          <td>${formatDimension(candidate.width)}</td>
          <td>${formatDimension(candidate.height)}</td>
          <td>${formatDimension(candidate.depth)}</td>
          <td>${candidate.part_count ?? ''}</td>
          <td><button type="button" class="button secondary walkup-add-item-btn" data-item="${escapeHtml(candidate.item_number || '')}">Add</button></td>
        </tr>`).join('')}</tbody>
      </table>
    </div>`;
  }

  if (data.found_in_components) {
    html += `<div class="lookup-meta-grid">
      <div><span class="lookup-meta-label">Construction</span><strong>${escapeHtml(data.construction || '?')}</strong></div>
      <div><span class="lookup-meta-label">Cabinet type</span><strong>${escapeHtml(data.cabinet_type || '?')}</strong></div>
      <div><span class="lookup-meta-label">Width</span><strong>${formatDimension(data.width)}</strong></div>
      <div><span class="lookup-meta-label">Height</span><strong>${formatDimension(data.height)}</strong></div>
      <div><span class="lookup-meta-label">Depth</span><strong>${formatDimension(data.depth)}</strong></div>
      <div><span class="lookup-meta-label">Parts</span><strong>${(data.parts || []).length}</strong></div>
    </div>`;
    html += `<div class="inline-actions" style="margin-bottom:12px;">
      <button type="button" class="button walkup-add-item-btn" data-item="${escapeHtml(data.item_number || '')}">Add ${escapeHtml(data.item_number || 'item')}</button>
    </div>`;
    html += `<div class="table-wrap modal-table-wrap">
      <table class="mdb-parts-subtable">
        <thead><tr>
          <th>Part Name</th><th>Qty</th><th>Length</th><th>Width</th><th>Material</th>
        </tr></thead>
        <tbody>${(data.parts || []).map((part) => `<tr>
          <td>${escapeHtml(part.part_name)}</td>
          <td>${part.quantity ?? ''}</td>
          <td>${formatDimension(part.length)}</td>
          <td>${formatDimension(part.width)}</td>
          <td>${escapeHtml(part.material || '')}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>`;
  }

  container.innerHTML = html;
  container.querySelectorAll('.walkup-add-item-btn').forEach((button) => {
    button.addEventListener('click', () => {
      const item = button.dataset.item || '';
      if (data.found_in_components && String(data.item_number || '').toUpperCase() === String(item).toUpperCase()) {
        addWalkupSelectedItem(data);
        return;
      }
      runWalkupItemLookup(item, true).catch((error) => alert(error.message));
    });
  });
}

async function runWalkupItemLookup(rawQuery, addDirectly = false) {
  const query = String(rawQuery || '').trim();
  if (!query) return null;
  document.getElementById('walkupRequestSummary').textContent = `Looking up ${query}?`;
  document.getElementById('walkupRequestResults').innerHTML = '';
  const data = await api(`/api/item-lookup?item_number=${encodeURIComponent(query)}`);
  if (addDirectly && data.found_in_components) {
    addWalkupSelectedItem(data);
    document.getElementById('walkupRequestSummary').textContent = `Added ${data.item_number}. Search for another item or click Review & generate.`;
    document.getElementById('walkupRequestResults').innerHTML = '';
    return data;
  }
  renderWalkupRequestResults(data);
  return data;
}

function resetWalkupRequestModal() {
  _walkupSelectedItems = [];
  _walkupFolderTitleManual = false;
  _walkupLastOutputDir = '';
  _walkupExpandedItem = '';
  _walkupReviewEdits = new Map();
  setWalkupReviewStep('search');
  const folderTitle = document.getElementById('walkupRequestFolderTitle');
  const purpose = document.getElementById('walkupRequestPurpose');
  const query = document.getElementById('walkupRequestQuery');
  const result = document.getElementById('walkupRequestResult');
  if (folderTitle) folderTitle.value = '';
  if (purpose) purpose.value = 'other';
  if (query) query.value = '';
  if (result) result.hidden = true;
  renderWalkupSelectedItems();
  document.getElementById('walkupRequestResults').innerHTML = '';
  document.getElementById('walkupRequestResultMetrics').innerHTML = '';
  const reviewList = document.getElementById('walkupRequestReviewList');
  if (reviewList) reviewList.innerHTML = '';
  document.getElementById('walkupRequestSummary').textContent =
    'Search cabinet_componets.csv, add items, then review dimensions before generating MDB files.';
}

function openWalkupRequestModal() {
  resetWalkupRequestModal();
  const logModal = document.getElementById('manualAddedModal');
  if (logModal) logModal.hidden = true;
  document.getElementById('walkupRequestModal').hidden = false;
  const omniRoute = document.querySelector('input[name="walkupOutputRoute"][value="omni_tap"]');
  if (omniRoute) omniRoute.checked = true;
  syncModalBodyLock();
  const input = document.getElementById('walkupRequestQuery');
  if (input) input.focus();
}

function closeWalkupRequestModal() {
  document.getElementById('walkupRequestModal').hidden = true;
  syncModalBodyLock();
}

async function generateWalkupRequestFiles() {
  if (!_walkupSelectedItems.length) {
    alert('Add at least one item first.');
    return;
  }
  const folderTitle = String(document.getElementById('walkupRequestFolderTitle').value || '').trim()
    || buildWalkupFolderTitle(_walkupSelectedItems);
  const btn = document.getElementById('walkupRequestGenerate');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Generating…';
  }
  try {
    const result = await api('/api/walkup-request/generate', {
      method: 'POST',
      body: JSON.stringify({
        folder_title: folderTitle,
        purpose: document.getElementById('walkupRequestPurpose')?.value || 'other',
        items: buildWalkupGenerateItems(),
        output_route: document.querySelector('input[name="walkupOutputRoute"]:checked')?.value || 'omni_tap',
      }),
    });
    const resultDiv = document.getElementById('walkupRequestResult');
    const metricsDiv = document.getElementById('walkupRequestResultMetrics');
    if (result.ok) {
      _walkupLastOutputDir = result.output_dir || '';
      let cards = metricCard('Folder', result.folder_title || folderTitle);
      cards += metricCard('Items', result.item_count || _walkupSelectedItems.length);
      cards += metricCard('MDB Parts', result.part_count || 0);
      cards += metricCard('Output', result.output_path ? 'Ready' : 'Created');
      if (result.purpose === 'breakdown_stock') {
        const usage = result.request_record || {};
        cards += metricCard(
          'Breakdown wood',
          `PW .5 ${Number(usage.pw05 || 0).toFixed(2)} · PW .75 ${Number(usage.pw075 || 0).toFixed(2)}`,
        );
      }
      metricsDiv.innerHTML = cards;
      resultDiv.hidden = false;
      const summaryBits = [`Generated walk-up files in ${result.output_dir || 'the output folder'}.`];
      if (result.warning) summaryBits.push(result.warning);
      document.getElementById('walkupRequestSummary').textContent = summaryBits.join(' ');
    } else {
      metricsDiv.innerHTML = metricCard('Status', 'Failed', result.error || 'Generation failed');
      resultDiv.hidden = false;
      document.getElementById('walkupRequestSummary').textContent = result.error || 'Generation failed.';
    }
  } catch (error) {
    alert(error.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Generate files';
    }
  }
}

function openTrainingMatrixModal() {
  return loadDailyTraining().then(() => {
    document.getElementById('trainingMatrixModal').hidden = false;
    syncModalBodyLock();
    dtSwitchTab('review');
  });
}

function closeTrainingMatrixModal() {
  document.getElementById('trainingMatrixModal').hidden = true;
  syncModalBodyLock();
}

// ---------------------------------------------------------------------------
// Daily Training Review
// ---------------------------------------------------------------------------
let _dtData = null;
let _dtCurrentTab = 'review';

const DT_RATING_LABELS = {
  1: 'Struggled',
  2: 'Needed Help',
  3: 'Supervised',
  4: 'Independent',
  5: 'Could Teach',
};
const DT_RATING_HINTS = {
  1: 'Could not complete the task safely or correctly',
  2: 'Required hands-on assistance to finish the task',
  3: 'Did the core work; trainer oversaw or handled related steps',
  4: 'Completed the task without assistance',
  5: 'Reliable enough to train others',
};
const DT_RATING_MAX = 5;
const DT_RATING_COLORS = { 1: 'var(--danger)', 2: 'var(--warn)', 3: 'var(--accent-2)', 4: 'var(--accent)', 5: '#1f7a57' };

function getDtTraineeId() {
  const el = document.getElementById('dtTraineeSelect');
  return el ? Number(el.value) : 0;
}

function dtSwitchTab(tab) {
  _dtCurrentTab = tab;
  document.getElementById('dtTabReview').classList.toggle('active', tab === 'review');
  document.getElementById('dtTabSummary').classList.toggle('active', tab === 'summary');
  document.getElementById('dtTabLog').classList.toggle('active', tab === 'log');
  document.getElementById('dtReviewPane').hidden = tab !== 'review';
  document.getElementById('dtSummaryPane').hidden = tab !== 'summary';
  document.getElementById('dtLogPane').hidden = tab !== 'log';
  if (tab === 'review') {
    const hint = document.getElementById('dtReviewHint');
    hint.textContent = 'Check off skill areas observed today, rate each one, and add support remarks. Hover a rating for details.';
    hint.style.color = '';
    loadDtDailyRemark().catch(() => {});
  }
  if (tab === 'summary') loadDtProficiency().catch((e) => console.warn(e));
  if (tab === 'log') loadDtLog().catch((e) => console.warn(e));
}

async function loadDailyTraining() {
  const data = await api('/api/daily-training');
  _dtData = data;
  const select = document.getElementById('dtTraineeSelect');
  const prev = select.value;
  select.innerHTML = (data.trainees || []).map((t) =>
    `<option value="${t.id}" ${String(t.id) === prev ? 'selected' : ''}>${escapeHtml(t.name)}</option>`
  ).join('');
  if (!select.value && data.trainees.length) select.value = data.trainees[0].id;

  const dateInput = document.getElementById('dtDate');
  if (!dateInput.value) dateInput.value = new Date().toISOString().slice(0, 10);

  renderDtSkillGrid(
    data.skill_areas || [],
    data.rating_labels || DT_RATING_LABELS,
    data.rating_hints || DT_RATING_HINTS,
  );
  await loadDtDailyRemark();
  updateDepartmentRecordSummary({
    training: {
      trainees: data.trainee_count || 0,
      observations: data.total_observations || 0,
    },
  });
  return data;
}

function renderDtSkillGrid(areas, ratingLabels, ratingHints = DT_RATING_HINTS) {
  const grid = document.getElementById('dtSkillGrid');
  grid.innerHTML = areas.map((area) => `
    <div class="dt-skill-card" data-area="${escapeHtml(area)}">
      <label class="dt-skill-card-header">
        <input type="checkbox" class="dt-area-check" data-area="${escapeHtml(area)}">
        <strong>${escapeHtml(area)}</strong>
      </label>
      <div class="dt-rating-row">
        ${Object.entries(ratingLabels).map(([val, label]) => {
          const hint = ratingHints[val] || ratingHints[Number(val)] || '';
          return `<button type="button" class="dt-rating-btn" data-area="${escapeHtml(area)}" data-rating="${val}" title="${escapeHtml(hint)}">${escapeHtml(label)}</button>`;
        }).join('')}
      </div>
      <input type="text" class="dt-note-input" data-area="${escapeHtml(area)}" placeholder="Optional note...">
    </div>
  `).join('');

  grid.querySelectorAll('.dt-area-check').forEach((cb) => {
    cb.addEventListener('change', () => {
      const card = cb.closest('.dt-skill-card');
      card.classList.toggle('active', cb.checked);
      if (cb.checked) {
        const firstBtn = card.querySelector('.dt-rating-btn[data-rating="3"]');
        if (firstBtn && !card.querySelector('.dt-rating-btn.selected')) firstBtn.click();
      }
    });
  });

  grid.querySelectorAll('.dt-rating-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const area = btn.dataset.area;
      grid.querySelectorAll(`.dt-rating-btn[data-area="${area}"]`).forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
      const card = btn.closest('.dt-skill-card');
      const cb = card.querySelector('.dt-area-check');
      if (!cb.checked) { cb.checked = true; card.classList.add('active'); }
    });
  });
}

async function loadDtDailyRemark() {
  const traineeId = getDtTraineeId();
  const date = document.getElementById('dtDate')?.value;
  const textarea = document.getElementById('dtDailyRemarks');
  if (!traineeId || !date || !textarea) return;
  const data = await api(`/api/daily-training/remark?trainee_id=${traineeId}&date=${encodeURIComponent(date)}`);
  textarea.value = data.item?.remarks || '';
}

async function submitDtReview() {
  const traineeId = getDtTraineeId();
  if (!traineeId) { alert('Select a trainee first.'); return; }
  const date = document.getElementById('dtDate').value;
  if (!date) { alert('Select a date.'); return; }

  const entries = [];
  document.querySelectorAll('.dt-skill-card.active').forEach((card) => {
    const area = card.dataset.area;
    const selectedBtn = card.querySelector('.dt-rating-btn.selected');
    if (!selectedBtn) return;
    const note = card.querySelector('.dt-note-input').value.trim();
    entries.push({ skill_area: area, rating: Number(selectedBtn.dataset.rating), note });
  });

  const remarks = document.getElementById('dtDailyRemarks').value.trim();
  if (!entries.length && !remarks) {
    alert('Check at least one skill area, add remarks, or both.');
    return;
  }

  const btn = document.getElementById('dtSubmitReview');
  btn.disabled = true;
  btn.textContent = 'Saving...';
  try {
    if (entries.length) {
      await api('/api/daily-training/observations', {
        method: 'POST',
        body: JSON.stringify({ trainee_id: traineeId, date, entries }),
      });
      document.querySelectorAll('.dt-skill-card.active').forEach((card) => {
        const cb = card.querySelector('.dt-area-check');
        cb.checked = false;
        card.classList.remove('active');
        card.querySelectorAll('.dt-rating-btn').forEach((b) => b.classList.remove('selected'));
        card.querySelector('.dt-note-input').value = '';
      });
    }
    await api('/api/daily-training/remarks', {
      method: 'POST',
      body: JSON.stringify({ trainee_id: traineeId, date, remarks }),
    });

    await loadDailyTraining();
    const parts = [];
    if (entries.length) parts.push(`${entries.length} observation${entries.length === 1 ? '' : 's'}`);
    if (remarks) parts.push('remarks');
    document.getElementById('dtReviewHint').textContent =
      `Saved ${parts.join(' and ')} for ${date}.`;
    document.getElementById('dtReviewHint').style.color = 'var(--accent)';
  } catch (err) {
    alert(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save Daily Review';
  }
}

async function loadDtProficiency() {
  const traineeId = getDtTraineeId();
  if (!traineeId) return;
  const data = await api(`/api/daily-training/proficiency?trainee_id=${traineeId}`);
  renderDtProficiency(data);
}

function renderDtProficiency(data) {
  const metricsDiv = document.getElementById('dtSummaryMetrics');
  metricsDiv.innerHTML = [
    metricCard('Overall Level', data.overall_level || 'No data', `avg ${data.overall_avg_rating || 0}`),
    metricCard('Areas Observed', `${data.areas_observed}/${data.areas_total}`, ''),
    metricCard('Total Observations', data.total_observations, ''),
    metricCard('Days Active', data.days_active || 0, data.trainee?.start_date ? `since ${data.trainee.start_date}` : ''),
  ].join('');

  const grid = document.getElementById('dtProficiencyGrid');
  grid.innerHTML = (data.areas || []).map((a) => {
    const level = Math.round(a.avg_rating || 0);
    const pct = ((a.avg_rating || 0) / DT_RATING_MAX * 100).toFixed(0);
    const trendClass = a.trend === 'up' ? 'dt-trend-up' : a.trend === 'down' ? 'dt-trend-down' : a.trend === 'steady' ? 'dt-trend-steady' : '';
    const marked = Boolean(a.proficiency_marked);
    return `
      <div class="dt-area-card ${marked ? 'is-proficient' : ''}">
        <div class="dt-area-card-header">
          <strong>${escapeHtml(a.skill_area)}</strong>
          <span class="dt-area-level" data-level="${level}">${escapeHtml(a.level_label)}</span>
        </div>
        <div class="dt-area-bar"><div class="dt-area-bar-fill" data-level="${level}" style="width:${pct}%"></div></div>
        <div class="dt-area-meta">
          <span class="${trendClass}">${a.observation_count} obs</span>
          <span>${a.latest_date ? formatDateUS(a.latest_date) : 'never'}</span>
        </div>
        <button
          class="button compact dt-mark-proficient ${marked ? 'marked' : 'secondary'}"
          type="button"
          data-area="${escapeHtml(a.skill_area)}"
          data-marked="${marked ? '1' : '0'}"
        >${marked ? 'Proficient ?' : 'Mark proficient'}</button>
      </div>
    `;
  }).join('');

  grid.querySelectorAll('.dt-mark-proficient').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const traineeId = getDtTraineeId();
      if (!traineeId) return;
      const marked = btn.dataset.marked !== '1';
      await api('/api/daily-training/proficiency/mark', {
        method: 'POST',
        body: JSON.stringify({
          trainee_id: traineeId,
          skill_area: btn.dataset.area,
          marked,
        }),
      });
      await loadDtProficiency();
    });
  });
}

function dtRatingOptions(selectedRating) {
  return Object.entries(DT_RATING_LABELS).map(([val, label]) =>
    `<option value="${val}" ${Number(val) === Number(selectedRating) ? 'selected' : ''}>${escapeHtml(label)}</option>`
  ).join('');
}

async function loadDtLog() {
  const traineeId = getDtTraineeId();
  if (!traineeId) return;
  const data = await api(`/api/daily-training/log?trainee_id=${traineeId}&days=30`);
  renderDtLog(data.days || []);
}

function renderDtLog(days) {
  const container = document.getElementById('dtLogEntries');
  if (!days.length) {
    container.innerHTML = '<p style="text-align:center;color:var(--muted);padding:2rem">No observations recorded yet.</p>';
    return;
  }
  container.innerHTML = days.map((day) => `
    <div class="dt-log-day" data-day="${escapeHtml(day.date)}">
      <div class="dt-log-day-header">
        <span>${escapeHtml(formatDateUS(day.date))}</span>
        <div class="dt-log-day-header-right">
          <span class="dt-log-day-meta">${day.entries.length} observation${day.entries.length === 1 ? '' : 's'}${day.remarks ? ' ? remarks' : ''}</span>
          <button class="button secondary compact dt-log-day-edit-toggle" type="button">Edit</button>
        </div>
      </div>
      <div class="dt-log-remarks-row">
        <div class="dt-log-remarks-view">
          ${day.remarks
            ? `<div class="dt-log-remarks"><strong>Support / remarks:</strong> ${escapeHtml(day.remarks)}</div>`
            : '<div class="dt-log-remarks dt-log-remarks-empty">No support remarks for this day.</div>'}
          <button class="button secondary compact dt-log-edit-remark" type="button">Edit remarks</button>
        </div>
        <form class="dt-log-remark-edit" hidden>
          <label>
            <span>Date</span>
            <input type="date" name="date" value="${escapeHtml(day.date)}" required>
          </label>
          <label>
            <span>Remarks</span>
            <textarea name="remarks" rows="2" placeholder="Cleanup, organization, staging, etc.">${escapeHtml(day.remarks || '')}</textarea>
          </label>
          <div class="dt-log-edit-actions">
            <button class="button compact" type="submit">Save remarks</button>
            <button class="button secondary compact dt-log-edit-cancel" type="button">Cancel</button>
          </div>
        </form>
      </div>
      ${day.entries.length ? `<div class="dt-log-day-entries">
        ${day.entries.map((e) => {
          const level = Number(e.rating);
          const label = DT_RATING_LABELS[level] || '?';
          return `<div class="dt-log-entry" data-id="${e.id}">
            <div class="dt-log-entry-view">
              <span class="dt-log-area">${escapeHtml(e.skill_area)}</span>
              <span class="dt-log-rating dt-area-level" data-level="${level}">${escapeHtml(label)}</span>
              <span class="dt-log-note">${escapeHtml(e.note || '')}${e.note ? '' : '<span class="dt-log-note-empty">No note</span>'}</span>
              <div class="dt-log-entry-actions">
                <button class="button secondary compact dt-log-edit" type="button">Edit</button>
                <button class="dt-log-delete" type="button" data-id="${e.id}" title="Delete">&times;</button>
              </div>
            </div>
            <form class="dt-log-entry-edit" hidden>
              <label>
                <span>Date</span>
                <input type="date" name="date" value="${escapeHtml(e.date)}" required>
              </label>
              <label>
                <span>Rating</span>
                <select name="rating">${dtRatingOptions(level)}</select>
              </label>
              <label class="dt-log-edit-note">
                <span>Note</span>
                <input type="text" name="note" value="${escapeHtml(e.note || '')}" placeholder="Optional note">
              </label>
              <div class="dt-log-edit-actions">
                <button class="button compact" type="submit">Save</button>
                <button class="button secondary compact dt-log-edit-cancel" type="button">Cancel</button>
              </div>
            </form>
          </div>`;
        }).join('')}
      </div>` : ''}
    </div>
  `).join('');

  function resetDtLogDayEditState(day) {
    day.classList.remove('is-editing');
    const toggle = day.querySelector('.dt-log-day-edit-toggle');
    if (toggle) toggle.textContent = 'Edit';
    day.querySelectorAll('.dt-log-entry-edit').forEach((form) => { form.hidden = true; });
    day.querySelectorAll('.dt-log-entry-view').forEach((view) => { view.hidden = false; });
    day.querySelectorAll('.dt-log-remark-edit').forEach((form) => { form.hidden = true; });
    day.querySelectorAll('.dt-log-remarks-view').forEach((view) => { view.hidden = false; });
  }

  container.querySelectorAll('.dt-log-day-edit-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const day = btn.closest('.dt-log-day');
      const willEdit = !day.classList.contains('is-editing');
      container.querySelectorAll('.dt-log-day.is-editing').forEach((openDay) => {
        if (openDay !== day) resetDtLogDayEditState(openDay);
      });
      if (willEdit) {
        day.classList.add('is-editing');
        btn.textContent = 'Done';
      } else {
        resetDtLogDayEditState(day);
      }
    });
  });

  container.querySelectorAll('.dt-log-edit').forEach((btn) => {
    btn.addEventListener('click', () => {
      const entry = btn.closest('.dt-log-entry');
      entry.querySelector('.dt-log-entry-view').hidden = true;
      entry.querySelector('.dt-log-entry-edit').hidden = false;
    });
  });

  container.querySelectorAll('.dt-log-edit-remark').forEach((btn) => {
    btn.addEventListener('click', () => {
      const row = btn.closest('.dt-log-remarks-row');
      row.querySelector('.dt-log-remarks-view').hidden = true;
      row.querySelector('.dt-log-remark-edit').hidden = false;
    });
  });

  container.querySelectorAll('.dt-log-edit-cancel').forEach((btn) => {
    btn.addEventListener('click', () => {
      const entry = btn.closest('.dt-log-entry');
      if (entry) {
        entry.querySelector('.dt-log-entry-view').hidden = false;
        entry.querySelector('.dt-log-entry-edit').hidden = true;
        return;
      }
      const row = btn.closest('.dt-log-remarks-row');
      if (row) {
        row.querySelector('.dt-log-remarks-view').hidden = false;
        row.querySelector('.dt-log-remark-edit').hidden = true;
      }
    });
  });

  container.querySelectorAll('.dt-log-entry-edit').forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const entry = form.closest('.dt-log-entry');
      const observationId = Number(entry.dataset.id);
      const formData = new FormData(form);
      await api('/api/daily-training/observations/update', {
        method: 'POST',
        body: JSON.stringify({
          id: observationId,
          date: formData.get('date'),
          rating: Number(formData.get('rating')),
          note: formData.get('note'),
        }),
      });
      await loadDtLog();
      await loadDailyTraining();
      if (_dtCurrentTab === 'summary') await loadDtProficiency();
    });
  });

  container.querySelectorAll('.dt-log-remark-edit').forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const dayNode = form.closest('.dt-log-day');
      const traineeId = getDtTraineeId();
      const originalDate = dayNode.dataset.day;
      const formData = new FormData(form);
      const newDate = String(formData.get('date') || '').trim();
      await api('/api/daily-training/remarks', {
        method: 'POST',
        body: JSON.stringify({
          trainee_id: traineeId,
          date: originalDate,
          new_date: newDate !== originalDate ? newDate : '',
          remarks: formData.get('remarks'),
        }),
      });
      await loadDtLog();
    });
  });

  container.querySelectorAll('.dt-log-delete').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this observation?')) return;
      await api('/api/daily-training/observations/delete', {
        method: 'POST',
        body: JSON.stringify({ id: Number(btn.dataset.id) }),
      });
      await loadDtLog();
      await loadDailyTraining();
    });
  });
}

function closeSnapshotHistoryModal() {
  const el = document.getElementById('snapshotHistoryModal');
  if (el) { el.hidden = true; syncModalBodyLock(); }
}

function formatDateUS(value) {
  const text = String(value || '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const [y, m, d] = text.split('-');
    return `${m}/${d}/${y}`;
  }
  if (/^\d{4}-\d{2}$/.test(text)) {
    const [y, m] = text.split('-');
    return `${m}/${y}`;
  }
  return text;
}

function sortMachineIssues(issues, field, asc) {
  return [...issues].sort((a, b) => {
    const va = String(a[field] || '').toLowerCase();
    const vb = String(b[field] || '').toLowerCase();
    const cmp = va < vb ? -1 : va > vb ? 1 : 0;
    return asc ? cmp : -cmp;
  });
}

function machineIssueStatusClass(status) {
  if (status === 'Resolved') return 'pill-resolved';
  if (status === 'In Progress') return 'pill-in-progress';
  if (status === 'Escalated') return 'pill-escalated';
  if (status === 'Pending') return 'pill-pending';
  return 'pill-reported';
}

function formatMachineIssueDate(entry) {
  const base = formatDateUS(entry.date);
  return entry.date_label ? `${base} (${entry.date_label})` : base;
}

function nextMachineIssueStatus(status) {
  const order = ['Pending', 'Reported', 'In Progress', 'Escalated', 'Resolved'];
  const index = order.indexOf(status);
  if (index === -1) return 'Reported';
  return order[(index + 1) % order.length];
}

function updateMachineIssueSortHeaders() {
  document.querySelectorAll('#machineIssueHeaders .sortable-header').forEach((th) => {
    const arrow = th.querySelector('.sort-arrow');
    if (th.dataset.sort === machineIssueSortField) {
      th.classList.add('active-sort');
      arrow.innerHTML = machineIssueSortAsc ? '&#9650;' : '&#9660;';
    } else {
      th.classList.remove('active-sort');
      arrow.innerHTML = '';
    }
  });
}

function renderMachineIssues(data) {
  _lastMachineIssueData = data;
  const metrics = data.metrics || {};
  document.getElementById('machineIssueMetrics').innerHTML = [
    metricCard('Total Logged', metrics.total || 0, 'machine events recorded'),
    metricCard('Open / Follow-up', metrics.open || 0, 'not yet resolved'),
    metricCard('Omni', metrics.omni || 0, 'entries mentioning Omni'),
    metricCard('Rover A', metrics.rover_a || 0, 'entries mentioning Rover A'),
  ].join('');
  document.getElementById('machineIssuesSummary').textContent =
    'Factual machine history: who was notified, what happened, and how it was resolved or escalated.';

  const machineSelect = document.getElementById('machineIssueMachine');
  const statusSelect = document.getElementById('machineIssueStatus');
  if (!machineSelect.options.length) {
    machineSelect.innerHTML = (data.machines || []).map((machine) => `<option value="${escapeHtml(machine)}">${escapeHtml(machine)}</option>`).join('');
  }
  if (!statusSelect.options.length) {
    statusSelect.innerHTML = (data.statuses || []).map((status) => `<option value="${escapeHtml(status)}">${escapeHtml(status)}</option>`).join('');
  }

  // Pending banner — remotely submitted errors awaiting review
  const pendingBanner = document.getElementById('machineIssuesPendingBanner');
  const pendingIssues = (data.issues || []).filter((e) => e.status === 'Pending');
  if (pendingBanner) {
    if (pendingIssues.length) {
      pendingBanner.hidden = false;
      pendingBanner.innerHTML = `<strong>${pendingIssues.length} pending error${pendingIssues.length > 1 ? 's' : ''} need review:</strong> ` +
        pendingIssues.map((e) => `${escapeHtml(e.machine)} — ${escapeHtml(e.issue)}`).join(' &bull; ');
    } else {
      pendingBanner.hidden = true;
    }
  }

  const tbody = document.getElementById('machineIssuesTable');
  const issues = sortMachineIssues(data.issues || [], machineIssueSortField, machineIssueSortAsc);
  if (!issues.length) {
    tbody.innerHTML = '<tr><td class="empty-row" colspan="6">No machine issues logged yet.</td></tr>';
  } else {
    tbody.innerHTML = issues.map((entry) => {
      const notified = Array.isArray(entry.notified) ? entry.notified.join(', ') : String(entry.notified || '');
      const detailParts = [entry.summary, entry.actions, entry.result].filter(Boolean);
      const detail = detailParts.join(' ');
      return `
        <tr>
          <td>${escapeHtml(formatMachineIssueDate(entry))}</td>
          <td>${escapeHtml(entry.machine)}</td>
          <td>
            <strong>${escapeHtml(entry.issue)}</strong>
            <div class="muted-cell">${escapeHtml(detail)}</div>
          </td>
          <td>${escapeHtml(notified || '?')}</td>
          <td>
            <button class="pill pill-toggle ${machineIssueStatusClass(entry.status)}"
              data-id="${escapeHtml(entry.id)}"
              data-status="${escapeHtml(entry.status)}"
              type="button"
              title="Click to advance status"
            >${escapeHtml(entry.status)}</button>
          </td>
          <td>
            <div class="row-actions">
              <button class="button secondary compact machine-issue-edit-btn" data-id="${escapeHtml(entry.id)}" type="button">Edit</button>
              <button class="button secondary compact machine-issue-delete-btn" data-id="${escapeHtml(entry.id)}" type="button">Delete</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    updateMachineIssueSortHeaders();

    tbody.querySelectorAll('.pill-toggle').forEach((button) => {
      button.addEventListener('click', async () => {
        const newStatus = nextMachineIssueStatus(button.dataset.status);
        await api('/api/machine-issues/update-status', {
          method: 'POST',
          body: JSON.stringify({ id: button.dataset.id, status: newStatus }),
        });
        await loadMachineIssues();
      });
    });

    tbody.querySelectorAll('.machine-issue-edit-btn').forEach((button) => {
      button.addEventListener('click', () => {
        const entry = (data.issues || []).find((item) => item.id === button.dataset.id);
        if (entry) beginMachineIssueEdit(entry);
      });
    });

    tbody.querySelectorAll('.machine-issue-delete-btn').forEach((button) => {
      button.addEventListener('click', async () => {
        if (!window.confirm('Delete this machine issue from the log?')) return;
        await api('/api/machine-issues/delete', {
          method: 'POST',
          body: JSON.stringify({ id: button.dataset.id }),
        });
        resetMachineIssueForm();
        setMachineIssueFormExpanded(false);
        await loadMachineIssues();
      });
    });
  }

  updateDepartmentRecordSummary({
    machineIssues: { total: metrics.total || 0, open: metrics.open || 0 },
  });
  renderMachineIssuesPrint(data);
}

function renderMachineIssuesPrint(data) {
  const metrics = data.metrics || {};
  const issues = sortMachineIssues(data.issues || [], 'date', false);
  const dates = issues.map((entry) => entry.date).filter(Boolean).sort();
  const rangeText = dates.length
    ? `${formatDateUS(dates[0])} – ${formatDateUS(dates[dates.length - 1])}`
    : 'No date range';
  const generated = new Date().toLocaleString();
  document.getElementById('machineIssuesPrintMeta').textContent =
    `${issues.length} recorded issue${issues.length === 1 ? '' : 's'} · ${rangeText} · `
    + `${metrics.open || 0} open/follow-up · Generated ${generated}`;

  const body = document.getElementById('machineIssuesPrintBody');
  if (!issues.length) {
    body.innerHTML = '<p class="print-empty">No machine issues logged.</p>';
    return;
  }

  body.innerHTML = issues.map((entry) => {
    const notified = Array.isArray(entry.notified) ? entry.notified.join(', ') : String(entry.notified || '');
    const sections = [
      ['Summary', entry.summary],
      ['Actions / follow-up', entry.actions],
      ['Result', entry.result],
    ].filter(([, value]) => String(value || '').trim());

    return `
      <article class="print-issue-entry">
        <div class="print-issue-kicker">
          <span>${escapeHtml(formatMachineIssueDate(entry))}</span>
          <span>${escapeHtml(entry.machine || '')}</span>
          <span class="print-issue-status">${escapeHtml(entry.status || '')}</span>
        </div>
        <h2 class="print-issue-title">${escapeHtml(entry.issue || '')}</h2>
        ${notified ? `<p class="print-issue-line"><strong>Notified:</strong> ${escapeHtml(notified)}</p>` : ''}
        ${sections.map(([label, value]) => `
          <p class="print-issue-line"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</p>
        `).join('')}
      </article>
    `;
  }).join('');
}

function printMachineIssues() {
  if (!_lastMachineIssueData) {
    alert('Machine issue data is not loaded yet.');
    return;
  }
  renderMachineIssuesPrint(_lastMachineIssueData);
  const sheet = document.getElementById('machineIssuesPrintSheet');
  sheet.hidden = false;
  document.body.classList.add('printing-machine-issues');
  const cleanup = () => {
    document.body.classList.remove('printing-machine-issues');
    sheet.hidden = true;
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  window.print();
}

async function loadMachineIssues() {
  const data = await api('/api/machine-issues');
  renderMachineIssues(data);
  return data;
}

async function loadNewHireTask(dayValue = '') {
  const query = dayValue === '' ? '' : `?weekday=${encodeURIComponent(dayValue)}`;
  const data = await api(`/api/new-hire-task${query}`);
  renderNewHireTask(data);
  return data;
}

async function printTrimChecklist() {
  const result = await api('/api/trim-checklist/print', {
    method: 'POST',
    body: JSON.stringify({}),
  });
  alert(`Sent trim checklist to printer:\n${result.path}`);
}

function trimMaterialKind(material) {
  const lower = String(material || '').toLowerCase();
  if (lower.startsWith('paint')) return 'paint';
  if (lower.startsWith('stain')) return 'stain';
  return 'other';
}

function trimMaterialBadge(material) {
  const label = String(material || '').trim();
  if (!label) return '<span class="trim-material-badge trim-material-empty">?</span>';
  const kind = trimMaterialKind(label);
  return `<span class="trim-material-badge trim-material-${kind}">${escapeHtml(label)}</span>`;
}

function renderTrimSectionLabel(label) {
  const text = String(label || '');
  if (!text.includes(' - ')) return escapeHtml(text);
  const splitAt = text.indexOf(' - ');
  const thickness = text.slice(0, splitAt);
  const grade = text.slice(splitAt + 3);
  return `<span class="trim-section-thickness">${escapeHtml(thickness)}</span><span class="trim-section-grade">${escapeHtml(grade)}</span>`;
}

function trimWriteInMaterialSelect(selected) {
  const current = String(selected || '');
  const options = ['', 'Paint UV-1', 'Stain NO UV'];
  return `
    <select class="trim-writein-select" data-field="material" aria-label="COH material">
      ${options.map((option) => {
        const label = option || 'Material…';
        const selectedAttr = option === current || (!current && !option) ? ' selected' : '';
        return `<option value="${escapeHtml(option)}"${selectedAttr}>${escapeHtml(label)}</option>`;
      }).join('')}
    </select>
  `;
}

function trimSectionIsWriteIn(group) {
  const label = String(group?.label || '').toLowerCase();
  if (label.includes('coh')) return true;
  return (group?.rows || []).some((row) => row.write_in);
}

function blankIfZeroQty(value) {
  const qty = Number(value || 0);
  return qty > 0 ? String(qty) : '';
}

function trimCatalogNeedRows(group) {
  const rows = group?.rows || [];
  if (trimSectionIsWriteIn(group)) return rows;
  return rows.filter((row) => Number(row.expected_today || 0) > 0);
}

function renderTrimChecklistRow(row, { writeIn = false } = {}) {
  const qtyInput = `
    <input
      type="number"
      min="0"
      step="1"
      class="trim-qty-input"
      data-field="qty_wanted"
      value="${escapeHtml(blankIfZeroQty(row.qty_wanted))}"
      aria-label="Qty wanted for ${escapeHtml(row.item || 'write-in item')}"
    >
  `;
  if (writeIn) {
    return `
      <tr class="trim-item-row trim-writein-row trim-material-row-${trimMaterialKind(row.material)}" data-row-index="${Number(row.row_index)}" data-write-in="1" data-slot="${Number(row.slot || 0)}" data-request-key="${escapeHtml(row.request_key || '')}">
        <td class="trim-item-name">
          <input type="text" class="trim-writein-input" data-field="item" value="${escapeHtml(row.item || '')}" placeholder="COH / other item" aria-label="COH/Other write-in item">
        </td>
        <td class="trim-size-cell">
          <input type="text" class="trim-writein-input" data-field="size" value="${escapeHtml(row.size || '')}" placeholder="Size" aria-label="COH/Other write-in size">
        </td>
        <td class="trim-material-cell">${trimWriteInMaterialSelect(row.material)}</td>
        <td class="num trim-qty-cell">${qtyInput}</td>
      </tr>
    `;
  }
  return `
    <tr class="trim-item-row trim-material-row-${trimMaterialKind(row.material)}" data-row-index="${Number(row.row_index)}" data-request-key="${escapeHtml(row.request_key || '')}" data-item="${escapeHtml(row.item || '')}" data-size="${escapeHtml(row.size || '')}" data-material="${escapeHtml(row.material || '')}">
      <td class="trim-item-name">${escapeHtml(row.item || '')}</td>
      <td class="trim-size-cell">${escapeHtml(row.size || '')}</td>
      <td class="trim-material-cell">${trimMaterialBadge(row.material)}</td>
      <td class="num">${escapeHtml(formatTrimQtyValue(row.expected_today || 0))}</td>
      <td class="num trim-qty-cell">${qtyInput}</td>
    </tr>
  `;
}

function formatTrimQtyValue(value) {
  if (value === null || value === undefined || value === '') return '';
  return String(Number(value));
}

let _trimChecklistData = null;
let _trimChecklistDirty = false;

function setTrimChecklistDirty(dirty) {
  _trimChecklistDirty = dirty;
  const indicator = document.getElementById('trimChecklistDirty');
  const saveButton = document.getElementById('saveTrimChecklist');
  if (indicator) indicator.hidden = !dirty;
  if (saveButton) saveButton.disabled = !dirty;
}

function renderTrimChecklist(data) {
  _trimChecklistData = data;
  setTrimChecklistDirty(false);
  const summary = document.getElementById('trimChecklistSummary');
  const body = document.getElementById('trimChecklistBody');
  if (!summary || !body) return;

  const expectedTotal = Number(data.expected_total || 0);
  const wantedCount = Number(data.wanted_count || data.restock_count || 0);
  const itemCount = Number(data.item_count || 0);
  summary.textContent = `${expectedTotal} trim piece${expectedTotal === 1 ? '' : 's'} expected to enter Sand today · ${wantedCount} stock line${wantedCount === 1 ? '' : 's'} requested · updated ${formatTimestamp(data.last_modified)}`;

  const groups = [];
  let currentGroup = { label: '', rows: [] };
  (data.rows || []).forEach((row) => {
    if (row.kind === 'section') {
      if (currentGroup.label || currentGroup.rows.length) {
        groups.push(currentGroup);
      }
      currentGroup = { label: row.label || '', rows: [] };
      return;
    }
    if (row.kind === 'item') {
      currentGroup.rows.push(row);
    }
  });
  if (currentGroup.label || currentGroup.rows.length) {
    groups.push(currentGroup);
  }

  if (!groups.length) {
    body.innerHTML = '<p class="muted-cell">No trim stock lines are configured.</p>';
    return;
  }

  const incoming = Array.isArray(data.incoming) ? data.incoming : [];
  const incomingHtml = `
    <section class="need-incoming-card">
      <div class="need-incoming-header">
        <h3>Expected to enter Sand today</h3>
        <p>${incoming.length ? `${incoming.length} trim line${incoming.length === 1 ? '' : 's'} on jobs currently in cutting.` : 'No trim lines are in cutting right now.'}</p>
      </div>
      ${incoming.length ? `
        <div class="need-incoming-list">
          ${incoming.map((row) => `
            <article class="need-incoming-item">
              <strong>${escapeHtml(row.item || 'Trim')}</strong>
              <span>${escapeHtml(row.description || row.catalog_item || '')}</span>
              <em>${escapeHtml(String(row.qty || 0))} expected${row.material ? ` · ${escapeHtml(row.material)}` : ''}</em>
              ${row.jobs && row.jobs.length ? `<small>${escapeHtml(row.jobs.join(', '))}</small>` : ''}
            </article>
          `).join('')}
        </div>
      ` : ''}
    </section>
  `;

  body.innerHTML = incomingHtml + groups.map((group) => {
    const writeIn = trimSectionIsWriteIn(group);
    const visibleRows = trimCatalogNeedRows(group);
    if (!visibleRows.length) return '';
    const sectionKind = writeIn ? 'other' : trimMaterialKind(group.label);
    const groupClass = writeIn ? ' trim-writein-group' : '';
    const headers = writeIn
      ? `<th>Item</th><th>Size</th><th>Material</th><th class="num">Qty wanted</th>`
      : `<th>Item</th><th>Size</th><th>Material</th><th class="num">Expected today</th><th class="num">Qty wanted</th>`;
    return `
    <section class="trim-material-group trim-group-${sectionKind}${groupClass}">
      ${group.label ? `<h3 class="trim-section-label trim-section-${sectionKind}">${renderTrimSectionLabel(group.label)}</h3>` : ''}
      <div class="table-wrap trim-table-wrap">
        <table class="trim-checklist-table">
          <thead>
            <tr>
              ${headers}
            </tr>
          </thead>
          <tbody>
            ${visibleRows.map((row) => renderTrimChecklistRow(row, { writeIn })).join('')}
          </tbody>
        </table>
      </div>
    </section>
  `;
  }).join('');

  body.querySelectorAll('.trim-qty-input, .trim-writein-input, .trim-writein-select').forEach((input) => {
    input.addEventListener('input', () => {
      setTrimChecklistDirty(true);
    });
    input.addEventListener('change', () => {
      setTrimChecklistDirty(true);
    });
  });
}

async function loadTrimChecklist() {
  const data = await api('/api/trim-checklist');
  renderTrimChecklist(data);
  return data;
}

function collectTrimChecklistRows() {
  const rows = [];
  document.querySelectorAll('#trimChecklistBody .trim-item-row').forEach((rowNode) => {
    const rowIndex = Number(rowNode.dataset.rowIndex || 0);
    const qtyWanted = Number(rowNode.querySelector('[data-field="qty_wanted"]')?.value || 0);
    const writeIn = rowNode.dataset.writeIn === '1';
    const item = writeIn
      ? (rowNode.querySelector('[data-field="item"]')?.value || '').trim()
      : (rowNode.dataset.item || '');
    const size = writeIn
      ? (rowNode.querySelector('[data-field="size"]')?.value || '').trim()
      : (rowNode.dataset.size || '');
    const material = writeIn
      ? (rowNode.querySelector('[data-field="material"]')?.value || '').trim()
      : (rowNode.dataset.material || '');
    rows.push({
      kind: 'item',
      row_index: rowIndex,
      write_in: writeIn,
      slot: Number(rowNode.dataset.slot || 0),
      request_key: rowNode.dataset.requestKey || '',
      item,
      size,
      material,
      qty_wanted: qtyWanted,
    });
  });
  return rows;
}

async function saveTrimChecklistChanges() {
  const rows = collectTrimChecklistRows();
  const data = await api('/api/trim-checklist', {
    method: 'POST',
    body: JSON.stringify({ rows }),
  });
  renderTrimChecklist(data);
  alert(`Saved ${Number(data.saved_count || rows.length)} trim checklist row${Number(data.saved_count || rows.length) === 1 ? '' : 's'}.`);
}

function buildTrimChecklistPrintHtml(data) {
  const groups = [];
  let currentGroup = { label: '', rows: [] };
  (data.rows || []).forEach((row) => {
    if (row.kind === 'section') {
      if (currentGroup.label || currentGroup.rows.length) groups.push(currentGroup);
      currentGroup = { label: row.label || '', rows: [] };
      return;
    }
    if (row.kind === 'item') currentGroup.rows.push(row);
  });
  if (currentGroup.label || currentGroup.rows.length) groups.push(currentGroup);

  const incoming = Array.isArray(data.incoming) ? data.incoming : [];
  const incomingBlock = incoming.length ? `
    <section class="trim-print-group">
      <h2>Expected to enter Sand today</h2>
      <table>
        <thead>
          <tr><th>Item</th><th>Description</th><th>Material</th><th>Expected</th><th>Jobs</th></tr>
        </thead>
        <tbody>
          ${incoming.map((row) => `
            <tr>
              <td>${escapeHtml(row.item || '')}</td>
              <td>${escapeHtml(row.description || row.catalog_item || '')}</td>
              <td>${escapeHtml(row.material || '')}</td>
              <td>${escapeHtml(String(row.qty || 0))}</td>
              <td>${escapeHtml((row.jobs || []).join(', '))}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </section>
  ` : '';

  return incomingBlock + groups.map((group) => {
    const writeIn = trimSectionIsWriteIn(group);
    const visibleRows = trimCatalogNeedRows(group);
    if (!visibleRows.length) return '';
    const header = writeIn
      ? `<tr><th>Item</th><th>Size</th><th>Material</th><th>Qty wanted</th></tr>`
      : `<tr><th>Item</th><th>Size</th><th>Material</th><th>Expected today</th><th>Qty wanted</th></tr>`;
    return `
    <section class="trim-print-group${writeIn ? ' is-writein' : ''}">
      ${group.label ? `<h2>${escapeHtml(group.label)}</h2>` : ''}
      <table>
        <thead>
          ${header}
        </thead>
        <tbody>
          ${visibleRows.map((row) => {
            const qtyCell = escapeHtml(blankIfZeroQty(row.qty_wanted));
            if (writeIn) {
              return `
            <tr class="trim-print-writein">
              <td>${escapeHtml(row.item || '')}</td>
              <td>${escapeHtml(row.size || '')}</td>
              <td>${escapeHtml(row.material || '')}</td>
              <td class="trim-print-handwrite">${qtyCell}</td>
            </tr>`;
            }
            return `
            <tr>
              <td>${escapeHtml(row.item || '')}</td>
              <td>${escapeHtml(row.size || '')}</td>
              <td>${escapeHtml(row.material || '')}</td>
              <td>${escapeHtml(String(row.expected_today ?? 0))}</td>
              <td>${qtyCell}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </section>
  `;
  }).join('');
}

function printTrimChecklistPreview() {
  const data = _trimChecklistData;
  if (!data) return;
  const edits = collectTrimChecklistRows();
  const editByRow = new Map(edits.map((row) => [Number(row.row_index), row]));
  const previewRows = (data.rows || []).map((row) => {
    if (row.kind !== 'item') return row;
    const updated = editByRow.get(Number(row.row_index));
    if (!updated) return row;
    return {
      ...row,
      item: updated.item,
      size: updated.size,
      material: updated.material,
      qty_wanted: updated.qty_wanted,
      write_in: updated.write_in || row.write_in,
      slot: updated.slot ?? row.slot,
    };
  });
  printTrimChecklistData({ ...data, rows: previewRows });
}

function trimMaterialGuideIncluded() {
  const checkbox = document.getElementById('includeTrimMaterialGuide');
  if (!checkbox) return false;
  return checkbox.checked;
}

function buildTrimChecklistPreviewHtml(data) {
  const itemCount = Number(data.item_count || 0);
  const parts = [];
  if (trimMaterialGuideIncluded() && typeof window.buildTrimMaterialGuideHtml === 'function') {
    parts.push(`<div class="trim-checklist-preview-paper trim-checklist-preview-guide">${window.buildTrimMaterialGuideHtml()}</div>`);
  }
  parts.push(`
    <div class="trim-checklist-preview-paper trim-checklist-preview-sheet">
      <header class="trim-checklist-preview-header">
        <p class="trim-checklist-preview-eyebrow">Timberland Cabinetry · Cut Department</p>
        <h3>Trim Need List</h3>
        <p class="trim-checklist-preview-meta">${Number(data.expected_total || 0)} expected to enter Sand today · ${itemCount} stock lines · they tell us qty wanted</p>
      </header>
      ${buildTrimChecklistPrintHtml(data)}
    </div>
  `);
  return parts.join('');
}

function renderTrimChecklistPreview(data) {
  _trimChecklistPreviewData = data;
  const summary = document.getElementById('trimChecklistPreviewSummary');
  const body = document.getElementById('trimChecklistPreviewBody');
  const guideButton = document.getElementById('downloadTrimMaterialGuide');
  if (!summary || !body) return;
  const itemCount = Number(data.item_count || 0);
  const restockCount = Number(data.restock_count || 0);
  const guideOn = trimMaterialGuideIncluded();
  summary.textContent = `${Number(data.expected_total || 0)} expected to enter Sand today · ${itemCount} stock lines · ${restockCount} requested · updated ${formatTimestamp(data.last_modified)}${guideOn ? ' · material guide included' : ''}`;
  body.innerHTML = buildTrimChecklistPreviewHtml(data);
  if (guideButton) guideButton.disabled = !guideOn;
}

function printTrimChecklistData(data, options = {}) {
  if (!data) return;
  const includeGuide = options.includeGuide !== undefined ? options.includeGuide : trimMaterialGuideIncluded();
  const guideSection = document.getElementById('trimChecklistGuidePrintSection');
  if (guideSection) {
    if (includeGuide && typeof window.buildTrimMaterialGuideHtml === 'function') {
      guideSection.hidden = false;
      guideSection.innerHTML = window.buildTrimMaterialGuideHtml();
    } else {
      guideSection.hidden = true;
      guideSection.innerHTML = '';
    }
  }
  document.getElementById('trimChecklistPrintMeta').textContent =
    `${Number(data.expected_total || 0)} expected to enter Sand today · they tell us qty wanted`;
  document.getElementById('trimChecklistPrintBody').innerHTML = buildTrimChecklistPrintHtml(data);
  document.body.classList.toggle('printing-trim-checklist-with-guide', includeGuide);
  document.body.classList.add('printing-trim-checklist');
  const cleanup = () => {
    document.body.classList.remove('printing-trim-checklist');
    document.body.classList.remove('printing-trim-checklist-with-guide');
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  window.print();
}

let _trimChecklistPreviewData = null;

async function openTrimChecklistPreviewModal() {
  const modal = document.getElementById('trimChecklistPreviewModal');
  const summary = document.getElementById('trimChecklistPreviewSummary');
  const body = document.getElementById('trimChecklistPreviewBody');
  if (!modal) return;
  modal.hidden = false;
  syncModalBodyLock();
  syncModalBodyLock();
  _trimChecklistPreviewData = null;
  if (summary) summary.textContent = 'Loading trim checklist preview…';
  if (body) body.innerHTML = '<p class="muted-text">Loading…</p>';
  try {
    const data = await api('/api/trim-checklist');
    renderTrimChecklistPreview(data);
  } catch (error) {
    if (summary) summary.textContent = error.message || String(error);
    if (body) body.innerHTML = `<p class="muted-text">${escapeHtml(error.message || String(error))}</p>`;
  }
}

function closeTrimChecklistPreviewModal() {
  const modal = document.getElementById('trimChecklistPreviewModal');
  if (!modal) return;
  modal.hidden = true;
  syncModalBodyLock();
}

async function downloadTrimChecklistWorkbook() {
  const response = await fetch('/api/trim-checklist/download');
  if (!response.ok) {
    const text = await response.text();
    let message = text || `Download failed: ${response.status}`;
    try {
      const payload = JSON.parse(text);
      if (payload?.error) message = payload.error;
    } catch {
      // keep raw message
    }
    throw new Error(message);
  }
  const blob = await response.blob();
  const disposition = response.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename=\"?([^\";]+)\"?/i);
  const filename = match ? match[1] : 'Trim_Inventory_Check_List_Grouped.xlsx';
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function printTrimChecklistPreviewFromTools() {
  if (!_trimChecklistPreviewData) return;
  printTrimChecklistData(_trimChecklistPreviewData, { includeGuide: trimMaterialGuideIncluded() });
}

function downloadTrimMaterialGuideHtml() {
  if (typeof window.buildTrimMaterialGuideDocumentHtml !== 'function') {
    throw new Error('Material guide is not available.');
  }
  const blob = new Blob([window.buildTrimMaterialGuideDocumentHtml()], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'Trim_Stock_Material_Guide.html';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function openTrimChecklistModal() {
  document.getElementById('trimChecklistModal').hidden = false;
  syncModalBodyLock();
  await loadTrimChecklist();
}

function closeTrimChecklistModal(force = false) {
  if (!force && _trimChecklistDirty) {
    const discard = window.confirm('Discard unsaved trim checklist changes?');
    if (!discard) return;
  }
  document.getElementById('trimChecklistModal').hidden = true;
  setTrimChecklistDirty(false);
  syncModalBodyLock();
}

function setNewHireTaskCollapsed(collapsed) {
  const panel = document.getElementById('newHireTaskPanel');
  const body = document.getElementById('newHireTaskBody');
  const toggle = document.getElementById('toggleNewHireTasks');
  panel.classList.toggle('is-collapsed', collapsed);
  body.hidden = collapsed;
  toggle.textContent = collapsed ? 'Expand' : 'Collapse';
  toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  localStorage.setItem(NEW_HIRE_TASK_COLLAPSED_KEY, collapsed ? '1' : '0');
}

function bulbHtml(color) {
  const normalized = String(color || 'gray').toLowerCase();
  const safe = ['gray', 'yellow', 'green', 'reclaimed'].includes(normalized) ? normalized : 'gray';
  return `<span class="bulb bulb-${safe}" aria-hidden="true"></span>`;
}

function getOperatorDateBasis() {
  const select = document.getElementById('operatorDateBasis');
  const value = select ? String(select.value || 'firm_date') : 'firm_date';
  return value === 'scheduled_departure' ? 'scheduled_departure' : 'firm_date';
}

function setOperatorDateBasisLabel(label) {
  const node = document.getElementById('operatorDateLabel');
  if (node) node.textContent = label || 'Firm Date';
}

async function loadOperatorPackets(selectedDate = '') {
  const dateBasis = getOperatorDateBasis();
  const params = new URLSearchParams();
  if (selectedDate) params.set('firm_date', selectedDate);
  if (dateBasis) params.set('date_basis', dateBasis);
  const query = params.toString() ? `?${params.toString()}` : '';
  const data = await api(`/api/operator-packets${query}`);
  const basisSelect = document.getElementById('operatorDateBasis');
  if (basisSelect && data.date_basis) {
    basisSelect.value = data.date_basis;
    localStorage.setItem(OPERATOR_DATE_BASIS_KEY, data.date_basis);
  }
  setOperatorDateBasisLabel(data.date_basis_label || 'Firm Date');
  const select = document.getElementById('operatorFirmDate');
  const previous = selectedDate || select.value || data.selected_firm_date || '';
  select.innerHTML = data.firm_dates.map((value) => `
    <option value="${value}" ${value === previous ? 'selected' : ''}>${value}</option>
  `).join('');

  const tbody = document.getElementById('operatorPacketsTable');
  tbody.innerHTML = data.items.map((item) => `
    <tr>
      <td><input type="checkbox" class="operator-po-checkbox" data-po="${item.po_number}"></td>
      <td>${item.po_number}</td>
      <td>${item.item_count}</td>
      <td>${bulbHtml(item.worksheet_bulb)}</td>
      <td>${bulbHtml(item.insight_bulb)}</td>
      <td>${item.generated_at ? formatTimestamp(item.generated_at) : ''}</td>
      <td>
        <div class="inline-actions">
          <button
            class="button secondary open-worksheet"
            data-path="${item.output_path || ''}"
            ${item.output_exists ? '' : 'disabled'}
          >Open</button>
        </div>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('.open-worksheet').forEach((button) => {
    button.addEventListener('click', async () => {
      await api('/api/open-report', {
        method: 'POST',
        body: JSON.stringify({ report_path: button.dataset.path }),
      });
    });
  });

  return data;
}

async function loadOverview() {
  const data = await api('/api/overview');
  writeOverviewCache(data);
  applyOverview(data);
  return data;
}

function _formatClock(value) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return formatTimestamp(value);
  return parsed.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function _friendlyInsightMessage(value) {
  const message = String(value || '').trim();
  if (!message) return '';
  if (/08001|SQL Server does not exist|SQLDriverConnect|DBNETLIB/i.test(message)) {
    return 'Could not reach Insight SQL. Check the network or Insight server connection.';
  }
  return message.length > 220 ? `${message.slice(0, 217)}…` : message;
}

function _autoRefreshPresentation(payload) {
  const server = payload?.server || {};
  const insight = payload?.insight || {};
  const action = String(server.last_action || '');
  const nextDue = _formatClock(server.next_due_at);
  if (insight.status === 'running' || action === 'running') {
    return {
      state: 'running',
      short: 'Auto Insight: refreshing…',
      detail: _friendlyInsightMessage(insight.message || server.last_message) || 'Refreshing Insight now.',
    };
  }
  if (action === 'error' || insight.status === 'error' || Number(server.consecutive_failures || 0) > 0) {
    const retry = nextDue ? ` Retry scheduled ${nextDue}.` : '';
    return {
      state: 'error',
      short: `Auto Insight: refresh failed${nextDue ? ` · retry ${nextDue}` : ''}`,
      detail: `${_friendlyInsightMessage(server.last_message || insight.message) || 'Insight refresh failed.'}${retry}`,
    };
  }
  if (action === 'retry_wait') {
    return {
      state: 'stale',
      short: `Auto Insight: retry ${nextDue || 'pending'}`,
      detail: _friendlyInsightMessage(server.last_message) || 'Waiting to retry Insight.',
    };
  }
  if (server.enabled === false || action === 'disabled') {
    return {
      state: 'error',
      short: 'Auto Insight: disabled',
      detail: _friendlyInsightMessage(server.last_message) || 'The automatic Insight refresh is not running.',
    };
  }
  return {
    state: 'ok',
    short: `Auto Insight: every 30 min${nextDue ? ` · next ${nextDue}` : ''}`,
    detail: _friendlyInsightMessage(server.last_message)
      || `Automatic Insight refresh is active every 30 minutes${nextDue ? `; next due ${nextDue}` : ''}.`,
  };
}

function renderAutoRefreshStatus(payload) {
  const presentation = _autoRefreshPresentation(payload);
  const snapshot = payload?.snapshot || {};
  if (snapshot.source_state) {
    document.getElementById('sourceState').textContent = `Source: ${snapshot.source_state}`;
  }
  if (snapshot.refreshed_at) {
    document.getElementById('refreshState').textContent = `Latest refresh: ${formatTimestamp(snapshot.refreshed_at)}`;
  }
  const state = document.getElementById('autoRefreshState');
  if (state) {
    state.classList.remove('is-ok', 'is-running', 'is-error', 'is-stale');
    state.classList.add(`is-${presentation.state}`);
    state.textContent = presentation.short;
    state.title = presentation.detail;
  }
  return presentation;
}

async function loadAutoRefreshStatus() {
  const payload = await api('/api/auto-refresh/status');
  renderAutoRefreshStatus(payload);
  return payload;
}

// Soft UI refresh so overnight Insight pulls (and other PCs' completions) show up
// without a manual browser reload. Skips while a modal is open or Insight is mid-refresh.
const UI_AUTO_REFRESH_MS = 60_000;
let _uiAutoRefreshTimer = null;
let _uiAutoRefreshInFlight = false;
let _uiVisibilityHooked = false;

function anyHealthModalOpen() {
  return MODAL_IDS.some((id) => {
    const node = document.getElementById(id);
    return node && !node.hidden;
  });
}

async function refreshDashboardUi() {
  if (_uiAutoRefreshInFlight || document.hidden || anyHealthModalOpen()) return;
  const btn = document.getElementById('insightRefreshButton');
  if (btn && btn.disabled) return;

  _uiAutoRefreshInFlight = true;
  try {
    await loadOverview();
    await Promise.allSettled([
      loadPaletteLabelSummary(),
      loadProductionQueue(),
    ]);
  } catch (_err) {
    // Keep auto-refresh quiet; transient network blips shouldn't alert.
  } finally {
    _uiAutoRefreshInFlight = false;
  }
}

function startUiAutoRefresh() {
  if (_uiAutoRefreshTimer) return;
  _uiAutoRefreshTimer = setInterval(() => {
    if (!document.hidden) loadAutoRefreshStatus().catch(() => {});
    refreshDashboardUi().catch(() => {});
  }, UI_AUTO_REFRESH_MS);
  if (!window.__cutHealthUiAutoRefreshLogged) {
    window.__cutHealthUiAutoRefreshLogged = true;
    const apiVersion = window.__cutHealthApiVersion || '?';
    console.info(
      `[Cut Health] UI auto-refresh active every ${UI_AUTO_REFRESH_MS / 1000}s (api v${apiVersion})`,
    );
  }
  if (!_uiVisibilityHooked) {
    _uiVisibilityHooked = true;
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        loadAutoRefreshStatus().catch(() => {});
        refreshDashboardUi().catch(() => {});
      }
    });
  }
}

async function loadPaletteLabelSummary() {
  const data = await api('/api/palette-labels?mode=ready');
  const value = document.getElementById('paletteLabelsReadyValue');
  const sub = document.getElementById('paletteLabelsReadySub');
  if (!value || !sub) return data;
  value.textContent = data.ready_count;
  const readyText = Number(data.ready_count || 0) === 1
    ? 'completed job awaiting label'
    : 'completed jobs awaiting labels';
  const historyText = Number(data.ready_count || 0) === 0 ? 'view recently printed labels' : readyText;
  const reopenedText = Number(data.reopened_count || 0) > 0 ? ` | ${data.reopened_count} reopened` : '';
  sub.textContent = `${historyText}${reopenedText}`;
  return data;
}

async function loadPoSuggestions(query = '') {
  const data = await api(`/api/po-suggestions?q=${encodeURIComponent(query)}`);
  const list = document.getElementById('poSuggestions');
  list.innerHTML = data.items.map((po) => `<option value="${po}"></option>`).join('');
}

async function generatePaperworkBatch(firmDate, poNumbers) {
  const result = await api('/api/operator-packets/generate', {
    method: 'POST',
    body: JSON.stringify({
      firm_date: firmDate,
      po_numbers: poNumbers,
      date_basis: getOperatorDateBasis(),
    }),
  });
  const batchName = result.batch_name || 'Batch';
  const handcutText = Number(result.handcuts_item_count || 0) > 0
    ? `\nHandcut items: ${Number(result.handcuts_item_count || 0)}`
    : '';
  const warningText = result.worksheet_warning
    ? `\nWorksheet note: ${result.worksheet_warning}`
    : '';
  const beamSawHalf = Number(result.beam_saw_half_inch_count || 0);
  const beamSawThreeQuarter = Number(result.beam_saw_three_quarter_inch_count || 0);
  const beamSawText = (beamSawHalf || beamSawThreeQuarter)
    ? `\nBeam saw: ${beamSawHalf} half-inch / ${beamSawThreeQuarter} three-quarter-inch rows (SCW/SCB/AB/DW machined items excluded)`
      + (result.beam_saw_dir ? `\n${result.beam_saw_dir}` : '')
    : '';
  const mdbText = result.mdb_path
    ? `\nMDB: ${Number(result.mdb_cabinet_count || 0)} cabinets / ${Number(result.mdb_part_count || 0)} parts\n${result.mdb_path}`
    : (result.mdb_warning ? `\nMDB note: ${result.mdb_warning}` : '');
  const poWord = poNumbers.length === 1 ? 'PO' : 'POs';
  const filesText = '\nPrint order: cabinet list + shelf self-check + handcut self-check + handcut matching + grouped totals + machining exception, then numbered nest previews, then pallet labels. Files: packet_before_taps.pdf, packet_after_taps.pdf, shelf_self_check.pdf, handcut_self_check.pdf, 4x2_labels.pdf, beam saw/, batch.mdb, {job}_handcuts.mdb';
  const machineText = result.machine_job_dir
    ? `\nMachine/tap folder: ${result.machine_job_dir}`
    : '';
  alert(`Created ${batchName} for ${poNumbers.length} ${poWord} in:\n${result.output_dir}${filesText}${machineText}${handcutText}${beamSawText}${mdbText}${warningText}`);
  await loadOperatorPackets(firmDate);
}

function paletteLabelRow(record) {
  return `
    <tr>
      <td><input type="checkbox" class="palette-label-checkbox" data-id="${Number(record.id || 0)}"></td>
      <td>${escapeHtml(record.po_number)}</td>
      <td>${escapeHtml(record.firm_date_display || record.firm_date)}</td>
      <td><span class="pill">${escapeHtml(record.status_display || record.status)}</span></td>
      <td>${escapeHtml(formatTimestamp(record.queued_at))}</td>
      <td>${escapeHtml(formatTimestamp(record.printed_at))}</td>
      <td>${Number(record.print_count || 0)}</td>
    </tr>
  `;
}

function selectAllPaletteLabels() {
  document.querySelectorAll('.palette-label-checkbox').forEach((checkbox) => {
    checkbox.checked = true;
  });
}

function renderPaletteLabels(data) {
  paletteLabelsMode = data.mode || 'ready';
  const isPrintedMode = paletteLabelsMode === 'printed';
  document.getElementById('paletteLabelsTitle').textContent = isPrintedMode
    ? 'Recently printed pallet labels'
    : 'Pallet labels ready';
  document.getElementById('paletteLabelsSummary').textContent =
    `${data.ready_count} ready to print | ${data.printed_count} printed`
    + (Number(data.reopened_count || 0) ? ` | ${data.reopened_count} reopened` : '');
  document.getElementById('paletteLabelsModeReady').classList.toggle('active', !isPrintedMode);
  document.getElementById('paletteLabelsModePrinted').classList.toggle('active', isPrintedMode);
  document.getElementById('printPaletteLabelsSelected').hidden = isPrintedMode;
  document.getElementById('reprintPaletteLabelsSelected').hidden = !isPrintedMode;

  const tbody = document.getElementById('paletteLabelsTable');
  const records = data.records || [];
  const selectAllBtn = document.getElementById('selectAllPaletteLabels');
  if (selectAllBtn) {
    selectAllBtn.disabled = !records.length;
  }
  if (!records.length) {
    tbody.innerHTML = `
      <tr>
        <td class="empty-row" colspan="7">
          ${isPrintedMode ? 'No printed pallet label history yet.' : 'No completed jobs are waiting for pallet labels.'}
        </td>
      </tr>
    `;
    return;
  }
  tbody.innerHTML = records.map(paletteLabelRow).join('');
}

async function loadPaletteLabels(mode = paletteLabelsMode) {
  const data = await api(`/api/palette-labels?mode=${encodeURIComponent(mode)}`);
  renderPaletteLabels(data);
  return data;
}

function openPaletteLabelsModal(mode = 'ready') {
  document.getElementById('paletteLabelsModal').hidden = false;
  syncModalBodyLock();
  document.getElementById('paletteLabelsTable').innerHTML = `
    <tr><td class="empty-row" colspan="7">Loading pallet labels...</td></tr>
  `;
  loadPaletteLabels(mode).catch((error) => alert(error.message));
}

function closePaletteLabelsModal() {
  document.getElementById('paletteLabelsModal').hidden = true;
  syncModalBodyLock();
}

function completedJobClass(job) {
  const classes = ['completed-job'];
  if (job.is_finished_out) classes.push('is-finished-out');
  else classes.push('is-partial');
  if (job.is_finished_out && job.needs_label) classes.push('needs-label');
  if (job.label_status === 'printed') classes.push('label-printed');
  if (job.label_status === 'queued' || job.label_status === 'reopened') classes.push('label-queued');
  return classes.join(' ');
}

function completedJobBadges(job) {
  const badges = [];
  if (job.is_finished_out) {
    badges.push('<span class="pill pill-finished-out">Finished out</span>');
  } else {
    badges.push('<span class="pill pill-partial">Partial job</span>');
  }
  if (job.is_finished_out) {
    if (job.label_status === 'printed') {
      const labelText = job.pallet_id
        ? `Pallet ID ${job.pallet_id}`
        : (job.label_status_display || 'Label recorded');
      badges.push(`<span class="pill pill-label-printed">${escapeHtml(labelText)}</span>`);
    } else if (job.label_status === 'queued') {
      badges.push('<span class="pill pill-label-ready">Label ready</span>');
    } else if (job.label_status === 'reopened') {
      badges.push('<span class="pill pill-label-zombie">Label reopened</span>');
    } else {
      badges.push('<span class="pill pill-label-needed">Label needed</span>');
    }
  }
  return badges.join('');
}

function renderCompletedToday(data) {
  const summary = data.summary || {};
  const isEmpty = !((data.jobs || []).length) || Number(summary.total || 0) <= 0;
  const isToday = data.day === new Date().toISOString().slice(0, 10);
  document.getElementById('completedTodayTitle').textContent =
    `Completed ${formatDateUS(data.day || new Date().toISOString().slice(0, 10))}`;

  if (isEmpty) {
    document.getElementById('completedTodaySummary').textContent = isToday
      ? 'No completed items recorded yet today'
      : 'No completed items recorded for this day';
    const container = document.getElementById('completedTodayJobs');
    container.innerHTML = `
      <div class="completed-empty-state">
        <p><strong>${isToday ? 'Nothing completed yet today.' : 'Nothing completed on this day.'}</strong></p>
        <p class="completed-empty-copy">
          ${isToday
            ? 'Counts update when Insight refreshes and items leave the in-cutting queue. If work has already finished, refresh Insight or pick a prior day in Output trends.'
            : 'Pick another day in Output trends, or check that Insight was refreshing on this date.'}
        </p>
      </div>
    `;
    return;
  }

  document.getElementById('completedTodaySummary').textContent =
    `${summary.total || 0} item${summary.total === 1 ? '' : 's'} completed ? `
    + `${data.job_count || 0} job${data.job_count === 1 ? '' : 's'} ? `
    + `${data.finished_out_count || 0} finished out ? `
    + `${data.labels_needed_count || 0} label${data.labels_needed_count === 1 ? '' : 's'} still needed`;

  const container = document.getElementById('completedTodayJobs');
  const jobs = data.jobs || [];
  container.innerHTML = jobs.map((job) => `
    <article class="${completedJobClass(job)}" data-po="${escapeHtml(job.po_number)}">
      <div class="completed-job-header">
        <div>
          <strong class="completed-job-name">${escapeHtml(job.job_name)}</strong>
          <div class="completed-job-meta">
            ${job.item_count} item${job.item_count === 1 ? '' : 's'} ?
            ${job.carcass_count} carcass / ${job.trim_count} trim
            ${job.firm_date ? ` · Firm ${escapeHtml(job.firm_date)}` : ''}
          </div>
        </div>
        <div class="completed-job-badges">${completedJobBadges(job)}</div>
      </div>
      <ul class="completed-job-items">
        ${(job.items || []).map((item) => `
          <li>
            <span class="completed-item-number">${escapeHtml(item.item_number || 'Item')}</span>
            ${item.line_number ? `<span class="completed-item-line">Line ${escapeHtml(item.line_number)}</span>` : ''}
            <span class="pill pill-item-kind ${item.is_carcass ? 'pill-carcass' : 'pill-trim'}">${item.is_carcass ? 'Carcass' : 'Trim'}</span>
          </li>
        `).join('')}
      </ul>
      ${job.is_finished_out && job.needs_label ? `
        <div class="completed-job-actions">
          <button class="button compact record-label-btn" type="button"
            data-po="${escapeHtml(job.po_number)}"
            data-firm-date="${escapeHtml(job.firm_date || '')}"
          >Record label printed</button>
        </div>
      ` : ''}
    </article>
  `).join('');

  container.querySelectorAll('.record-label-btn').forEach((button) => {
    button.addEventListener('click', async () => {
      await api('/api/palette-labels/record', {
        method: 'POST',
        body: JSON.stringify({
          labels: [{
            po_number: button.dataset.po,
            firm_date: button.dataset.firmDate || undefined,
          }],
        }),
      });
      await loadCompletedToday(data.day);
      await loadPaletteLabelSummary();
    });
  });
}

async function loadCompletedToday(day = '') {
  const targetDay = day || new Date().toISOString().slice(0, 10);
  try {
    const data = await api(`/api/completed-today?day=${encodeURIComponent(targetDay)}`);
    _completedTodayDay = data.day || targetDay;
    renderCompletedToday(data);
    updateTrendDaySelection(_completedTodayDay);
    return data;
  } catch (error) {
    _completedTodayDay = targetDay;
    updateTrendDaySelection(_completedTodayDay);
    document.getElementById('completedTodayTitle').textContent = `Completed ${formatDateUS(targetDay)}`;
    document.getElementById('completedTodaySummary').textContent = 'Unable to load completed items';
    document.getElementById('completedTodayJobs').innerHTML = `
      <div class="completed-empty-state">
        <p><strong>Could not load completed jobs.</strong></p>
        <p class="completed-empty-copy">${escapeHtml(error.message || 'Unknown error')}</p>
      </div>
    `;
    throw error;
  }
}

function openCompletedTodayFromHero() {
  const today = new Date().toISOString().slice(0, 10);
  const total = Number(_overviewToday?.total || 0);
  document.getElementById('completedTodayModal').hidden = false;
  syncModalBodyLock();
  _completedTodayDay = today;
  updateTrendDaySelection(today);

  if (total <= 0) {
    document.getElementById('completedTodayJobs').innerHTML =
      '<p class="empty-panel-copy">Loading...</p>';
    renderCompletedToday({
      day: today,
      summary: { total: 0, carcass: Number(_overviewToday?.carcass || 0), trim: Number(_overviewToday?.trim || 0) },
      job_count: 0,
      finished_out_count: 0,
      labels_needed_count: 0,
      jobs: [],
    });
    return Promise.resolve();
  }

  document.getElementById('completedTodayJobs').innerHTML =
    '<p class="empty-panel-copy">Loading completed jobs...</p>';
  return loadCompletedToday(today);
}

function openCompletedTodayModal(day = '') {
  document.getElementById('completedTodayModal').hidden = false;
  syncModalBodyLock();
  document.getElementById('completedTodayJobs').innerHTML =
    '<p class="empty-panel-copy">Loading completed jobs...</p>';
  const targetDay = day || new Date().toISOString().slice(0, 10);
  return loadCompletedToday(targetDay);
}

function closeCompletedTodayModal() {
  document.getElementById('completedTodayModal').hidden = true;
  _completedTodayDay = '';
  updateTrendDaySelection('');
  syncModalBodyLock();
}

function renderAheadGoal(data) {
  const jobCount = Number(data.job_count || 0);
  const itemCount = Number(data.item_count || 0);
  const days = Number(data.ahead_goal_days || 14);
  const horizonStart = data.goal_horizon_start;
  const horizonEnd = data.goal_horizon_end;

  document.getElementById('aheadGoalTitle').textContent = 'Jobs to reach goal';
  if (jobCount <= 0) {
    document.getElementById('aheadGoalSummary').textContent =
      horizonStart && horizonEnd
        ? `No in-cutting jobs scheduled to depart through ${formatDateUS(horizonEnd)} (${days} calendar days ahead)`
        : `No in-cutting jobs due through the ${days}-calendar-day goal`;
    document.getElementById('aheadGoalJobs').innerHTML = `
      <div class="completed-empty-state">
        <p><strong>You are caught up for this horizon.</strong></p>
        <p class="completed-empty-copy">
          Complete every In Cutting job due through this date to stay ${days} calendar days ahead of scheduled departure.
          Counts reflect rows currently In Cutting in the latest Insight snapshot.
        </p>
      </div>
    `;
    return;
  }

  const horizonText = horizonEnd
    ? `through ${formatDateUS(horizonEnd)}`
    : `${days} calendar days ahead`;
  document.getElementById('aheadGoalSummary').textContent =
    `${jobCount} job${jobCount === 1 ? '' : 's'} ? `
    + `${itemCount} line${itemCount === 1 ? '' : 's'} ? `
    + `${data.carcass_count || 0} carcass / ${data.trim_count || 0} trim ? `
    + `scheduled departures ${horizonText}`;

  const dateGroups = data.date_groups || [];
  document.getElementById('aheadGoalJobs').innerHTML = dateGroups.map((group) => `
    <section class="ahead-goal-date-group">
      <header class="ahead-goal-date-header">
        <strong>SDD ${escapeHtml(group.date_display || formatDateUS(group.date))}</strong>
        <span>${group.job_count} job${group.job_count === 1 ? '' : 's'} · ${group.item_count} line${group.item_count === 1 ? '' : 's'}</span>
      </header>
      ${(group.jobs || []).map((job) => `
        <article class="completed-job ahead-goal-job">
          <div class="completed-job-header">
            <div>
              <strong class="completed-job-name">${escapeHtml(job.job_name || job.po_number)}</strong>
              <div class="completed-job-meta">${job.item_count} line${job.item_count === 1 ? '' : 's'} · ${job.carcass_count || 0} carcass / ${job.trim_count || 0} trim</div>
            </div>
          </div>
        </article>
      `).join('')}
    </section>
  `).join('');
}

async function loadAheadGoal(day = '') {
  const targetDay = day || new Date().toISOString().slice(0, 10);
  try {
    const data = await api(`/api/ahead-goal?day=${encodeURIComponent(targetDay)}`);
    renderAheadGoal(data);
    return data;
  } catch (error) {
    document.getElementById('aheadGoalTitle').textContent = 'Jobs to reach goal';
    document.getElementById('aheadGoalSummary').textContent = 'Unable to load ahead-goal jobs';
    document.getElementById('aheadGoalJobs').innerHTML = `
      <div class="completed-empty-state">
        <p><strong>Could not load ahead-goal jobs.</strong></p>
        <p class="completed-empty-copy">${escapeHtml(error.message || 'Unknown error')}</p>
      </div>
    `;
    throw error;
  }
}

function openAheadGoalModal() {
  document.getElementById('aheadGoalModal').hidden = false;
  syncModalBodyLock();
  document.getElementById('aheadGoalJobs').innerHTML =
    '<p class="empty-panel-copy">Loading jobs...</p>';
  return loadAheadGoal();
}

function closeAheadGoalModal() {
  document.getElementById('aheadGoalModal').hidden = true;
  syncModalBodyLock();
}

function selectedPaletteLabelIds() {
  return Array.from(document.querySelectorAll('.palette-label-checkbox:checked'))
    .map((node) => Number(node.dataset.id))
    .filter((value) => Number.isFinite(value) && value > 0);
}

async function submitPaletteLabelPrint(reprint = false) {
  const recordIds = selectedPaletteLabelIds();
  if (!recordIds.length) {
    alert('Select at least one pallet label first.');
    return;
  }
  const endpoint = reprint ? '/api/palette-labels/reprint' : '/api/palette-labels/print';
  const result = await api(endpoint, {
    method: 'POST',
    body: JSON.stringify({ record_ids: recordIds }),
  });
  alert(`Sent ${result.count} pallet label${Number(result.count || 0) === 1 ? '' : 's'} to printer:\n${result.output_path}`);
  await loadPaletteLabels(paletteLabelsMode);
  await loadPaletteLabelSummary();
}

const refreshButton = document.getElementById('refreshButton');
if (refreshButton) {
  refreshButton.addEventListener('click', () => {
    Promise.all([
      loadOverview(),
      loadProductionQueue(),
      loadOperatorPackets(document.getElementById('operatorFirmDate').value),
      loadNewHireTask(document.getElementById('newHireTaskDay').value),
      loadDailyTraining(),
      loadMachineIssues(),
    ]).catch((error) => alert(error.message));
  });
}

function _wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function runInsightRefresh(button, onSuccess = null) {
  const originalLabel = button?.textContent || 'Refresh Insight';
  if (button) {
    button.disabled = true;
    button.textContent = 'Refreshing…';
  }
  try {
    const data = await api('/api/insight-refresh', { method: 'POST', body: JSON.stringify({}) });
    if (!data.ok && !/already in progress/i.test(String(data.message || ''))) {
      throw new Error(data.message || 'Refresh failed.');
    }

    for (let attempt = 0; attempt < 600; attempt += 1) {
      await _wait(1500);
      const status = await api('/api/insight-refresh/status');
      if (status.status === 'running') {
        if (button && status.message) {
          button.textContent = status.message.length > 24 ? 'Refreshing…' : status.message;
        }
        continue;
      }
      if (status.status !== 'ok') {
        throw new Error(`Insight refresh failed: ${status.message || 'Unknown error'}`);
      }
      if (button) button.textContent = '✓ Refreshed';
      await Promise.allSettled([
        loadOverview(),
        loadProductionQueue(),
        loadAutoRefreshStatus(),
      ]);
      if (typeof onSuccess === 'function') await onSuccess(status);
      return status;
    }
    throw new Error('Insight refresh did not finish within 15 minutes.');
  } finally {
    if (button) {
      await _wait(800);
      button.textContent = originalLabel;
      button.disabled = false;
    }
  }
}

document.getElementById('insightRefreshButton').addEventListener('click', async () => {
  const button = document.getElementById('insightRefreshButton');
  try {
    await runInsightRefresh(button);
  } catch (error) {
    alert(error.message);
  }
});



document.getElementById('openRemoteQueueButton').addEventListener('click', () => {
  window.open('/remote-admin', '_blank', 'noopener,noreferrer');
});

document.getElementById('openPrintMapButton')?.addEventListener('click', async () => {
  const target = window.open('', '_blank');
  if (target) target.opener = null;
  try {
    const data = await api('/api/open-pallet-locator-print', { method: 'POST', body: JSON.stringify({}) });
    if (!data.ok || !data.url) throw new Error(data.error || 'Could not open the map printer.');
    if (target) target.location = data.url;
    else window.open(data.url, '_blank', 'noopener,noreferrer');
  } catch (error) {
    if (target) target.close();
    alert(error.message || 'Could not open the map printer.');
  }
});

const MORNING_PLAN_POLL_MS = 60_000;
const MORNING_PLAN_DATE_BASIS_KEY = 'cutHealthMorningPlanDateBasis';
let _morningPlanTimer = null;
let _morningPlanLoading = false;
let _morningPlanLastData = null;
let _morningPlanDraft = null;
let _morningPlanManualPos = [];
let _morningPlanOutstandingOrder = [];
let _morningPlanNewWorkOrder = [];
let _morningPlanExcludedPos = [];

function getMorningPlanBatchCap() {
  const input = document.getElementById('morningPlanBatchCap');
  const raw = Number(input?.value);
  if (Number.isFinite(raw) && raw > 0) return Math.max(1, Math.floor(raw));
  const saved = Number(localStorage.getItem('cutHealthSmartBatchesCap'));
  return Number.isFinite(saved) && saved > 0 ? Math.max(1, Math.floor(saved)) : 15;
}

function setMorningPlanBatchCap(value) {
  const cap = Math.max(1, Math.floor(Number(value) || 15));
  const input = document.getElementById('morningPlanBatchCap');
  if (input) input.value = String(cap);
  const smartCap = document.getElementById('smartBatchesCap');
  if (smartCap) smartCap.value = String(cap);
  localStorage.setItem('cutHealthSmartBatchesCap', String(cap));
  return cap;
}

function getMorningPlanWipCeiling() {
  const input = document.getElementById('morningPlanWipCeiling');
  const saved = Number(localStorage.getItem('cutHealthSmartBatchesMax'));
  const raw = Number(input?.value);
  if (Number.isFinite(raw)) return Math.max(0, raw);
  return Number.isFinite(saved) ? Math.max(0, saved) : 0;
}

function morningPlanDraftBody(extra = {}) {
  return {
    max_cabinets: getMorningPlanWipCeiling(),
    date_basis: getMorningPlanDateBasis(),
    manual_pos: [..._morningPlanManualPos],
    outstanding_order: [..._morningPlanOutstandingOrder],
    new_work_order: [..._morningPlanNewWorkOrder],
    excluded_pos: [..._morningPlanExcludedPos],
    ...extra,
  };
}

function getMorningPlanDateBasis() {
  return document.getElementById('morningPlanDateBasis')?.value
    || localStorage.getItem(MORNING_PLAN_DATE_BASIS_KEY)
    || 'firm_date';
}

function _morningPlanStatus(row) {
  const labels = {
    active: Number(row.remaining_to_cut || 0) > 0 ? 'In Cutting' : 'Active',
    added: 'Added today',
    draft: 'Eligible now',
    progress: 'Cutting progressed',
    no_longer_active: 'No longer active',
    pushed_out: 'Cutting Complete',
    complete: 'Complete',
  };
  return labels[row.status] || row.status || 'Active';
}

function _morningPlanStatusClass(row) {
  if (row.status === 'added') return 'pill-info';
  if (row.status === 'draft') return 'pill-info';
  if (row.status === 'progress') return 'pill-success';
  if (row.status === 'pushed_out' || row.status === 'no_longer_active') return 'pill-warning';
  if (row.status === 'complete') return 'pill-success';
  return 'pill-pending';
}

function _morningPlanSnapshotAge(data) {
  const refreshedAt = data?.current?.source_refreshed_at;
  if (!refreshedAt) return null;
  const parsed = new Date(refreshedAt);
  if (Number.isNaN(parsed.getTime())) return null;
  return Math.max((Date.now() - parsed.getTime()) / 1000, 0);
}

function _morningPlanRoleLabel(role) {
  if (role === 'outstanding') return 'Outstanding';
  if (role === 'manual') return 'Manual add';
  if (role === 'forecast') return 'Forecast';
  return role || 'Job';
}

// The draft is assembled over a morning, a row at a time, while the lead walks the
// floor. Keeping the edits only in memory meant a reload — or the server's own idle
// restart — silently threw the whole plan away, so they are mirrored to
// localStorage and restored for the same day.
const MORNING_PLAN_DRAFT_STATE_KEY = 'cutHealthMorningPlanDraftState';

function _morningPlanToday() {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

function saveMorningPlanDraftState() {
  try {
    localStorage.setItem(MORNING_PLAN_DRAFT_STATE_KEY, JSON.stringify({
      day: _morningPlanToday(),
      manual_pos: _morningPlanManualPos,
      outstanding_order: _morningPlanOutstandingOrder,
      new_work_order: _morningPlanNewWorkOrder,
      excluded_pos: _morningPlanExcludedPos,
    }));
  } catch (_error) {
    /* private mode or quota — the draft still works, it just will not survive reload */
  }
}

function restoreMorningPlanDraftState() {
  try {
    const raw = localStorage.getItem(MORNING_PLAN_DRAFT_STATE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    // Yesterday's ordering has nothing to say about today's plan.
    if (!saved || saved.day !== _morningPlanToday()) {
      localStorage.removeItem(MORNING_PLAN_DRAFT_STATE_KEY);
      return;
    }
    _morningPlanManualPos = [...(saved.manual_pos || [])];
    _morningPlanOutstandingOrder = [...(saved.outstanding_order || [])];
    _morningPlanNewWorkOrder = [...(saved.new_work_order || [])];
    _morningPlanExcludedPos = [...(saved.excluded_pos || [])];
  } catch (_error) {
    /* unreadable state is not worth failing a page load over */
  }
}

function applyMorningPlanDraftState(draft) {
  _morningPlanDraft = draft;
  _morningPlanManualPos = [...(draft.manual_pos || [])];
  _morningPlanOutstandingOrder = [...(draft.outstanding_order || [])];
  _morningPlanNewWorkOrder = [...(draft.new_work_order || [])];
  _morningPlanExcludedPos = [...(draft.excluded_pos || _morningPlanExcludedPos || [])];
  saveMorningPlanDraftState();
}

function renderMorningPlanEvents(live) {
  const events = Array.isArray(live?.events) ? live.events : [];
  const eventCount = document.getElementById('morningPlanEventCount');
  if (eventCount) {
    eventCount.textContent = String(events.length);
    eventCount.className = `pill ${events.length ? 'pill-warning' : 'pill-success'}`;
  }
  const eventList = document.getElementById('morningPlanEventsList');
  if (!eventList) return;
  eventList.innerHTML = events.length
    ? events.map((item) => `
      <article class="morning-plan-event severity-${escapeHtml(item.severity || 'info')}">
        <div class="morning-plan-event-head">
          <strong>${escapeHtml(item.po_number || 'Plan')}</strong>
          <span class="muted-text">${escapeHtml(item.occurred_at ? formatTimestamp(item.occurred_at) : '')}</span>
        </div>
        <div class="morning-plan-event-title">${escapeHtml(item.title || 'Plan changed')}</div>
        <div class="morning-plan-event-detail">${escapeHtml(item.detail || '')}</div>
      </article>`).join('')
    : '<div class="morning-plan-empty">No meaningful Insight changes since the last pin.</div>';
}

function renderMorningPlanAddList(filter = '') {
  const host = document.getElementById('morningPlanAddList');
  if (!host) return;
  const needle = String(filter || '').trim().toUpperCase();
  const rows = (_morningPlanDraft?.addable || []).filter((row) => {
    if (!needle) return true;
    return String(row.po_number || '').toUpperCase().includes(needle);
  });
  host.innerHTML = rows.length
    ? rows.map((row) => `
      <button type="button" class="morning-plan-add-row" data-po="${escapeHtml(row.po_number)}">
        <strong>${escapeHtml(row.po_number)}</strong>
        <span>${Number(row.cab_count || 0)} cabs · ${escapeHtml(row.firm_date || row.sched_departure_date || '—')}</span>
      </button>`).join('')
    : '<div class="morning-plan-empty">No matching POs to add.</div>';
  host.querySelectorAll('.morning-plan-add-row').forEach((button) => {
    button.addEventListener('click', () => {
      const po = button.dataset.po || '';
      if (!po) return;
      _morningPlanExcludedPos = _morningPlanExcludedPos.filter(
        (value) => String(value).toUpperCase() !== String(po).toUpperCase(),
      );
      if (!_morningPlanManualPos.some((value) => String(value).toUpperCase() === String(po).toUpperCase())) {
        _morningPlanManualPos.push(po);
      }
      setMorningPlanAddOpen(false);
      loadMorningPlanDraft({ quiet: true }).catch((error) => alert(error.message));
    });
  });
}

function setMorningPlanAddOpen(open) {
  const addPanel = document.getElementById('morningPlanAddPanel');
  const eventsPanel = document.getElementById('morningPlanEventsPanel');
  if (addPanel) addPanel.hidden = !open;
  if (eventsPanel) eventsPanel.hidden = open;
  if (open) {
    const search = document.getElementById('morningPlanAddSearch');
    if (search) {
      search.value = '';
      search.focus();
    }
    renderMorningPlanAddList('');
  }
}

// Re-order the draft we already have so the row moves under the cursor instead of
// after a 2-4s round trip. The server still gets the final say on capacity; this
// only stops clicks from looking dead while a rebuild is in flight.
function _morningPlanReorderLocally() {
  const draft = _morningPlanDraft;
  if (!draft) return null;
  const byOrder = (rows, order) => {
    const remaining = [...(rows || [])];
    const picked = [];
    (order || []).forEach((po) => {
      const index = remaining.findIndex(
        (row) => String(row.po_number).toUpperCase() === String(po).toUpperCase(),
      );
      if (index >= 0) picked.push(...remaining.splice(index, 1));
    });
    return picked.concat(remaining);
  };
  const outstanding = byOrder(draft.outstanding, _morningPlanOutstandingOrder);
  const newWork = byOrder(draft.new_work, _morningPlanNewWorkOrder);
  return {
    ...draft,
    outstanding,
    new_work: newWork,
    manual: newWork.filter((row) => row.role === 'manual'),
    forecast: newWork.filter((row) => row.role === 'forecast'),
    rows: outstanding.concat(newWork),
    outstanding_order: outstanding.map((row) => row.po_number),
    new_work_order: newWork.map((row) => row.po_number),
  };
}

function moveMorningPlanRow(po, role, direction) {
  const list = role === 'outstanding'
    ? _morningPlanOutstandingOrder
    : _morningPlanNewWorkOrder;
  const index = list.findIndex((value) => String(value).toUpperCase() === String(po).toUpperCase());
  if (index < 0) return;
  const target = index + direction;
  if (target < 0 || target >= list.length) return;
  const copy = [...list];
  const [item] = copy.splice(index, 1);
  copy.splice(target, 0, item);
  if (role === 'outstanding') _morningPlanOutstandingOrder = copy;
  else _morningPlanNewWorkOrder = copy;
  saveMorningPlanDraftState();
  // Ordering is a client-side fact and a rebuild costs 35-60s against the share,
  // so reordering does not ask the server. The row set and the totals are
  // unchanged; Produce sends the final order and the server applies its capacity
  // rules then, as do add/remove, which really can change what fits.
  const optimistic = _morningPlanReorderLocally();
  if (optimistic) renderMorningPlanDraft(optimistic);
}

function removeMorningPlanRow(po, role) {
  const key = String(po || '').toUpperCase();
  if (!key) return;
  if (!_morningPlanExcludedPos.some((value) => String(value).toUpperCase() === key)) {
    _morningPlanExcludedPos.push(po);
  }
  _morningPlanManualPos = _morningPlanManualPos.filter(
    (value) => String(value).toUpperCase() !== key,
  );
  _morningPlanOutstandingOrder = _morningPlanOutstandingOrder.filter(
    (value) => String(value).toUpperCase() !== key,
  );
  _morningPlanNewWorkOrder = _morningPlanNewWorkOrder.filter(
    (value) => String(value).toUpperCase() !== key,
  );
  saveMorningPlanDraftState();
  queueMorningPlanDraftRefresh();
}

function renderMorningPlanDraft(draft) {
  if (!draft) return;
  applyMorningPlanDraftState(draft);
  const target = Number(draft.max_cabinets || getMorningPlanWipCeiling());
  const outstanding = Number(draft.outstanding_cabinets || 0);
  const manual = Number(draft.manual_cabinets || 0);
  const forecast = Number(draft.forecast_cabinets || 0);
  const planTotal = Number(draft.plan_cabinets || 0);
  let targetNote = '.';
  if (draft.over_target) targetNote = ' (manual adds over the remaining target — kept).';
  else if (draft.plan_over_target) targetNote = ` (${planTotal - target} over target on outstanding work alone).`;
  document.getElementById('morningPlanSummary').textContent =
    `${outstanding} outstanding + ${manual} manual + ${forecast} forecast = ${planTotal} of ${target} target`
    + targetNote;
  document.getElementById('morningPlanMetrics').innerHTML = [
    metricCard('Outstanding', escapeHtml(outstanding), 'already produced'),
    metricCard('Manual adds', escapeHtml(manual), 'sticky priority'),
    metricCard('Forecast', escapeHtml(forecast), 'fills remaining target'),
    metricCard('Plan total', escapeHtml(planTotal), `target ${target}`),
    metricCard('Available new', escapeHtml(draft.available_new_cabinets || 0), 'before manuals'),
    metricCard('Addable POs', escapeHtml((draft.addable || []).length), 'search to add'),
  ].join('');
  document.getElementById('morningPlanUpdatedAt').textContent =
    `Automatic draft · ${escapeHtml(draft.date_basis_label || 'Firm Date')} · approval creates the pinned production plan`;
  document.getElementById('morningPlanJobsHeading').textContent = 'Morning plan draft';
  document.getElementById('morningPlanDraftHint').textContent = draft.over_target
    ? 'Over target'
    : 'Live preview';

  const host = document.getElementById('morningPlanDraftList');
  const rows = Array.isArray(draft.rows) ? draft.rows : [];
  host.innerHTML = rows.length
    ? rows.map((row, index) => {
      const role = row.role || 'forecast';
      const section = role === 'outstanding' ? 'outstanding' : 'new';
      const siblings = role === 'outstanding'
        ? (draft.outstanding || [])
        : (draft.new_work || []);
      const localIndex = siblings.findIndex(
        (item) => String(item.po_number).toUpperCase() === String(row.po_number).toUpperCase(),
      );
      const canUp = localIndex > 0;
      const canDown = localIndex >= 0 && localIndex < siblings.length - 1;
      const dateText = getMorningPlanDateBasis() === 'scheduled_departure'
        ? (row.sched_departure_date || row.firm_date || '—')
        : (row.firm_date || row.sched_departure_date || '—');
      return `
        <article class="morning-plan-draft-row role-${escapeHtml(role)}" data-po="${escapeHtml(row.po_number)}" data-role="${escapeHtml(role)}" data-section="${escapeHtml(section)}">
          <div class="morning-plan-draft-main">
            <span class="pill ${role === 'outstanding' ? 'pill-info' : (role === 'manual' ? 'pill-warning' : 'pill-pending')}">${escapeHtml(_morningPlanRoleLabel(role))}</span>
            <strong>${escapeHtml(row.po_number)}</strong>
            <span class="morning-plan-job-meta">${Number(row.cab_count || 0)} cabs · ${escapeHtml(dateText)}</span>
          </div>
          <div class="morning-plan-draft-actions">
            <button type="button" class="button secondary compact mp-move-up" ${canUp ? '' : 'disabled'} aria-label="Move up">↑</button>
            <button type="button" class="button secondary compact mp-move-down" ${canDown ? '' : 'disabled'} aria-label="Move down">↓</button>
            <button type="button" class="button secondary compact mp-remove" aria-label="Remove">Remove</button>
          </div>
        </article>`;
    }).join('')
    : '<div class="morning-plan-empty">No outstanding work and no forecast jobs under the current target.</div>';

  host.querySelectorAll('.morning-plan-draft-row').forEach((rowEl) => {
    const po = rowEl.dataset.po || '';
    const role = rowEl.dataset.role || '';
    rowEl.querySelector('.mp-move-up')?.addEventListener('click', () => moveMorningPlanRow(po, role, -1));
    rowEl.querySelector('.mp-move-down')?.addEventListener('click', () => moveMorningPlanRow(po, role, 1));
    rowEl.querySelector('.mp-remove')?.addEventListener('click', () => {
      if (role === 'outstanding') {
        if (!window.confirm(`Remove ${po} from this morning's printed outstanding list?`)) return;
      }
      removeMorningPlanRow(po, role);
    });
  });

  if (!document.getElementById('morningPlanAddPanel')?.hidden) {
    renderMorningPlanAddList(document.getElementById('morningPlanAddSearch')?.value || '');
  }
}

async function loadMorningPlanDraft({ quiet = false, refreshInsight = false } = {}) {
  if (_morningPlanLoading) return null;
  _morningPlanLoading = true;
  const summary = document.getElementById('morningPlanSummary');
  if (!quiet && summary) summary.textContent = 'Loading morning plan draft…';
  try {
    const draft = await api('/api/morning-cut-plan/draft', {
      method: 'POST',
      body: JSON.stringify(morningPlanDraftBody({ refresh_insight: refreshInsight })),
    });
    if (!draft.ok) throw new Error(draft.error || 'Could not build the morning plan draft.');
    renderMorningPlanDraft(draft);
    try {
      const live = await api(`/api/morning-cut-plan/live?date_basis=${encodeURIComponent(getMorningPlanDateBasis())}`);
      _morningPlanLastData = live;
      renderMorningPlanEvents(live);
    } catch (_liveErr) {
      renderMorningPlanEvents({ events: [] });
    }
    const banner = document.getElementById('morningPlanRefreshBanner');
    if (banner) {
      banner.className = 'morning-plan-refresh-banner is-ok';
      if (draft.blocked_by_pipeline) {
        const carried = Number(draft.carried_pipeline_cabinets || 0);
        const legacy = Number(draft.legacy_pipeline_cabinets || 0);
        const pipeline = Number(draft.produced_pipeline_cabinets || 0);
        const target = Number(draft.max_cabinets || 0);
        let why = `${pipeline} cabinets already in the pipeline meet the ${target} target, so nothing new will be produced.`;
        if (legacy > 0 || carried > 0) {
          why += ` ${Math.max(legacy, carried)} of them are carried from earlier days with no set marked complete —`
            + ' remove those rows to free the target, or raise it.';
        }
        banner.className = 'morning-plan-refresh-banner is-error';
        banner.textContent = why;
      } else if (draft.over_target) {
        banner.textContent = 'Manual adds exceed remaining target capacity; forecast is empty.';
      } else if (draft.plan_over_target) {
        banner.textContent = 'Outstanding work already covers the target; no new work is forecast.';
      } else {
        banner.textContent = 'Draft ready for review. Approve & Produce runs smart batches for new work, pins this plan, and sends the checklist to the listener.';
      }
    }
    return draft;
  } catch (error) {
    const banner = document.getElementById('morningPlanRefreshBanner');
    if (banner) {
      banner.className = 'morning-plan-refresh-banner is-error';
      banner.textContent = error.message || 'Could not load the Morning Plan draft.';
    }
    if (!quiet && summary) summary.textContent = 'Morning Plan draft unavailable.';
    return null;
  } finally {
    _morningPlanLoading = false;
    if (_morningPlanRefreshQueued) {
      _morningPlanRefreshQueued = false;
      loadMorningPlanDraft({ quiet: true }).catch(() => {});
    }
  }
}

// Edits arrive faster than the 2-4s rebuild. Dropping the ones that land mid-flight
// left the client state ahead of what the page showed, so coalesce instead: run one
// more rebuild after the current one, carrying whatever accumulated.
let _morningPlanRefreshQueued = false;

function queueMorningPlanDraftRefresh() {
  if (_morningPlanLoading) {
    _morningPlanRefreshQueued = true;
    return;
  }
  loadMorningPlanDraft({ quiet: true }).catch((error) => alert(error.message));
}

async function produceMorningPlan(button) {
  const newCount = (_morningPlanDraft?.new_work || []).length;
  const message = newCount
    ? `Approve this plan and produce paperwork for ${newCount} new job(s)? This pins the list, sends morning_plan.pdf to the listener, and writes today's build-line staging pull to the CNC day folder.`
    : 'Approve this outstanding plan? This pins the list, sends morning_plan.pdf to the listener, and writes today\'s build-line staging pull to the CNC day folder.';
  if (!window.confirm(message)) return;
  const original = button?.textContent || 'Approve & Produce';
  if (button) {
    button.disabled = true;
    button.textContent = 'Producing…';
  }
  try {
    const data = await api('/api/morning-cut-plan/produce', {
      method: 'POST',
      body: JSON.stringify({
        ...morningPlanDraftBody(),
        batch_cap: getMorningPlanBatchCap(),
        generate_mdb: document.getElementById('smartBatchesGenMdb')?.checked !== false,
        generate_worksheets: document.getElementById('smartBatchesGenWorksheets')?.checked !== false,
        route_handcuts_to_omni: document.getElementById('smartBatchesRouteHandcuts')?.checked === true,
        worksheet_profile: 'operator',
        output_route: getProductionOutputRoute(),
      }),
    });
    if (!data.ok) throw new Error(data.error || 'Produce failed.');
    if (data.draft) renderMorningPlanDraft(data.draft);
    if (data.live) {
      _morningPlanLastData = data.live;
      renderMorningPlanEvents(data.live);
    }
    const banner = document.getElementById('morningPlanRefreshBanner');
    if (banner) {
      banner.className = 'morning-plan-refresh-banner is-ok';
      banner.textContent = data.message || `Dropped ${data.network_pdf_path || data.output_path || 'morning_plan.pdf'} for the listener.`;
    }
    alert(data.message || 'Morning Plan produced.');
    previewSmartBatches({ quiet: true }).catch(() => {});
  } catch (error) {
    alert(error.message || 'Could not produce the Morning Plan.');
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = original;
    }
  }
}

// Keep legacy name for WIP resync callers.
async function loadMorningPlan({ quiet = false } = {}) {
  return loadMorningPlanDraft({ quiet });
}

function renderMorningPlan(data) {
  if (data?.rows) renderMorningPlanDraft(data);
  else if (data) {
    _morningPlanLastData = data;
    renderMorningPlanEvents(data);
  }
}

function startMorningPlanPolling() {
  if (_morningPlanTimer) return;
  _morningPlanTimer = setInterval(() => {
    if (!document.hidden && !document.getElementById('morningPlanModal').hidden) {
      loadMorningPlanDraft({ quiet: true }).catch(() => {});
    }
  }, MORNING_PLAN_POLL_MS);
}

function stopMorningPlanPolling() {
  if (_morningPlanTimer) {
    clearInterval(_morningPlanTimer);
    _morningPlanTimer = null;
  }
}

function openMorningPlanModal() {
  const basisSelect = document.getElementById('morningPlanDateBasis');
  if (basisSelect) {
    basisSelect.value =
      localStorage.getItem(MORNING_PLAN_DATE_BASIS_KEY) || 'firm_date';
    delete basisSelect.dataset.userSelected;
  }
  const ceilingInput = document.getElementById('morningPlanWipCeiling');
  if (ceilingInput) {
    ceilingInput.value = localStorage.getItem('cutHealthSmartBatchesMax') || '150';
  }
  const batchInput = document.getElementById('morningPlanBatchCap');
  if (batchInput) {
    batchInput.value = localStorage.getItem('cutHealthSmartBatchesCap') || '15';
  }
  // Reopen used to zero these, which threw away today's Remove list and then
  // wrote that empty list back over localStorage. Forecast fill would put the
  // same gray In Cutting job back on the next open.
  restoreMorningPlanDraftState();
  setMorningPlanAddOpen(false);
  document.getElementById('morningPlanModal').hidden = false;
  syncModalBodyLock();
  loadMorningPlanDraft().catch(() => {});
  startMorningPlanPolling();
}

function closeMorningPlanModal() {
  document.getElementById('morningPlanModal').hidden = true;
  setMorningPlanAddOpen(false);
  stopMorningPlanPolling();
  syncModalBodyLock();
}

document.getElementById('openMorningCutPlanButton')?.addEventListener('click', openMorningPlanModal);
document.getElementById('closeMorningPlanModal')?.addEventListener('click', closeMorningPlanModal);
document.getElementById('morningPlanModal')?.addEventListener('click', (event) => {
  if (event.target.id === 'morningPlanModal') closeMorningPlanModal();
});
document.getElementById('morningPlanProduce')?.addEventListener('click', (event) => {
  produceMorningPlan(event.currentTarget).catch(() => {});
});
document.getElementById('morningPlanAddJob')?.addEventListener('click', () => {
  setMorningPlanAddOpen(true);
});
document.getElementById('morningPlanCloseAdd')?.addEventListener('click', () => {
  setMorningPlanAddOpen(false);
});
document.getElementById('morningPlanAddSearch')?.addEventListener('input', (event) => {
  renderMorningPlanAddList(event.currentTarget.value || '');
});
document.getElementById('morningPlanRefreshDraft')?.addEventListener('click', () => {
  loadMorningPlanDraft({ quiet: true }).catch((error) => alert(error.message));
});
document.getElementById('morningPlanDateBasis')?.addEventListener('change', (event) => {
  event.currentTarget.dataset.userSelected = 'true';
  localStorage.setItem(MORNING_PLAN_DATE_BASIS_KEY, event.currentTarget.value);
  loadMorningPlanDraft({ quiet: true }).catch(() => {});
});
document.getElementById('morningPlanWipCeiling')?.addEventListener('change', (event) => {
  const value = Math.max(1, Number(event.currentTarget.value) || 150);
  event.currentTarget.value = String(value);
  localStorage.setItem('cutHealthSmartBatchesMax', String(value));
  const smartMax = document.getElementById('smartBatchesMax');
  if (smartMax) smartMax.value = String(value);
  loadMorningPlanDraft({ quiet: true }).catch(() => {});
});
document.getElementById('morningPlanBatchCap')?.addEventListener('change', (event) => {
  setMorningPlanBatchCap(event.currentTarget.value);
});
document.getElementById('morningPlanRefreshInsight')?.addEventListener('click', async (event) => {
  try {
    await runInsightRefresh(event.currentTarget, () => loadMorningPlanDraft({ quiet: true, refreshInsight: true }));
  } catch (error) {
    alert(error.message || 'Could not refresh Insight.');
    await loadMorningPlanDraft({ quiet: true });
  }
});

const restockViewerState = {
  mode: 'cabinets',
  inventory: [],
  componentInventory: [],
  jobs: [],
  componentJobs: [],
  selectedItem: 'ALL',
  selectedPo: '',
  selectedJobKey: '',
  dirty: false,
  path: '',
  componentPath: '',
  source: '',
  componentChoicesLoaded: false,
  componentChoicesLoading: false,
  componentChoiceRequest: 0,
  currentComponentProfile: null,
  currentComponentProfiles: [],
  editingLegacyComponent: null,
};

function restockJobKey(job) {
  return `${job.firm_date || ''}::${job.po_number || ''}`;
}

function cloneRestockInventory(items) {
  return (items || []).map((row) => ({
    item: String(row.item || '').trim().toUpperCase(),
    qty: Number(row.qty || 0),
  })).filter((row) => row.item && row.qty > 0);
}

function cloneComponentInventory(items) {
  return (items || []).map((row) => ({
    key: String(row.key || '').trim(),
    component: String(row.component || '').trim(),
    width: String(row.width || '').trim(),
    length: String(row.length || '').trim(),
    material: String(row.material || '').trim().toUpperCase(),
    match_rule: String(row.match_rule || '').trim().toUpperCase(),
    display_label: String(row.display_label || '').trim(),
    location: String(row.location || '').trim(),
    qty: Number(row.qty || 0),
    cabinet_type: String(row.cabinet_type || '').trim(),
    cabinet_width: String(row.cabinet_width || '').trim(),
    cabinet_height: String(row.cabinet_height || '').trim(),
    cabinet_depth: String(row.cabinet_depth || '').trim(),
  })).filter((row) => row.key && row.component && row.qty > 0);
}

function setComponentSelectOptions(id, values, placeholder, { autoSingle = false } = {}) {
  const select = document.getElementById(id);
  if (!select) return '';
  const previous = String(select.value || '');
  const normalized = (values || []).map((value) => (
    typeof value === 'object' ? value : { value: String(value), label: String(value) }
  ));
  select.innerHTML = `<option value="">${escapeHtml(placeholder)}</option>` + normalized.map((option) => (
    `<option value="${escapeHtml(String(option.value ?? option.key ?? ''))}">${escapeHtml(String(option.label ?? option.value ?? ''))}</option>`
  )).join('');
  if (normalized.some((option) => String(option.value ?? option.key ?? '') === previous)) {
    select.value = previous;
  } else if (autoSingle && normalized.length === 1) {
    select.value = String(normalized[0].value ?? normalized[0].key ?? '');
  }
  select.disabled = normalized.length === 0;
  return String(select.value || '');
}

function currentComponentChoiceQuery() {
  const secondaryNumber = document.getElementById('componentSecondaryNumberInput');
  return {
    cabinet_type: String(document.getElementById('componentCabinetTypeInput')?.value || ''),
    component: String(document.getElementById('componentPartInput')?.value || ''),
    primary_measurement: String(document.getElementById('componentPrimaryInput')?.value || ''),
    secondary_measurement: String(
      secondaryNumber && !secondaryNumber.hidden
        ? secondaryNumber.value
        : document.getElementById('componentSecondaryInput')?.value || ''
    ),
  };
}

function updateComponentProfileDisplay(data, profiles, prompt = '') {
  const selectedProfiles = profiles || [];
  const selectedProfile = selectedProfiles[0] || null;
  restockViewerState.currentComponentProfile = selectedProfile;
  restockViewerState.currentComponentProfiles = selectedProfiles;
  restockViewerState.editingLegacyComponent = null;
  const inferred = document.getElementById('componentInferredSize');
  const compatibility = document.getElementById('componentCompatibility');
  const submit = document.getElementById('componentInventorySubmit');
  if (inferred) {
    inferred.classList.toggle('is-ready', selectedProfiles.length > 0);
    if (selectedProfiles.length === 1) {
      const profile = selectedProfiles[0];
      inferred.textContent = profile.display_label
        ? `${profile.display_label} · ${data.material_display || ''}`
        : `${profile.component}: ${profile.width} x ${profile.length} · ${data.material_display || ''}`;
    } else if (selectedProfiles.length > 1) {
      inferred.textContent = `${selectedProfiles.length} stock pieces selected · ${data.material_display || ''}`;
    } else {
      inferred.textContent = prompt;
    }
  }
  if (compatibility) {
    const cabinets = [...new Set(selectedProfiles.flatMap((profile) => profile.compatible_cabinets || []))];
    compatibility.hidden = cabinets.length === 0;
    compatibility.textContent = cabinets.length
      ? `Usable for: ${cabinets.slice(0, 8).join(', ')}${cabinets.length > 8 ? `, +${cabinets.length - 8} more` : ''}`
      : '';
  }
  if (submit) submit.disabled = selectedProfiles.length === 0;
}

function renderComponentStockChoices(data) {
  const before = currentComponentChoiceQuery();
  const selectionMode = data.selection_mode || 'dimensions';
  setComponentSelectOptions('componentCabinetTypeInput', data.cabinet_types || [], 'Choose cabinet type');
  document.getElementById('componentCabinetTypeInput').value = before.cabinet_type;
  setComponentSelectOptions('componentPartInput', data.components || [], 'Choose component');
  document.getElementById('componentPartInput').value = before.component;
  const primaryField = document.getElementById('componentPrimaryField');
  const primary = document.getElementById('componentPrimaryInput');
  const primaryRequired = Boolean(selectionMode === 'dimensions' && before.cabinet_type && before.component && data.primary_required);
  if (primaryField) primaryField.hidden = !primaryRequired;
  if (primary) {
    primary.disabled = !primaryRequired;
    primary.required = primaryRequired;
    primary.value = primaryRequired ? before.primary_measurement : '';
  }
  const primaryLabel = document.getElementById('componentPrimaryLabel');
  const secondaryLabel = document.getElementById('componentSecondaryLabel');
  const primaryLabelText = data.primary_label || 'Component width';
  const secondaryLabelText = data.secondary_label || 'Component length';
  if (primaryLabel) primaryLabel.textContent = primaryLabelText;
  if (secondaryLabel) secondaryLabel.textContent = secondaryLabelText;
  if (primary) primary.setAttribute('aria-label', primaryLabelText);

  const profiles = data.profiles || [];
  const secondaryField = document.getElementById('componentSecondaryField');
  const secondarySelect = document.getElementById('componentSecondaryInput');
  const secondaryNumber = document.getElementById('componentSecondaryNumberInput');
  const secondaryRequired = Boolean(selectionMode === 'dimensions' && before.component && data.secondary_required);
  const numberSecondary = data.secondary_control === 'number';
  if (secondaryField) secondaryField.hidden = !secondaryRequired;
  if (secondaryNumber) {
    secondaryNumber.setAttribute('aria-label', secondaryLabelText);
    secondaryNumber.hidden = !numberSecondary;
    secondaryNumber.disabled = !secondaryRequired || !numberSecondary;
    secondaryNumber.required = secondaryRequired && numberSecondary;
    secondaryNumber.value = numberSecondary ? before.secondary_measurement : '';
  }
  let selectedSecondary = '';
  if (secondarySelect) {
    secondarySelect.setAttribute('aria-label', secondaryLabelText);
    secondarySelect.hidden = numberSecondary;
    secondarySelect.required = secondaryRequired && !numberSecondary;
    if (!numberSecondary) {
      const secondaryOptions = profiles.map((profile) => ({ value: profile.secondary, label: profile.label }));
      selectedSecondary = setComponentSelectOptions(
        'componentSecondaryInput',
        secondaryOptions,
        `Choose ${String(data.secondary_label || 'measurement').toLowerCase()}`,
        { autoSingle: profiles.length === 1 },
      );
      if (before.secondary_measurement && profiles.some((profile) => profile.secondary === before.secondary_measurement)) {
        secondarySelect.value = before.secondary_measurement;
      }
    } else {
      secondarySelect.disabled = true;
      secondarySelect.value = '';
    }
  }

  const variantField = document.getElementById('componentVariantField');
  const variantOptions = document.getElementById('componentVariantOptions');
  const variants = data.variant_options || [];
  const variantMode = selectionMode === 'single' || selectionMode === 'checkboxes';
  if (variantField) variantField.hidden = !variantMode;
  if (variantOptions) {
    variantOptions.innerHTML = variantMode ? variants.map((option) => `
      <label class="component-variant-option">
        <input type="${selectionMode === 'single' ? 'radio' : 'checkbox'}" name="componentVariantChoice" value="${escapeHtml(option.value)}">
        <strong>${escapeHtml(option.label)}</strong>
        <small>${escapeHtml(option.detail || '')}</small>
      </label>
    `).join('') : '';
  }

  const fixed = (data.fixed_measurements || [])
    .map((measurement) => `${measurement.label} ${measurement.value}`)
    .join(' and ');
  let prompt = '';
  if (!before.cabinet_type) prompt = 'Choose the cabinet type first.';
  else if (!before.component) prompt = 'Now choose the component.';
  else if (variantMode) prompt = selectionMode === 'single' ? 'Choose left or right.' : 'Select SCB33 and/or SCB36.';
  else if (primaryRequired && !before.primary_measurement) {
    prompt = `Enter the ${String(data.primary_label || 'measurement').toLowerCase()} from the stock piece.${fixed ? ` ${fixed} is fixed for ${before.cabinet_type}.` : ''}`;
  } else if (secondaryRequired && !before.secondary_measurement) {
    prompt = `${numberSecondary ? 'Enter' : 'Choose'} the ${String(data.secondary_label || 'remaining measurement').toLowerCase()}.`;
  } else if (!numberSecondary && before.primary_measurement && profiles.length === 0) {
    prompt = 'That measurement is not in the component catalogue.';
  } else {
    prompt = fixed ? `${fixed} is inferred from ${before.cabinet_type}.` : 'The catalogue resolves this component automatically.';
  }

  if (variantMode) {
    updateComponentProfileDisplay(data, [], prompt);
    variantOptions?.querySelectorAll('input[name="componentVariantChoice"]').forEach((input) => {
      input.addEventListener('change', () => {
        const selectedValues = [...variantOptions.querySelectorAll('input[name="componentVariantChoice"]:checked')]
          .map((control) => control.value);
        const selectedProfiles = variants
          .filter((option) => selectedValues.includes(String(option.value)))
          .map((option) => option.profile);
        updateComponentProfileDisplay(data, selectedProfiles, prompt);
      });
    });
  } else {
    const finalSecondary = numberSecondary
      ? before.secondary_measurement
      : String(secondarySelect?.value || selectedSecondary || '');
    const selectedProfile = profiles.find((profile) => profile.secondary === finalSecondary) || data.resolved || null;
    updateComponentProfileDisplay(data, selectedProfile ? [selectedProfile] : [], prompt);
  }
}

async function loadComponentStockChoices() {
  const requestId = ++restockViewerState.componentChoiceRequest;
  restockViewerState.componentChoicesLoading = true;
  const params = new URLSearchParams(currentComponentChoiceQuery());
  const data = await api(`/api/restock/component-choices?${params.toString()}`);
  if (requestId !== restockViewerState.componentChoiceRequest) return;
  restockViewerState.componentChoicesLoaded = true;
  restockViewerState.componentChoicesLoading = false;
  renderComponentStockChoices(data);
  return data;
}

async function populateComponentStockForm(row) {
  const typeInput = document.getElementById('componentCabinetTypeInput');
  const componentInput = document.getElementById('componentPartInput');
  const primaryInput = document.getElementById('componentPrimaryInput');
  const secondaryInput = document.getElementById('componentSecondaryInput');
  const secondaryNumberInput = document.getElementById('componentSecondaryNumberInput');
  if (!typeInput || !componentInput || !primaryInput || !secondaryInput || !secondaryNumberInput) return row;

  typeInput.value = '';
  componentInput.value = '';
  primaryInput.value = '';
  secondaryInput.value = '';
  secondaryNumberInput.value = '';
  const initial = await loadComponentStockChoices();
  const availableTypes = initial?.cabinet_types || [];
  const candidates = [row.cabinet_type, ...availableTypes]
    .filter((value, index, values) => value && values.indexOf(value) === index);

  for (const cabinetType of candidates) {
    typeInput.value = cabinetType;
    componentInput.value = '';
    primaryInput.value = '';
    secondaryInput.value = '';
    secondaryNumberInput.value = '';
    await loadComponentStockChoices();
    componentInput.value = row.component;
    let choices = await loadComponentStockChoices();
    if (!choices?.components?.includes(row.component)) continue;
    if (['single', 'checkboxes'].includes(choices.selection_mode)) {
      const option = (choices.variant_options || []).find((candidate) => candidate.profile?.key === row.key);
      if (option) {
        const control = document.querySelector(`input[name="componentVariantChoice"][value="${CSS.escape(String(option.value))}"]`);
        if (control) {
          control.checked = true;
          control.dispatchEvent(new Event('change', { bubbles: true }));
        }
        return option.profile;
      }
      continue;
    }
    if (choices.primary_required) {
      primaryInput.value = choices.primary_axis === 'length' ? row.length : row.width;
      choices = await loadComponentStockChoices();
    }
    if (choices.secondary_required) {
      const secondaryValue = choices.secondary_axis === 'length' ? row.length : row.width;
      if (choices.secondary_control === 'number') secondaryNumberInput.value = secondaryValue;
      else secondaryInput.value = secondaryValue;
      choices = await loadComponentStockChoices();
    }
    const matched = (choices.profiles || []).find((profile) => profile.key === row.key) || choices.resolved;
    if (matched?.key === row.key) return matched;
  }
  return row;
}

function resetComponentStockForm() {
  document.getElementById('componentInventoryForm')?.reset();
  document.getElementById('componentQtyInput').value = '1';
  restockViewerState.componentChoicesLoaded = false;
  restockViewerState.currentComponentProfile = null;
  restockViewerState.currentComponentProfiles = [];
  restockViewerState.editingLegacyComponent = null;
  loadComponentStockChoices().catch(() => {});
}

// ---------------------------------------------------------------------------
// Offline mode: producing a day to the Desktop and carrying it on a drive.
// ---------------------------------------------------------------------------
let _offlineModeState = null;
let _offlineModeBusy = false;

async function loadOfflineMode() {
  try {
    const res = await fetch('/api/offline-mode');
    _offlineModeState = await res.json();
  } catch (err) {
    _offlineModeState = null;
  }
  renderOfflineMode();
}

// No global toast in this dashboard; every panel reports into its own line.
function offlineModeNote(message, isError = false) {
  const summary = document.getElementById('offlineModeSummary');
  if (!summary) return;
  summary.textContent = message;
  summary.classList.toggle('is-error', !!isError);
  // Left up long enough to read across a shop floor, then the panel goes back
  // to describing the state rather than the last thing that happened.
  window.setTimeout(() => { renderOfflineMode(); }, 6000);
}

async function postOfflineMode(path, body) {
  if (_offlineModeBusy) return null;
  _offlineModeBusy = true;
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    return await res.json();
  } catch (err) {
    return { ok: false, error: String(err) };
  } finally {
    _offlineModeBusy = false;
  }
}

function describeCutDataAge(data) {
  // "1,610 rows" reads as healthy no matter how old they are, so the age goes
  // first and in words. An unknown age is stated as unknown rather than
  // rounded to zero, which would read as fresh.
  if (!data || data.source === 'none') return 'No cut records loaded.';
  const rows = Number(data.rows || 0).toLocaleString();
  const label = data.source_label || data.source || 'unknown source';
  if (data.refreshed_at === null || data.refreshed_at === undefined || data.age_days === null) {
    return `${rows} rows from the ${label} — carries no date, so its age cannot be shown.`;
  }
  const days = Number(data.age_days);
  const when = String(data.refreshed_at).slice(0, 10);
  const age = days <= 0 ? 'today' : (days === 1 ? 'yesterday' : `${days} days old`);
  return `${rows} rows from the ${label}, ${age} (${when}).`;
}

function renderCutDataFreshness(data, { alwaysShow = false } = {}) {
  const line = document.getElementById('cutDataFreshness');
  if (!line) return;
  const stale = !!(data && data.stale);
  const offline = !!(data && data.source === 'offline');
  if (!alwaysShow && !stale && !offline) {
    line.textContent = '';
    line.hidden = true;
    line.classList.remove('is-stale');
    return;
  }
  line.hidden = false;
  line.textContent = describeCutDataAge(data);
  line.classList.toggle('is-stale', stale);
  if (offline && data.offline_outstanding_rows != null) {
    line.textContent += ` ${Number(data.offline_outstanding_rows).toLocaleString()}`
      + ' still outstanding after subtracting work shown done.';
  }
}

function isGithubFloorIssue(issue) {
  const code = String((issue && issue.code) || '');
  const detail = String((issue && issue.detail) || '');
  if (/^github_/i.test(code)) return true;
  return /github|\bgh\b\s*\(|github cli/i.test(detail);
}

function floorResilienceIssues(data) {
  const seen = new Set();
  return ((data && data.issues) || []).filter((issue) => {
    if (isGithubFloorIssue(issue)) return false;
    const key = String(issue.detail || issue.code || '');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function floorResilienceNeedsAttention(data) {
  return floorResilienceIssues(data).some((issue) =>
    issue.severity === 'critical' || issue.severity === 'warning'
  );
}

function renderResilienceStatus(data) {
  const target = document.getElementById('resilienceStatus');
  if (!target) return;
  if (!data) {
    target.innerHTML = '<p class="panel-copy">Continuity evidence is unavailable.</p>';
    return;
  }
  const snapshot = data.snapshot || {};
  const outbox = data.po_outbox || {};
  const recovery = data.recovery || {};
  const drill = data.drill || {};
  const automated = drill.automated || {};
  const physical = drill.physical || {};
  const removable = snapshot.removable || {};
  const mediaCandidates = Array.isArray(removable.candidates) ? removable.candidates : [];
  const age = snapshot.capture_age_hours == null
    ? 'never captured'
    : `${Number(snapshot.capture_age_hours).toFixed(1)}h old`;
  const ts3 = snapshot.ts3?.ok ? 'on TS3' : 'TS3 pending';
  const mediaText = removable.configured
    ? (removable.available
      ? `Recovery drive ${removable.selected?.drive || removable.last_drive || ''} ready`
      : `Recovery drive ${removable.last_drive || ''} not inserted`)
    : '';
  const pendingCount = outbox.pending == null ? null : Number(outbox.pending);
  const unresolved = Number(recovery.unresolved_count || 0);
  const floorIssues = floorResilienceIssues(data);
  const issueRows = floorIssues.map((issue) =>
    `<p class="panel-copy${issue.severity === 'critical' ? ' is-error' : ' is-stale'}">`
      + `${escapeHtml(issue.detail || issue.code || 'Continuity warning')}</p>`
  ).join('');
  const mediaRows = mediaCandidates.map((item) => {
    const isSelected = !!(removable.media_id && item.media_id === removable.media_id);
    const label = item.kind === 'usb_fixed' ? 'USB hard disk' : 'removable drive';
    return `<button type="button" class="button secondary" data-recovery-media="${escapeHtml(item.path || '')}"`
      + `${isSelected ? ' disabled' : ''}>${isSelected ? 'Selected' : 'Use'} ${escapeHtml(item.drive || item.path || '')}`
      + ` (${escapeHtml(label)})</button>`;
  }).join('');
  const copyButton = removable.configured && removable.available
    ? '<button type="button" class="button secondary" data-recovery-copy>Copy current snapshot now</button>'
    : '';
  const showMedia = !!(mediaText && (!removable.configured || !removable.available || mediaCandidates.length));
  const showOutbox = pendingCount == null || pendingCount > 0 || unresolved > 0;
  const showDrills = (automated.finished_at && !automated.ok)
    || (physical.finished_at && !physical.ok);
  const automatedText = automated.finished_at
    ? `${automated.ok ? 'passed' : 'FAILED'} ${formatTimestamp(automated.finished_at)}`
    : '';
  const physicalText = physical.finished_at
    ? `${physical.ok ? 'passed' : 'FAILED'} ${formatTimestamp(physical.finished_at)}`
    : '';
  const pendingLabel = pendingCount == null ? 'unknown' : pendingCount.toLocaleString();
  const compactMeta = `${age} · ${ts3}`;
  const bodyParts = [
    showMedia ? `<p class="panel-copy">${escapeHtml(mediaText)}.</p>` : '',
    (mediaRows || copyButton) ? `<div class="offline-mode-drive-actions">${mediaRows}${copyButton}</div>` : '',
    showOutbox
      ? `<p class="panel-copy">PO events waiting: ${escapeHtml(pendingLabel)} · Recovery conflicts: ${unresolved}</p>`
      : '',
    showDrills
      ? `<p class="panel-copy">${automatedText ? `Automated drill: ${escapeHtml(automatedText)}` : ''}`
        + `${automatedText && physicalText ? ' · ' : ''}`
        + `${physicalText ? `Physical drill: ${escapeHtml(physicalText)}` : ''}</p>`
      : '',
    issueRows,
  ].filter(Boolean).join('');
  if (!bodyParts && !floorResilienceNeedsAttention(data) && !mediaCandidates.length) {
    target.innerHTML = '';
    return;
  }
  target.innerHTML = `<div class="offline-mode-drive is-compact">
    <div class="offline-mode-drive-head">
      <span>${escapeHtml(compactMeta)}</span>
    </div>
    ${bodyParts}
  </div>`;
  target.querySelectorAll('[data-recovery-media]').forEach((button) => {
    button.addEventListener('click', async () => {
      button.disabled = true;
      const result = await postOfflineMode('/api/offline-mode/recovery-media/select', {
        drive: button.getAttribute('data-recovery-media'),
      });
      offlineModeNote(result?.ok
        ? `Selected physical recovery drive ${result.last_drive || result.drive || ''}.`
        : (result?.error || 'The recovery drive could not be selected.'), !result?.ok);
      loadOfflineMode().catch(() => {});
    });
  });
  target.querySelectorAll('[data-recovery-copy]').forEach((button) => {
    button.addEventListener('click', async () => {
      button.disabled = true;
      const result = await postOfflineMode('/api/offline-mode/recovery-media/copy', {});
      offlineModeNote(result?.ok
        ? 'Copied the current verified status snapshot to the physical recovery drive.'
        : (result?.error || 'The recovery snapshot copy failed.'), !result?.ok);
      loadOfflineMode().catch(() => {});
    });
  });
}

function renderOfflineMode() {
  const panel = document.getElementById('offlineModePanel');
  if (!panel) return;
  const state = _offlineModeState;
  const drives = (state && Array.isArray(state.drives)) ? state.drives : [];
  const offline = !!(state && state.offline);
  const automaticFallback = !!(state && state.automatic_fallback);
  const cutData = (state && state.cut_data) || null;
  const resilience = (state && state.resilience) || null;
  const stale = !!(cutData && cutData.stale);
  const network = (state && state.network) || null;
  const networkUnavailable = !!(network && network.available === false);
  const resilienceNeedsAttention = floorResilienceNeedsAttention(resilience);
  const recoveryMediaAvailable = !!(
    resilience?.snapshot?.removable?.candidates?.length
  );
  // Normally invisible. It appears when it is on, or when a drive turns up and
  // there is a decision to make -- an outage control that is always on screen
  // is one nobody reads when it matters. Not gated on the workspace: the share
  // being down applies wherever you happen to be standing.
  //
  // Stale data also raises it, share or no share. A queue served from a June
  // snapshot looks entirely normal on screen, so the only way it gets noticed
  // is if something says so.
  panel.hidden = !offline && drives.length === 0 && !stale
    && !networkUnavailable && !resilienceNeedsAttention && !recoveryMediaAvailable;
  renderCutDataFreshness(cutData, { alwaysShow: offline || networkUnavailable });
  renderResilienceStatus(resilience);
  if (panel.hidden) return;

  const summary = document.getElementById('offlineModeSummary');
  const title = document.getElementById('offlineModeTitle');
  const rootLine = document.getElementById('offlineModeRoot');
  const toggle = document.getElementById('offlineModeToggle');
  const body = document.getElementById('offlineModeDrives');
  if (!summary || !rootLine || !toggle || !body) return;

  if (title) {
    title.textContent = offline || networkUnavailable
      ? 'Working without the share'
      : (resilienceNeedsAttention ? 'Continuity needs attention' : 'Continuity ready');
  }

  summary.textContent = offline
    ? (automaticFallback
      ? 'TS3 became unavailable, so paperwork switched to the Desktop. Insight can still refresh independently; local work remains here until TS3 reconciliation is safe.'
      : 'Paperwork is being produced to the Desktop, not TS3. Insight can still refresh independently. Carry machine files on a thumb drive.')
    : (networkUnavailable
      ? 'TS3 is unavailable. Cut Health records remain safe on this PC; network reads and synchronization are degraded.'
    : (stale
      ? 'The share is in use, but the records on screen are not current. Check the source below before working off these numbers.'
      : (resilienceNeedsAttention
        ? 'Production is available, but one recovery safeguard needs attention.'
      : 'TS3 is available. Cut Health records remain locally owned and synchronize separately.')));
  const runtimePath = state && state.storage ? state.storage.runtime_data_dir : '';
  const networkPath = network ? network.path : '';
  const showPaths = offline || networkUnavailable;
  rootLine.textContent = (state && showPaths)
    ? `Local records: ${runtimePath || 'unknown'}${networkPath ? ` · TS3 source: ${networkPath}` : ''}`
    : '';
  rootLine.hidden = !showPaths;
  toggle.textContent = offline
    ? (automaticFallback ? 'Try TS3 Again' : 'Turn off Offline Mode')
    : 'Use Local Paperwork';
  toggle.classList.toggle('secondary', offline);
  toggle.disabled = !!(state && state.forced_by_env);
  if (state && state.forced_by_env) {
    toggle.title = 'Pinned by an environment variable on this PC; the switch cannot change it.';
  }

  if (!drives.length) {
    body.innerHTML = offline
      ? '<p class="panel-copy">No thumb drive plugged in.</p>'
      : '';
    return;
  }

  body.innerHTML = drives.map((drive) => {
    const pending = (drive.pending || []).length;
    const completed = (drive.completed || []).length;
    const cut = (drive.cut || []).length;
    const returned = (drive.returned || []).length;
    return `<div class="offline-mode-drive">
      <div class="offline-mode-drive-head">
        <strong>${escapeHtml(drive.path || '')}</strong>
        <span>${pending} waiting to post · ${completed} posted · ${cut} cut</span>
      </div>
      <div class="offline-mode-drive-actions">
        <button type="button" class="button secondary" data-offline-stage="${escapeHtml(drive.path || '')}">Copy today's sets out</button>
        <button type="button" class="button secondary" data-offline-import="${escapeHtml(drive.path || '')}"${returned || completed ? '' : ' disabled'}>Bring finished work back</button>
      </div>
      ${cut ? `<p class="panel-copy offline-mode-cut">Marked cut at the machine: ${escapeHtml((drive.cut || []).join(', '))}</p>` : ''}
    </div>`;
  }).join('');

  body.querySelectorAll('[data-offline-stage]').forEach((button) => {
    button.addEventListener('click', async () => {
      button.disabled = true;
      const result = await postOfflineMode('/api/offline-mode/stage', {
        drive: button.getAttribute('data-offline-stage'),
      });
      button.disabled = false;
      if (result && result.ok) {
        const count = (result.sets || []).length;
        offlineModeNote(`Copied ${count} set${count === 1 ? '' : 's'} to the drive.`);
      } else {
        offlineModeNote((result && (result.error || (result.errors || [])[0])) || 'The copy failed.', true);
      }
      loadOfflineMode().catch(() => {});
    });
  });

  body.querySelectorAll('[data-offline-import]').forEach((button) => {
    button.addEventListener('click', async () => {
      button.disabled = true;
      const result = await postOfflineMode('/api/offline-mode/import', {
        drive: button.getAttribute('data-offline-import'),
      });
      button.disabled = false;
      if (result && result.ok) {
        const cut = (result.cut || []).length;
        offlineModeNote(cut
          ? `Brought back ${cut} finished job${cut === 1 ? '' : 's'}.`
          : 'Nothing finished has come back yet.');
      } else {
        offlineModeNote((result && (result.error || (result.errors || [])[0])) || 'The import failed.', true);
      }
      loadOfflineMode().catch(() => {});
      loadProductionQueue().catch(() => {});
    });
  });
}

function wireOfflineModeToggle() {
  const toggle = document.getElementById('offlineModeToggle');
  if (!toggle) return;
  toggle.addEventListener('click', async () => {
    const offline = !!(_offlineModeState && _offlineModeState.offline);
    const automaticFallback = !!(_offlineModeState && _offlineModeState.automatic_fallback);
    if (!offline) {
      const ok = window.confirm(
        'Use local paperwork mode?\n\n'
        + 'Paperwork will be produced to the Desktop instead of the share, and '
        + 'has to be carried to the machine on a thumb drive.\n\n'
        + 'Insight refresh remains available. Only do this if TS3 is going to stay down.');
      if (!ok) return;
    }
    toggle.disabled = true;
    const result = await postOfflineMode('/api/offline-mode', {
      offline: !offline,
      reason: offline
        ? (automaticFallback ? 'automatic fallback recovery verified' : 'share is back')
        : 'ts3 unreachable',
    });
    toggle.disabled = false;
    if (result && result.ok) {
      _offlineModeState = result;
      if (result.offline) {
        offlineModeNote('Offline Mode is on. The day is being produced to the Desktop.');
      } else {
        const recovered = Number(result?.recovery?.recovery?.sets_recovered || 0);
        offlineModeNote(recovered
          ? `Recovery verified ${recovered} local set${recovered === 1 ? '' : 's'}. Paperwork goes to TS3 again.`
          : 'Recovery verified. Paperwork goes to TS3 again.');
      }
    } else {
      offlineModeNote((result && result.error) || 'The switch could not be changed.', true);
    }
    loadOfflineMode().catch(() => {});
  });
}

function syncRestockAlertVisibility() {
  const panel = document.getElementById('restockAlertPanel');
  if (!panel) return;
  const hasMatches = (
    (restockViewerState.jobs || []).length
    + (restockViewerState.componentJobs || []).length
  ) > 0;
  panel.hidden = _cncWorkflowView !== 'morning' || !hasMatches;
}

function renderRestockAlert(data) {
  const panel = document.getElementById('restockAlertPanel');
  const summary = document.getElementById('restockAlertSummary');
  const body = document.getElementById('restockAlertJobs');
  if (!panel || !summary || !body) return;
  const cabinetJobs = Array.isArray(data.jobs) ? data.jobs : [];
  const componentJobs = Array.isArray(data.component_jobs) ? data.component_jobs : [];
  syncRestockAlertVisibility();
  summary.textContent = `${cabinetJobs.length} job${cabinetJobs.length === 1 ? '' : 's'} can use complete cabinets · ${componentJobs.length} job${componentJobs.length === 1 ? '' : 's'} can use stocked components.`;
  const combined = [
    ...cabinetJobs.map((job) => ({ ...job, stockType: 'Cabinet' })),
    ...componentJobs.map((job) => ({ ...job, stockType: 'Component' })),
  ].slice(0, 8);
  body.innerHTML = combined.map((job) => `<button type="button" class="restock-alert-chip" data-restock-alert-mode="${job.stockType === 'Component' ? 'components' : 'cabinets'}">
    <strong>${escapeHtml(job.po_number || '')}</strong><span>${escapeHtml(job.stockType)} stock · ${Number(job.match_count || 0)} match${Number(job.match_count || 0) === 1 ? '' : 'es'}</span>
  </button>`).join('');
  body.querySelectorAll('[data-restock-alert-mode]').forEach((button) => {
    button.addEventListener('click', async () => {
      restockViewerState.mode = button.getAttribute('data-restock-alert-mode') || 'cabinets';
      openRestockViewerModal();
    });
  });
}

function applyRestockDashboard(data) {
  restockViewerState.inventory = cloneRestockInventory(data.inventory || []);
  restockViewerState.componentInventory = cloneComponentInventory(data.component_inventory || []);
  restockViewerState.jobs = Array.isArray(data.jobs) ? data.jobs : [];
  restockViewerState.componentJobs = Array.isArray(data.component_jobs) ? data.component_jobs : [];
  restockViewerState.path = data.path || '';
  restockViewerState.componentPath = data.component_path || '';
  restockViewerState.source = data.source || '';
  restockViewerState.dirty = false;
  if (
    restockViewerState.selectedItem !== 'ALL'
    && !(restockViewerState.mode === 'components' ? restockViewerState.componentInventory : restockViewerState.inventory)
      .some((row) => (restockViewerState.mode === 'components' ? row.key : row.item) === restockViewerState.selectedItem)
  ) {
    restockViewerState.selectedItem = 'ALL';
  }
  renderRestockViewer();
  renderRestockAlert(data);
}

function filteredRestockJobs() {
  const sourceJobs = restockViewerState.mode === 'components'
    ? restockViewerState.componentJobs
    : restockViewerState.jobs;
  const itemFilter = restockViewerState.selectedItem;
  const poFilter = String(restockViewerState.selectedPo || '').trim().toUpperCase();
  return (sourceJobs || []).filter((job) => {
    const matches = job.matches || [];
    if (itemFilter && itemFilter !== 'ALL') {
      if (!matches.some((match) => String(match.item || match.key || '').toUpperCase() === itemFilter)) {
        return false;
      }
    }
    if (poFilter) {
      const po = String(job.po_number || '').toUpperCase();
      if (!po.includes(poFilter)) return false;
    }
    return true;
  });
}

function renderRestockInventoryList() {
  const list = document.getElementById('restockInventoryList');
  const meta = document.getElementById('restockInventoryMeta');
  const deleteBtn = document.getElementById('restockDeleteSelected');
  if (!list) return;

  const componentMode = restockViewerState.mode === 'components';
  const inventory = componentMode ? restockViewerState.componentInventory : restockViewerState.inventory;
  const jobsSource = componentMode ? restockViewerState.componentJobs : restockViewerState.jobs;
  const totalQty = inventory.reduce((sum, row) => sum + Number(row.qty || 0), 0);
  if (meta) {
    meta.textContent = `${inventory.length} ${componentMode ? 'component' : 'SKU'}${inventory.length === 1 ? '' : 's'} · ${totalQty} pcs${restockViewerState.dirty ? ' · unsaved' : ''}`;
  }

  const highlighted = new Set();
  if (restockViewerState.selectedJobKey) {
    const selectedJob = (jobsSource || []).find((job) => restockJobKey(job) === restockViewerState.selectedJobKey);
    (selectedJob?.matches || []).forEach((match) => highlighted.add(String(match.item || match.key || '').toUpperCase()));
  }

  const rows = [
    {
      item: 'ALL',
      qty: null,
      label: 'All',
    },
    ...inventory.map((row) => ({ ...row, item: componentMode ? row.key : row.item })),
  ];

  list.innerHTML = rows.map((row) => {
    const item = row.item;
    const active = restockViewerState.selectedItem === item ? 'active' : '';
    const highlight = highlighted.has(item) ? 'highlighted' : '';
    const qtyHtml = item === 'ALL'
      ? `<span class="restock-qty">${jobsSource.length} jobs</span>`
      : `<span class="restock-qty">${Number(row.qty || 0)}</span>`;
    return `<button type="button" class="restock-inventory-item ${active} ${highlight}" data-item="${escapeHtml(item)}" role="option" aria-selected="${active ? 'true' : 'false'}">
      <span>${escapeHtml(item === 'ALL' ? 'All' : (componentMode ? (row.display_label || `${row.component} ${row.width} x ${row.length}`) : item))}</span>
      ${qtyHtml}
    </button>`;
  }).join('');

  list.querySelectorAll('[data-item]').forEach((button) => {
    button.addEventListener('click', async () => {
      const item = button.getAttribute('data-item') || 'ALL';
      restockViewerState.selectedItem = item;
      restockViewerState.selectedJobKey = '';
      const itemInput = document.getElementById('restockItemInput');
      const qtyInput = document.getElementById('restockQtyInput');
      if (item !== 'ALL') {
        const row = inventory.find((entry) => (componentMode ? entry.key : entry.item) === item);
        if (componentMode) {
          document.getElementById('componentLocationInput').value = row?.location || '';
          document.getElementById('componentQtyInput').value = String(row?.qty || 1);
          const matchedProfile = await populateComponentStockForm(row);
          restockViewerState.currentComponentProfile = matchedProfile;
          restockViewerState.currentComponentProfiles = [matchedProfile];
          restockViewerState.editingLegacyComponent = row;
          const inferred = document.getElementById('componentInferredSize');
          inferred.classList.add('is-ready');
          inferred.textContent = row.display_label || `${row.component}: ${row.width} x ${row.length}`;
          document.getElementById('componentInventorySubmit').disabled = false;
        } else {
          if (itemInput) itemInput.value = item;
          if (qtyInput) qtyInput.value = String(row?.qty || 1);
        }
      }
      renderRestockViewer();
    });
  });

  if (deleteBtn) {
    deleteBtn.disabled = restockViewerState.selectedItem === 'ALL' || !restockViewerState.selectedItem;
  }
}

function renderRestockJobs() {
  const body = document.getElementById('restockJobsBody');
  const summary = document.getElementById('restockViewerSummary');
  if (!body) return;

  const jobs = filteredRestockJobs();
  const componentMode = restockViewerState.mode === 'components';
  const inventory = componentMode ? restockViewerState.componentInventory : restockViewerState.inventory;
  const itemLabel = restockViewerState.selectedItem === 'ALL' ? (componentMode ? 'any stocked component' : 'any restock SKU') : restockViewerState.selectedItem;
  const poLabel = restockViewerState.selectedPo
    ? ` · PO filter “${restockViewerState.selectedPo}”`
    : '';
  if (summary) {
    if (componentMode && !inventory.length) {
      summary.textContent = 'No component stock recorded yet. Add components below to match them against upcoming cabinets.';
    } else {
      summary.textContent = `${jobs.length} upcoming job${jobs.length === 1 ? '' : 's'} with ${itemLabel}${poLabel} · 21-day lookahead`;
    }
  }

  if (!jobs.length) {
    body.innerHTML = `<p class="muted-text" style="padding:16px 4px">No matching jobs. ${
      inventory.length
        ? 'Try All, clear the PO filter, or refresh Insight.'
        : `Add ${componentMode ? 'component stock' : 'restock inventory'} on the left to see matches.`
    }</p>`;
    return;
  }

  body.innerHTML = jobs.map((job) => {
    const key = restockJobKey(job);
    const active = restockViewerState.selectedJobKey === key ? 'active' : '';
    const matches = (job.matches || []).filter((match) => {
      if (restockViewerState.selectedItem === 'ALL') return true;
      return String(match.item || match.key || '').toUpperCase() === restockViewerState.selectedItem;
    });
    const chips = matches.map((match) => {
      const short = Number(match.shortfall || 0) > 0;
      const cls = short ? 'short' : 'covered';
      return `<span class="restock-match-chip ${cls}" title="Need ${match.needed} / stock ${match.stock}">
        <strong>${escapeHtml(componentMode ? (match.display_label || `${match.component} ${match.width} x ${match.length}`) : match.item)}</strong>
        <span>${componentMode
          ? `use ${Number(match.covered || 0)} of ${Number(match.needed || 0)} needed`
          : `need ${Number(match.needed || 0)} / stock ${Number(match.stock || 0)}`}</span>
        ${componentMode && match.location ? `<span>· ${escapeHtml(match.location)}</span>` : ''}
      </span>`;
    }).join('');
    return `<article class="restock-job-card ${active}" data-job-key="${escapeHtml(key)}">
      <div class="restock-job-header">
        <strong>${escapeHtml(job.po_number || '')}</strong>
        <span class="muted-text">${escapeHtml(job.firm_date || '')}${
          Number(job.in_cutting_count || 0) > 0 ? ` · ${job.in_cutting_count} in cutting` : ''
        }</span>
      </div>
      <div class="restock-match-chips">${chips}</div>
    </article>`;
  }).join('');

  body.querySelectorAll('[data-job-key]').forEach((card) => {
    card.addEventListener('click', () => {
      const key = card.getAttribute('data-job-key') || '';
      restockViewerState.selectedJobKey = restockViewerState.selectedJobKey === key ? '' : key;
      renderRestockViewer();
    });
  });
}

function renderRestockViewer() {
  const componentMode = restockViewerState.mode === 'components';
  const cabinetForm = document.getElementById('restockInventoryForm');
  const componentForm = document.getElementById('componentInventoryForm');
  if (cabinetForm) cabinetForm.hidden = componentMode;
  if (componentForm) componentForm.hidden = !componentMode;
  const heading = document.getElementById('restockInventoryHeading');
  if (heading) heading.textContent = componentMode ? 'Components in stock' : 'Cabinets in restock';
  document.querySelector('#restockViewerModal .restock-sidebar')?.classList.toggle('component-mode', componentMode);
  document.getElementById('restockModeCabinets')?.classList.toggle('active', !componentMode);
  document.getElementById('restockModeComponents')?.classList.toggle('active', componentMode);
  document.getElementById('restockModeCabinets')?.setAttribute('aria-selected', componentMode ? 'false' : 'true');
  document.getElementById('restockModeComponents')?.setAttribute('aria-selected', componentMode ? 'true' : 'false');
  renderRestockInventoryList();
  renderRestockJobs();
  if (componentMode && !restockViewerState.componentChoicesLoaded && !restockViewerState.componentChoicesLoading) {
    loadComponentStockChoices().catch((error) => {
      const inferred = document.getElementById('componentInferredSize');
      if (inferred) inferred.textContent = error.message || 'Could not load component choices.';
      restockViewerState.componentChoicesLoading = false;
    });
  }
}

async function loadRestockViewer() {
  const body = document.getElementById('restockJobsBody');
  if (body) {
    body.innerHTML = '<p class="muted-text" style="padding:16px 4px">Loading…</p>';
  }
  const data = await api('/api/restock');
  applyRestockDashboard(data);
}

async function openRestockViewerModal() {
  const modal = document.getElementById('restockViewerModal');
  if (!modal) return;
  modal.hidden = false;
  syncModalBodyLock();
  restockViewerState.selectedItem = 'ALL';
  restockViewerState.selectedPo = '';
  restockViewerState.selectedJobKey = '';
  const poInput = document.getElementById('restockPoInput');
  if (poInput) poInput.value = '';
  try {
    await loadRestockViewer();
  } catch (error) {
    const summary = document.getElementById('restockViewerSummary');
    if (summary) summary.textContent = error.message || String(error);
    const body = document.getElementById('restockJobsBody');
    if (body) body.innerHTML = `<p class="muted-text" style="padding:16px 4px">${escapeHtml(error.message || String(error))}</p>`;
  }
}

function closeRestockViewerModal() {
  const modal = document.getElementById('restockViewerModal');
  if (!modal) return;
  if (restockViewerState.dirty && !window.confirm('Discard unsaved restock inventory changes?')) {
    return;
  }
  modal.hidden = true;
  syncModalBodyLock();
}

async function saveRestockInventory() {
  const payload = {
    items: restockViewerState.inventory.map((row) => ({
      item: row.item,
      qty: Number(row.qty || 0),
    })),
    component_items: restockViewerState.componentInventory.map((row) => ({
      component: row.component,
      width: row.width,
      length: row.length,
      material: row.material,
      location: row.location,
      qty: Number(row.qty || 0),
      cabinet_type: row.cabinet_type || '',
      match_rule: row.match_rule || '',
      display_label: row.display_label || '',
    })),
  };
  const data = await api('/api/restock', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  applyRestockDashboard(data);
}

document.getElementById('openRestockViewerButton')?.addEventListener('click', () => {
  restockViewerState.mode = 'cabinets';
  openRestockViewerModal();
});

let routerStockItems = [];
let _breakdownChecklistData = null;

function breakdownChecklistGroups(data) {
  const groups = [];
  let current = { label: '', rows: [] };
  (data?.rows || []).forEach((row) => {
    if (row.kind === 'section') {
      if (current.label || current.rows.length) groups.push(current);
      current = { label: row.label || '', rows: [] };
      return;
    }
    if (row.kind === 'item') current.rows.push(row);
  });
  if (current.label || current.rows.length) groups.push(current);
  return groups;
}

function updateRouterStockNeedCells(tr) {
  const wanted = Number(tr.querySelector('[data-router-stock-field="qty_requested"]')?.value || 0);
  tr.classList.toggle('needs-restock', wanted > 0);
}

function breakdownSectionIsWriteIn(group) {
  const label = String(group?.label || '').toLowerCase();
  if (label.includes('write') || label.includes('other')) return true;
  return (group?.rows || []).some((row) => row.write_in);
}

function breakdownGroupIsWall(group) {
  const label = String(group?.label || '');
  if (/^\s*WALL\b/i.test(label)) return true;
  const rows = group?.rows || [];
  return rows.length > 0 && rows.every((row) => {
    const family = String(row.family || '').toLowerCase();
    const sku = String(row.sku || '').toLowerCase();
    return family.startsWith('wall') || sku.startsWith('wall-');
  });
}

function renderRouterStock(data) {
  _breakdownChecklistData = data;
  routerStockItems = Array.isArray(data?.items) ? data.items.map((row) => ({ ...row })) : [];
  const summary = document.getElementById('routerStockSummary');
  const body = document.getElementById('routerStockBody');
  const generateButton = document.getElementById('generateRouterStock');
  const positiveQty = routerStockItems.reduce((sum, row) => sum + Math.max(Number(row.qty_requested || 0), 0), 0);
  if (summary) {
    summary.textContent = positiveQty > 0
      ? `Ready to generate ${positiveQty} side${positiveQty === 1 ? '' : 's'} · updated ${formatTimestamp(data?.last_modified)}`
      : `1) Print Ask for Breakdown. 2) Type returned qtys here. 3) Generate · updated ${formatTimestamp(data?.last_modified)}`;
  }
  if (generateButton) {
    generateButton.disabled = positiveQty <= 0;
    generateButton.title = positiveQty > 0
      ? `Generate Walk-up packet for ${positiveQty} side${positiveQty === 1 ? '' : 's'}`
      : 'Enter at least one qty wanted today, then Generate';
  }
  if (!body) return;
  const groups = breakdownChecklistGroups(data);
  if (!groups.length) {
    body.innerHTML = '<p class="muted-cell">No breakdown stock sides are configured.</p>';
    return;
  }
  body.innerHTML = groups.map((group) => {
    const showHand = !breakdownGroupIsWall(group);
    return `
    <section class="trim-material-group">
      ${group.label ? `<h3 class="trim-section-label">${escapeHtml(group.label)}</h3>` : ''}
      <div class="table-wrap trim-table-wrap">
        <table class="trim-checklist-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Size</th>
              ${showHand ? '<th>Hand</th>' : ''}
              <th class="num">Qty wanted today</th>
            </tr>
          </thead>
          <tbody>
            ${group.rows.map((row) => `
              <tr class="trim-item-row${Number(row.qty_requested || 0) > 0 ? ' needs-restock' : ''}" data-router-stock-sku="${escapeHtml(row.sku || '')}">
                <td class="trim-item-name">${escapeHtml(row.item || '')}</td>
                <td class="trim-size-cell">${escapeHtml(row.size || '')}</td>
                ${showHand ? `<td>${escapeHtml(row.hand || '')}</td>` : ''}
                <td class="num trim-qty-cell">
                  <input type="number" min="0" step="1" class="trim-qty-input" data-router-stock-field="qty_requested" value="${escapeHtml(blankIfZeroQty(row.qty_requested))}" aria-label="Qty wanted today for ${escapeHtml(row.item || '')}">
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </section>
  `;
  }).join('');
  body.querySelectorAll('[data-router-stock-sku]').forEach((tr) => {
    tr.querySelectorAll('input').forEach((input) => {
      input.addEventListener('input', () => {
        // Keep qty whole and non-negative so typed junk can't break Generate.
        if (input.matches('[data-router-stock-field="qty_requested"]')) {
          const cleaned = Math.min(Math.max(Math.floor(Number(input.value) || 0), 0), 120);
          if (String(input.value).trim() !== '' && Number(input.value) !== cleaned) {
            input.value = String(cleaned);
          }
        }
        updateRouterStockNeedCells(tr);
        const liveQty = collectRouterStockItems().reduce((sum, row) => sum + Math.max(Number(row.qty_requested || 0), 0), 0);
        if (generateButton) {
          generateButton.disabled = liveQty <= 0;
          generateButton.title = liveQty > 0
            ? `Generate Walk-up packet for ${liveQty} side${liveQty === 1 ? '' : 's'}`
            : 'Enter at least one qty wanted today, then Generate';
        }
        if (summary) {
          summary.textContent = liveQty > 0
            ? `Ready to generate ${liveQty} side${liveQty === 1 ? '' : 's'}`
            : '1) Print Ask for Breakdown. 2) Type returned qtys here. 3) Generate';
        }
      });
      input.addEventListener('change', () => updateRouterStockNeedCells(tr));
    });
  });
}

function collectRouterStockItems() {
  const body = document.getElementById('routerStockBody');
  if (!body) return [];
  return Array.from(body.querySelectorAll('[data-router-stock-sku]')).map((tr) => ({
    sku: tr.getAttribute('data-router-stock-sku') || '',
    qty_requested: Math.max(Number(tr.querySelector('[data-router-stock-field="qty_requested"]')?.value || 0), 0),
    enabled: true,
  }));
}

function buildBreakdownChecklistPrintHtml(data, { blankQty = true } = {}) {
  return breakdownChecklistGroups(data).map((group) => {
    const showHand = !breakdownGroupIsWall(group);
    return `
    <section class="trim-print-group">
      ${group.label ? `<h2>${escapeHtml(group.label)}</h2>` : ''}
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>Size</th>
            ${showHand ? '<th>Hand</th>' : ''}
            <th>Qty wanted today</th>
          </tr>
        </thead>
        <tbody>
          ${group.rows.map((row) => `
            <tr>
              <td>${escapeHtml(row.item || '')}</td>
              <td>${escapeHtml(row.size || '')}</td>
              ${showHand ? `<td>${escapeHtml(row.hand || '')}</td>` : ''}
              <td class="trim-print-handwrite">${blankQty ? '' : escapeHtml(blankIfZeroQty(row.qty_requested))}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </section>
  `;
  }).join('');
}

function printBreakdownChecklist() {
  const data = _breakdownChecklistData;
  if (!data) {
    alert('Breakdown stock checklist is not loaded yet.');
    return;
  }
  const meta = document.getElementById('breakdownChecklistPrintMeta');
  const body = document.getElementById('breakdownChecklistPrintBody');
  const sheet = document.getElementById('breakdownChecklistPrintSheet');
  if (!meta || !body || !sheet) return;
  meta.textContent = `How many sides do you want today? Write qty wanted. · ${new Date().toLocaleString()}`;
  // Always blank qty cells — this is the ask sheet they write on by hand.
  body.innerHTML = buildBreakdownChecklistPrintHtml(data, { blankQty: true });
  sheet.hidden = false;
  document.body.classList.add('printing-breakdown-checklist');
  const cleanup = () => {
    document.body.classList.remove('printing-breakdown-checklist');
    sheet.hidden = true;
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  window.print();
}

async function generateRouterStockPacket() {
  const btn = document.getElementById('generateRouterStock');
  const summary = document.getElementById('routerStockSummary');
  const items = collectRouterStockItems();
  const positiveQty = items.reduce((sum, row) => sum + Math.max(Number(row.qty_requested || 0), 0), 0);
  if (positiveQty <= 0) {
    alert('Enter at least one qty wanted today, then click Generate.');
    return;
  }
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Generating…';
  }
  try {
    const result = await api('/api/router-stock/generate', {
      method: 'POST',
      body: JSON.stringify({ items }),
    });
    if (!result.ok) {
      alert(result.error || 'Generate failed.');
      return;
    }
    const parts = Number(result.part_count || positiveQty);
    const sheets = Number(result.sheet_count || 0);
    const folder = result.output_dir || result.folder_title || 'Walk-up Requests';
    if (summary) {
      summary.textContent = `Generated ${parts} side${parts === 1 ? '' : 's'} on ${sheets} sheet${sheets === 1 ? '' : 's'} → ${folder}`;
    }
    alert(
      `Breakdown stock ready.\n\n`
      + `${parts} side${parts === 1 ? '' : 's'} · ${sheets} TAP sheet${sheets === 1 ? '' : 's'}\n`
      + `${folder}`
    );
    // Refresh from server so saved qtys match what Generate used.
    const data = await api('/api/router-stock');
    renderRouterStock(data);
    if (summary) {
      summary.textContent = `Generated ${parts} side${parts === 1 ? '' : 's'} on ${sheets} sheet${sheets === 1 ? '' : 's'} → ${folder}`;
    }
  } catch (error) {
    alert(error.message || String(error));
  } finally {
    if (btn) {
      btn.textContent = 'Generate';
      const liveQty = collectRouterStockItems().reduce(
        (sum, row) => sum + Math.max(Number(row.qty_requested || 0), 0),
        0,
      );
      btn.disabled = liveQty <= 0;
    }
  }
}

async function openRouterStockModal() {
  const modal = document.getElementById('routerStockModal');
  if (!modal) return;
  modal.hidden = false;
  syncModalBodyLock();
  const data = await api('/api/router-stock');
  renderRouterStock(data);
}

document.getElementById('openRouterStockButton')?.addEventListener('click', openRouterStockModal);
document.getElementById('openBreakdownStockButton')?.addEventListener('click', openRouterStockModal);
document.getElementById('openBreakdownChecklistButton')?.addEventListener('click', openRouterStockModal);
document.getElementById('closeRouterStockModal')?.addEventListener('click', () => {
  const modal = document.getElementById('routerStockModal');
  if (modal) modal.hidden = true;
  syncModalBodyLock();
});
document.getElementById('printRouterStock')?.addEventListener('click', printBreakdownChecklist);
document.getElementById('generateRouterStock')?.addEventListener('click', () => {
  generateRouterStockPacket().catch((error) => alert(error.message || String(error)));
});
document.getElementById('saveRouterStock')?.addEventListener('click', async () => {
  const rows = collectRouterStockItems();
  const data = await api('/api/router-stock', {
    method: 'POST',
    body: JSON.stringify({ items: rows, clear_planned: true }),
  });
  renderRouterStock(data);
});

document.getElementById('openRestockAlertViewerButton')?.addEventListener('click', () => {
  openRestockViewerModal();
});

document.getElementById('restockModeCabinets')?.addEventListener('click', () => {
  restockViewerState.mode = 'cabinets';
  restockViewerState.selectedItem = 'ALL';
  restockViewerState.selectedJobKey = '';
  renderRestockViewer();
});

document.getElementById('restockModeComponents')?.addEventListener('click', () => {
  restockViewerState.mode = 'components';
  restockViewerState.selectedItem = 'ALL';
  restockViewerState.selectedJobKey = '';
  renderRestockViewer();
});

document.getElementById('closeRestockViewerModal')?.addEventListener('click', () => {
  closeRestockViewerModal();
});

document.getElementById('refreshRestockViewer')?.addEventListener('click', async () => {
  if (restockViewerState.dirty && !window.confirm('Refresh and discard unsaved inventory edits?')) {
    return;
  }
  try {
    await loadRestockViewer();
  } catch (error) {
    alert(error.message || String(error));
  }
});

document.getElementById('restockInventoryForm')?.addEventListener('submit', (event) => {
  event.preventDefault();
  const itemInput = document.getElementById('restockItemInput');
  const qtyInput = document.getElementById('restockQtyInput');
  const item = String(itemInput?.value || '').trim().toUpperCase();
  const qty = Number(qtyInput?.value || 0);
  if (!item) return;
  if (!Number.isFinite(qty) || qty < 1) {
    alert('Qty must be a whole number of at least 1.');
    return;
  }
  const existing = restockViewerState.inventory.find((row) => row.item === item);
  if (existing) {
    existing.qty = qty;
  } else {
    restockViewerState.inventory.push({ item, qty });
    restockViewerState.inventory.sort((a, b) => a.item.localeCompare(b.item));
  }
  restockViewerState.selectedItem = item;
  restockViewerState.dirty = true;
  if (itemInput) itemInput.value = '';
  if (qtyInput) qtyInput.value = '1';
  renderRestockViewer();
});

document.getElementById('componentInventoryForm')?.addEventListener('submit', (event) => {
  event.preventDefault();
  const profiles = restockViewerState.currentComponentProfiles.length
    ? restockViewerState.currentComponentProfiles
    : (restockViewerState.currentComponentProfile ? [restockViewerState.currentComponentProfile] : []);
  const location = String(document.getElementById('componentLocationInput')?.value || '').trim();
  const qty = Number(document.getElementById('componentQtyInput')?.value || 0);
  if (!profiles.length || !Number.isInteger(qty) || qty < 1) {
    alert('Finish the cabinet and component selections, then enter a whole-number quantity.');
    return;
  }
  const cabinetType = String(document.getElementById('componentCabinetTypeInput')?.value || '');
  profiles.forEach((profile) => {
    const row = {
      key: profile.key,
      component: profile.component,
      width: profile.width,
      length: profile.length,
      material: profile.material,
      match_rule: profile.match_rule || '',
      display_label: profile.display_label || '',
      location,
      qty,
      cabinet_type: cabinetType,
    };
    const existing = restockViewerState.componentInventory.findIndex((entry) => entry.key === profile.key);
    if (existing >= 0) restockViewerState.componentInventory[existing] = row;
    else restockViewerState.componentInventory.push(row);
  });
  restockViewerState.componentInventory.sort((a, b) => a.key.localeCompare(b.key));
  restockViewerState.selectedItem = profiles[profiles.length - 1].key;
  restockViewerState.dirty = true;
  resetComponentStockForm();
  renderRestockViewer();
});

[
  ['componentCabinetTypeInput', ['componentPartInput', 'componentPrimaryInput', 'componentSecondaryInput', 'componentSecondaryNumberInput']],
  ['componentPartInput', ['componentPrimaryInput', 'componentSecondaryInput', 'componentSecondaryNumberInput']],
  ['componentPrimaryInput', ['componentSecondaryInput', 'componentSecondaryNumberInput']],
  ['componentSecondaryInput', []],
].forEach(([id, downstream]) => {
  document.getElementById(id)?.addEventListener('change', () => {
    downstream.forEach((downstreamId) => {
      const control = document.getElementById(downstreamId);
      if (control) control.value = '';
    });
    restockViewerState.currentComponentProfile = null;
    loadComponentStockChoices().catch((error) => {
      const inferred = document.getElementById('componentInferredSize');
      if (inferred) inferred.textContent = error.message || 'Could not update component choices.';
    });
  });
});

let componentPrimaryLookupTimer = null;
document.getElementById('componentPrimaryInput')?.addEventListener('input', () => {
  window.clearTimeout(componentPrimaryLookupTimer);
  const secondary = document.getElementById('componentSecondaryInput');
  const secondaryNumber = document.getElementById('componentSecondaryNumberInput');
  if (secondary) secondary.value = '';
  if (secondaryNumber) secondaryNumber.value = '';
  restockViewerState.currentComponentProfile = null;
  restockViewerState.currentComponentProfiles = [];
  componentPrimaryLookupTimer = window.setTimeout(() => {
    loadComponentStockChoices().catch((error) => {
      const inferred = document.getElementById('componentInferredSize');
      if (inferred) inferred.textContent = error.message || 'Could not look up that component measurement.';
    });
  }, 250);
});

let componentSecondaryLookupTimer = null;
document.getElementById('componentSecondaryNumberInput')?.addEventListener('input', () => {
  window.clearTimeout(componentSecondaryLookupTimer);
  restockViewerState.currentComponentProfile = null;
  restockViewerState.currentComponentProfiles = [];
  componentSecondaryLookupTimer = window.setTimeout(() => {
    loadComponentStockChoices().catch((error) => {
      const inferred = document.getElementById('componentInferredSize');
      if (inferred) inferred.textContent = error.message || 'Could not look up that component measurement.';
    });
  }, 250);
});

document.getElementById('restockDeleteSelected')?.addEventListener('click', () => {
  const item = restockViewerState.selectedItem;
  if (!item || item === 'ALL') return;
  if (restockViewerState.mode === 'components') {
    restockViewerState.componentInventory = restockViewerState.componentInventory.filter((row) => row.key !== item);
  } else {
    restockViewerState.inventory = restockViewerState.inventory.filter((row) => row.item !== item);
  }
  restockViewerState.selectedItem = 'ALL';
  restockViewerState.dirty = true;
  renderRestockViewer();
});

document.getElementById('restockSaveInventory')?.addEventListener('click', async () => {
  try {
    await saveRestockInventory();
  } catch (error) {
    alert(error.message || String(error));
  }
});

document.getElementById('restockPoSearch')?.addEventListener('submit', (event) => {
  event.preventDefault();
  const poInput = document.getElementById('restockPoInput');
  restockViewerState.selectedPo = String(poInput?.value || '').trim();
  restockViewerState.selectedJobKey = '';
  renderRestockViewer();
});

document.getElementById('restockClearPoFilter')?.addEventListener('click', () => {
  const poInput = document.getElementById('restockPoInput');
  if (poInput) poInput.value = '';
  restockViewerState.selectedPo = '';
  restockViewerState.selectedJobKey = '';
  renderRestockViewer();
});

document.getElementById('openLabelReprintButton').addEventListener('click', () => {
  openLabelReprintModal();
});

async function openPoChangesModal() {
  const modal = document.getElementById('poChangesModal');
  const body = document.getElementById('poChangesBody');
  const summary = document.getElementById('poChangesSummary');
  modal.hidden = false;
  syncModalBodyLock();
  body.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:20px">Loading…</td></tr>';
  try {
    const data = await api('/api/po-changes?days=45');
    const changes = data.changes || [];
    summary.textContent = changes.length
      ? `${changes.length} firm date / scheduled departure change${changes.length === 1 ? '' : 's'} in the last 45 days (newest first).`
      : 'No firm date or scheduled departure changes detected in the last 45 days.';
    if (!changes.length) {
      body.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:20px">No changes recorded yet.</td></tr>';
      return;
    }
    body.innerHTML = changes.map((c) => {
      const fieldClass = 'pill';
      return `
        <tr>
          <td>${escapeHtml(formatTimestamp(c.changed_at))}</td>
          <td><strong>${escapeHtml(c.po_number)}</strong></td>
          <td><span class="${fieldClass}">${escapeHtml(c.field)}</span></td>
          <td>${escapeHtml(c.from_value || '—')}</td>
          <td style="color:var(--muted)">→</td>
          <td><strong>${escapeHtml(c.to_value || '—')}</strong></td>
        </tr>`;
    }).join('');
  } catch (err) {
    summary.textContent = 'Unable to load PO changes.';
    body.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--danger);padding:20px">${escapeHtml(err.message || 'Error')}</td></tr>`;
  }
}

document.getElementById('openPoChangesButton').addEventListener('click', () => {
  openPoChangesModal();
});
document.getElementById('closePoChangesModal').addEventListener('click', () => {
  document.getElementById('poChangesModal').hidden = true;
  syncModalBodyLock();
});

async function openNotesModal() {
  const modal = document.getElementById('notesModal');
  const body = document.getElementById('notesBody');
  const summary = document.getElementById('notesSummary');
  modal.hidden = false;
  syncModalBodyLock();
  body.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:20px">Loading…</td></tr>';
  try {
    const data = await api('/api/eod-notes?days=21');
    const notes = data.notes || [];
    summary.textContent = notes.length
      ? `${notes.length} note${notes.length === 1 ? '' : 's'} from the floor in the last 21 days (newest first).`
      : 'No floor notes logged in the last 21 days.';
    if (!notes.length) {
      body.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:20px">No notes yet. Floor users add them with the <strong>note</strong> skill.</td></tr>';
      return;
    }
    body.innerHTML = notes.map((n) => {
      let time = String(n.created_at || '');
      try { time = new Date(n.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); } catch (e) {}
      let author = String(n.author || '—');
      if (author.includes('\\')) author = author.split('\\').pop();
      if (n.machine) author += ` (${n.machine})`;
      return `
        <tr>
          <td>${escapeHtml(n.day)}</td>
          <td>${escapeHtml(time)}</td>
          <td>${escapeHtml(author)}</td>
          <td>${escapeHtml(n.note)}</td>
          <td><button class="button secondary note-delete" type="button" data-id="${n.id}" title="Remove note">✕</button></td>
        </tr>`;
    }).join('');
    body.querySelectorAll('.note-delete').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!window.confirm('Remove this note?')) return;
        try {
          await api('/api/eod-notes/delete', { method: 'POST', body: JSON.stringify({ id: Number(btn.dataset.id) }) });
          openNotesModal();
        } catch (err) { alert(err.message || 'Delete failed'); }
      });
    });
  } catch (err) {
    summary.textContent = 'Unable to load notes.';
    body.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--danger);padding:20px">${escapeHtml(err.message || 'Error')}</td></tr>`;
  }
}

document.getElementById('openNotesButton').addEventListener('click', () => {
  openNotesModal();
});
document.getElementById('closeNotesModal').addEventListener('click', () => {
  document.getElementById('notesModal').hidden = true;
  syncModalBodyLock();
});

const EOD_REVIEW_NOTICE_KEY = 'cutHealthEodReviewNoticeV1';
let _eodReviewData = null;
let _eodReviewBusy = false;
let _eodReviewResolveBusy = false;

function eodReviewFingerprint(items) {
  return (Array.isArray(items) ? items : [])
    .map((item) => `${item.id}:${item.status || 'pending'}`)
    .sort()
    .join('|');
}

function renderEodReview(data, { notify = false } = {}) {
  _eodReviewData = data || { items: [], pending_count: 0 };
  const items = Array.isArray(_eodReviewData.items) ? _eodReviewData.items : [];
  const count = Number(_eodReviewData.pending_count ?? items.length) || 0;
  const countEl = document.getElementById('eodReviewCount');
  const state = document.getElementById('eodReviewState');
  const summary = document.getElementById('eodReviewSummary');
  const body = document.getElementById('eodReviewTableBody');
  if (countEl) countEl.textContent = String(count);
  if (state) {
    state.classList.toggle('is-error', count > 0);
    state.textContent = count
      ? `${count} item${count === 1 ? '' : 's'} left the queue without CNC evidence. Open Review items to mark warehouse or confirm Cut.`
      : 'Clear. Removals are machine-verified, on a published EOD, or marked warehouse.';
  }
  if (summary) {
    summary.textContent = count
      ? `${count} item${count === 1 ? '' : 's'} need a decision. Mark warehouse if they were pulled, or confirm Cut if they ran.`
      : 'No items need review. The EOD evidence gate is clear.';
  }
  if (body) {
    body.innerHTML = items.length ? items.map((item) => `
      <tr>
        <td>${escapeHtml(item.day || '')}</td>
        <td>${escapeHtml(item.po_number || '—')}</td>
        <td>${escapeHtml(item.item_number || '—')}</td>
        <td>${escapeHtml(item.line_number || '—')}</td>
        <td>${escapeHtml(item.icn_id || '—')}</td>
        <td>${escapeHtml(item.reason || '')}</td>
        <td>
          <div class="inline-actions">
            <button class="button compact eod-review-action" type="button" data-id="${Number(item.id)}" data-status="confirmed_cut">Confirm Cut</button>
            <button class="button secondary compact eod-review-action" type="button" data-id="${Number(item.id)}" data-status="warehouse_pull">From warehouse</button>
            <button class="button secondary compact eod-review-action" type="button" data-id="${Number(item.id)}" data-status="deferred">Investigate</button>
          </div>
        </td>
      </tr>`).join('') : '<tr><td colspan="7" class="muted-text">No EOD items need review.</td></tr>';
  }
  if (notify && count && !window.__cutHealthCompanyMode) {
    const fingerprint = eodReviewFingerprint(items);
    try { window.sessionStorage.setItem(EOD_REVIEW_NOTICE_KEY, fingerprint); } catch (_) {}
  }
}

async function loadEodReview({ notify = false } = {}) {
  if (_eodReviewBusy || window.__cutHealthCompanyMode) return _eodReviewData;
  _eodReviewBusy = true;
  try {
    const data = await api('/api/eod-review');
    renderEodReview(data, { notify });
    return data;
  } finally {
    _eodReviewBusy = false;
  }
}

function openEodReviewModal() {
  const modal = document.getElementById('eodReviewModal');
  if (!modal) return;
  modal.hidden = false;
  syncModalBodyLock();
}

function closeEodReviewModal() {
  const modal = document.getElementById('eodReviewModal');
  if (!modal) return;
  modal.hidden = true;
  syncModalBodyLock();
}

async function resolveEodReview(id, status, button) {
  const ids = Array.isArray(id) ? id.map((value) => Number(value)).filter(Boolean) : [Number(id)];
  if (!ids.length || _eodReviewResolveBusy) return;
  _eodReviewResolveBusy = true;
  if (button) button.disabled = true;
  try {
    const data = await api('/api/eod-review/resolve', {
      method: 'POST',
      body: JSON.stringify(ids.length === 1 ? { id: ids[0], status } : { ids, status }),
    });
    renderEodReview(data);
    try {
      window.sessionStorage.setItem(
        EOD_REVIEW_NOTICE_KEY,
        eodReviewFingerprint(data.items || []),
      );
    } catch (_) {}
    const eod = data.eod || {};
    const summary = document.getElementById('eodReviewSummary');
    if (summary && eod.status) {
      const rebuilt = eod.status === 'generated';
      summary.textContent = data.pending_count
        ? `Decision saved and the EOD gate was reevaluated. ${data.pending_count} item${data.pending_count === 1 ? '' : 's'} still need review.`
        : rebuilt
          ? 'Decision saved. The corrected EOD was rebuilt and the morning email gate is clear.'
          : 'Decision saved. The EOD gate is clear; there were not enough reportable Cut items to write a report.';
    }
  } catch (error) {
    alert(error.message || 'Could not save the EOD review decision.');
    if (button) button.disabled = false;
  } finally {
    _eodReviewResolveBusy = false;
  }
}

document.getElementById('openEodReview')?.addEventListener('click', () => {
  openEodReviewModal();
  loadEodReview().catch((error) => alert(error.message));
});
document.getElementById('closeEodReview')?.addEventListener('click', closeEodReviewModal);
document.getElementById('refreshEodReview')?.addEventListener('click', () => {
  loadEodReview().catch((error) => alert(error.message));
});
document.getElementById('markAllEodReviewWarehouse')?.addEventListener('click', () => {
  const ids = (_eodReviewData?.items || []).map((item) => Number(item.id)).filter(Boolean);
  if (!ids.length) return;
  if (!window.confirm(`Mark all ${ids.length} item${ids.length === 1 ? '' : 's'} as pulled from the warehouse?`)) {
    return;
  }
  resolveEodReview(ids, 'warehouse_pull', document.getElementById('markAllEodReviewWarehouse'))
    .catch((error) => alert(error.message));
});
document.getElementById('eodReviewModal')?.addEventListener('click', (event) => {
  if (event.target.id === 'eodReviewModal') closeEodReviewModal();
});
document.getElementById('eodReviewTableBody')?.addEventListener('click', (event) => {
  const button = event.target.closest('.eod-review-action');
  if (!button) return;
  resolveEodReview(Number(button.dataset.id), button.dataset.status || '', button);
});

function eodEmailJoin(list) {
  return (Array.isArray(list) ? list : []).join('\n');
}

function fillEodEmailForm(data) {
  const enabled = document.getElementById('eodEmailEnabled');
  const time = document.getElementById('eodEmailTime');
  const from = document.getElementById('eodEmailFrom');
  const to = document.getElementById('eodEmailTo');
  const cc = document.getElementById('eodEmailCc');
  const status = document.getElementById('eodEmailStatus');
  if (!enabled || !time || !from || !to || !cc) return;
  enabled.checked = false;
  time.value = data.send_time || '06:00';
  from.value = data.from_address || '';
  to.value = eodEmailJoin(data.to);
  cc.value = eodEmailJoin(data.cc);
  const last = data.last_sent_day ? `Last sent report day: ${data.last_sent_day}.` : 'No report day marked sent yet.';
  const pending = data.pending_report_day || 'yesterday';
  const approved = data.send_approved ? `Approved for ${pending}.` : `${pending} is not approved — it will not send.`;
  if (status) status.textContent = `Unattended send is locked off. ${approved} ${last}`;
}

async function openEodEmailModal() {
  const modal = document.getElementById('eodEmailModal');
  if (!modal) return;
  modal.hidden = false;
  syncModalBodyLock();
  const data = await api('/api/eod-morning-email');
  fillEodEmailForm(data);
}

function closeEodEmailModal() {
  const modal = document.getElementById('eodEmailModal');
  if (!modal) return;
  modal.hidden = true;
  syncModalBodyLock();
}

document.getElementById('openEodEmailButton')?.addEventListener('click', () => {
  openEodEmailModal().catch((error) => alert(error.message));
});
document.getElementById('closeEodEmailModal')?.addEventListener('click', () => {
  closeEodEmailModal();
});
document.getElementById('eodEmailModal')?.addEventListener('click', (event) => {
  if (event.target.id === 'eodEmailModal') closeEodEmailModal();
});
document.getElementById('eodEmailForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const data = await api('/api/eod-morning-email', {
      method: 'POST',
      body: JSON.stringify({
        enabled: false,
        require_send_approval: true,
        send_time: document.getElementById('eodEmailTime').value,
        from_address: document.getElementById('eodEmailFrom').value,
        to: document.getElementById('eodEmailTo').value,
        cc: document.getElementById('eodEmailCc').value,
      }),
    });
    fillEodEmailForm(data);
  } catch (error) {
    alert(error.message);
  }
});
document.getElementById('eodEmailApprove')?.addEventListener('click', async () => {
  try {
    const data = await api('/api/eod-morning-email/approve', { method: 'POST', body: JSON.stringify({}) });
    fillEodEmailForm(data);
  } catch (error) {
    alert(error.message);
  }
});
document.getElementById('eodEmailSendNow')?.addEventListener('click', async () => {
  try {
    const data = await api('/api/eod-morning-email/send', { method: 'POST', body: JSON.stringify({}) });
    if (data.status === 'skipped') {
      alert(`Not sent: ${data.reason || 'blocked'}.`);
    }
    const status = await api('/api/eod-morning-email');
    fillEodEmailForm(status);
  } catch (error) {
    alert(error.message);
  }
});

document.getElementById('openTrimChecklistPreviewButton')?.addEventListener('click', () => {
  openTrimChecklistPreviewModal().catch((error) => alert(error.message));
});
document.getElementById('closeTrimChecklistPreviewModal')?.addEventListener('click', () => {
  closeTrimChecklistPreviewModal();
});
document.getElementById('downloadTrimChecklistPreview')?.addEventListener('click', () => {
  downloadTrimChecklistWorkbook().catch((error) => alert(error.message));
});
document.getElementById('downloadTrimMaterialGuide')?.addEventListener('click', () => {
  downloadTrimMaterialGuideHtml();
});
document.getElementById('printTrimChecklistPreview')?.addEventListener('click', () => {
  printTrimChecklistPreviewFromTools();
});
document.getElementById('includeTrimMaterialGuide')?.addEventListener('change', () => {
  if (_trimChecklistPreviewData) renderTrimChecklistPreview(_trimChecklistPreviewData);
});
document.getElementById('trimChecklistPreviewModal')?.addEventListener('click', (event) => {
  if (event.target.id === 'trimChecklistPreviewModal') {
    closeTrimChecklistPreviewModal();
  }
});

function openCabinetWelcomeGuideModal() {
  const modal = document.getElementById('cabinetWelcomeGuideModal');
  const body = document.getElementById('cabinetWelcomeGuideBody');
  if (!modal || !body) return;
  if (typeof window.buildCabinetWelcomeGuideHtml !== 'function') {
    alert('Cabinet welcome guide is not available. Restart Cut Health and try again.');
    return;
  }
  body.innerHTML = window.buildCabinetWelcomeGuideHtml();
  modal.hidden = false;
  syncModalBodyLock();
}

function closeCabinetWelcomeGuideModal() {
  const modal = document.getElementById('cabinetWelcomeGuideModal');
  if (!modal) return;
  modal.hidden = true;
  syncModalBodyLock();
}

async function downloadCabinetWelcomeGuideHtml() {
  if (typeof window.buildCabinetWelcomeGuideDocumentHtml !== 'function') {
    throw new Error('Cabinet welcome guide is not available.');
  }
  let html = window.buildCabinetWelcomeGuideDocumentHtml();
  const assets = [
    '/static/cabinet_guide/depth_from_wall.svg',
  ];
  for (const asset of assets) {
    try {
      const response = await fetch(asset);
      if (!response.ok) continue;
      const svgText = await response.text();
      const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
      html = html.split(asset.replace('/static/', './')).join(dataUrl);
      html = html.split(asset).join(dataUrl);
    } catch {
      // keep original path if fetch fails
    }
  }
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'Welcome_to_the_World_of_Cabinets.html';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function printCabinetWelcomeGuide() {
  if (typeof window.buildCabinetWelcomeGuideHtml !== 'function') return;
  const printBody = document.getElementById('cabinetWelcomeGuidePrintBody');
  if (!printBody) return;
  printBody.innerHTML = window.buildCabinetWelcomeGuideHtml();
  document.body.classList.add('printing-cabinet-welcome-guide');
  const cleanup = () => {
    document.body.classList.remove('printing-cabinet-welcome-guide');
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  window.print();
}

document.getElementById('openCabinetWelcomeGuideButton')?.addEventListener('click', () => {
  openCabinetWelcomeGuideModal();
});
document.getElementById('closeCabinetWelcomeGuideModal')?.addEventListener('click', () => {
  closeCabinetWelcomeGuideModal();
});
document.getElementById('downloadCabinetWelcomeGuide')?.addEventListener('click', () => {
  downloadCabinetWelcomeGuideHtml().catch((error) => alert(error.message || String(error)));
});
async function printNewHirePacket(button) {
  if (!button) return;
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = 'Building packet…';
  try {
    const data = await api('/api/new-hire-packet/create', { method: 'POST' });
    const extra = (data.warnings || []).length
      ? `\n\n${(data.warnings || []).join('\n')}`
      : '';
    alert(`New hire packet folder is ready:\n${data.folder}${extra}`);
  } catch (err) {
    alert(err.message || 'Could not build the new hire packet.');
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

function openCohViewerModal() {
  const modal = document.getElementById('cohViewerModal');
  if (!modal) return;
  modal.hidden = false;
  syncModalBodyLock();
  loadCohTrim().catch((error) => {
    const lane = document.getElementById('cohViewerLane');
    if (lane) lane.innerHTML = `<p class="muted-text">${escapeHtml(error.message || 'Could not load COH.')}</p>`;
  });
}

function closeCohViewerModal() {
  const modal = document.getElementById('cohViewerModal');
  if (!modal) return;
  modal.hidden = true;
  syncModalBodyLock();
}

document.getElementById('openCohViewer')?.addEventListener('click', openCohViewerModal);
document.getElementById('closeCohViewerModal')?.addEventListener('click', closeCohViewerModal);
document.getElementById('cohViewerRefresh')?.addEventListener('click', () => {
  loadCohTrim().catch((error) => alert(error.message));
});
document.getElementById('cohViewerModal')?.addEventListener('click', (event) => {
  if (event.target.id === 'cohViewerModal') closeCohViewerModal();
});
document.getElementById('printNewHirePacket')?.addEventListener('click', (event) => {
  printNewHirePacket(event.currentTarget);
});
document.getElementById('generateOnboardingPdfPacket')?.addEventListener('click', (event) => {
  printNewHirePacket(event.currentTarget);
});
document.getElementById('printCabinetWelcomeGuide')?.addEventListener('click', () => {
  printCabinetWelcomeGuide();
});
document.getElementById('cabinetWelcomeGuideModal')?.addEventListener('click', (event) => {
  if (event.target.id === 'cabinetWelcomeGuideModal') {
    closeCabinetWelcomeGuideModal();
  }
});

document.getElementById('settingsForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const aheadGoalDays = document.getElementById('aheadGoalDays').value;
  await api('/api/settings', {
    method: 'POST',
    body: JSON.stringify({ ahead_goal_days: aheadGoalDays }),
  });
  await loadOverview();
});

document.getElementById('walkupForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.target);
  await api('/api/walkups', {
    method: 'POST',
    body: JSON.stringify({
      description: form.get('description'),
      po_number: form.get('poNumber'),
      work_type: form.get('workType'),
      item_count: form.get('itemCount'),
      pw05: form.get('pw05'),
      pw075: form.get('pw075'),
    }),
  });
  event.target.reset();
  await loadOverview();
  if (!document.getElementById('manualAddedModal').hidden) {
    await loadManualAddedToday();
  }
});

document.getElementById('machineIssueForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.target);
  const notifiedRaw = String(form.get('notified') || '');
  const issueId = String(form.get('id') || '').trim();
  await api('/api/machine-issues/issues', {
    method: 'POST',
    body: JSON.stringify({
      id: issueId || undefined,
      date: form.get('date'),
      machine: form.get('machine'),
      status: form.get('status'),
      issue: form.get('issue'),
      notified: notifiedRaw.split(',').map((part) => part.trim()).filter(Boolean),
      summary: form.get('summary'),
      actions: form.get('actions'),
      result: form.get('result'),
    }),
  });
  resetMachineIssueForm();
  setMachineIssueFormExpanded(false);
  await loadMachineIssues();
});

document.getElementById('cancelMachineIssueEdit').addEventListener('click', () => {
  resetMachineIssueForm();
});

document.getElementById('toggleMachineIssueForm').addEventListener('click', () => {
  const body = document.getElementById('machineIssueFormBody');
  setMachineIssueFormExpanded(body.hidden);
});

document.getElementById('poNumberInput').addEventListener('input', (event) => {
  loadPoSuggestions(event.target.value).catch(() => {});
});

document.getElementById('shareSelectedReports').addEventListener('click', async () => {
  const checked = Array.from(document.querySelectorAll('.report-checkbox:checked')).map((node) => node.dataset.path);
  if (!checked.length) {
    alert('Select at least one report first.');
    return;
  }
  await api('/api/share-email', {
    method: 'POST',
    body: JSON.stringify({
      report_paths: checked,
      subject: 'Cut Department End-of-Day Reports',
      body: 'Attached are the selected Cut Department end-of-day reports.',
    }),
  });
});

// Operator packets elements removed ? unified into Production Queue
if (document.getElementById('operatorFirmDate')) {
  document.getElementById('operatorFirmDate').addEventListener('change', async (event) => {
    await loadOperatorPackets(event.target.value);
  });
}
if (document.getElementById('operatorDateBasis')) {
  document.getElementById('operatorDateBasis').addEventListener('change', async (event) => {
    localStorage.setItem(OPERATOR_DATE_BASIS_KEY, event.target.value);
    await loadOperatorPackets('');
  });
}

document.getElementById('newHireTaskDay').addEventListener('change', async (event) => {
  await loadNewHireTask(event.target.value);
});

document.getElementById('printTrimChecklistButton').addEventListener('click', () => {
  openTrimChecklistPreviewModal().then(() => printTrimChecklistPreviewFromTools()).catch((error) => alert(error.message));
});

document.getElementById('openTrimChecklist').addEventListener('click', () => {
  openTrimChecklistModal().catch((error) => alert(error.message));
});

document.getElementById('closeTrimChecklistModal').addEventListener('click', () => {
  closeTrimChecklistModal();
});

document.getElementById('saveTrimChecklist').addEventListener('click', () => {
  saveTrimChecklistChanges().catch((error) => alert(error.message));
});

document.getElementById('printTrimChecklist').addEventListener('click', () => {
  printTrimChecklistPreview();
});

document.getElementById('trimChecklistModal').addEventListener('click', (event) => {
  if (event.target.id === 'trimChecklistModal') closeTrimChecklistModal();
});

document.getElementById('toggleNewHireTasks').addEventListener('click', () => {
  const panel = document.getElementById('newHireTaskPanel');
  setNewHireTaskCollapsed(!panel.classList.contains('is-collapsed'));
});

document.getElementById('printMachineIssues').addEventListener('click', printMachineIssues);

document.querySelectorAll('#machineIssueHeaders .sortable-header').forEach((th) => {
  th.addEventListener('click', () => {
    const field = th.dataset.sort;
    if (machineIssueSortField === field) {
      machineIssueSortAsc = !machineIssueSortAsc;
    } else {
      machineIssueSortField = field;
      machineIssueSortAsc = field !== 'date';
    }
    if (_lastMachineIssueData) renderMachineIssues(_lastMachineIssueData);
  });
});

document.getElementById('closePaletteLabelsModal').addEventListener('click', closePaletteLabelsModal);
document.getElementById('closeCompletedTodayModal').addEventListener('click', closeCompletedTodayModal);
document.getElementById('closeAheadGoalModal').addEventListener('click', closeAheadGoalModal);
document.getElementById('closeManualAddedModal').addEventListener('click', closeManualAddedModal);
document.getElementById('closeSnapshotHistoryModal').addEventListener('click', closeSnapshotHistoryModal);
document.getElementById('closeMachineIssuesModal').addEventListener('click', closeMachineIssuesModal);
document.getElementById('closeTrainingMatrixModal').addEventListener('click', closeTrainingMatrixModal);
document.getElementById('closeItemLookupModal').addEventListener('click', closeItemLookupModal);
document.getElementById('itemLookupForm').addEventListener('submit', (event) => {
  event.preventDefault();
  runItemLookup(document.getElementById('itemLookupQuery').value).catch((error) => alert(error.message));
});
document.getElementById('topbarItemSearchForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const query = document.getElementById('topbarItemSearch').value;
  openItemLookupModal(query);
  if (!String(query || '').trim()) {
    document.getElementById('itemLookupQuery').focus();
  }
});
document.getElementById('itemLookupModal').addEventListener('click', (event) => {
  if (event.target.id === 'itemLookupModal') {
    closeItemLookupModal();
  }
});
document.getElementById('openWalkupRequestModal').addEventListener('click', openWalkupRequestModal);
document.getElementById('openWalkupRequestTopbar')?.addEventListener('click', openWalkupRequestModal);
document.getElementById('openWalkupRequestFromPlan')?.addEventListener('click', openWalkupRequestModal);
document.getElementById('openManualAddedTopbar')?.addEventListener('click', () => {
  openManualAddedModal().catch((error) => alert(error.message));
});
document.getElementById('openManualAddedFromPlan')?.addEventListener('click', () => {
  openManualAddedModal().catch((error) => alert(error.message));
});
document.getElementById('closeWalkupRequestModal').addEventListener('click', closeWalkupRequestModal);
document.getElementById('walkupRequestForm').addEventListener('submit', (event) => {
  event.preventDefault();
  runWalkupItemLookup(document.getElementById('walkupRequestQuery').value).catch((error) => alert(error.message));
});
document.getElementById('walkupRequestFolderTitle').addEventListener('input', () => {
  _walkupFolderTitleManual = true;
});
document.getElementById('walkupRequestReviewBtn').addEventListener('click', openWalkupReview);
document.getElementById('walkupRequestBackBtn').addEventListener('click', backFromWalkupReview);
document.getElementById('walkupRequestGenerate').addEventListener('click', () => {
  generateWalkupRequestFiles().catch((error) => alert(error.message));
});
document.getElementById('walkupRequestOpenOutput').addEventListener('click', async () => {
  if (!_walkupLastOutputDir) return;
  await api('/api/walkup-request/open-output', {
    method: 'POST',
    body: JSON.stringify({ output_dir: _walkupLastOutputDir }),
  });
});
document.getElementById('walkupRequestModal').addEventListener('click', (event) => {
  if (event.target.id === 'walkupRequestModal') {
    closeWalkupRequestModal();
  }
});

document.getElementById('addTraineeBtn').addEventListener('click', async () => {
  const name = window.prompt('Trainee name:');
  if (!name) return;
  const startDate = window.prompt('Start date (YYYY-MM-DD, or leave blank):', new Date().toISOString().slice(0, 10)) ?? '';
  try {
    await api('/api/daily-training/trainees', {
      method: 'POST',
      body: JSON.stringify({ name, start_date: startDate }),
    });
    await loadDailyTraining();
  } catch (err) {
    alert(err.message);
  }
});

document.getElementById('dtTabReview').addEventListener('click', () => dtSwitchTab('review'));
document.getElementById('dtTabSummary').addEventListener('click', () => dtSwitchTab('summary'));
document.getElementById('dtTabLog').addEventListener('click', () => dtSwitchTab('log'));
document.getElementById('dtSubmitReview').addEventListener('click', submitDtReview);

document.getElementById('dtTraineeSelect').addEventListener('change', () => {
  if (_dtCurrentTab === 'review') loadDtDailyRemark().catch(() => {});
  if (_dtCurrentTab === 'summary') loadDtProficiency().catch(() => {});
  if (_dtCurrentTab === 'log') loadDtLog().catch(() => {});
});

document.getElementById('dtDate').addEventListener('change', () => {
  if (_dtCurrentTab === 'review') loadDtDailyRemark().catch(() => {});
});

document.getElementById('trendChart').addEventListener('click', (event) => {
  const row = event.target.closest('.trend-row-action');
  if (!row || !row.dataset.day) return;
  openCompletedTodayModal(row.dataset.day).catch((error) => alert(error.message));
});

document.getElementById('paletteLabelsModeReady').addEventListener('click', () => {
  loadPaletteLabels('ready').catch((error) => alert(error.message));
});

document.getElementById('paletteLabelsModePrinted').addEventListener('click', () => {
  loadPaletteLabels('printed').catch((error) => alert(error.message));
});

document.getElementById('selectAllPaletteLabels').addEventListener('click', selectAllPaletteLabels);

document.getElementById('printPaletteLabelsSelected').addEventListener('click', () => {
  submitPaletteLabelPrint(false).catch((error) => alert(error.message));
});

document.getElementById('reprintPaletteLabelsSelected').addEventListener('click', () => {
  submitPaletteLabelPrint(true).catch((error) => alert(error.message));
});

document.getElementById('paletteLabelsModal').addEventListener('click', (event) => {
  if (event.target.id === 'paletteLabelsModal') {
    closePaletteLabelsModal();
  }
});

// ---- Label Reprint Modal -----------------------------------------------

let _labelReprintItems = [];
let _labelReprintFilter = 'all'; // 'all' | 'placeholder' | 'insight'
let _labelPrintQueueData = null;

function _selectedCutZebra(selectId = 'supervisorLabelPrinter') {
  return String(document.getElementById(selectId)?.value || '').trim();
}

function _syncCutZebraSelect(selectId, printers) {
  const select = document.getElementById(selectId);
  if (!select) return;
  const prior = select.value;
  select.innerHTML = printers.length
    ? printers.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('')
    : '<option value="">No Cut Zebra printer online</option>';
  if (printers.includes(prior)) select.value = prior;
}

function renderLabelPrintQueue(data) {
  _labelPrintQueueData = data;
  const state = document.getElementById('supervisorLabelQueueState');
  const jobs = document.getElementById('supervisorLabelQueueJobs');
  const retry = document.getElementById('supervisorRetryLabelPrint');
  const printers = data?.printers || [];
  _syncCutZebraSelect('supervisorLabelPrinter', printers);
  _syncCutZebraSelect('labelReprintPrinter', printers);
  if (!data?.ok) {
    if (state) state.textContent = data?.error || 'Could not check label printing.';
    if (jobs) jobs.innerHTML = '';
    return;
  }
  const pending = Number(data.pending_count) || 0;
  const failed = Number(data.failed_count) || 0;
  if (state) {
    state.textContent = !printers.length
      ? `${pending} batch${pending === 1 ? '' : 'es'} ready for labels. No Cut Zebra printer is currently available.`
      : `${pending} batch${pending === 1 ? '' : 'es'} ready for labels${failed ? ` · ${failed} failed print${failed === 1 ? '' : 's'}` : ''}.`;
  }
  if (retry) retry.hidden = !data.last_failed;
  if (!jobs) return;
  // Selections survive the re-render: a refresh (manual or the 60s tick) must
  // not silently empty a basket the user is still filling.
  const stillPresent = new Set((data.jobs || []).map((job) => String(job.id)));
  _labelQueueSelection = new Set(
    [..._labelQueueSelection].filter((id) => stillPresent.has(id)),
  );
  jobs.innerHTML = (data.jobs || []).length
    ? data.jobs.map((job) => {
      const id = String(job.id);
      const checked = _labelQueueSelection.has(id) ? ' checked' : '';
      return `<article class="supervisor-label-job${job.status === 'failed' ? ' is-failed' : ''}${checked ? ' is-selected' : ''}" data-label-job-id="${escapeHtml(job.id)}">
        <div class="supervisor-label-job-head">
          <label class="supervisor-label-pick">
            <input type="checkbox" data-label-job-pick="${escapeHtml(job.id)}"${checked}>
            <strong>${escapeHtml(job.set_name || `Reprint · ${job.po_number}`)}</strong>
          </label>
          <button class="button compact" type="button" data-print-label-job="${escapeHtml(job.id)}">${job.status === 'failed' ? 'Retry' : 'Print labels'}</button>
        </div>
        <p>${Number(job.label_count) || 0} labels${Number(job.post_revision) ? ` · Post ${Number(job.post_revision)}` : ''}${job.error ? ` · ${escapeHtml(job.error)}` : ''}</p>
      </article>`;
    }).join('')
    : '<p class="pq-note-empty">No ready batches are waiting for labels.</p>';
  syncLabelQueueSelectionUi();
}

let _labelQueueSelection = new Set();

function labelQueueSelectedIds() {
  return [..._labelQueueSelection];
}

function syncLabelQueueSelectionUi() {
  const count = _labelQueueSelection.size;
  const total = (_labelPrintQueueData?.jobs || []).length;
  const label = document.getElementById('supervisorLabelSelectionCount');
  const printBtn = document.getElementById('supervisorPrintSelectedLabels');
  const deleteBtn = document.getElementById('supervisorDeleteSelectedLabels');
  const selectAll = document.getElementById('supervisorLabelSelectAll');
  if (label) {
    const labels = (_labelPrintQueueData?.jobs || [])
      .filter((job) => _labelQueueSelection.has(String(job.id)))
      .reduce((sum, job) => sum + (Number(job.label_count) || 0), 0);
    label.textContent = count
      ? `${count} of ${total} selected · ${labels} label${labels === 1 ? '' : 's'}`
      : 'None selected';
  }
  if (printBtn) printBtn.disabled = !count;
  if (deleteBtn) deleteBtn.disabled = !count;
  if (selectAll) {
    selectAll.checked = Boolean(total) && count === total;
    selectAll.indeterminate = Boolean(count) && count < total;
  }
}

function setLabelQueueBulkState(message, isError = false) {
  const node = document.getElementById('supervisorLabelBulkState');
  if (!node) return;
  node.hidden = !message;
  node.textContent = message || '';
  node.classList.toggle('is-error', Boolean(isError));
}

async function printSelectedLabelJobs() {
  const ids = labelQueueSelectedIds();
  if (!ids.length) return;
  const printerName = _selectedCutZebra();
  if (!printerName) throw new Error('Connect and select Cut Zebra 1 or Cut Zebra 2.');
  let printed = 0;
  const failures = [];
  // One at a time on purpose: the Zebra is a physical queue, and a partial
  // failure has to name the batch that failed rather than the whole run.
  for (const id of ids) {
    setLabelQueueBulkState(`Printing ${printed + 1} of ${ids.length}…`);
    try {
      const result = await api('/api/label-print-queue/print', {
        method: 'POST',
        body: JSON.stringify({ job_id: id, printer_name: printerName }),
      });
      if (!result.ok) throw new Error(result.error || result.job?.error || 'Label print failed.');
      printed += 1;
      _labelQueueSelection.delete(id);
    } catch (error) {
      const job = (_labelPrintQueueData?.jobs || []).find((entry) => String(entry.id) === id);
      failures.push(`${job?.set_name || id}: ${error.message}`);
    }
  }
  await loadLabelPrintQueue();
  setLabelQueueBulkState(
    failures.length
      ? `Printed ${printed} of ${ids.length}. Failed: ${failures.join('; ')}`
      : `Printed ${printed} batch${printed === 1 ? '' : 'es'}.`,
    Boolean(failures.length),
  );
}

async function deleteSelectedLabelJobs() {
  const ids = labelQueueSelectedIds();
  if (!ids.length) return;
  const total = (_labelPrintQueueData?.jobs || [])
    .filter((job) => _labelQueueSelection.has(String(job.id)))
    .reduce((sum, job) => sum + (Number(job.label_count) || 0), 0);
  if (!confirm(
    `Remove ${ids.length} batch${ids.length === 1 ? '' : 'es'} (${total} label${total === 1 ? '' : 's'}) from the label queue?\n\n`
    + 'The batches stop asking to be printed. Nothing is cut, deleted or un-produced.',
  )) return;
  setLabelQueueBulkState(`Removing ${ids.length}…`);
  const result = await api('/api/label-print-queue/discard', {
    method: 'POST',
    body: JSON.stringify({ job_ids: ids, reason: 'Removed from the label queue' }),
  });
  if (!result.ok) throw new Error(result.error || 'Could not remove those batches.');
  _labelQueueSelection.clear();
  renderLabelPrintQueue(result);
  setLabelQueueBulkState(`Removed ${Number(result.discarded) || 0} batch${Number(result.discarded) === 1 ? '' : 'es'}.`);
}

async function loadLabelPrintQueue() {
  const data = await api('/api/label-print-queue');
  renderLabelPrintQueue(data);
  return data;
}

async function printQueuedLabels(jobId) {
  const printerName = _selectedCutZebra();
  if (!printerName) throw new Error('Connect and select Cut Zebra 1 or Cut Zebra 2.');
  const result = await api('/api/label-print-queue/print', {
    method: 'POST',
    body: JSON.stringify({ job_id: jobId, printer_name: printerName }),
  });
  if (!result.ok) throw new Error(result.error || result.job?.error || 'Label print failed.');
  await loadLabelPrintQueue();
}

function openLabelReprintModal(prefillPo) {
  document.getElementById('labelReprintModal').hidden = false;
  syncModalBodyLock();
  _loadCuttingCompleteJobs();
  loadLabelPrintQueue().catch(() => {});
  if (prefillPo) {
    document.getElementById('labelReprintPo').value = prefillPo;
    _loadLabelReprintJob(prefillPo);
  }
}

async function _loadCuttingCompleteJobs() {
  const el = document.getElementById('labelReprintCcList');
  el.innerHTML = '<span class="muted-text">Loading…</span>';
  try {
    const data = await api('/api/label-reprint/cutting-complete-jobs');
    if (!data.ok || !data.jobs.length) {
    el.innerHTML = '<span class="muted-text">No outstanding cutting jobs found.</span>';
      return;
    }
    el.innerHTML = data.jobs.map(po =>
      `<button class="chip" type="button" data-po="${escapeHtml(po)}">${escapeHtml(po)}</button>`
    ).join('');
    el.querySelectorAll('.chip').forEach(btn => {
      btn.addEventListener('click', () => {
        const po = btn.dataset.po;
        document.getElementById('labelReprintPo').value = po;
        _loadLabelReprintJob(po);
      });
    });
  } catch (e) {
    el.innerHTML = '<span class="muted-text">Could not load jobs.</span>';
  }
}

function closeLabelReprintModal() {
  document.getElementById('labelReprintModal').hidden = true;
  syncModalBodyLock();
}

async function _loadLabelReprintJob(po) {
  document.getElementById('labelReprintSummary').textContent = `Loading ${po}…`;
  document.getElementById('labelReprintJobStatus').hidden = true;
  try {
    const data = await api(`/api/label-reprint/job?po=${encodeURIComponent(po)}`);
    if (!data.ok) { document.getElementById('labelReprintSummary').textContent = data.error || 'Error loading job.'; return; }
    _labelReprintItems = data.items || [];
    _labelReprintFilter = 'all';
    _renderLabelReprintTable(data);
  } catch(e) {
    document.getElementById('labelReprintSummary').textContent = `Error: ${e.message}`;
  }
}

function _labelReprintVisible() {
  if (_labelReprintFilter === 'placeholder') return _labelReprintItems;
  if (_labelReprintFilter === 'insight') return _labelReprintItems.filter(i => i.has_insight_label);
  return _labelReprintItems;
}

function _renderLabelReprintTable(data) {
  const metrics = document.getElementById('labelReprintMetrics');
  metrics.innerHTML = [
    metricCard('Total', (data.in_cutting_count || 0) + (data.cutting_complete_count || 0), 'items in job'),
    metricCard('In Cutting', data.in_cutting_count || 0, 'still cutting'),
    metricCard('Complete', data.cutting_complete_count || 0, 'cutting complete'),
    metricCard('Insight Labels', (_labelReprintItems.filter(i => i.has_insight_label).length), 'triggered on submit'),
  ].join('');

  document.getElementById('labelReprintSummary').textContent =
    `${_labelReprintItems.length} items for PO ${escapeHtml(data.po_number)}`;
  document.getElementById('labelReprintJobStatus').hidden = false;

  _refreshLabelReprintTableBody();
}

function _refreshLabelReprintTableBody() {
  const tbody = document.getElementById('labelReprintTable');
  const visible = _labelReprintVisible();
  if (!visible.length) {
    tbody.innerHTML = '<tr><td class="empty-row" colspan="8">No items match the current filter.</td></tr>';
    _updateLabelReprintPrintBtn();
    return;
  }
  tbody.innerHTML = visible.map(item => {
    const statusClass = item.status === 'Cutting Complete' ? 'pill-resolved' : 'pill-reported';
    const insightHtml = item.has_insight_label
      ? `<span class="pill pill-resolved" title="Submitted ${escapeHtml(item.insight_completed_at || '')} by ${escapeHtml(item.insight_operator || '')}">Triggered</span>`
      : `<span class="pill pill-pending">Not yet</span>`;
    return `<tr>
      <td><input type="checkbox" class="label-reprint-chk" data-icn="${escapeHtml(item.icn_id)}"></td>
      <td><strong>${escapeHtml(item.item_number)}</strong></td>
      <td>${escapeHtml(item.cabinet_number || '—')}</td>
      <td class="muted-cell">${escapeHtml(item.description)}</td>
      <td class="muted-cell">${escapeHtml(item.icn_id)}</td>
      <td><span class="pill ${statusClass}">${escapeHtml(item.status)}</span></td>
      <td><span class="pill pill-placeholder" title="4×2 PDF — always available">4×2 PDF</span></td>
      <td>${insightHtml}</td>
    </tr>`;
  }).join('');

  tbody.querySelectorAll('.label-reprint-chk').forEach(chk => {
    chk.addEventListener('change', _updateLabelReprintPrintBtn);
  });
  _updateLabelReprintPrintBtn();
}

function _updateLabelReprintPrintBtn() {
  const checked = document.querySelectorAll('.label-reprint-chk:checked').length;
  const btn = document.getElementById('labelReprintPrintSelected');
  btn.disabled = checked === 0;
  btn.textContent = checked > 0 ? `Print selected (${checked})` : 'Print selected (0)';
}

function _setLabelReprintTab(filter) {
  _labelReprintFilter = filter;
  ['All', 'Placeholder', 'Insight'].forEach(name => {
    const id = `labelReprintTab${name}`;
    document.getElementById(id).classList.toggle('active', filter === name.toLowerCase().replace(' ', ''));
  });
  _refreshLabelReprintTableBody();
}

document.getElementById('labelReprintSearch').addEventListener('submit', (e) => {
  e.preventDefault();
  const po = document.getElementById('labelReprintPo').value.trim();
  if (po) _loadLabelReprintJob(po);
});

document.getElementById('labelReprintSelectAll').addEventListener('click', () => {
  document.querySelectorAll('.label-reprint-chk').forEach(c => { c.checked = true; });
  _updateLabelReprintPrintBtn();
});
document.getElementById('labelReprintClearAll').addEventListener('click', () => {
  document.querySelectorAll('.label-reprint-chk').forEach(c => { c.checked = false; });
  _updateLabelReprintPrintBtn();
});
document.getElementById('labelReprintCheckAll').addEventListener('change', (e) => {
  document.querySelectorAll('.label-reprint-chk').forEach(c => { c.checked = e.target.checked; });
  _updateLabelReprintPrintBtn();
});
document.getElementById('labelReprintTabAll').addEventListener('click', () => _setLabelReprintTab('all'));
document.getElementById('labelReprintTabPlaceholder').addEventListener('click', () => _setLabelReprintTab('placeholder'));
document.getElementById('labelReprintTabInsight').addEventListener('click', () => _setLabelReprintTab('insight'));

document.getElementById('labelReprintPrintSelected').addEventListener('click', async () => {
  const icnIds = [...document.querySelectorAll('.label-reprint-chk:checked')].map(c => c.dataset.icn);
  const po = document.getElementById('labelReprintPo').value.trim();
  const btn = document.getElementById('labelReprintPrintSelected');
  const printerName = _selectedCutZebra('labelReprintPrinter');
  if (!printerName) {
    alert('Connect and select Cut Zebra 1 or Cut Zebra 2.');
    return;
  }
  btn.disabled = true;
  btn.textContent = 'Printing…';
  try {
    const result = await api('/api/label-reprint/print', {
      method: 'POST',
      body: JSON.stringify({ po_number: po, icn_ids: icnIds, printer_name: printerName }),
    });
    if (!result.ok) { alert(result.error || 'Print failed.'); return; }
    alert(`${Number(result.job?.label_count) || icnIds.length} label(s) sent to ${result.job?.printer_name || printerName}.`);
    closeLabelReprintModal();
    await loadLabelPrintQueue();
  } catch(e) {
    alert(`Error: ${e.message}`);
  } finally {
    _updateLabelReprintPrintBtn();
  }
});

document.getElementById('labelReprintModal').addEventListener('click', (event) => {
  if (event.target.id === 'labelReprintModal') closeLabelReprintModal();
});
document.getElementById('closeLabelReprintModal').addEventListener('click', closeLabelReprintModal);

document.getElementById('supervisorLabelQueueJobs')?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-print-label-job]');
  if (!button) return;
  button.disabled = true;
  printQueuedLabels(button.dataset.printLabelJob)
    .catch((error) => alert(error.message || String(error)))
    .finally(() => { button.disabled = false; });
});

document.getElementById('supervisorLabelQueueJobs')?.addEventListener('change', (event) => {
  const pick = event.target.closest('[data-label-job-pick]');
  if (!pick) return;
  const id = String(pick.dataset.labelJobPick);
  if (pick.checked) _labelQueueSelection.add(id);
  else _labelQueueSelection.delete(id);
  pick.closest('.supervisor-label-job')?.classList.toggle('is-selected', pick.checked);
  syncLabelQueueSelectionUi();
});

document.getElementById('supervisorLabelSelectAll')?.addEventListener('change', (event) => {
  const jobs = _labelPrintQueueData?.jobs || [];
  if (event.target.checked) jobs.forEach((job) => _labelQueueSelection.add(String(job.id)));
  else _labelQueueSelection.clear();
  renderLabelPrintQueue(_labelPrintQueueData);
});

document.getElementById('supervisorPrintSelectedLabels')?.addEventListener('click', (event) => {
  const button = event.target;
  button.disabled = true;
  printSelectedLabelJobs()
    .catch((error) => setLabelQueueBulkState(error.message || String(error), true))
    .finally(() => syncLabelQueueSelectionUi());
});

document.getElementById('supervisorDeleteSelectedLabels')?.addEventListener('click', (event) => {
  const button = event.target;
  button.disabled = true;
  deleteSelectedLabelJobs()
    .catch((error) => setLabelQueueBulkState(error.message || String(error), true))
    .finally(() => syncLabelQueueSelectionUi());
});

document.getElementById('supervisorRetryLabelPrint')?.addEventListener('click', async () => {
  const printerName = _selectedCutZebra();
  if (!printerName) {
    alert('Connect and select Cut Zebra 1 or Cut Zebra 2.');
    return;
  }
  try {
    const result = await api('/api/label-print-queue/retry', {
      method: 'POST',
      body: JSON.stringify({ printer_name: printerName }),
    });
    if (!result.ok) throw new Error(result.error || result.job?.error || 'Retry failed.');
    await loadLabelPrintQueue();
  } catch (error) {
    alert(error.message || String(error));
  }
});

document.getElementById('supervisorReprintLabels')?.addEventListener('click', () => openLabelReprintModal());
document.getElementById('supervisorRefreshLabels')?.addEventListener('click', () => {
  loadLabelPrintQueue().catch((error) => alert(error.message || String(error)));
});

// ---- Non-cut push-outs + Reclaimed viewer (Tools) -----------------------

function _isoDaysAgo(days) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function _todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function _formatShortTs(value) {
  const text = String(value || '');
  if (!text) return '';
  // Prefer local-looking "YYYY-MM-DD HH:MM"
  if (text.length >= 16) return `${text.slice(0, 10)} ${text.slice(11, 16)}`;
  return text;
}

function _wireToolDetailChecks({ checkboxClass, checkAllId, selectAllId, clearAllId, countId, onChange }) {
  const update = () => {
    const boxes = document.querySelectorAll(`.${checkboxClass}`);
    const checked = document.querySelectorAll(`.${checkboxClass}:checked`).length;
    const countEl = document.getElementById(countId);
    if (countEl) countEl.textContent = `${checked} selected`;
    const checkAll = document.getElementById(checkAllId);
    if (checkAll) {
      checkAll.disabled = boxes.length === 0;
      checkAll.checked = boxes.length > 0 && checked === boxes.length;
    }
    const selectAll = document.getElementById(selectAllId);
    const clearAll = document.getElementById(clearAllId);
    if (selectAll) selectAll.disabled = boxes.length === 0;
    if (clearAll) clearAll.disabled = boxes.length === 0;
    if (typeof onChange === 'function') onChange(checked, boxes.length);
  };
  document.querySelectorAll(`.${checkboxClass}`).forEach((chk) => {
    chk.addEventListener('change', update);
  });
  update();
  return update;
}

let _nonCutSelectedPo = '';
let _nonCutRange = { from: '', to: '' };

function openNonCutPushoutsModal() {
  const fromEl = document.getElementById('nonCutPushoutsFrom');
  const toEl = document.getElementById('nonCutPushoutsTo');
  if (fromEl && !fromEl.value) fromEl.value = _isoDaysAgo(6);
  if (toEl && !toEl.value) toEl.value = _todayIso();
  document.getElementById('nonCutPushoutsModal').hidden = false;
  syncModalBodyLock();
  loadNonCutPushoutJobs({ refresh: true });
}

function closeNonCutPushoutsModal() {
  document.getElementById('nonCutPushoutsModal').hidden = true;
  syncModalBodyLock();
}

async function loadNonCutPushoutJobs({ refresh = false } = {}) {
  const from = document.getElementById('nonCutPushoutsFrom').value;
  const to = document.getElementById('nonCutPushoutsTo').value;
  _nonCutRange = { from, to };
  const jobsEl = document.getElementById('nonCutPushoutsJobs');
  const summary = document.getElementById('nonCutPushoutsSummary');
  jobsEl.innerHTML = '<p class="muted-text">Loading…</p>';
  _nonCutSelectedPo = '';
  _resetNonCutDetail('Select a job to see pieces.');
  try {
    const q = new URLSearchParams({ from, to, refresh: refresh ? '1' : '0' });
    const data = await api(`/api/non-cut-pushouts?${q}`);
    if (!data.ok) {
      summary.textContent = data.error || 'Could not load non-cut push-outs.';
      jobsEl.innerHTML = `<p class="muted-text">${escapeHtml(data.error || 'Error')}</p>`;
      return;
    }
    const cacheNote = data.cache?.error
      ? ` Scan cache: ${data.cache.error}`
      : (data.cache?.polled
        ? ` Cache +${data.cache.saved || 0} scan(s); ${data.cache.event_count || 0} total cached.`
        : '');
    summary.textContent = data.job_count
      ? `${data.job_count} job${data.job_count === 1 ? '' : 's'} · ${data.item_count} non-cut piece${data.item_count === 1 ? '' : 's'} (${data.day_start} → ${data.day_end}).${cacheNote}`
      : `No non-cut push-outs in ${data.day_start} → ${data.day_end}.${cacheNote}`;
    const jobs = data.jobs || [];
    if (!jobs.length) {
      jobsEl.innerHTML = '<p class="muted-text">No matching jobs.</p>';
      return;
    }
    jobsEl.innerHTML = jobs.map((job) => {
      const who = job.operators_label || (job.operators || []).join(', ') || '—';
      const range = job.first_at || job.last_at
        ? `${_formatShortTs(job.first_at)}${job.first_at !== job.last_at ? ` → ${_formatShortTs(job.last_at)}` : ''}`
        : '';
      return `<button type="button" class="pq-job-row" data-po="${escapeHtml(job.po_number)}">
        <div class="pq-job-po">${escapeHtml(job.po_number)}</div>
        <div class="pq-job-meta">${Number(job.count || 0)} piece${Number(job.count) === 1 ? '' : 's'} · ${escapeHtml(who)}${range ? ` · ${escapeHtml(range)}` : ''}</div>
      </button>`;
    }).join('');
    jobsEl.querySelectorAll('.pq-job-row').forEach((btn) => {
      btn.addEventListener('click', () => {
        jobsEl.querySelectorAll('.pq-job-row').forEach((el) => el.classList.remove('is-selected'));
        btn.classList.add('is-selected');
        loadNonCutPushoutJob(btn.dataset.po);
      });
    });
  } catch (e) {
    summary.textContent = `Error: ${e.message}`;
    jobsEl.innerHTML = `<p class="muted-text">${escapeHtml(e.message)}</p>`;
  }
}

function _resetNonCutDetail(message) {
  document.getElementById('nonCutPushoutsDetailLabel').textContent = 'Pieces';
  document.getElementById('nonCutPushoutsTable').innerHTML =
    `<tr><td class="empty-row" colspan="5">${escapeHtml(message)}</td></tr>`;
  document.getElementById('nonCutPushoutsSelectedCount').textContent = '0 selected';
  ['nonCutPushoutsSelectAll', 'nonCutPushoutsClearAll', 'nonCutPushoutsCheckAll'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) { el.disabled = true; if (el.type === 'checkbox') el.checked = false; }
  });
}

async function loadNonCutPushoutJob(po) {
  _nonCutSelectedPo = po || '';
  document.getElementById('nonCutPushoutsDetailLabel').textContent = po || 'Pieces';
  const tbody = document.getElementById('nonCutPushoutsTable');
  tbody.innerHTML = '<tr><td class="empty-row" colspan="5">Loading…</td></tr>';
  try {
    const q = new URLSearchParams({
      po,
      from: _nonCutRange.from || document.getElementById('nonCutPushoutsFrom').value,
      to: _nonCutRange.to || document.getElementById('nonCutPushoutsTo').value,
    });
    const data = await api(`/api/non-cut-pushouts/job?${q}`);
    if (!data.ok) {
      tbody.innerHTML = `<tr><td class="empty-row" colspan="5">${escapeHtml(data.error || 'Error')}</td></tr>`;
      return;
    }
    const items = data.items || [];
    if (!items.length) {
      tbody.innerHTML = '<tr><td class="empty-row" colspan="5">No pieces for this job in range.</td></tr>';
      _wireToolDetailChecks({
        checkboxClass: 'noncut-item-cb',
        checkAllId: 'nonCutPushoutsCheckAll',
        selectAllId: 'nonCutPushoutsSelectAll',
        clearAllId: 'nonCutPushoutsClearAll',
        countId: 'nonCutPushoutsSelectedCount',
      });
      return;
    }
    tbody.innerHTML = items.map((item) => `<tr>
      <td><input type="checkbox" class="noncut-item-cb" data-icn="${escapeHtml(item.icn_id || '')}" data-wsl="${escapeHtml(String(item.wsl_id || ''))}"></td>
      <td><strong>${escapeHtml(item.item_number || '—')}</strong></td>
      <td class="muted-cell">${escapeHtml(item.icn_id || '')}</td>
      <td>${escapeHtml(item.operator_short || item.operator || '')}</td>
      <td class="muted-cell">${escapeHtml(_formatShortTs(item.completed_at))}</td>
    </tr>`).join('');
    _wireToolDetailChecks({
      checkboxClass: 'noncut-item-cb',
      checkAllId: 'nonCutPushoutsCheckAll',
      selectAllId: 'nonCutPushoutsSelectAll',
      clearAllId: 'nonCutPushoutsClearAll',
      countId: 'nonCutPushoutsSelectedCount',
    });
  } catch (e) {
    tbody.innerHTML = `<tr><td class="empty-row" colspan="5">${escapeHtml(e.message)}</td></tr>`;
  }
}

document.getElementById('openNonCutPushoutsButton').addEventListener('click', () => openNonCutPushoutsModal());
document.getElementById('closeNonCutPushoutsModal').addEventListener('click', closeNonCutPushoutsModal);
document.getElementById('nonCutPushoutsModal').addEventListener('click', (event) => {
  if (event.target.id === 'nonCutPushoutsModal') closeNonCutPushoutsModal();
});
document.getElementById('nonCutPushoutsRange').addEventListener('submit', (e) => {
  e.preventDefault();
  loadNonCutPushoutJobs({ refresh: false });
});
document.getElementById('nonCutPushoutsRefresh').addEventListener('click', () => {
  loadNonCutPushoutJobs({ refresh: true });
});
document.getElementById('nonCutPushoutsSelectAll').addEventListener('click', () => {
  document.querySelectorAll('.noncut-item-cb').forEach((c) => { c.checked = true; });
  document.getElementById('nonCutPushoutsCheckAll').dispatchEvent(new Event('change'));
  _wireToolDetailChecks({
    checkboxClass: 'noncut-item-cb',
    checkAllId: 'nonCutPushoutsCheckAll',
    selectAllId: 'nonCutPushoutsSelectAll',
    clearAllId: 'nonCutPushoutsClearAll',
    countId: 'nonCutPushoutsSelectedCount',
  });
});
document.getElementById('nonCutPushoutsClearAll').addEventListener('click', () => {
  document.querySelectorAll('.noncut-item-cb').forEach((c) => { c.checked = false; });
  _wireToolDetailChecks({
    checkboxClass: 'noncut-item-cb',
    checkAllId: 'nonCutPushoutsCheckAll',
    selectAllId: 'nonCutPushoutsSelectAll',
    clearAllId: 'nonCutPushoutsClearAll',
    countId: 'nonCutPushoutsSelectedCount',
  });
});
document.getElementById('nonCutPushoutsCheckAll').addEventListener('change', (e) => {
  document.querySelectorAll('.noncut-item-cb').forEach((c) => { c.checked = e.target.checked; });
  _wireToolDetailChecks({
    checkboxClass: 'noncut-item-cb',
    checkAllId: 'nonCutPushoutsCheckAll',
    selectAllId: 'nonCutPushoutsSelectAll',
    clearAllId: 'nonCutPushoutsClearAll',
    countId: 'nonCutPushoutsSelectedCount',
  });
});

let _reclaimedSelectedPo = '';
let _reclaimedFloorEntries = [];
let _reclaimedFloorTimer = null;

function setReclaimedViewerTab(tab) {
  const floorSelected = tab !== 'allocations';
  document.getElementById('reclaimedFloorPanel').hidden = !floorSelected;
  document.getElementById('reclaimedAllocationsPanel').hidden = floorSelected;
  document.getElementById('refreshReclaimedFloorInventory').hidden = !floorSelected;
  const floorTab = document.getElementById('reclaimedFloorTab');
  const allocationsTab = document.getElementById('reclaimedAllocationsTab');
  floorTab.classList.toggle('is-active', floorSelected);
  floorTab.classList.toggle('secondary', !floorSelected);
  allocationsTab.classList.toggle('is-active', !floorSelected);
  allocationsTab.classList.toggle('secondary', floorSelected);
  floorTab.setAttribute('aria-selected', floorSelected ? 'true' : 'false');
  allocationsTab.setAttribute('aria-selected', floorSelected ? 'false' : 'true');
  document.getElementById('reclaimedViewerTitle').textContent = floorSelected
    ? 'Reclaimed floor inventory'
    : 'Reclaimed cabinet allocations';
  if (!floorSelected) loadReclaimedJobs();
}

function resetReclaimedFloorForm() {
  document.getElementById('reclaimedFloorForm').reset();
  document.getElementById('reclaimedFloorEntryId').value = '';
  document.getElementById('reclaimedFloorCancelEdit').hidden = true;
  document.querySelector('#reclaimedFloorForm button[type="submit"]').textContent = 'Add to floor inventory';
}

function editReclaimedFloorEntry(entryId) {
  const entry = _reclaimedFloorEntries.find((row) => row.id === entryId);
  if (!entry) return;
  document.getElementById('reclaimedFloorEntryId').value = entry.id || '';
  document.getElementById('reclaimedFloorPallet').value = entry.pallet || '';
  document.getElementById('reclaimedFloorJob').value = entry.job_name || '';
  document.getElementById('reclaimedFloorOrder').value = entry.order_number || '';
  document.getElementById('reclaimedFloorNotes').value = entry.notes || '';
  document.getElementById('reclaimedFloorCancelEdit').hidden = false;
  document.querySelector('#reclaimedFloorForm button[type="submit"]').textContent = 'Save floor entry';
  document.getElementById('reclaimedFloorPallet').focus();
}

function renderReclaimedFloorInventory(data) {
  const summary = document.getElementById('reclaimedFloorSummary');
  const tbody = document.getElementById('reclaimedFloorTable');
  if (!data.ok) {
    summary.textContent = data.error || 'Could not scan reclaimed floor inventory.';
    tbody.innerHTML = `<tr><td class="empty-row" colspan="6">${escapeHtml(data.error || 'Error')}</td></tr>`;
    return;
  }
  _reclaimedFloorEntries = data.entries || [];
  const counts = data.counts || {};
  const refreshed = data.snapshot_refreshed_at
    ? ` Insight snapshot ${data.snapshot_refreshed_at}.`
    : ' Insight snapshot date unavailable.';
  summary.textContent = `${Number(data.count || 0)} pallet entr${Number(data.count || 0) === 1 ? 'y' : 'ies'} Â· ${Number(counts.gone || 0)} orphan candidate${Number(counts.gone || 0) === 1 ? '' : 's'} Â· ${Number(counts.open || 0)} still open Â· ${Number(counts.review || 0)} review.${refreshed}`;
  const stale = data.snapshot_stale
    ? ' WARNING: the Insight snapshot is stale; refresh Insight before acting on orphan candidates.'
    : '';
  summary.textContent = `${Number(data.count || 0)} pallet entr${Number(data.count || 0) === 1 ? 'y' : 'ies'} | ${Number(counts.gone || 0)} orphan candidate${Number(counts.gone || 0) === 1 ? '' : 's'} | ${Number(counts.open || 0)} still open | ${Number(counts.review || 0)} review.${refreshed}${stale}`;
  if (!_reclaimedFloorEntries.length) {
    tbody.innerHTML = '<tr><td class="empty-row" colspan="6">No pallets inventoried. Add each reclaimed pallet above; every rescan checks it against Insight.</td></tr>';
    return;
  }
  tbody.innerHTML = _reclaimedFloorEntries.map((entry) => {
    const scan = entry.reconciliation || {};
    const pillClass = scan.state === 'gone' ? 'pill-success' : scan.state === 'open' ? 'pill-warning' : 'pill-placeholder';
    const statuses = (scan.statuses || []).join(', ');
    const evidence = statuses
      ? `${scan.reason || ''} ${statuses}`
      : (scan.reason || '');
    const label = entry.job_name || 'â€”';
    const notes = entry.notes ? `<div class="muted-cell">${escapeHtml(entry.notes)}</div>` : '';
    return `<tr>
      <td><span class="pill ${pillClass}">${escapeHtml(scan.label || 'Review')}</span></td>
      <td>${escapeHtml(entry.pallet || 'â€”')}</td>
      <td><strong>${escapeHtml(label)}</strong>${notes}</td>
      <td>${escapeHtml(entry.order_number || 'â€”')}</td>
      <td class="muted-cell">${escapeHtml(evidence)}</td>
      <td><div class="inline-actions reclaimed-floor-row-actions">
        <button class="button secondary reclaimed-floor-edit" type="button" data-id="${escapeHtml(entry.id)}">Edit</button>
        <button class="button secondary reclaimed-floor-clear" type="button" data-id="${escapeHtml(entry.id)}">Remove from floor</button>
      </div></td>
    </tr>`;
  }).join('');
  tbody.querySelectorAll('.reclaimed-floor-edit').forEach((button) => {
    button.addEventListener('click', () => editReclaimedFloorEntry(button.dataset.id));
  });
  tbody.querySelectorAll('.reclaimed-floor-clear').forEach((button) => {
    button.addEventListener('click', async () => {
      const entry = _reclaimedFloorEntries.find((row) => row.id === button.dataset.id);
      const label = entry?.pallet || entry?.job_name || entry?.order_number || 'this pallet';
      if (!confirm(`Remove ${label} from the current floor inventory?`)) return;
      try {
        const next = await api('/api/reclaimed-floor-inventory', {
          method: 'POST',
          body: JSON.stringify({ action: 'clear', id: button.dataset.id }),
        });
        renderReclaimedFloorInventory(next);
        resetReclaimedFloorForm();
      } catch (error) {
        summary.textContent = `Error: ${error.message}`;
      }
    });
  });
}

async function loadReclaimedFloorInventory() {
  const summary = document.getElementById('reclaimedFloorSummary');
  const tbody = document.getElementById('reclaimedFloorTable');
  summary.textContent = 'Scanning the current floor inventory against Insightâ€¦';
  tbody.innerHTML = '<tr><td class="empty-row" colspan="6">Scanningâ€¦</td></tr>';
  summary.textContent = 'Scanning the current floor inventory against Insight...';
  tbody.innerHTML = '<tr><td class="empty-row" colspan="6">Scanning...</td></tr>';
  try {
    renderReclaimedFloorInventory(await api('/api/reclaimed-floor-inventory'));
  } catch (error) {
    summary.textContent = `Error: ${error.message}`;
    tbody.innerHTML = `<tr><td class="empty-row" colspan="6">${escapeHtml(error.message)}</td></tr>`;
  }
}

async function loadReclaimedFloorMatchStatus() {
  const button = document.getElementById('printReclaimedFloorMatchList');
  const summary = document.getElementById('reclaimedFloorMatchSummary');
  if (!button || !summary) return;
  try {
    const data = await api('/api/reclaim-marry-up');
    const count = Number(data.floor_match_count || 0);
    button.disabled = count < 1;
    button.textContent = count
      ? `Open floor match PDF (${count})`
      : 'Open floor match PDF';
    summary.textContent = count
      ? `${count} job${count === 1 ? '' : 's'} with reclaimed cabinets already ${count === 1 ? 'has' : 'have'} a dedicated floor pallet.`
      : 'No reclaimed-allocation jobs currently have a dedicated job pallet marked on the floor.';
  } catch (error) {
    button.disabled = true;
    summary.textContent = error.message || 'Could not check the floor match list.';
  }
}

function openReclaimedViewerModal() {
  document.getElementById('reclaimedViewerModal').hidden = false;
  syncModalBodyLock();
  setReclaimedViewerTab('floor');
  loadReclaimedFloorInventory();
  loadReclaimedFloorMatchStatus();
  if (_reclaimedFloorTimer) clearInterval(_reclaimedFloorTimer);
  _reclaimedFloorTimer = setInterval(() => {
    if (!document.getElementById('reclaimedViewerModal').hidden) {
      loadReclaimedFloorInventory();
      loadReclaimedFloorMatchStatus();
    }
  }, 60000);
}

function closeReclaimedViewerModal() {
  document.getElementById('reclaimedViewerModal').hidden = true;
  if (_reclaimedFloorTimer) {
    clearInterval(_reclaimedFloorTimer);
    _reclaimedFloorTimer = null;
  }
  syncModalBodyLock();
}

function _resetReclaimedDetail(message) {
  document.getElementById('reclaimedViewerDetailLabel').textContent = 'Cabinets';
  document.getElementById('reclaimedViewerTable').innerHTML =
    `<tr><td class="empty-row" colspan="3">${escapeHtml(message)}</td></tr>`;
  document.getElementById('reclaimedViewerSelectedCount').textContent = '0 selected';
  ['reclaimedViewerSelectAll', 'reclaimedViewerClearAll', 'reclaimedViewerCheckAll'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) { el.disabled = true; if (el.type === 'checkbox') el.checked = false; }
  });
}

async function loadReclaimedJobs() {
  const jobsEl = document.getElementById('reclaimedViewerJobs');
  const summary = document.getElementById('reclaimedViewerSummary');
  jobsEl.innerHTML = '<p class="muted-text">Loading…</p>';
  _reclaimedSelectedPo = '';
  _resetReclaimedDetail('Select a job to see reclaimed cabinets.');
  try {
    const data = await api('/api/reclaimed-cabinets');
    if (!data.ok) {
      summary.textContent = data.error || 'Could not load reclaimed cabinets.';
      jobsEl.innerHTML = `<p class="muted-text">${escapeHtml(data.error || 'Error')}</p>`;
      return;
    }
    const generated = data.generated_at ? ` Updated ${escapeHtml(data.generated_at)}.` : '';
    summary.textContent = data.job_count
      ? `${data.job_count} job${data.job_count === 1 ? '' : 's'} · ${data.item_count} reclaimed item${data.item_count === 1 ? '' : 's'}.${generated}`
      : `No reclaimed cabinets on file.${generated}`;
    const jobs = data.jobs || [];
    if (!jobs.length) {
      jobsEl.innerHTML = '<p class="muted-text">No reclaimed jobs.</p>';
      return;
    }
    jobsEl.innerHTML = jobs.map((job) => {
      const sdd = job.sched_departure_date || '—';
      const fd = job.firm_date || '—';
      return `<button type="button" class="pq-job-row" data-po="${escapeHtml(job.po_number)}">
        <div class="pq-job-po">${escapeHtml(job.po_number)}</div>
        <div class="pq-job-meta">${Number(job.count || 0)} reclaimed · SDD ${escapeHtml(sdd)} · FD ${escapeHtml(fd)}</div>
      </button>`;
    }).join('');
    jobsEl.querySelectorAll('.pq-job-row').forEach((btn) => {
      btn.addEventListener('click', () => {
        jobsEl.querySelectorAll('.pq-job-row').forEach((el) => el.classList.remove('is-selected'));
        btn.classList.add('is-selected');
        loadReclaimedJob(btn.dataset.po);
      });
    });
  } catch (e) {
    summary.textContent = `Error: ${e.message}`;
    jobsEl.innerHTML = `<p class="muted-text">${escapeHtml(e.message)}</p>`;
  }
}

async function loadReclaimedJob(po) {
  _reclaimedSelectedPo = po || '';
  document.getElementById('reclaimedViewerDetailLabel').textContent = po || 'Cabinets';
  const tbody = document.getElementById('reclaimedViewerTable');
  tbody.innerHTML = '<tr><td class="empty-row" colspan="3">Loading…</td></tr>';
  try {
    const data = await api(`/api/reclaimed-cabinets/job?po=${encodeURIComponent(po)}`);
    if (!data.ok) {
      tbody.innerHTML = `<tr><td class="empty-row" colspan="3">${escapeHtml(data.error || 'Error')}</td></tr>`;
      return;
    }
    const items = data.items || [];
    if (!items.length) {
      tbody.innerHTML = '<tr><td class="empty-row" colspan="3">No reclaimed cabinets for this job.</td></tr>';
      _wireToolDetailChecks({
        checkboxClass: 'reclaimed-item-cb',
        checkAllId: 'reclaimedViewerCheckAll',
        selectAllId: 'reclaimedViewerSelectAll',
        clearAllId: 'reclaimedViewerClearAll',
        countId: 'reclaimedViewerSelectedCount',
      });
      return;
    }
    tbody.innerHTML = items.map((item) => `<tr>
      <td><input type="checkbox" class="reclaimed-item-cb" data-item="${escapeHtml(item.item_number || '')}" data-po="${escapeHtml(item.po_number || po)}"></td>
      <td><strong>${escapeHtml(item.item_number || '')}</strong></td>
      <td class="muted-cell">${escapeHtml(item.po_number || po)}</td>
    </tr>`).join('');
    _wireToolDetailChecks({
      checkboxClass: 'reclaimed-item-cb',
      checkAllId: 'reclaimedViewerCheckAll',
      selectAllId: 'reclaimedViewerSelectAll',
      clearAllId: 'reclaimedViewerClearAll',
      countId: 'reclaimedViewerSelectedCount',
    });
  } catch (e) {
    tbody.innerHTML = `<tr><td class="empty-row" colspan="3">${escapeHtml(e.message)}</td></tr>`;
  }
}

document.getElementById('openReclaimedViewerButton').addEventListener('click', () => openReclaimedViewerModal());
document.getElementById('closeReclaimedViewerModal').addEventListener('click', closeReclaimedViewerModal);
document.getElementById('reclaimedFloorTab').addEventListener('click', () => setReclaimedViewerTab('floor'));
document.getElementById('reclaimedAllocationsTab').addEventListener('click', () => setReclaimedViewerTab('allocations'));
document.getElementById('refreshReclaimedFloorInventory').addEventListener('click', () => {
  loadReclaimedFloorInventory();
  loadReclaimedFloorMatchStatus();
});
document.getElementById('printReclaimedFloorMatchList').addEventListener('click', async () => {
  const button = document.getElementById('printReclaimedFloorMatchList');
  const summary = document.getElementById('reclaimedFloorMatchSummary');
  button.disabled = true;
  summary.textContent = 'Building the floor match PDF...';
  try {
    const result = await api('/api/reclaim-marry-up/floor-pdf', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    summary.textContent = `Opened a print-friendly PDF for ${Number(result.count || 0)} floor job${Number(result.count || 0) === 1 ? '' : 's'}.`;
  } catch (error) {
    summary.textContent = error.message || 'Could not create the floor match PDF.';
  } finally {
    await loadReclaimedFloorMatchStatus();
  }
});
document.getElementById('reclaimedFloorCancelEdit').addEventListener('click', resetReclaimedFloorForm);
document.getElementById('reclaimedFloorForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const summary = document.getElementById('reclaimedFloorSummary');
  const payload = {
    action: 'upsert',
    id: document.getElementById('reclaimedFloorEntryId').value.trim(),
    pallet: document.getElementById('reclaimedFloorPallet').value.trim(),
    job_name: document.getElementById('reclaimedFloorJob').value.trim(),
    order_number: document.getElementById('reclaimedFloorOrder').value.trim(),
    notes: document.getElementById('reclaimedFloorNotes').value.trim(),
  };
  try {
    const data = await api('/api/reclaimed-floor-inventory', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    renderReclaimedFloorInventory(data);
    resetReclaimedFloorForm();
  } catch (error) {
    summary.textContent = `Error: ${error.message}`;
  }
});
document.getElementById('reclaimedViewerModal').addEventListener('click', (event) => {
  if (event.target.id === 'reclaimedViewerModal') closeReclaimedViewerModal();
});

// ---- Omni Cut Station Recuts (Tools) ------------------------------------

let _omniRecutsSnapshot = null;
let _omniRecutsSelectedKey = '';
let _omniRecutsSelectedItems = [];
let _omniRecutsSelectedJob = '';

function openOmniRecutsModal() {
  document.getElementById('omniRecutsModal').hidden = false;
  syncModalBodyLock();
  loadOmniRecuts();
}

function closeOmniRecutsModal() {
  document.getElementById('omniRecutsModal').hidden = true;
  syncModalBodyLock();
}

function _omniJobKey(day, job) {
  return `${String(day || '')}|${String(job || '')}`;
}

function _resetOmniRecutsDetail(message) {
  _omniRecutsSelectedItems = [];
  _omniRecutsSelectedJob = '';
  const rebatch = document.getElementById('omniRecutsPrepareRebatch');
  if (rebatch) rebatch.hidden = true;
  document.getElementById('omniRecutsDetailLabel').textContent = 'Recut items';
  document.getElementById('omniRecutsDetailMeta').textContent = '';
  document.getElementById('omniRecutsTable').innerHTML =
    `<tr><td class="empty-row" colspan="6">${escapeHtml(message)}</td></tr>`;
}

function _renderOmniRecutItems(items, label) {
  document.getElementById('omniRecutsDetailLabel').textContent = label || 'Recut items';
  document.getElementById('omniRecutsDetailMeta').textContent =
    items.length ? `${items.length} item${items.length === 1 ? '' : 's'}` : '';
  const tbody = document.getElementById('omniRecutsTable');
  if (!items.length) {
    tbody.innerHTML = '<tr><td class="empty-row" colspan="6">No submitted recuts for this job.</td></tr>';
    return;
  }
  tbody.innerHTML = items.map((item) => {
    const cabinet = item.cabinet_number == null || item.cabinet_number === ''
      ? '—'
      : String(item.cabinet_number);
    return `<tr>
      <td><strong>${escapeHtml(cabinet)}</strong></td>
      <td>${escapeHtml(item.part_name || '—')}</td>
      <td>${escapeHtml(item.type || '—')}</td>
      <td class="muted-cell">${escapeHtml(item.zone || '')}</td>
      <td>${escapeHtml(item.note || '')}</td>
      <td class="muted-cell">${escapeHtml(_formatShortTs(item.submitted_at))}</td>
    </tr>`;
  }).join('');
}

async function loadOmniRecuts() {
  const jobsEl = document.getElementById('omniRecutsJobs');
  const summary = document.getElementById('omniRecutsSummary');
  const hotEl = document.getElementById('omniRecutsHotZones');
  const daysEl = document.getElementById('omniRecutsDays');
  const days = Math.max(1, Math.min(31, Number(daysEl?.value || 7) || 7));
  if (daysEl) daysEl.value = String(days);
  jobsEl.innerHTML = '<p class="muted-text">Loading…</p>';
  _omniRecutsSelectedKey = '';
  _omniRecutsSnapshot = null;
  _resetOmniRecutsDetail('Select a job to see submitted recuts.');
  if (hotEl) hotEl.textContent = '';
  try {
    const data = await api(`/api/omni-recuts?days=${encodeURIComponent(days)}`);
    _omniRecutsSnapshot = data;
    if (!data.ok) {
      summary.textContent = data.error || 'Could not load Omni recuts.';
      jobsEl.innerHTML = `<p class="muted-text">${escapeHtml(data.error || 'Error')}</p>`;
      return;
    }
    const generated = data.generated_at ? ` Updated ${data.generated_at}.` : '';
    const scanned = (data.scanned_days || []).length
      ? ` Scanned ${(data.scanned_days || []).join(', ')}.`
      : '';
    summary.textContent = `${data.item_count || 0} recut item${Number(data.item_count) === 1 ? '' : 's'} · `
      + `${data.completed_count || 0} CNC-complete job${Number(data.completed_count) === 1 ? '' : 's'} · `
      + `${data.job_count || 0} status file${Number(data.job_count) === 1 ? '' : 's'} `
      + `(${data.days || days}-day window).${generated}${scanned}`;

    const hot = data.hot_zones || [];
    if (hotEl) {
      hotEl.textContent = hot.length
        ? `Hot zones: ${hot.slice(0, 4).map((z) => `${z.zone}×${z.count}`).join(' · ')}`
        : 'No zone clusters yet.';
    }

    const items = data.items || [];
    const jobsByKey = new Map();
    for (const job of data.jobs || []) {
      const key = _omniJobKey(job.day, job.job);
      jobsByKey.set(key, {
        day: job.day,
        job: job.job,
        completed: Boolean(job.operator_completed_at),
        completed_at: job.operator_completed_at || '',
        ran_count: Number(job.ran_count || 0),
        tap_count: Number(job.tap_count || 0),
        recut_count: 0,
        items: [],
      });
    }
    for (const item of items) {
      const key = _omniJobKey(item.day, item.job);
      if (!jobsByKey.has(key)) {
        jobsByKey.set(key, {
          day: item.day,
          job: item.job,
          completed: false,
          completed_at: '',
          ran_count: 0,
          tap_count: 0,
          recut_count: 0,
          items: [],
        });
      }
      const row = jobsByKey.get(key);
      row.items.push(item);
      row.recut_count += 1;
    }

    const jobs = Array.from(jobsByKey.values()).sort((a, b) => {
      if (b.recut_count !== a.recut_count) return b.recut_count - a.recut_count;
      return String(b.day).localeCompare(String(a.day)) || String(a.job).localeCompare(String(b.job));
    });

    if (!jobs.length) {
      jobsEl.innerHTML = '<p class="muted-text">No Omni status or recut files in this window.</p>';
      return;
    }

    jobsEl.innerHTML = jobs.map((job) => {
      const key = _omniJobKey(job.day, job.job);
      const bits = [];
      if (job.recut_count) bits.push(`${job.recut_count} recut${job.recut_count === 1 ? '' : 's'}`);
      if (job.completed) bits.push('CNC complete');
      else if (job.ran_count || job.tap_count) {
        bits.push(`${job.ran_count}/${job.tap_count || '?'} ran`);
      }
      if (!bits.length) bits.push('status on file');
      return `<button type="button" class="pq-job-row" data-key="${escapeHtml(key)}">
        <div class="pq-job-po">${escapeHtml(job.job || '—')}</div>
        <div class="pq-job-meta">${escapeHtml(job.day || '')} · ${escapeHtml(bits.join(' · '))}</div>
      </button>`;
    }).join('');

    jobsEl.querySelectorAll('.pq-job-row').forEach((btn) => {
      btn.addEventListener('click', () => {
        jobsEl.querySelectorAll('.pq-job-row').forEach((el) => el.classList.remove('is-selected'));
        btn.classList.add('is-selected');
        showOmniRecutsJob(btn.dataset.key);
      });
    });
  } catch (e) {
    summary.textContent = `Error: ${e.message}`;
    jobsEl.innerHTML = `<p class="muted-text">${escapeHtml(e.message)}</p>`;
  }
}

function showOmniRecutsJob(key) {
  _omniRecutsSelectedKey = key || '';
  const data = _omniRecutsSnapshot;
  if (!data || !data.ok) {
    _resetOmniRecutsDetail('Could not load Omni recuts.');
    return;
  }
  const [day, ...jobParts] = String(key || '').split('|');
  const job = jobParts.join('|');
  const items = (data.items || []).filter(
    (item) => String(item.day || '') === day && String(item.job || '') === job,
  );
  const status = (data.jobs || []).find(
    (row) => String(row.day || '') === day && String(row.job || '') === job,
  );
  const label = job ? `${job} · ${day}` : 'Recut items';
  _omniRecutsSelectedItems = items;
  _omniRecutsSelectedJob = job;
  const rebatch = document.getElementById('omniRecutsPrepareRebatch');
  if (rebatch) rebatch.hidden = !job || !items.length;
  _renderOmniRecutItems(items, label);
  if (status?.operator_completed_at) {
    document.getElementById('omniRecutsDetailMeta').textContent =
      `${items.length} recut${items.length === 1 ? '' : 's'} · CNC complete ${_formatShortTs(status.operator_completed_at)}`;
  }
}

let _previewCheckDays = [];
let _previewCheckDay = '';
let _previewCheckJob = '';

function openPreviewCheckModal() {
  document.getElementById('previewCheckModal').hidden = false;
  syncModalBodyLock();
  loadPreviewCheckDays();
}

function closePreviewCheckModal() {
  document.getElementById('previewCheckModal').hidden = true;
  syncModalBodyLock();
}

function _previewCheckDayIndex() {
  return _previewCheckDays.indexOf(_previewCheckDay);
}

async function loadPreviewCheckDays() {
  const summary = document.getElementById('previewCheckSummary');
  const select = document.getElementById('previewCheckJob');
  if (summary) summary.textContent = 'Loading day folders…';
  try {
    const params = new URLSearchParams();
    if (_previewCheckDay) params.set('day', _previewCheckDay);
    const data = await api(`/api/preview-check?${params.toString()}`);
    if (!data.ok && data.error) throw new Error(data.error);
    _previewCheckDays = data.days || [];
    _previewCheckDay = data.day || _previewCheckDay;
    const label = document.getElementById('previewCheckDayLabel');
    if (label) label.textContent = _previewCheckDay || '—';
    const jobs = data.jobs || [];
    if (select) {
      const previous = _previewCheckJob;
      select.innerHTML = '<option value="">Choose a job…</option>' + jobs.map((job) => {
        const name = String(job.name || '');
        const marks = [
          job.has_paperwork ? 'paperwork' : '',
          job.has_previews ? 'previews' : '',
        ].filter(Boolean).join(', ');
        return `<option value="${escapeHtml(name)}">${escapeHtml(name)}${marks ? ` (${marks})` : ''}</option>`;
      }).join('');
      if (previous && jobs.some((job) => job.name === previous)) {
        select.value = previous;
      } else {
        _previewCheckJob = '';
      }
    }
    const index = _previewCheckDayIndex();
    const prev = document.getElementById('previewCheckPrevDay');
    const next = document.getElementById('previewCheckNextDay');
    if (prev) prev.disabled = index < 0 || index >= _previewCheckDays.length - 1;
    if (next) next.disabled = index <= 0;
    if (summary) {
      summary.textContent = jobs.length
        ? `${jobs.length} job${jobs.length === 1 ? '' : 's'} on ${_previewCheckDay}. Choose one to scan TAP previews.`
        : `No job folders on ${_previewCheckDay}.`;
    }
    if (_previewCheckJob) {
      await loadPreviewCheckJob();
    } else {
      const body = document.getElementById('previewCheckBody');
      if (body) body.innerHTML = '<p class="muted-text">Pick a job to scan previews.</p>';
    }
  } catch (error) {
    if (summary) summary.textContent = error.message || 'Could not load Preview Check.';
  }
}

function shiftPreviewCheckDay(step) {
  const index = _previewCheckDayIndex();
  if (index < 0) return;
  const next = _previewCheckDays[index - step];
  if (!next) return;
  _previewCheckDay = next;
  _previewCheckJob = '';
  loadPreviewCheckDays();
}

function renderPreviewCheckCabinets(data) {
  const body = document.getElementById('previewCheckBody');
  const summary = document.getElementById('previewCheckSummary');
  if (!body) return;
  const cabinets = data.cabinets || [];
  if (!cabinets.length) {
    body.innerHTML = '<p class="muted-text">No cabinets on the paperwork list or TAP previews for this job.</p>';
    if (summary) summary.textContent = `${data.job || 'Job'} · nothing to compare.`;
    return;
  }
  if (summary) {
    summary.textContent = `${data.job} · ${data.found_total}/${data.expected_total} parts on TAP · ${data.complete_cabinets}/${data.cabinet_count} cabinets complete`;
  }
  body.innerHTML = cabinets.map((cab) => {
    const item = cab.item_number ? ` · ${escapeHtml(cab.item_number)}` : '';
    const desc = cab.description && cab.description !== cab.item_number
      ? ` <span class="muted-text">${escapeHtml(cab.description)}</span>`
      : '';
    const countClass = cab.ok ? 'is-ok' : 'is-missing';
    const badges = (cab.badges || []).map((badge) => {
      const lit = badge.found ? ' is-found' : '';
      return `<span class="preview-check-badge${lit}" title="${escapeHtml(badge.part_name || badge.label)}">${escapeHtml(badge.label)}</span>`;
    }).join('');
    return `<article class="preview-check-cabinet">
      <div class="preview-check-cabinet-head">
        <div class="preview-check-cabinet-title">Cab ${Number(cab.cabinet_number) || '?'} ${item}${desc}</div>
        <div class="preview-check-count ${countClass}">${Number(cab.found) || 0}/${Number(cab.expected) || 0}</div>
      </div>
      <div class="preview-check-badges">${badges || '<span class="muted-text">No TAP parts listed</span>'}</div>
    </article>`;
  }).join('');
}

async function loadPreviewCheckJob() {
  const job = String(document.getElementById('previewCheckJob')?.value || '').trim();
  _previewCheckJob = job;
  const body = document.getElementById('previewCheckBody');
  const summary = document.getElementById('previewCheckSummary');
  if (!job) {
    if (body) body.innerHTML = '<p class="muted-text">Pick a job to scan previews.</p>';
    return;
  }
  if (body) body.innerHTML = '<p class="muted-text">Scanning previews…</p>';
  try {
    const params = new URLSearchParams({ day: _previewCheckDay, job });
    const data = await api(`/api/preview-check?${params.toString()}`);
    if (!data.ok) throw new Error(data.error || 'Scan failed');
    renderPreviewCheckCabinets(data);
  } catch (error) {
    if (body) body.innerHTML = `<p class="muted-text">${escapeHtml(error.message || 'Scan failed')}</p>`;
    if (summary) summary.textContent = error.message || 'Scan failed';
  }
}

document.getElementById('openPreviewCheckButton')?.addEventListener('click', () => openPreviewCheckModal());
document.getElementById('openPreviewCheckButtonRef')?.addEventListener('click', () => openPreviewCheckModal());
document.getElementById('closePreviewCheckModal')?.addEventListener('click', () => closePreviewCheckModal());
document.getElementById('previewCheckModal')?.addEventListener('click', (event) => {
  if (event.target.id === 'previewCheckModal') closePreviewCheckModal();
});
document.getElementById('previewCheckPrevDay')?.addEventListener('click', () => shiftPreviewCheckDay(-1));
document.getElementById('previewCheckNextDay')?.addEventListener('click', () => shiftPreviewCheckDay(1));
document.getElementById('previewCheckJob')?.addEventListener('change', () => loadPreviewCheckJob());
document.getElementById('previewCheckRefresh')?.addEventListener('click', () => {
  if (_previewCheckJob) loadPreviewCheckJob();
  else loadPreviewCheckDays();
});

document.getElementById('openOmniRecutsButton').addEventListener('click', () => openOmniRecutsModal());
document.getElementById('closeOmniRecutsModal').addEventListener('click', closeOmniRecutsModal);
document.getElementById('omniRecutsModal').addEventListener('click', (event) => {
  if (event.target.id === 'omniRecutsModal') closeOmniRecutsModal();
});
document.getElementById('omniRecutsRange').addEventListener('submit', (e) => {
  e.preventDefault();
  loadOmniRecuts();
});
document.getElementById('omniRecutsPrepareRebatch')?.addEventListener('click', () => {
  prepareRebatchFromRecuts(_omniRecutsSelectedJob, _omniRecutsSelectedItems);
});
document.getElementById('reclaimedViewerSelectAll').addEventListener('click', () => {
  document.querySelectorAll('.reclaimed-item-cb').forEach((c) => { c.checked = true; });
  _wireToolDetailChecks({
    checkboxClass: 'reclaimed-item-cb',
    checkAllId: 'reclaimedViewerCheckAll',
    selectAllId: 'reclaimedViewerSelectAll',
    clearAllId: 'reclaimedViewerClearAll',
    countId: 'reclaimedViewerSelectedCount',
  });
});
document.getElementById('reclaimedViewerClearAll').addEventListener('click', () => {
  document.querySelectorAll('.reclaimed-item-cb').forEach((c) => { c.checked = false; });
  _wireToolDetailChecks({
    checkboxClass: 'reclaimed-item-cb',
    checkAllId: 'reclaimedViewerCheckAll',
    selectAllId: 'reclaimedViewerSelectAll',
    clearAllId: 'reclaimedViewerClearAll',
    countId: 'reclaimedViewerSelectedCount',
  });
});
document.getElementById('reclaimedViewerCheckAll').addEventListener('change', (e) => {
  document.querySelectorAll('.reclaimed-item-cb').forEach((c) => { c.checked = e.target.checked; });
  _wireToolDetailChecks({
    checkboxClass: 'reclaimed-item-cb',
    checkAllId: 'reclaimedViewerCheckAll',
    selectAllId: 'reclaimedViewerSelectAll',
    clearAllId: 'reclaimedViewerClearAll',
    countId: 'reclaimedViewerSelectedCount',
  });
});

let _missingMdbSelectedJob = '';

function openMissingMdbItemsModal() {
  document.getElementById('missingMdbItemsModal').hidden = false;
  syncModalBodyLock();
  loadMissingMdbJobs();
}

function closeMissingMdbItemsModal() {
  document.getElementById('missingMdbItemsModal').hidden = true;
  syncModalBodyLock();
}

function _resetMissingMdbDetail(message) {
  document.getElementById('missingMdbItemsDetailLabel').textContent = 'Cabinets';
  document.getElementById('missingMdbItemsTable').innerHTML =
    `<tr><td class="empty-row" colspan="5">${escapeHtml(message)}</td></tr>`;
  document.getElementById('missingMdbItemsSelectedCount').textContent = '0 selected';
  ['missingMdbItemsSelectAll', 'missingMdbItemsClearAll', 'missingMdbItemsCheckAll'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) { el.disabled = true; if (el.type === 'checkbox') el.checked = false; }
  });
}

async function loadMissingMdbJobs() {
  const jobsEl = document.getElementById('missingMdbItemsJobs');
  const summary = document.getElementById('missingMdbItemsSummary');
  jobsEl.innerHTML = '<p class="muted-text">Loading…</p>';
  _missingMdbSelectedJob = '';
  _resetMissingMdbDetail('Select a job to see missing items.');
  try {
    const data = await api('/api/missing-mdb-items');
    if (!data.ok) {
      summary.textContent = data.error || 'Could not load missing MDB items.';
      jobsEl.innerHTML = `<p class="muted-text">${escapeHtml(data.error || 'Error')}</p>`;
      return;
    }
    summary.textContent = data.job_count
      ? `${data.job_count} job${data.job_count === 1 ? '' : 's'} · ${data.item_count} missing item${data.item_count === 1 ? '' : 's'}.`
      : 'No missing MDB items on file.';
    const jobs = data.jobs || [];
    if (!jobs.length) {
      jobsEl.innerHTML = '<p class="muted-text">No jobs with missing items.</p>';
      return;
    }
    jobsEl.innerHTML = jobs.map((job) => {
      const when = job.last_at ? _formatShortTs(job.last_at) : '';
      const reasons = (job.reasons || []).slice(0, 2).join(', ') || '—';
      return `<button type="button" class="pq-job-row" data-job="${escapeHtml(job.job_name || job.po_number || '')}">
        <div class="pq-job-po">${escapeHtml(job.job_name || job.po_number || '')}</div>
        <div class="pq-job-meta">${Number(job.count || 0)} missing · ${escapeHtml(reasons)}${when ? ` · ${escapeHtml(when)}` : ''}</div>
      </button>`;
    }).join('');
    jobsEl.querySelectorAll('.pq-job-row').forEach((btn) => {
      btn.addEventListener('click', () => {
        jobsEl.querySelectorAll('.pq-job-row').forEach((el) => el.classList.remove('is-selected'));
        btn.classList.add('is-selected');
        loadMissingMdbJob(btn.dataset.job);
      });
    });
  } catch (e) {
    summary.textContent = `Error: ${e.message}`;
    jobsEl.innerHTML = `<p class="muted-text">${escapeHtml(e.message)}</p>`;
  }
}

async function loadMissingMdbJob(job) {
  _missingMdbSelectedJob = job || '';
  document.getElementById('missingMdbItemsDetailLabel').textContent = job || 'Cabinets';
  const tbody = document.getElementById('missingMdbItemsTable');
  tbody.innerHTML = '<tr><td class="empty-row" colspan="5">Loading…</td></tr>';
  try {
    const data = await api(`/api/missing-mdb-items/job?job=${encodeURIComponent(job)}`);
    if (!data.ok) {
      tbody.innerHTML = `<tr><td class="empty-row" colspan="5">${escapeHtml(data.error || 'Error')}</td></tr>`;
      return;
    }
    const items = data.items || [];
    if (!items.length) {
      tbody.innerHTML = '<tr><td class="empty-row" colspan="5">No missing items for this job.</td></tr>';
      _wireToolDetailChecks({
        checkboxClass: 'missing-mdb-item-cb',
        checkAllId: 'missingMdbItemsCheckAll',
        selectAllId: 'missingMdbItemsSelectAll',
        clearAllId: 'missingMdbItemsClearAll',
        countId: 'missingMdbItemsSelectedCount',
      });
      return;
    }
    tbody.innerHTML = items.map((item) => {
      const cab = item.cabinet_number != null && item.cabinet_number !== '' ? String(item.cabinet_number) : '—';
      return `<tr>
      <td><input type="checkbox" class="missing-mdb-item-cb" data-id="${escapeHtml(item.id || item.selected_key || '')}" data-item="${escapeHtml(item.item_number || '')}"></td>
      <td><strong>${escapeHtml(item.item_number || '')}</strong>${item.product ? `<div class="muted-text">${escapeHtml(item.product)}</div>` : ''}</td>
      <td class="muted-cell">${escapeHtml(cab)}</td>
      <td>${escapeHtml(item.reason || '')}</td>
      <td class="muted-cell">${escapeHtml(_formatShortTs(item.timestamp))}</td>
    </tr>`;
    }).join('');
    _wireToolDetailChecks({
      checkboxClass: 'missing-mdb-item-cb',
      checkAllId: 'missingMdbItemsCheckAll',
      selectAllId: 'missingMdbItemsSelectAll',
      clearAllId: 'missingMdbItemsClearAll',
      countId: 'missingMdbItemsSelectedCount',
    });
  } catch (e) {
    tbody.innerHTML = `<tr><td class="empty-row" colspan="5">${escapeHtml(e.message)}</td></tr>`;
  }
}

document.getElementById('openMissingMdbItemsButton').addEventListener('click', () => openMissingMdbItemsModal());
document.getElementById('closeMissingMdbItemsModal').addEventListener('click', closeMissingMdbItemsModal);
document.getElementById('missingMdbItemsModal').addEventListener('click', (event) => {
  if (event.target.id === 'missingMdbItemsModal') closeMissingMdbItemsModal();
});
document.getElementById('missingMdbItemsSelectAll').addEventListener('click', () => {
  document.querySelectorAll('.missing-mdb-item-cb').forEach((c) => { c.checked = true; });
  _wireToolDetailChecks({
    checkboxClass: 'missing-mdb-item-cb',
    checkAllId: 'missingMdbItemsCheckAll',
    selectAllId: 'missingMdbItemsSelectAll',
    clearAllId: 'missingMdbItemsClearAll',
    countId: 'missingMdbItemsSelectedCount',
  });
});
document.getElementById('missingMdbItemsClearAll').addEventListener('click', () => {
  document.querySelectorAll('.missing-mdb-item-cb').forEach((c) => { c.checked = false; });
  _wireToolDetailChecks({
    checkboxClass: 'missing-mdb-item-cb',
    checkAllId: 'missingMdbItemsCheckAll',
    selectAllId: 'missingMdbItemsSelectAll',
    clearAllId: 'missingMdbItemsClearAll',
    countId: 'missingMdbItemsSelectedCount',
  });
});
document.getElementById('missingMdbItemsCheckAll').addEventListener('change', (e) => {
  document.querySelectorAll('.missing-mdb-item-cb').forEach((c) => { c.checked = e.target.checked; });
  _wireToolDetailChecks({
    checkboxClass: 'missing-mdb-item-cb',
    checkAllId: 'missingMdbItemsCheckAll',
    selectAllId: 'missingMdbItemsSelectAll',
    clearAllId: 'missingMdbItemsClearAll',
    countId: 'missingMdbItemsSelectedCount',
  });
});

document.getElementById('completedTodayModal').addEventListener('click', (event) => {
  if (event.target.id === 'completedTodayModal') {
    closeCompletedTodayModal();
  }
});

document.getElementById('aheadGoalModal').addEventListener('click', (event) => {
  if (event.target.id === 'aheadGoalModal') {
    closeAheadGoalModal();
  }
});

document.getElementById('manualAddedModal').addEventListener('click', (event) => {
  if (event.target.id === 'manualAddedModal') {
    closeManualAddedModal();
  }
});

document.getElementById('snapshotHistoryModal').addEventListener('click', (event) => {
  if (event.target.id === 'snapshotHistoryModal') {
    closeSnapshotHistoryModal();
  }
});

document.getElementById('machineIssuesModal').addEventListener('click', (event) => {
  if (event.target.id === 'machineIssuesModal') {
    closeMachineIssuesModal();
  }
});

document.getElementById('trainingMatrixModal').addEventListener('click', (event) => {
  if (event.target.id === 'trainingMatrixModal') {
    closeTrainingMatrixModal();
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (!document.getElementById('morningPlanModal')?.hidden) {
    closeMorningPlanModal();
    return;
  }
  if (!document.getElementById('trimChecklistPreviewModal')?.hidden) {
    closeTrimChecklistPreviewModal();
    return;
  }
  if (!document.getElementById('cabinetWelcomeGuideModal')?.hidden) {
    closeCabinetWelcomeGuideModal();
    return;
  }
  if (!document.getElementById('itemLookupModal').hidden) {
    closeItemLookupModal();
    return;
  }
  if (!document.getElementById('trainingMatrixModal').hidden) {
    closeTrainingMatrixModal();
    return;
  }
  if (!document.getElementById('machineIssuesModal').hidden) {
    closeMachineIssuesModal();
    return;
  }
  if (!document.getElementById('paletteLabelsModal').hidden) {
    closePaletteLabelsModal();
    return;
  }
  if (!document.getElementById('labelReprintModal').hidden) {
    closeLabelReprintModal();
    return;
  }
  if (!document.getElementById('nonCutPushoutsModal')?.hidden) {
    closeNonCutPushoutsModal();
    return;
  }
  if (!document.getElementById('reclaimedViewerModal')?.hidden) {
    closeReclaimedViewerModal();
    return;
  }
  if (!document.getElementById('omniRecutsModal')?.hidden) {
    closeOmniRecutsModal();
    return;
  }
  if (!document.getElementById('missingMdbItemsModal')?.hidden) {
    closeMissingMdbItemsModal();
    return;
  }
  if (!document.getElementById('completedTodayModal').hidden) {
    closeCompletedTodayModal();
    return;
  }
  if (!document.getElementById('aheadGoalModal').hidden) {
    closeAheadGoalModal();
    return;
  }
  if (!document.getElementById('manualAddedModal').hidden) {
    closeManualAddedModal();
    return;
  }
  if (!document.getElementById('walkupRequestModal').hidden) {
    closeWalkupRequestModal();
    return;
  }
  if (!document.getElementById('snapshotHistoryModal').hidden) {
    closeSnapshotHistoryModal();
    return;
  }
  if (!document.getElementById('pqFloorAddModal').hidden) {
    closePqFloorAddModal();
    return;
  }
  if (!document.getElementById('pqJobCardModal')?.hidden) {
    closePqJobCardModal();
    return;
  }
  if (!document.getElementById('pqWizardModal').hidden) {
    closePqWizard();
    return;
  }
});

if (document.getElementById('generateOperatorPackets')) {
  document.getElementById('generateOperatorPackets').addEventListener('click', async () => {
    const firmDate = document.getElementById('operatorFirmDate').value;
    const checked = Array.from(document.querySelectorAll('.operator-po-checkbox:checked')).map((node) => node.dataset.po);
    if (!firmDate) {
      alert('Select a date first.');
      return;
    }
    if (!checked.length) {
      alert('Select at least one PO first.');
      return;
    }
    generatePaperworkBatch(firmDate, checked).catch((error) => alert(error.message));
  });
}

const savedOperatorDateBasis = localStorage.getItem(OPERATOR_DATE_BASIS_KEY);
if (savedOperatorDateBasis) {
  const basisSelect = document.getElementById('operatorDateBasis');
  if (basisSelect) basisSelect.value = savedOperatorDateBasis;
}

const savedNewHireTaskCollapsed = localStorage.getItem(NEW_HIRE_TASK_COLLAPSED_KEY);

document.getElementById('machineIssueDate').value = new Date().toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// Unified Production Queue
// ---------------------------------------------------------------------------
const PQ_DATE_BASIS_KEY = 'cutHealthPqDateBasis';
const PQ_SHOW_COMPLETED_KEY = 'cutHealthPqShowCompleted';
const PQ_FLOOR_MODE_KEY = 'cutHealthPqFloorMode';
// Superseded by PQ_FLOOR_MODE_KEY; still read once so a saved preference survives.
const PQ_SHOW_FLOOR_KEY = 'cutHealthPqShowFloor';
const PQ_FLOOR_ONLY_KEY = 'cutHealthPqFloorOnly';
let _pqData = null;
let _pqWizardJobs = null;
let _pqWizardStep = 'review';
let _pqPartsExpanded = false;
let _pqLastOutputDir = '';
let _pqDimensionEdits = new Map();
let _pqSelectedCabKeys = new Set();
let _pqDimensionEditOrigin = 'review';
let _pqRecalcTimer = null;
let _pqWizardDestination = 'generate'; // 'generate' | 'staging'
let _pqReviewSummaryText = '';
let _pqStagingGroups = []; // [{name, selections, status, outputDir, error}]
let _pqStagingRunning = false;

function pqCabKey(po, item) {
  return `${po}|${item}`;
}

function setPqWizardStep(step) {
  _pqWizardStep = step;
  document.getElementById('pqWizardActionsReview').hidden = step !== 'review';
  document.getElementById('pqWizardActionsNotes').hidden = step !== 'notes_gate';
  document.getElementById('pqWizardActionsEdit').hidden = step !== 'dimension_edit';
  document.getElementById('pqWizardActionsStaging').hidden = step !== 'staging';
  document.getElementById('pqWizardToolbarReview').hidden = step !== 'review';
  document.getElementById('pqWizardToolbarEdit').hidden = step !== 'dimension_edit';
  document.getElementById('pqWizardToolbarStaging').hidden = step !== 'staging';
  const staged = _pqWizardDestination === 'staging';
  document.getElementById('pqWizardGenerate').textContent = staged ? 'Continue to staging' : 'Generate files';
  const titles = {
    review: 'Review cabinets',
    notes_gate: 'Cabinets with notes',
    dimension_edit: 'Edit dimensions',
    staging: 'Review staging',
  };
  document.getElementById('pqWizardTitle').textContent = titles[step] || 'Review & generate';
}

function captureSelectedPqCabKeys() {
  const keys = new Set();
  for (const job of _pqWizardJobs || []) {
    for (const cab of job.cabinets) {
      const cb = document.querySelector(`.pq-cab-cb[data-item="${CSS.escape(cab.item_number)}"][data-po="${CSS.escape(job.po_number)}"]`);
      if (cb && !cb.checked) continue;
      keys.add(pqCabKey(job.po_number, cab.item_number));
    }
  }
  _pqSelectedCabKeys = keys;
}

function isPqCabSelected(po, item) {
  if (_pqWizardStep === 'review') {
    const cb = document.querySelector(`.pq-cab-cb[data-item="${CSS.escape(item)}"][data-po="${CSS.escape(po)}"]`);
    return !cb || cb.checked;
  }
  return _pqSelectedCabKeys.has(pqCabKey(po, item));
}

function getSelectedPqCabinets() {
  const results = [];
  for (const job of _pqWizardJobs || []) {
    for (const cab of job.cabinets) {
      if (!isPqCabSelected(job.po_number, cab.item_number)) continue;
      results.push({ job, cab });
    }
  }
  return results;
}

function getNotedSelectedCabinets() {
  return getSelectedPqCabinets().filter(({ cab }) => cab.has_notes);
}

function formatPqDimension(value) {
  if (value == null || value === '') return '?';
  const number = Number(value);
  return Number.isFinite(number) ? String(number) : String(value);
}

function pqReviewDimensionDisplay(job, cab, axis) {
  const edit = _pqDimensionEdits.get(pqCabKey(job.po_number, cab.item_number));
  const base = cab[axis];
  const value = edit?.[axis] ?? base;
  const customized = edit && edit[axis] != null && Number(edit[axis]) !== Number(base);
  return `<span class="${customized ? 'pq-dim-customized' : ''}">${formatPqDimension(value)}</span>`;
}

function findPqCabinet(po, item) {
  for (const job of _pqWizardJobs || []) {
    if (job.po_number !== po) continue;
    const cab = (job.cabinets || []).find((entry) => entry.item_number === item);
    if (cab) return { job, cab };
  }
  return null;
}

function wirePqReviewDimensionButtons(container) {
  container.querySelectorAll('.pq-dim-adjust-btn').forEach((button) => {
    button.addEventListener('click', () => {
      const match = findPqCabinet(button.dataset.po, button.dataset.item);
      if (!match) return;
      captureSelectedPqCabKeys();
      openPqDimensionEdit([match], false, 'review').catch((error) => alert(error.message));
    });
  });
}

function getPqDateBasis() {
  const el = document.getElementById('pqDateBasis');
  return el ? el.value : 'firm_date';
}

function pqDateBasisShortLabel(basis) {
  return basis === 'scheduled_departure' ? 'Sched' : 'Firm';
}

function pqJobDateMeta(job, groupDate = '') {
  const basis = getPqDateBasis();
  const sched = job.sched_departure_date || '';
  const firm = job.job_firm_date || '';
  const group = groupDate || job.firm_date || '';
  if (basis === 'scheduled_departure') {
    const primary = sched || group;
    const parts = [];
    if (primary) parts.push(`Sched ${primary}`);
    if (firm && firm !== primary) parts.push(`Firm ${firm}`);
    return parts.length ? ` · ${parts.join(' · ')}` : '';
  }
  const primary = firm || group;
  const parts = [];
  if (primary) parts.push(`Firm ${primary}`);
  if (sched && sched !== primary) parts.push(`Sched ${sched}`);
  return parts.length ? ` · ${parts.join(' · ')}` : '';
}

function pqWizardJobDateLabel(job) {
  const basis = getPqDateBasis();
  if (basis === 'scheduled_departure') {
    return job.sched_departure_date || job.firm_date || '';
  }
  return job.job_firm_date || job.firm_date || '';
}

function getPqShowCompleted() {
  const el = document.getElementById('pqShowCompleted');
  return Boolean(el && el.checked);
}

// Floor visibility is one three-state choice, not two checkboxes. The old pair
// could express "floor only, floor hidden", which is not a state -- the handler
// silently re-checked the other box to paper over it.
function getPqFloorMode() {
  const el = document.getElementById('pqFloorMode');
  const value = el ? String(el.value || '') : '';
  return value === 'show' || value === 'only' ? value : 'hide';
}

function getPqShowFloor() {
  return getPqFloorMode() !== 'hide';
}

function getPqFloorOnly() {
  return getPqFloorMode() === 'only';
}

function pqFloorPoSet(floorJobs) {
  return new Set((floorJobs || []).map((job) => String(job.po_number || '').trim()).filter(Boolean));
}

function pqJobVisibleInQueue(job, { showCompleted, showFloor, floorPoSet }) {
  if (!showCompleted && job.is_finished_out) {
    return false;
  }
  const onFloor = Boolean(job.on_floor) || floorPoSet.has(String(job.po_number || '').trim());
  if (!showFloor && onFloor) {
    return false;
  }
  return true;
}

function pqJobStatusText(job) {
  const inCutting = Number(job.in_cutting_count || 0);
  const complete = Number(job.cutting_complete_count || 0);
  const total = inCutting + complete || Number(job.item_count || 0);
  if (inCutting || complete) {
    return `${inCutting} remaining · ${complete} complete · ${total} total`;
  }
  return `${total} item${total === 1 ? '' : 's'}`;
}

function pqPaperworkBadge(job) {
  const generatedAt = String(job.generated_at || '').trim();
  const paperworkReady = Boolean(generatedAt)
    || ['yellow', 'green'].includes(String(job.worksheet_bulb || '').toLowerCase());
  const label = paperworkReady ? 'Paperwork ready' : 'Needs paperwork';
  const detail = generatedAt
    ? `Paperwork generated ${formatTimestamp(generatedAt)}`
    : label;
  const className = paperworkReady ? 'pq-paperwork-ready' : 'pq-paperwork-missing';
  return `<span class="pq-status-badge ${className}" title="${escapeHtml(detail)}">${label}</span>`;
}

function pqCnc(job) {
  return job && job.cnc && typeof job.cnc === 'object' ? job.cnc : {};
}

function pqCutRemainderTone(job) {
  const cnc = pqCnc(job);
  return (cnc.seen || cnc.machine_done) ? 'cut' : 'waiting';
}

function pqCutSplitBadge(submitted, leftover, leftoverTone, title) {
  const rightClass = leftoverTone === 'cut' ? 'pq-cut-progress' : 'pq-cut-waiting';
  return (
    `<span class="pq-status-badge pq-cut-split" title="${escapeHtml(title)}">`
    + `<span class="pq-cut-half pq-cut-complete">${submitted}</span>`
    + `<span class="pq-cut-half ${rightClass}">${leftover}</span>`
    + `</span>`
  );
}

function pqCutBadge(job) {
  const inCutting = Number(job.in_cutting_count || 0);
  const complete = Number(job.cutting_complete_count || 0);
  const countedTotal = inCutting + complete;
  const fallbackTotal = Number(job.item_count || 0);
  const total = countedTotal || fallbackTotal;
  const submitted = complete > 0 ? complete : 0;
  const leftover = inCutting > 0 ? inCutting : Math.max(0, total - submitted);
  const insightState = String(job.insight_bulb || 'gray').toLowerCase();
  const cnc = pqCnc(job);
  const remainderTone = pqCutRemainderTone(job);

  if (insightState === 'reclaimed') {
    const detail = 'Reclaim marry-up is pending in Morning (this job should not appear in the active cut queue).';
    return `<span class="pq-status-badge pq-cut-reclaimed" title="${escapeHtml(detail)}">Reclaim pending</span>`;
  }

  if (job.is_finished_out || insightState === 'green' || (submitted > 0 && leftover <= 0)) {
    const detail = total > 0
      ? `${submitted || total} of ${total} submitted in Insight`
      : 'All cabinets submitted in Insight';
    return `<span class="pq-status-badge pq-cut-complete" title="${escapeHtml(detail)}">Submitted</span>`;
  }

  if (submitted > 0 && leftover > 0) {
    const rest = remainderTone === 'cut'
      ? `${leftover} cut, not submitted`
      : `${leftover} not cut`;
    const title = `${submitted} submitted in Insight · ${rest}`;
    return pqCutSplitBadge(submitted, leftover, remainderTone, title);
  }

  if (remainderTone === 'cut') {
    const sheets = Number(cnc.ran_count || 0);
    const taps = Number(cnc.tap_count || 0);
    const label = cnc.machine_done ? 'Machine cut' : 'On CNC';
    const detail = taps
      ? `CNC ${cnc.machine_done ? 'finished' : 'has run'} ${sheets || taps} of ${taps} sheet${taps === 1 ? '' : 's'}. None submitted in Insight yet.`
      : 'CNC has this job. None submitted in Insight yet.';
    return `<span class="pq-status-badge pq-cut-progress" title="${escapeHtml(detail)}">${escapeHtml(label)}</span>`;
  }

  const detail = leftover > 0
    ? `${leftover} cabinet${leftover === 1 ? '' : 's'} not cut`
    : 'No cabinets submitted or cut';
  return `<span class="pq-status-badge pq-cut-waiting" title="${escapeHtml(detail)}">Awaiting cut</span>`;
}

function pqFlagBadges(job) {
  const badges = [];
  if (job.has_notes) {
    const noteDetail = String(job.notes_preview || job.note || 'This job has Insight notes').trim();
    badges.push(
      `<span class="pq-status-badge pq-flag-notes" title="${escapeHtml(noteDetail)}">Has notes</span>`,
    );
  }
  if (job.on_floor) {
    badges.push(
      '<span class="pq-status-badge pq-flag-floor" title="This job is marked on the production floor">On floor</span>',
    );
  }
  const mismatch = String(pqCnc(job).mismatch || '');
  if (mismatch === 'machine_ahead') {
    badges.push(
      '<span class="pq-status-badge pq-flag-cnc-ahead" title="The CNC finished this job\'s set(s), but Insight still has items in cutting">CNC done · Insight open</span>',
    );
  } else if (mismatch === 'insight_without_cnc') {
    badges.push(
      '<span class="pq-status-badge pq-flag-cnc-missing" title="Insight is cutting complete, but the CNC never ran the set(s) filed for this job">No CNC record</span>',
    );
  }
  return badges.join('');
}

function renderPqJobRow(job, { checkboxClass = 'pq-job-cb', groupDate = '' } = {}) {
  const finishedClass = job.is_finished_out ? ' is-finished-out' : '';
  const floorClass = job.on_floor ? ' is-floor-job' : '';
  const disabled = job.is_finished_out ? 'disabled' : '';
  const firmDate = groupDate || job.firm_date || '';
  const cabinetCount = Number(
    job.carcass_count != null ? job.carcass_count : (job.item_count || 0),
  );
  return `
    <label class="pq-job-row pq-queue-job-row${finishedClass}${floorClass}">
      <input type="checkbox" class="${checkboxClass}" data-po="${escapeHtml(job.po_number)}" data-date="${escapeHtml(firmDate)}" ${disabled}>
      <span class="pq-job-po">
        <span class="pq-job-name">${escapeHtml(job.po_number)}</span>
        <span class="pq-job-floor-meta">${escapeHtml(pqJobStatusText(job))}${pqJobDateMeta(job, groupDate)}</span>
        <span class="pq-job-statuses" aria-label="Job status">
          ${pqPaperworkBadge(job)}
          ${pqCutBadge(job)}
          ${pqFlagBadges(job)}
        </span>
      </span>
      <button class="pq-job-details-btn" type="button" data-po="${escapeHtml(job.po_number)}" title="Cabinets, wood usage, and recorded events">Details</button>
      <span class="pq-job-items" title="Cabinets" aria-label="${cabinetCount} cabinets">${cabinetCount}</span>
      <span class="pq-job-unique" title="Unique cabinet types" aria-label="${Number(job.unique_items || 0)} unique cabinet types">${job.unique_items}</span>
    </label>
  `;
}

function renderPqFloorSection(floorJobs) {
  if (!floorJobs.length) {
    return '';
  }
  return `
    <div class="pq-floor-section">
      <div class="pq-floor-header">
        <div>
          <strong class="pq-floor-title">On the floor</strong>
          <span class="pq-floor-meta">${floorJobs.length} job${floorJobs.length === 1 ? '' : 's'} started early ? sorted by fewest still in cutting</span>
        </div>
      </div>
      <div class="pq-jobs-list">
        ${floorJobs.map((job) => `
          <div class="pq-floor-row-wrap">
            ${renderPqJobRow({ ...job, on_floor: true }, { checkboxClass: 'pq-floor-cb pq-job-cb' })}
            <button class="button secondary compact pq-floor-remove-btn" type="button" data-po="${escapeHtml(job.po_number)}" title="Remove from floor">Remove</button>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function setPqFloorHint(floorCount, floorOnly, showFloor) {
  const hint = document.getElementById('pqFloorHint');
  if (!hint) return;
  if (floorCount > 0 && !floorOnly && !showFloor) {
    hint.hidden = false;
    hint.textContent = `${floorCount} on the floor hidden · check Show on the floor`;
  } else if (floorCount > 0 && !floorOnly && showFloor) {
    hint.hidden = false;
    hint.textContent = `${floorCount} on the floor`;
  } else {
    hint.hidden = true;
    hint.textContent = '';
  }
}

function wireProductionQueueInteractions(container) {
  container.querySelectorAll('.pq-date-cb').forEach((dateCb) => {
    dateCb.addEventListener('change', () => {
      const date = dateCb.dataset.date;
      const jobCbs = container.querySelectorAll(`.pq-job-cb[data-date="${date}"]`);
      jobCbs.forEach((cb) => {
        if (!cb.disabled) cb.checked = dateCb.checked;
      });
    });
  });
  container.querySelectorAll('.pq-job-cb').forEach((jobCb) => {
    jobCb.addEventListener('change', () => {
      const date = jobCb.dataset.date;
      const dateCb = container.querySelector(`.pq-date-cb[data-date="${date}"]`);
      if (!dateCb) return;
      const siblings = container.querySelectorAll(`.pq-job-cb[data-date="${date}"]:not(:disabled)`);
      const allChecked = Array.from(siblings).every((cb) => cb.checked);
      const someChecked = Array.from(siblings).some((cb) => cb.checked);
      dateCb.checked = allChecked;
      dateCb.indeterminate = someChecked && !allChecked;
    });
  });
  container.querySelectorAll('.pq-floor-remove-btn').forEach((button) => {
    button.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const po = button.dataset.po;
      if (!po) return;
      await api('/api/production-floor/remove', {
        method: 'POST',
        body: JSON.stringify({ po_numbers: [po] }),
      });
      await loadProductionQueue();
    });
  });
  container.querySelectorAll('.pq-job-details-btn').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const po = button.dataset.po;
      if (!po) return;
      openPqJobCard(po).catch((error) => alert(error.message));
    });
  });
}

function setPqHiddenCompletedHint(hiddenCount) {
  const hint = document.getElementById('pqHiddenCompletedHint');
  if (!hint) return;
  if (hiddenCount > 0 && !getPqShowCompleted()) {
    hint.hidden = false;
    hint.textContent = `${hiddenCount} completed job${hiddenCount === 1 ? '' : 's'} hidden`;
  } else {
    hint.hidden = true;
    hint.textContent = '';
  }
}

async function loadProductionQueue() {
  const dateBasis = getPqDateBasis();
  const params = new URLSearchParams();
  if (dateBasis) params.set('date_basis', dateBasis);
  const query = params.toString() ? `?${params}` : '';
  const container = document.getElementById('pqDateGroups');
  if (container && !_pqData) {
    container.innerHTML = '<p class="pq-note-empty" style="text-align:center;padding:2rem 0">Loading jobs…</p>';
  }
  try {
    const data = await api(`/api/production-queue${query}`);
    _pqData = data;
    renderProductionQueue(data);
    return data;
  } catch (err) {
    console.warn('Production queue load failed:', err.message);
    if (container && !_pqData) {
      container.innerHTML = `<p class="pq-note-empty" style="text-align:center;padding:2rem 0">Could not load jobs: ${escapeHtml(err.message || 'unknown error')}</p>`;
    }
    return null;
  }
}

function renderProductionQueue(data) {
  const container = document.getElementById('pqDateGroups');
  const groups = data.date_groups || [];
  const floorJobs = (data.floor_jobs && data.floor_jobs.jobs) || [];
  const showCompleted = getPqShowCompleted();
  const showFloor = getPqShowFloor();
  const floorOnly = getPqFloorOnly();
  const floorPoSet = pqFloorPoSet(floorJobs);
  const visibility = { showCompleted, showFloor, floorPoSet };
  const dateBasisLabel = data.date_basis_label || pqDateBasisShortLabel(getPqDateBasis());
  const hiddenCompleted = showCompleted
    ? 0
    : groups.reduce((sum, group) => sum + Number(group.finished_out_count || 0), 0);
  const hiddenFloor = showFloor || floorOnly
    ? 0
    : floorJobs.length;

  setPqFloorHint(floorJobs.length, floorOnly, showFloor);

  let html = '';
  if (showFloor || floorOnly) {
    html = renderPqFloorSection(floorJobs);
  }

  if (floorOnly) {
    container.innerHTML = html || '<p style="text-align:center;color:var(--c-text-muted);padding:2rem 0">No jobs marked on the floor yet. Click “Add to floor” to tag in-cutting jobs you have already started.</p>';
    setPqHiddenCompletedHint(0);
    wireProductionQueueInteractions(container);
    return;
  }

  if (!groups.length && !floorJobs.length) {
    container.innerHTML = '<p style="text-align:center;color:var(--c-text-muted);padding:2rem 0">No production data available</p>';
    setPqHiddenCompletedHint(0);
    return;
  }

  for (const group of groups) {
    const visibleJobs = (group.jobs || []).filter((job) => pqJobVisibleInQueue(job, visibility));
    if (!visibleJobs.length) {
      continue;
    }
    const activeCount = visibleJobs.filter((job) => !job.is_finished_out).length;
    const metaText = showCompleted
      ? `${visibleJobs.length} job${visibleJobs.length === 1 ? '' : 's'}, ${visibleJobs.reduce((sum, job) => sum + Number(job.item_count || 0), 0)} items`
      : `${activeCount} active job${activeCount === 1 ? '' : 's'}, ${visibleJobs.reduce((sum, job) => sum + Number(job.item_count || 0), 0)} items`;
    html += `<div class="pq-date-group" data-date="${escapeHtml(group.date)}">
      <div class="pq-date-header">
        <label class="pq-date-label">
          <input type="checkbox" class="pq-date-cb" data-date="${escapeHtml(group.date)}">
          <strong>${escapeHtml(dateBasisLabel)} ${escapeHtml(group.date)}</strong>
        </label>
        <span class="pq-date-meta">${metaText}</span>
      </div>
      <div class="pq-jobs-list">`;
    for (const job of visibleJobs) {
      html += renderPqJobRow(job, { groupDate: group.date });
    }
    html += '</div></div>';
  }

  if (!html && !floorJobs.length) {
    html = '<p style="text-align:center;color:var(--c-text-muted);padding:2rem 0">All jobs on this list are already cut complete. Toggle ?Show completed jobs? to review them.</p>';
  } else if (!html.includes('pq-date-group') && floorJobs.length && showFloor) {
    // floor section only rendered above; main queue empty
  } else if (!html && hiddenFloor > 0) {
    html = '<p style="text-align:center;color:var(--c-text-muted);padding:2rem 0">Floor jobs are hidden. Check “Show on the floor” to review them.</p>';
  }

  container.innerHTML = html;
  setPqHiddenCompletedHint(showCompleted ? 0 : hiddenCompleted);
  wireProductionQueueInteractions(container);
}

async function openPqFloorAddModal() {
  document.getElementById('pqFloorAddModal').hidden = false;
  syncModalBodyLock();
  const groupsEl = document.getElementById('pqFloorAddGroups');
  groupsEl.innerHTML = '<p class="empty-panel-copy">Loading in-cutting jobs...</p>';
  try {
    const dateBasis = getPqDateBasis();
    const data = await api(`/api/production-floor/candidates?date_basis=${encodeURIComponent(dateBasis)}`);
    renderPqFloorAddCandidates(data);
  } catch (error) {
    groupsEl.innerHTML = `<p class="empty-panel-copy">${escapeHtml(error.message || 'Failed to load jobs')}</p>`;
  }
}

function closePqFloorAddModal() {
  document.getElementById('pqFloorAddModal').hidden = true;
  syncModalBodyLock();
}

function closePqJobCardModal() {
  const modal = document.getElementById('pqJobCardModal');
  if (modal) modal.hidden = true;
  syncModalBodyLock();
}

function pqJobCardWood(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return '0';
  return amount.toFixed(1).replace(/\.0$/, '');
}

function renderPqJobCard(card) {
  const body = document.getElementById('pqJobCardBody');
  const title = document.getElementById('pqJobCardTitle');
  const summary = document.getElementById('pqJobCardSummary');
  if (!body) return;
  const po = String(card.po_number || '').trim();
  if (title) title.textContent = po || 'Job details';
  const remaining = Number(card.in_cutting_count || 0);
  const complete = Number(card.cutting_complete_count || 0);
  const total = Number(card.carcass_count || remaining + complete);
  if (summary) {
    summary.textContent = card.ok
      ? `${remaining} remaining · ${complete} complete · ${total} total`
      : (card.error || 'Purchase order not found.');
  }
  if (!card.ok) {
    body.innerHTML = `<p class="empty-panel-copy">${escapeHtml(card.error || 'No details for this purchase order.')}</p>`;
    return;
  }
  const wood = card.wood || {};
  const cabinets = Array.isArray(card.cabinets) ? card.cabinets : [];
  const events = Array.isArray(card.events) ? card.events : [];
  const dates = [
    card.firm_date ? `Firm ${card.firm_date}` : '',
    card.sched_departure_date ? `Sched ${card.sched_departure_date}` : '',
    card.on_floor ? 'On the floor' : '',
  ].filter(Boolean);
  const cabinetRows = cabinets.length
    ? cabinets.map((cab) => {
        const note = String(cab.note || '').trim();
        const woodCell = cab.wood_known
          ? `PW .5 ${pqJobCardWood(Number(cab.pw05 || 0) * Number(cab.quantity || 0))} · PW .75 ${pqJobCardWood(Number(cab.pw075 || 0) * Number(cab.quantity || 0))}`
          : '—';
        return `<tr>
          <td>${escapeHtml(cab.item_number || '')}${cab.product && cab.product !== cab.item_number ? `<div class="pq-job-floor-meta">${escapeHtml(cab.product)}</div>` : ''}</td>
          <td>${escapeHtml(String(cab.quantity || 0))}</td>
          <td>${escapeHtml(cab.status || '')}</td>
          <td>${escapeHtml(woodCell)}</td>
          <td>${note ? escapeHtml(note) : '—'}</td>
        </tr>`;
      }).join('')
    : '<tr><td colspan="5">No carcass cabinets on this purchase order.</td></tr>';
  const eventRows = events.length
    ? events.map((event) => {
        const when = event.at ? formatTimestamp(event.at) : '—';
        const detail = String(event.detail || '').trim();
        return `<li>
          <time>${escapeHtml(when)}</time>
          <div>
            <strong>${escapeHtml(event.label || event.kind || '')}</strong>
            ${detail ? `<div class="pq-job-floor-meta">${escapeHtml(detail)}</div>` : ''}
          </div>
        </li>`;
      }).join('')
    : '<li><time>—</time><div>No recorded events yet.</div></li>';
  const unknown = Array.isArray(wood.unknown_items) && wood.unknown_items.length
    ? `<p class="pq-job-floor-meta">No wood usage on file for ${escapeHtml(wood.unknown_items.join(', '))}.</p>`
    : '';
  body.innerHTML = `
    <p class="pq-job-card-meta">${escapeHtml(dates.join(' · ') || 'Dates not set')}</p>
    <section class="pq-job-card-section">
      <h3>Wood usage</h3>
      <p>PW .5 ${escapeHtml(pqJobCardWood(wood.pw05))} · PW .75 ${escapeHtml(pqJobCardWood(wood.pw075))}</p>
      ${unknown}
    </section>
    <section class="pq-job-card-section">
      <h3>Cabinets</h3>
      <table class="pq-job-card-table">
        <thead>
          <tr>
            <th>Item</th>
            <th>Qty</th>
            <th>Status</th>
            <th>Wood</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>${cabinetRows}</tbody>
      </table>
    </section>
    <section class="pq-job-card-section">
      <h3>Events</h3>
      <ul class="pq-job-card-events">${eventRows}</ul>
    </section>
  `;
}

async function openPqJobCard(poNumber) {
  const modal = document.getElementById('pqJobCardModal');
  const body = document.getElementById('pqJobCardBody');
  const title = document.getElementById('pqJobCardTitle');
  const summary = document.getElementById('pqJobCardSummary');
  if (!modal || !body) return;
  if (title) title.textContent = poNumber || 'Job details';
  if (summary) summary.textContent = 'Loading cabinets, wood usage, and events…';
  body.innerHTML = '<p class="empty-panel-copy">Loading…</p>';
  modal.hidden = false;
  syncModalBodyLock();
  const params = new URLSearchParams();
  params.set('po', poNumber);
  const dateBasis = getPqDateBasis();
  if (dateBasis) params.set('date_basis', dateBasis);
  const card = await api(`/api/production-queue/job-card?${params.toString()}`);
  renderPqJobCard(card);
}

function renderPqFloorAddCandidates(data) {
  const groupsEl = document.getElementById('pqFloorAddGroups');
  const groups = data.date_groups || [];
  document.getElementById('pqFloorAddSummary').textContent =
    `${data.candidate_count || 0} in-cutting job${Number(data.candidate_count || 0) === 1 ? '' : 's'} available to mark on the floor.`;
  if (!groups.length) {
    groupsEl.innerHTML = '<p class="empty-panel-copy">No in-cutting jobs available. Finished jobs and jobs already on the floor are excluded.</p>';
    return;
  }
  groupsEl.innerHTML = groups.map((group) => `
    <div class="pq-floor-add-group">
      <div class="pq-floor-add-header"><strong>${escapeHtml(group.date)}</strong> ? ${group.job_count} job${group.job_count === 1 ? '' : 's'}</div>
      ${group.jobs.map((job) => `
        <label class="pq-floor-add-row">
          <input type="checkbox" class="pq-floor-add-cb" data-po="${escapeHtml(job.po_number)}" data-date="${escapeHtml(job.firm_date || group.date)}">
          <span>
            <strong>${escapeHtml(job.po_number)}</strong>
            <span class="pq-floor-add-meta">${escapeHtml(pqJobStatusText(job))}</span>
          </span>
        </label>
      `).join('')}
    </div>
  `).join('');
}

async function submitPqFloorAdd() {
  const selected = Array.from(document.querySelectorAll('.pq-floor-add-cb:checked'));
  if (!selected.length) {
    alert('Select at least one in-cutting job to add to the floor.');
    return;
  }
  const jobs = selected.map((cb) => ({
    po_number: cb.dataset.po,
    firm_date: cb.dataset.date,
  }));
  await api('/api/production-floor/add', {
    method: 'POST',
    body: JSON.stringify({ jobs }),
  });
  closePqFloorAddModal();
  await loadProductionQueue();
}

function getSelectedPqJobs() {
  const checked = document.querySelectorAll('.pq-job-cb:checked');
  return Array.from(checked).map((cb) => ({ po_number: cb.dataset.po, firm_date: cb.dataset.date }));
}

async function openPqWizard() {
  const selected = getSelectedPqJobs();
  if (!selected.length) {
    alert(getPqShowCompleted()
      ? 'Select at least one active job. Completed jobs are shown for reference only.'
      : 'Select at least one job. Toggle “Show completed jobs” if you need to review finished work.');
    return;
  }
  const poNumbers = [...new Set(selected.map((s) => s.po_number))];
  const dateBasis = getPqDateBasis();

  const btn = document.getElementById('pqReviewGenerate');
  btn.disabled = true;
  btn.textContent = 'Loading…';
  try {
    const details = await api('/api/production-queue/details', {
      method: 'POST',
      body: JSON.stringify({ po_numbers: poNumbers, date_basis: dateBasis }),
    });
    _pqWizardJobs = details.jobs || [];
    if (!_pqWizardJobs.length) { alert('No cabinet details found for selected jobs.'); return; }

    _pqPartsExpanded = false;
    document.getElementById('pqExpandParts').textContent = 'Show Components';
    const totalCabs = _pqWizardJobs.reduce((n, j) => n + j.cabinets.length, 0);
    const dateSet = new Set(selected.map((s) => s.firm_date));
    const dateLabel = dateSet.size === 1 ? [...dateSet][0] : `${dateSet.size} dates`;

    _pqReviewSummaryText =
      `${_pqWizardJobs.length} job${_pqWizardJobs.length === 1 ? '' : 's'}, ${totalCabs} unique cabinet${totalCabs === 1 ? '' : 's'} across ${dateLabel}`;
    document.getElementById('pqWizardSummary').textContent = _pqReviewSummaryText;
    document.getElementById('pqWizardResult').hidden = true;
    _pqDimensionEdits = new Map();
    _pqSelectedCabKeys = new Set();
    _pqWizardDestination = 'generate';
    _pqStagingGroups = [];
    document.getElementById('pqGenerateAllBatches').textContent = 'Generate all batches';
    setPqWizardStep('review');
    renderPqWizardReview(_pqWizardJobs);
    const omniRoute = document.querySelector('input[name="pqOutputRoute"][value="omni_tap"]');
    if (omniRoute) omniRoute.checked = true;
    document.getElementById('pqWizardModal').hidden = false;
    syncModalBodyLock();
  } catch (err) {
    alert('Failed to load details: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Review & Generate';
  }
}

function closePqWizard() {
  if (_pqStagingRunning) {
    alert('Batches are still generating. Wait for the run to finish before closing.');
    return;
  }
  document.getElementById('pqWizardModal').hidden = true;
  _pqWizardStep = 'review';
  _pqDimensionEdits = new Map();
  _pqSelectedCabKeys = new Set();
  _pqDimensionEditOrigin = 'review';
  _pqWizardDestination = 'generate';
  _pqStagingGroups = [];
  document.getElementById('pqGenerateAllBatches').textContent = 'Generate all batches';
  syncModalBodyLock();
}

function renderPqWizardReview(jobs) {
  const container = document.getElementById('pqWizardBody');
  let html = '';
  for (const job of jobs) {
    html += `<div class="mdb-wizard-job">
      <h3 class="mdb-wizard-job-title">${escapeHtml(job.po_number)}
        <span class="mdb-wizard-job-count">${escapeHtml(pqWizardJobDateLabel(job))} · ${job.item_count} items</span></h3>
      <table class="mdb-wizard-table">
        <thead><tr>
          <th></th><th>Product</th><th>Item #</th><th>Type</th>
          <th>W</th><th>H</th><th>D</th>
          <th>Construction</th><th>Parts</th><th class="pq-dim-actions-col"></th><th>Notes</th>
        </tr></thead><tbody>`;
    for (const cab of job.cabinets) {
      const qtyBadge = cab.quantity > 1 ? ` <span class="pill">&times;${cab.quantity}</span>` : '';
      const noteHtml = cab.note
        ? `<div class="pq-note-text">${escapeHtml(cab.note)}</div>`
        : '<span class="pq-note-empty">?</span>';
      const customized = _pqDimensionEdits.has(pqCabKey(job.po_number, cab.item_number));
      html += `<tr class="${cab.has_notes ? 'mdb-row-flagged' : ''}${customized ? ' pq-row-customized' : ''}">
        <td><input type="checkbox" class="pq-cab-cb" data-item="${escapeHtml(cab.item_number)}" data-po="${escapeHtml(job.po_number)}" checked></td>
        <td>${escapeHtml(cab.product)}${qtyBadge}</td>
        <td>${escapeHtml(cab.item_number)}</td>
        <td>${escapeHtml(cab.cabinet_type)}</td>
        <td>${pqReviewDimensionDisplay(job, cab, 'width')}</td>
        <td>${pqReviewDimensionDisplay(job, cab, 'height')}</td>
        <td>${pqReviewDimensionDisplay(job, cab, 'depth')}</td>
        <td>${escapeHtml(cab.construction || '?')}</td>
        <td>${cab.part_count}</td>
        <td class="pq-dim-actions-col">
          <button type="button" class="pq-dim-adjust-btn" data-po="${escapeHtml(job.po_number)}" data-item="${escapeHtml(cab.item_number)}" title="Override cabinet W/H/D">Adjust</button>
        </td>
        <td class="pq-note-cell">${noteHtml}</td>
      </tr>`;
      html += `<tr class="mdb-parts-row" data-item="${escapeHtml(cab.item_number)}" data-po="${escapeHtml(job.po_number)}" hidden>
        <td colspan="11"><div class="mdb-parts-container" data-item="${escapeHtml(cab.item_number)}" data-po="${escapeHtml(job.po_number)}">Loading…</div></td>
      </tr>`;
    }
    html += '</tbody></table></div>';
  }
  container.innerHTML = html;
  wirePqReviewDimensionButtons(container);
}

function renderPqNotesGate(cabinets) {
  const container = document.getElementById('pqWizardBody');
  document.getElementById('pqWizardSummary').textContent =
    `${cabinets.length} selected cabinet${cabinets.length === 1 ? '' : 's'} have Insight notes. Review them before generating, or continue with library dimensions.`;
  container.innerHTML = `
    <div class="pq-notes-gate-list">
      ${cabinets.map(({ job, cab }) => `
        <article class="pq-notes-gate-card">
          <div class="pq-notes-gate-head">
            <strong>${escapeHtml(job.po_number)} · ${escapeHtml(cab.item_number)}</strong>
            <span>${escapeHtml(cab.product || '')}</span>
          </div>
          <p class="pq-notes-gate-dims">Library: W ${formatPqDimension(cab.width)} · H ${formatPqDimension(cab.height)} · D ${formatPqDimension(cab.depth)}</p>
          ${cab.has_dimension_notes ? `<p class="pq-notes-gate-suggested">From note: ${['width', 'height', 'depth'].filter((axis) => cab.suggested_dimensions && cab.suggested_dimensions[axis] != null).map((axis) => `${axis[0].toUpperCase()} ${cab.suggested_dimensions[axis]}`).join(' · ')}</p>` : ''}
          <div class="pq-note-text">${escapeHtml(cab.note || '')}</div>
        </article>
      `).join('')}
    </div>`;
}

function renderPqDimensionPartsTable(po, item, parts, excludedParts = []) {
  return renderSelectablePartsTable(parts, {
    po,
    item,
    excludedParts,
    checkboxClass: 'pq-part-cb',
    showRecalcStatus: true,
  });
}

function renderPqDimensionEdit(cabinets, { fromReview = false } = {}) {
  const container = document.getElementById('pqWizardBody');
  const noteCount = cabinets.filter(({ cab }) => cab.has_notes).length;
  document.getElementById('pqWizardSummary').textContent = fromReview
    ? `Manual dimension override for ${cabinets.length} cabinet${cabinets.length === 1 ? '' : 's'}. Use when a mod was missed in Insight notes or the build string.`
    : `Editing dimensions for ${cabinets.length} cabinet${cabinets.length === 1 ? '' : 's'}${noteCount ? ` (${noteCount} with notes)` : ''}. Parts that depend on W/H/D update automatically.`;
  container.innerHTML = cabinets.map(({ job, cab }) => {
    const key = pqCabKey(job.po_number, cab.item_number);
    const edit = _pqDimensionEdits.get(key) || {};
    const width = edit.width ?? cab.review_width ?? cab.width ?? '';
    const height = edit.height ?? cab.review_height ?? cab.height ?? '';
    const depth = edit.depth ?? cab.review_depth ?? cab.depth ?? '';
    return `
      <article class="pq-dimension-card" data-po="${escapeHtml(job.po_number)}" data-item="${escapeHtml(cab.item_number)}">
        <div class="pq-dimension-card-head">
          <div>
            <strong>${escapeHtml(job.po_number)} · ${escapeHtml(cab.item_number)}</strong>
            <span class="pq-dimension-sub">${escapeHtml(cab.product || '')} · ${escapeHtml(cab.cabinet_type || '')}</span>
          </div>
        </div>
        ${cab.note ? `<div class="pq-note-text pq-dimension-note">${escapeHtml(cab.note)}</div>` : ''}
        <p class="pq-dimension-library">Library: W ${formatPqDimension(cab.width)} · H ${formatPqDimension(cab.height)} · D ${formatPqDimension(cab.depth)}</p>
        <div class="pq-dimension-inputs">
          <label>W<input class="pq-dim-input" data-axis="width" data-po="${escapeHtml(job.po_number)}" data-item="${escapeHtml(cab.item_number)}" type="number" step="0.125" min="0" value="${width}"></label>
          <label>H<input class="pq-dim-input" data-axis="height" data-po="${escapeHtml(job.po_number)}" data-item="${escapeHtml(cab.item_number)}" type="number" step="0.125" min="0" value="${height}"></label>
          <label>D<input class="pq-dim-input" data-axis="depth" data-po="${escapeHtml(job.po_number)}" data-item="${escapeHtml(cab.item_number)}" type="number" step="0.125" min="0" value="${depth}"></label>
        </div>
        <div class="pq-dimension-parts-wrap" id="pqParts-${CSS.escape(key).replace(/\|/g, '-')}" data-po="${escapeHtml(job.po_number)}" data-item="${escapeHtml(cab.item_number)}">
          ${renderPqDimensionPartsTable(job.po_number, cab.item_number, edit.parts || [], edit.excludedParts || [])}
        </div>
      </article>`;
  }).join('');

  container.querySelectorAll('.pq-dim-input').forEach((input) => {
    input.addEventListener('change', () => schedulePqDimensionRecalc(input.dataset.po, input.dataset.item));
  });
  wirePartIncludeCheckboxes(container, {
    editStore: _pqDimensionEdits,
    keyFor: pqCabKey,
    checkboxClass: 'pq-part-cb',
  });
}

async function recalculatePqCabinet(po, item) {
  const card = document.querySelector(`.pq-dimension-card[data-po="${CSS.escape(po)}"][data-item="${CSS.escape(item)}"]`);
  if (!card) return;
  capturePartIncludeCheckboxes('pq-part-cb', _pqDimensionEdits, pqCabKey);
  const readAxis = (axis) => {
    const input = card.querySelector(`.pq-dim-input[data-axis="${axis}"]`);
    return input ? Number(input.value) : NaN;
  };
  const width = readAxis('width');
  const height = readAxis('height');
  const depth = readAxis('depth');
  if (![width, height, depth].every(Number.isFinite)) return;

  const partsWrap = card.querySelector('.pq-dimension-parts-wrap');
  if (partsWrap) partsWrap.innerHTML = '<p class="lookup-empty">Recalculating parts?</p>';
  const data = await api('/api/production-queue/recalculate-parts', {
    method: 'POST',
    body: JSON.stringify({ item_number: item, width, height, depth }),
  });
  const prev = _pqDimensionEdits.get(pqCabKey(po, item)) || {};
  _pqDimensionEdits.set(pqCabKey(po, item), {
    ...prev,
    width,
    height,
    depth,
    parts: data.parts || [],
    excludedParts: prev.excludedParts || [],
  });
  if (partsWrap) {
    partsWrap.innerHTML = renderPqDimensionPartsTable(
      po,
      item,
      data.parts || [],
      prev.excludedParts || [],
    );
    wirePartIncludeCheckboxes(partsWrap, {
      editStore: _pqDimensionEdits,
      keyFor: pqCabKey,
      checkboxClass: 'pq-part-cb',
    });
  }
}

function schedulePqDimensionRecalc(po, item) {
  clearTimeout(_pqRecalcTimer);
  _pqRecalcTimer = setTimeout(() => {
    recalculatePqCabinet(po, item).catch((error) => alert(error.message));
  }, 250);
}

async function seedPqDimensionEdits(cabinets, useNoteDimensions) {
  for (const { job, cab } of cabinets) {
    const key = pqCabKey(job.po_number, cab.item_number);
    if (_pqDimensionEdits.has(key) && !useNoteDimensions) {
      continue;
    }
    const width = useNoteDimensions ? (cab.review_width ?? cab.width) : (_pqDimensionEdits.get(key)?.width ?? cab.width);
    const height = useNoteDimensions ? (cab.review_height ?? cab.height) : (_pqDimensionEdits.get(key)?.height ?? cab.height);
    const depth = useNoteDimensions ? (cab.review_depth ?? cab.depth) : (_pqDimensionEdits.get(key)?.depth ?? cab.depth);
    if (width == null || height == null || depth == null) continue;
    const data = await api('/api/production-queue/recalculate-parts', {
      method: 'POST',
      body: JSON.stringify({
        item_number: cab.item_number,
        width,
        height,
        depth,
      }),
    });
    const prev = _pqDimensionEdits.get(key) || {};
    _pqDimensionEdits.set(key, {
      ...prev,
      width: data.width ?? width,
      height: data.height ?? height,
      depth: data.depth ?? depth,
      parts: data.parts || [],
      excludedParts: prev.excludedParts || [],
    });
  }
}

async function openPqDimensionEdit(cabinets, useNoteDimensions, origin = 'notes_gate') {
  _pqDimensionEditOrigin = origin;
  const btn = document.getElementById('pqNotesEdit');
  const applyBtn = document.getElementById('pqNotesApply');
  const bulkBtn = document.getElementById('pqAdjustSelectedDims');
  if (btn) { btn.disabled = true; btn.textContent = 'Loading…'; }
  if (applyBtn) { applyBtn.disabled = true; applyBtn.textContent = 'Loading…'; }
  if (bulkBtn) { bulkBtn.disabled = true; }
  try {
    await seedPqDimensionEdits(cabinets, useNoteDimensions);
    renderPqDimensionEdit(cabinets, { fromReview: origin === 'review' });
    setPqWizardStep('dimension_edit');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Edit dimensions'; }
    if (applyBtn) { applyBtn.disabled = false; applyBtn.textContent = 'Apply from notes'; }
    if (bulkBtn) { bulkBtn.disabled = false; }
  }
}

function pqReturnFromDimensionEdit() {
  if (_pqDimensionEditOrigin === 'review') {
    renderPqWizardReview(_pqWizardJobs);
    setPqWizardStep('review');
    return;
  }
  renderPqNotesGate(getNotedSelectedCabinets());
  setPqWizardStep('notes_gate');
}

async function togglePqParts() {
  _pqPartsExpanded = !_pqPartsExpanded;
  document.getElementById('pqExpandParts').textContent = _pqPartsExpanded ? 'Hide Components' : 'Show Components';
  const rows = document.querySelectorAll('.mdb-parts-row');
  rows.forEach((r) => { r.hidden = !_pqPartsExpanded; });
  if (_pqPartsExpanded) {
    const containers = document.querySelectorAll('.mdb-parts-container');
    for (const el of containers) {
      if (el.dataset.loaded) continue;
      const item = el.dataset.item;
      const po = el.dataset.po || '';
      try {
        const data = await api(`/api/mdb-generator/parts?item_number=${encodeURIComponent(item)}`);
        el.dataset.loaded = '1';
        if (!data.parts || !data.parts.length) {
          el.textContent = 'No components found';
          continue;
        }
        const edit = _pqDimensionEdits.get(pqCabKey(po, item));
        el.innerHTML = renderSelectablePartsTable(data.parts, {
          po,
          item,
          excludedParts: edit?.excludedParts || [],
          checkboxClass: 'pq-part-cb',
        });
        wirePartIncludeCheckboxes(el, {
          editStore: _pqDimensionEdits,
          keyFor: pqCabKey,
          checkboxClass: 'pq-part-cb',
        });
      } catch {
        el.textContent = 'Failed to load';
      }
    }
  }
}

function pqBuildSelections() {
  capturePartIncludeCheckboxes('pq-part-cb', _pqDimensionEdits, pqCabKey);
  const selections = [];
  for (const job of _pqWizardJobs || []) {
    for (const cab of job.cabinets) {
      if (!isPqCabSelected(job.po_number, cab.item_number)) continue;

      const edit = _pqDimensionEdits.get(pqCabKey(job.po_number, cab.item_number));
      const excluded = edit?.excludedParts || [];

      const selection = {
        item_number: cab.item_number,
        product: cab.product,
        po_number: job.po_number,
        firm_date: job.firm_date,
        excluded_parts: excluded,
        // Display/staging metadata; ignored by the generate endpoint.
        quantity: Number(cab.quantity) || 1,
      };

      if (edit) {
        if (Number.isFinite(Number(edit.width))) selection.width_override = Number(edit.width);
        if (Number.isFinite(Number(edit.height))) selection.height_override = Number(edit.height);
        if (Number.isFinite(Number(edit.depth))) selection.depth_override = Number(edit.depth);
        if (edit.parts && edit.parts.length) {
          const excludedSet = new Set(excluded);
          selection.part_overrides = edit.parts
            .filter((part) => part.recalculated && !excludedSet.has(String(part.part_name || '').trim()))
            .map((part) => ({
              part_name: part.part_name,
              width: part.width,
              length: part.length,
              quantity: part.quantity,
            }));
        }
      }

      selections.push(selection);
    }
  }
  return selections;
}

async function pqExecuteGenerate() {
  if (!_pqWizardJobs || !_pqWizardJobs.length) return;
  const selections = pqBuildSelections();
  if (!selections.length) { alert('No cabinets selected.'); return; }

  const genMdb = document.getElementById('pqGenMdb').checked;
  const genWorksheets = document.getElementById('pqGenWorksheets').checked;
  const routeHandcuts = document.getElementById('pqRouteHandcuts')?.checked === true;
  const outputRoute = document.querySelector('input[name="pqOutputRoute"]:checked')?.value || 'omni_tap';
  if (!genMdb && !genWorksheets) { alert('Select at least one output type.'); return; }
  if (outputRoute === 'python_mm_dxf' && !window.confirm(
    'Python is in Onboarding. This will generate verified millimeter DXFs for EnRoute and will not generate or dispatch TAPs. Continue?'
  )) return;

  const profile = document.getElementById('pqWorksheetProfile').value;
  const btn = document.getElementById('pqWizardGenerate');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Generating…';
  }
  try {
    const result = await api('/api/production-queue/generate', {
      method: 'POST',
      body: JSON.stringify({
        selections,
        worksheet_profile: profile,
        generate_mdb: genMdb,
        generate_worksheets: genWorksheets,
        route_handcuts_to_omni: routeHandcuts,
        date_basis: getPqDateBasis(),
        output_route: outputRoute,
      }),
    });
    const resultDiv = document.getElementById('pqWizardResult');
    const metricsDiv = document.getElementById('pqResultMetrics');
    if (result.ok) {
      let cards = '';
      if (result.worksheets && result.worksheets.length) {
        const wsCount = result.worksheets.reduce((n, w) => n + (w.generated_count || 0), 0);
        cards += metricCard('Worksheets', wsCount);
        if (result.worksheets[0].output_dir) {
          _pqLastOutputDir = result.worksheets[0].output_dir;
        }
      }
      if (result.mdb) {
        if (!_pqLastOutputDir && result.mdb.output_dir) {
          _pqLastOutputDir = result.mdb.output_dir;
        }
        cards += metricCard('MDB Cabinets', result.mdb.cabinet_count);
        cards += metricCard('MDB Parts', result.mdb.part_count);
      }
      cards += metricCard('Status', 'Complete');
      metricsDiv.innerHTML = cards;
      resultDiv.hidden = false;
      loadProductionQueue().catch(() => {});
    } else {
      metricsDiv.innerHTML = metricCard('Status', 'Failed', result.error || '');
      resultDiv.hidden = false;
    }
  } catch (err) {
    alert(err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Generate files';
    }
  }
}

function pqProceedFromWizard() {
  if (_pqWizardDestination === 'staging') {
    pqEnterStaging();
    return;
  }
  pqExecuteGenerate().catch((error) => alert(error.message));
}

function pqWizardContinue(destination = 'generate') {
  _pqWizardDestination = destination;
  captureSelectedPqCabKeys();
  const noted = getNotedSelectedCabinets();
  if (!noted.length) {
    pqProceedFromWizard();
    return;
  }
  renderPqNotesGate(noted);
  setPqWizardStep('notes_gate');
}

// ---------------------------------------------------------------------------
// Batch staging: split the wizard's selections into smaller batches, then
// generate every batch (one paperwork folder each) in a single run.
// ---------------------------------------------------------------------------
function pqStagingBatchName(index) {
  return `Batch ${index + 1}`;
}

function pqStagingRenumber() {
  _pqStagingGroups.forEach((group, index) => {
    group.name = pqStagingBatchName(index);
  });
}

function pqStagingGroupCabCount(group) {
  return group.selections.reduce((sum, sel) => sum + (Number(sel.quantity) || 1), 0);
}

function pqEnterStaging() {
  const selections = pqBuildSelections();
  if (!selections.length) { alert('No cabinets selected.'); return; }
  _pqStagingGroups = [{ name: pqStagingBatchName(0), selections, status: '', outputDir: '', error: '' }];
  _pqStagingRunning = false;
  document.getElementById('pqWizardResult').hidden = true;
  setPqWizardStep('staging');
  renderPqStaging();
}

function pqStagingSummaryText() {
  const total = _pqStagingGroups.reduce((sum, group) => sum + pqStagingGroupCabCount(group), 0);
  const jobs = new Set();
  _pqStagingGroups.forEach((group) => group.selections.forEach((sel) => jobs.add(sel.po_number)));
  const batches = _pqStagingGroups.filter((group) => group.selections.length).length;
  return `${total} cabinet${total === 1 ? '' : 's'} from ${jobs.size} job${jobs.size === 1 ? '' : 's'} staged into `
    + `${batches} batch${batches === 1 ? '' : 'es'}. Each batch generates its own paperwork folder.`;
}

function pqStagingStatusHtml(group) {
  if (group.status === 'running') return '<span class="pill">Generating…</span>';
  if (group.status === 'done') {
    return '<span class="pill">Done</span>'
      + ` <button type="button" class="button secondary pq-stage-open-btn" data-dir="${escapeHtml(group.outputDir || '')}">Open folder</button>`;
  }
  if (group.status === 'failed') return `<span class="pill">Failed</span> <span class="pq-note-text">${escapeHtml(group.error || '')}</span>`;
  return '';
}

function renderPqStaging() {
  const container = document.getElementById('pqWizardBody');
  document.getElementById('pqWizardSummary').textContent = pqStagingSummaryText();
  const batchNames = _pqStagingGroups.map((group) => group.name);
  const disabled = _pqStagingRunning ? 'disabled' : '';
  let html = '';
  _pqStagingGroups.forEach((group, groupIndex) => {
    const cabCount = pqStagingGroupCabCount(group);
    const jobCount = new Set(group.selections.map((sel) => sel.po_number)).size;
    html += `<div class="mdb-wizard-job" data-group="${groupIndex}">
      <h3 class="mdb-wizard-job-title">${escapeHtml(group.name)}
        <span class="mdb-wizard-job-count">${cabCount} cabinet${cabCount === 1 ? '' : 's'} · ${jobCount} job${jobCount === 1 ? '' : 's'}</span>
        <span class="pq-stage-status">${pqStagingStatusHtml(group)}</span>
        ${_pqStagingGroups.length > 1 && !_pqStagingRunning
          ? `<button type="button" class="button secondary pq-stage-remove-btn" data-group="${groupIndex}" title="Remove this batch and move its cabinets to the first batch">Remove batch</button>`
          : ''}
      </h3>`;
    if (!group.selections.length) {
      html += '<p class="pq-note-empty" style="padding:.25rem 0 .5rem">Empty — move cabinets here with the Batch dropdown, or it will be skipped.</p>';
    } else {
      html += `<table class="mdb-wizard-table">
        <thead><tr><th>Job</th><th>Product</th><th>Item #</th><th>Qty</th><th>Date</th><th>Batch</th></tr></thead><tbody>`;
      group.selections.forEach((sel, selIndex) => {
        const options = batchNames
          .map((name, i) => `<option value="${i}" ${i === groupIndex ? 'selected' : ''}>${escapeHtml(name)}</option>`)
          .join('');
        html += `<tr>
          <td>${escapeHtml(sel.po_number)}</td>
          <td>${escapeHtml(sel.product || '')}</td>
          <td>${escapeHtml(sel.item_number)}</td>
          <td>${Number(sel.quantity) || 1}</td>
          <td>${escapeHtml(sel.firm_date || '')}</td>
          <td><select class="pq-stage-move" data-group="${groupIndex}" data-index="${selIndex}" ${disabled}>${options}</select></td>
        </tr>`;
      });
      html += '</tbody></table>';
    }
    html += '</div>';
  });
  container.innerHTML = html;

  container.querySelectorAll('.pq-stage-move').forEach((select) => {
    select.addEventListener('change', () => {
      const fromGroup = Number(select.dataset.group);
      const fromIndex = Number(select.dataset.index);
      const toGroup = Number(select.value);
      if (!Number.isInteger(fromGroup) || !Number.isInteger(toGroup) || fromGroup === toGroup) return;
      const [moved] = _pqStagingGroups[fromGroup].selections.splice(fromIndex, 1);
      if (moved) _pqStagingGroups[toGroup].selections.push(moved);
      renderPqStaging();
    });
  });
  container.querySelectorAll('.pq-stage-remove-btn').forEach((button) => {
    button.addEventListener('click', () => {
      const index = Number(button.dataset.group);
      if (!Number.isInteger(index) || _pqStagingGroups.length <= 1) return;
      const [removed] = _pqStagingGroups.splice(index, 1);
      const target = _pqStagingGroups[0];
      if (removed && target) target.selections.push(...removed.selections);
      pqStagingRenumber();
      renderPqStaging();
    });
  });
  container.querySelectorAll('.pq-stage-open-btn').forEach((button) => {
    button.addEventListener('click', async () => {
      const dir = button.dataset.dir;
      if (!dir) return;
      await api('/api/production-queue/open-output', {
        method: 'POST',
        body: JSON.stringify({ output_dir: dir }),
      });
    });
  });
}

function pqSuggestBatches() {
  if (_pqStagingRunning) return;
  const capInput = document.getElementById('pqStageCap');
  const cap = Math.max(1, Number(capInput.value) || 15);
  const pool = _pqStagingGroups.flatMap((group) => group.selections);
  if (!pool.length) { alert('No cabinets staged.'); return; }

  // Rebuild in queue order (firm date, then job) so batches follow cut order.
  const byKey = new Map(pool.map((sel) => [pqCabKey(sel.po_number, sel.item_number), sel]));
  const orderedJobs = [];
  for (const job of _pqWizardJobs || []) {
    const jobSelections = [];
    for (const cab of job.cabinets) {
      const sel = byKey.get(pqCabKey(job.po_number, cab.item_number));
      if (sel) {
        jobSelections.push(sel);
        byKey.delete(pqCabKey(job.po_number, cab.item_number));
      }
    }
    if (jobSelections.length) orderedJobs.push(jobSelections);
  }
  if (byKey.size) orderedJobs.push([...byKey.values()]);

  const unitJobs = orderedJobs.map((jobSelections) => jobSelections.flatMap((sel) =>
    Array.from({ length: Math.max(1, Number(sel.quantity) || 1) }, () => ({ ...sel, quantity: 1 }))
  ));
  const pending = unitJobs.filter((job) => job.length);
  const groups = [];
  const lookaheadJobs = 5;
  const fillWithWholeJobs = (current) => {
    while (pending.length && current.length < cap) {
      const room = cap - current.length;
      let bestIndex = -1;
      let bestSize = -1;
      pending.slice(0, lookaheadJobs).forEach((job, index) => {
        if (job.length <= room && job.length > bestSize) {
          bestIndex = index;
          bestSize = job.length;
        }
      });
      if (bestIndex < 0) break;
      current.push(...pending.splice(bestIndex, 1)[0]);
    }
    return current;
  };
  while (pending.length) {
    const jobSelections = pending.shift();
    if (jobSelections.length <= cap) {
      groups.push(fillWithWholeJobs(jobSelections));
      continue;
    }
    // Full sets in an oversized PO's run remain dedicated to that PO. Only
    // the final partial set can be topped up with later whole jobs.
    while (jobSelections.length >= cap) groups.push(jobSelections.splice(0, cap));
    if (jobSelections.length) groups.push(fillWithWholeJobs(jobSelections));
  }

  const compactSelections = (selections) => {
    const compacted = [];
    const bySelection = new Map();
    selections.forEach((sel) => {
      const key = JSON.stringify(Object.entries(sel).filter(([name]) => name !== 'quantity'));
      const existing = bySelection.get(key);
      if (existing) existing.quantity += 1;
      else {
        const added = { ...sel, quantity: 1 };
        bySelection.set(key, added);
        compacted.push(added);
      }
    });
    return compacted;
  };

  _pqStagingGroups = groups.map((selections, index) => ({
    name: pqStagingBatchName(index),
    selections: compactSelections(selections),
    status: '',
    outputDir: '',
    error: '',
  }));
  renderPqStaging();
}

async function pqGenerateAllBatches() {
  if (_pqStagingRunning) return;
  // Skip batches that already generated so a retry only re-runs failures.
  const groups = _pqStagingGroups.filter((group) => group.selections.length && group.status !== 'done');
  if (!groups.length) { alert('No batches left to generate.'); return; }

  const genMdb = document.getElementById('pqGenMdb').checked;
  const genWorksheets = document.getElementById('pqGenWorksheets').checked;
  const routeHandcuts = document.getElementById('pqRouteHandcuts')?.checked === true;
  const outputRoute = document.querySelector('input[name="pqOutputRoute"]:checked')?.value || 'omni_tap';
  if (!genMdb && !genWorksheets) { alert('Select at least one output type.'); return; }
  if (outputRoute === 'python_mm_dxf' && !window.confirm(
    'Python is in Onboarding. Every staged batch will generate verified millimeter DXFs for EnRoute and no TAPs. Continue?'
  )) return;
  const profile = document.getElementById('pqWorksheetProfile').value;
  const dateBasis = getPqDateBasis();

  _pqStagingRunning = true;
  const btn = document.getElementById('pqGenerateAllBatches');
  btn.disabled = true;
  let failures = 0;
  try {
    for (const group of groups) {
      group.status = 'running';
      group.error = '';
      renderPqStaging();
      try {
        const result = await api('/api/production-queue/generate', {
          method: 'POST',
          body: JSON.stringify({
            selections: group.selections,
            worksheet_profile: profile,
            generate_mdb: genMdb,
            generate_worksheets: genWorksheets,
            route_handcuts_to_omni: routeHandcuts,
            date_basis: dateBasis,
            batch_label: group.name,
            output_route: outputRoute,
          }),
        });
        if (result.ok) {
          group.status = 'done';
          group.outputDir = (result.worksheets && result.worksheets[0] && result.worksheets[0].output_dir)
            || (result.mdb && result.mdb.output_dir)
            || '';
          if (group.outputDir) _pqLastOutputDir = group.outputDir;
        } else {
          group.status = 'failed';
          group.error = result.error || 'Generation failed';
          failures += 1;
        }
      } catch (err) {
        group.status = 'failed';
        group.error = err.message;
        failures += 1;
      }
      renderPqStaging();
    }
  } finally {
    _pqStagingRunning = false;
    btn.disabled = false;
    btn.textContent = failures ? 'Retry failed batches' : 'Generate all batches';
    renderPqStaging();
    loadProductionQueue().catch(() => {});
    loadOmniDispatch().catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Smart Batches (Tools + Production Queue)
// ---------------------------------------------------------------------------
// Mirrors DEFAULT_MAX_CABINETS in cut/services/smart_batch_generator.py. The
// operator sets the real ceiling in #smartBatchesMax / #morningPlanWipCeiling;
// this is only the value those controls fall back to.
const SMART_BATCHES_MAX_DEFAULT = 150;
const SMART_BATCHES_MAX_KEY = 'cutHealthSmartBatchesMax';
const SMART_BATCHES_CAP_KEY = 'cutHealthSmartBatchesCap';
const STAIN_GRADE_BATCH_QTY_KEY = 'cutHealthStainGradeBatchQty';
const CNC_WORKFLOW_VIEW_KEY = 'cutHealthCncWorkflowView';
const CNC_WORKFLOW_VIEWS = ['morning', 'omni', 'glass', 'production', 'pricing', 'reference'];
// 'plan' merged into 'morning': setting the day and setting the produced-work
// target are one decision, and splitting them across a tab is what buried the plan.
const CNC_WORKFLOW_VIEW_ALIASES = { plan: 'morning' };
const CNC_WORKFLOW_COPY = {
  morning: {
    title: 'Morning',
    description: 'Set the day: the checklist, the pinned Cut plan, and the produced-work target that decides what goes to the floor.',
  },
  omni: {
    title: 'Omni Queue',
    description: 'Choose what the operator can see, set priority, and control the live cutting order.',
  },
  glass: {
    title: 'Glass Prep',
    description: 'Glass doors on finished-interior cabinets, seen before they arrive: what is coming, and whether the doors and panes exist yet.',
  },
  production: {
    title: 'Production Metrics',
    description: 'What the department produced, whether it is ahead of SDD, and the end-of-day papers on the network archive.',
  },
  pricing: {
    title: 'Pricing',
    description: 'Review the retained V1 standard and work the V2 virtual-nest queue in controlled batches.',
  },
  reference: {
    title: 'Reference',
    description: 'Papers, records, and the tools you reach for a few times a week.',
  },
};
let _smartBatchPlan = null;
let _smartBatchRunning = false;
let _stainGradeQueueExpanded = true;
let _currentStainGradeQueue = null;
let _smartBatchLastOutputDir = '';
/** One shared Morning pipeline strip above plan and staging. */
let _morningWip = null;
let _morningWipProducedAtPlan = null;
let _morningWipResyncTimer = null;
let _cncWorkflowView = 'morning';
let _pricingLoaded = false;
let _pricingBusy = false;
let _pricingView = 'all';
let _pricingPayload = { jobs: [], counts: {}, source: {} };
let _pricingQueuePayload = { jobs: [], counts: {} };
let _pricingExpandedPo = '';
const _pricingDetailCache = new Map();
// Floor-stream state lives up here, not beside its own functions further down: the
// bootstrap call to showCncWorkflowView() runs at top level, and that reaches
// syncOmniFloorLiveStreamForView(). Declared any later, these are still in the temporal
// dead zone when it fires and the whole script aborts at that line.
let _omniFloorEventSource = null;
let _omniFloorLiveFingerprint = '';
let _omniFloorStreamState = 'off';
let _omniFloorStreamReconnectTimer = null;
const OMNI_FLOOR_STREAM_RECONNECT_MS = 3000;

// Keep the local Python serve process alive only while a dashboard tab is open.
const HEALTH_CLIENT_ID = `ch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
const HEALTH_CLIENT_HEARTBEAT_MS = 20000;
let _healthClientHeartbeatTimer = null;

function _postHealthClient(path, { keepalive = false } = {}) {
  const body = JSON.stringify({ client_id: HEALTH_CLIENT_ID });
  if (keepalive && typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    try {
      navigator.sendBeacon(path, new Blob([body], { type: 'application/json' }));
      return;
    } catch (_error) {
      /* fall through to fetch */
    }
  }
  fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: !!keepalive,
  }).catch(() => {});
}

function startHealthClientPresence() {
  _postHealthClient('/api/client/hello');
  if (_healthClientHeartbeatTimer) window.clearInterval(_healthClientHeartbeatTimer);
  // Heartbeat while the tab exists, visible or not. A dashboard sitting in a
  // background tab is still open, but gating this on visibilityState let the
  // client go stale after 90s and the server idle-exit 45s later — switching
  // back landed on a painted page whose every request failed.
  _healthClientHeartbeatTimer = window.setInterval(() => {
    _postHealthClient('/api/client/heartbeat');
  }, HEALTH_CLIENT_HEARTBEAT_MS);
  // Browsers throttle timers in background tabs, so re-announce the moment a tab
  // comes back rather than waiting out the next interval.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') _postHealthClient('/api/client/heartbeat');
  });
  // Do not bye() on pagehide — Ctrl+F5 / reload would drop presence and can race
  // idle shutdown + a fresh auto-refresh thread. Stale client expiry reclaims the
  // port after the tab is truly gone.
}

/* -----------------------------------------------------------------
   Detail level (Simple / Full)

   Simple shows the daily path and nothing else: plan the work, watch
   the Omni, read the numbers. It is the version you can put in front
   of someone on their first morning and have them follow it.

   It hides, it never removes. Full is the dashboard exactly as it was,
   so no trained user loses a control they depend on -- and anything
   marked advanced is one click away, not gone.

   Default is Simple. Someone who has never opened this before should
   land on the teachable view; the preference then sticks per browser.
   ----------------------------------------------------------------- */
const CUT_DEPTH_KEY = 'cutHealthDetailLevel';
let _cutDepth = 'simple';

function applyCutDepth(level, { persist = true } = {}) {
  const next = level === 'full' ? 'full' : 'simple';
  _cutDepth = next;
  if (persist) {
    try {
      localStorage.setItem(CUT_DEPTH_KEY, next);
    } catch (_error) {
      /* private browsing: the mode still applies for this session */
    }
  }
  document.body.classList.toggle('mode-simple', next === 'simple');
  const simpleButton = document.getElementById('depthSimpleButton');
  const fullButton = document.getElementById('depthFullButton');
  if (simpleButton) {
    simpleButton.classList.toggle('is-active', next === 'simple');
    simpleButton.setAttribute('aria-pressed', next === 'simple' ? 'true' : 'false');
  }
  if (fullButton) {
    fullButton.classList.toggle('is-active', next === 'full');
    fullButton.setAttribute('aria-pressed', next === 'full' ? 'true' : 'false');
  }
  // Collapsed tables cap at a smaller count in Simple mode, so re-cap
  // everything already on the page when the level changes.
  document.querySelectorAll('[data-collapsible-rows]').forEach((table) => {
    applyRowCollapse(table);
  });
  syncAdvancedEmptyLanes();
}

/**
 * Reveal any advanced lane that is holding something.
 *
 * The dispatch lanes are mutually exclusive filters on the same set list, so a
 * set that changes state does not just re-render -- it moves lane. Hiding a
 * lane outright therefore hides a destination, and holding a released set whose
 * paperwork is not finished dropped its card into "Preparing & held" and off
 * the screen, with nothing left to say where it went.
 *
 * So these lanes are quiet, not absent: hidden while they hold nothing, shown
 * the moment they hold work. Call after anything that re-renders a lane.
 */
function syncAdvancedEmptyLanes() {
  document.querySelectorAll('[data-depth="advanced-empty"]').forEach((lane) => {
    const countNode = lane.querySelector('.omni-dispatch-count');
    let hasItems;
    if (countNode) {
      // parseInt, not Number: the COH lane writes "1 task", and Number() gives
      // NaN for that -- which read as empty and kept a lane with work hidden.
      hasItems = (parseInt(countNode.textContent, 10) || 0) > 0;
    } else {
      // Lanes without a count badge render an empty-state paragraph instead.
      const list = lane.querySelector('.omni-floor-status-list, .omni-dispatch-list');
      hasItems = !!list && !!list.querySelector(':scope > *:not(.omni-dispatch-empty)');
    }
    lane.classList.toggle('has-items', hasItems);
  });
}

function initCutDepth() {
  let stored = null;
  try {
    stored = localStorage.getItem(CUT_DEPTH_KEY);
  } catch (_error) {
    stored = null;
  }
  applyCutDepth(stored === 'full' ? 'full' : 'simple', { persist: false });
  document.getElementById('depthSimpleButton')?.addEventListener('click', () => {
    applyCutDepth('simple');
  });
  document.getElementById('depthFullButton')?.addEventListener('click', () => {
    applyCutDepth('full');
  });
}

/* -----------------------------------------------------------------
   Long-list collapse

   Both halves of the morning plan render everything they have. The
   recommended-jobs table lists every eligible job (149 rows this
   morning) and the batch list every candidate batch (103 cards, 4.6k
   pixels of scroll inside a 570px panel). Nobody reads past the first
   screen of either.

   Show the first few, keep the rest one click away, and always put the
   real total on the toggle so the count is never a surprise.
   ----------------------------------------------------------------- */
const ROW_COLLAPSE_LIMIT = { simple: 8, full: 15 };
// Batch cards are several lines each, so far fewer fit than table rows.
const CARD_COLLAPSE_LIMIT = { simple: 4, full: 8 };

/** Rows for a table, direct children for anything else. */
function collapsibleItems(el) {
  if (el.tagName === 'TABLE') {
    const body = el.tBodies && el.tBodies[0];
    return body ? Array.from(body.rows) : null;
  }
  return Array.from(el.children);
}

function applyRowCollapse(table) {
  if (!table) return;
  const rows = collapsibleItems(table);
  if (!rows) return;
  const limitKey = table.dataset.collapseLimit;
  const limits = limitKey === 'cards' ? CARD_COLLAPSE_LIMIT : ROW_COLLAPSE_LIMIT;
  const limit = limits[_cutDepth] || limits.full;
  const expanded = table.dataset.rowsExpanded === 'true';
  const hiddenCount = Math.max(0, rows.length - limit);

  rows.forEach((row, index) => {
    row.hidden = !expanded && index >= limit;
  });

  const toggleId = table.dataset.collapsibleRows;
  const toggle = toggleId ? document.getElementById(toggleId) : null;
  if (!toggle) return;
  if (hiddenCount === 0) {
    toggle.hidden = true;
    return;
  }
  toggle.hidden = false;
  const singular = table.dataset.collapseNoun || 'job';
  // Explicit plural: "batch" + "s" is not a word.
  const plural = table.dataset.collapseNounPlural || `${singular}s`;
  const noun = hiddenCount === 1 ? singular : plural;
  toggle.textContent = expanded
    ? `Show fewer (hide ${hiddenCount} ${noun})`
    : `Show all ${rows.length} — ${hiddenCount} more ${noun}`;
  toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
}

function registerRowCollapse(
  table,
  toggleId,
  { limit = 'rows', noun = 'job', nounPlural = '' } = {},
) {
  if (!table) return;
  table.dataset.collapsibleRows = toggleId;
  table.dataset.collapseLimit = limit;
  table.dataset.collapseNoun = noun;
  if (nounPlural) table.dataset.collapseNounPlural = nounPlural;
  const toggle = document.getElementById(toggleId);
  if (toggle && !toggle.dataset.collapseBound) {
    toggle.dataset.collapseBound = 'true';
    toggle.addEventListener('click', () => {
      table.dataset.rowsExpanded = table.dataset.rowsExpanded === 'true' ? 'false' : 'true';
      applyRowCollapse(table);
    });
  }
  applyRowCollapse(table);
}

/* -----------------------------------------------------------------
   CNC run times

   The station has been recording how long every sheet took since it
   started writing tap_runs.jsonl, and until now nothing read the file.

   Three states have to stay distinguishable, because two of them
   render an empty table and neither means "no work happened":

     no file      the share is unreachable, or the station has not
                  written today
     hand-marked  the file is there, the operator pressed Mark Ran,
                  and no handle was ever held on the control
     measured     the control held and released files, so these are
                  real load-to-M30 times

   Pace is shown as a number and never as a verdict. The estimate
   prices feed moves only, with no acceleration, so it runs a third to
   a half of real cut time even at 100% override -- observed 0.33 and
   0.44 on real records. It is worth watching relative to itself and
   worth no threshold at all until a floor baseline exists.
   ----------------------------------------------------------------- */
let _runTimesLoading = false;

function formatCutTime(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value < 0) return '—';
  const mins = Math.floor(value / 60);
  const secs = Math.round(value % 60);
  if (mins <= 0) return `${secs}s`;
  return `${mins}m ${String(secs).padStart(2, '0')}s`;
}

function describeDaysRead(data) {
  // days_read is the folders actually opened; data.day is only the one that
  // answered. Older payloads carry just the latter.
  const days = Array.isArray(data?.days_read) && data.days_read.length
    ? data.days_read
    : [data?.day].filter(Boolean);
  if (!days.length) return 'the day folders';
  if (days.length === 1) return days[0];
  return `${days.slice(0, -1).join(', ')} or ${days[days.length - 1]}`;
}

function renderRunTimes(data) {
  const state = document.getElementById('runTimesState');
  const metrics = document.getElementById('runTimesMetrics');
  const table = document.getElementById('runTimesTable');
  const detail = document.getElementById('runTimesDetail');
  if (!state || !metrics || !table) return;
  const body = table.tBodies[0];
  const summary = data?.summary || {};
  const sheets = data?.sheets || [];

  if (!data?.ok) {
    state.textContent = data?.error
      ? `Could not read the run log: ${data.error}`
      : 'Could not read the run log.';
    state.classList.add('is-error');
    metrics.innerHTML = '';
    body.innerHTML = '';
    if (detail) detail.hidden = true;
    return;
  }
  state.classList.remove('is-error');

  if (!data.exists) {
    // Not an error and not a quiet zero: nothing has been written here.
    // Name every folder that was looked in, not one of them. The reader is
    // handed the batch day plus today, so "no run log for 8-5" was both
    // incomplete and misleading -- it read as "nothing happened today" while
    // the station log for that very day sat in the batch day's folder.
    state.textContent = `No run log in ${describeDaysRead(data)}. `
      + 'The station writes it beside the set, so a day with no batches of its '
      + 'own has none here. The event log below reads the same folders.';
    metrics.innerHTML = '';
    body.innerHTML = '';
    if (detail) detail.hidden = true;
    return;
  }
  if (detail) detail.hidden = false;

  const sheetCount = Number(summary.sheets) || 0;
  const detected = Number(summary.detected_sheets) || 0;
  const hand = Number(summary.operator_marked_sheets) || 0;
  const aborts = Number(summary.aborts) || 0;

  if (!data.has_measured_times) {
    // Every sheet was hand-marked. Say why there are no times rather than
    // showing an empty table under a heading that promises them.
    state.textContent = `${data.day}: ${sheetCount} sheet${sheetCount === 1 ? '' : 's'} `
      + 'marked by hand, none measured. The control never held a file, so there '
      + 'are no cut times for this day.';
  } else {
    const handNote = hand ? ` ${hand} also marked by hand and not timed.` : '';
    const reset = resetHandleFromPayload(data);
    const abortNote = aborts
      ? ` ${aborts} likely RESET press${aborts === 1 ? '' : 'es'} (held at least ${reset.logMin}s, under ${reset.sheetFloor}s) ${aborts === 1 ? 'was' : 'were'} not counted.`
      : '';
    state.textContent = `${data.day}: ${detected} sheet${detected === 1 ? '' : 's'} `
      + `measured from the control.${handNote}${abortNote}`;
  }

  metrics.innerHTML = [
    metricCard('Sheets measured', escapeHtml(summary.timed_sheets ?? 0), 'load to M30'),
    metricCard('Total cut time', escapeHtml(formatCutTime(summary.total_held_seconds)), 'measured sheets only'),
    metricCard('Median sheet', escapeHtml(formatCutTime(summary.median_held_seconds)), 'half above, half below'),
    metricCard('Longest sheet', escapeHtml(formatCutTime(summary.slowest_held_seconds)),
      escapeHtml(summary.slowest_tap || '—')),
    metricCard('Marked by hand', escapeHtml(hand), 'no measured time'),
  ].join('');

  body.innerHTML = sheets.length
    ? sheets.map((row) => {
      const pace = Number(row.pace_ratio);
      const paceText = Number.isFinite(pace) ? pace.toFixed(2) : '—';
      const detectedRow = row.source === 'detected';
      return `<tr>
        <td>${escapeHtml(row.tap || '—')}</td>
        <td>${escapeHtml(row.set_name || '—')}</td>
        <td>${escapeHtml(formatCutTime(row.held_seconds))}</td>
        <td>${escapeHtml(formatCutTime(row.estimated_seconds))}</td>
        <td>${escapeHtml(paceText)}</td>
        <td><span class="run-source ${detectedRow ? 'is-detected' : ''}">${escapeHtml(detectedRow ? 'measured' : 'hand')}</span></td>
      </tr>`;
    }).join('')
    : '<tr><td colspan="6" class="pq-note-empty">No measured sheets for this day.</td></tr>';

  registerRowCollapse(table, 'runTimesToggle', { noun: 'sheet' });
}

function _yesterdayIsoDate() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

function renderDepartmentScanMetrics(data) {
  const state = document.getElementById('departmentScanState');
  const pickingBand = document.getElementById('departmentScanPicking');
  const deptBody = document.querySelector('#departmentScanTable tbody');
  const empBody = document.querySelector('#departmentScanPickingTable tbody');
  if (state) {
    state.classList.remove('is-error');
    const log = data.log || {};
    const polled = log.last_poll_at ? ` Last poll ${log.last_poll_at}.` : ' Cache fills on Insight refresh.';
    state.textContent = `${data.day || ''} unique items, not scan rows.${polled}`;
  }
  const picking = data.picking || {};
  if (pickingBand) {
    pickingBand.innerHTML = [
      metricCard('Picking items', picking.unique_icns ?? 0, 'warehouse + custom-complete picking'),
      metricCard('Picking scan rows', picking.scan_rows ?? 0, 'raw Insight rows'),
    ].join('');
  }
  const departments = Array.isArray(data.departments) ? data.departments : [];
  if (deptBody) {
    deptBody.innerHTML = departments.length
      ? departments.map((row) => (
        `<tr><td>${row.label || row.cpt_id}</td>`
        + `<td>${row.unique_icns ?? 0}</td>`
        + `<td>${row.scan_rows ?? 0}</td></tr>`
      )).join('')
      : '<tr><td colspan="3" class="pq-note-empty">No cached scans for this day yet.</td></tr>';
  }
  const employees = Array.isArray(picking.by_employee) ? picking.by_employee : [];
  if (empBody) {
    empBody.innerHTML = employees.length
      ? employees.map((row) => (
        `<tr><td>${row.operator || ''}</td>`
        + `<td>${row.unique_icns ?? 0}</td>`
        + `<td>${row.scan_rows ?? 0}</td></tr>`
      )).join('')
      : '<tr><td colspan="3" class="pq-note-empty">No picking scans for this day.</td></tr>';
  }
}

async function loadDepartmentScanMetrics() {
  if (window.__cutHealthCompanyMode) return;
  const state = document.getElementById('departmentScanState');
  const dayEl = document.getElementById('departmentScanDay');
  if (dayEl && !dayEl.value) dayEl.value = _yesterdayIsoDate();
  const day = String(dayEl?.value || _yesterdayIsoDate()).trim();
  try {
    const data = await api(`/api/department-scan-metrics?day=${encodeURIComponent(day)}`);
    if (data && data.ok === false) {
      throw new Error(data.error || 'Could not load department metrics');
    }
    renderDepartmentScanMetrics(data);
  } catch (error) {
    if (state) {
      state.textContent = `Could not load department metrics: ${error.message || error}`;
      state.classList.add('is-error');
    }
  }
}

async function loadRunTimes({ day = '' } = {}) {
  if (_runTimesLoading) return;
  _runTimesLoading = true;
  const state = document.getElementById('runTimesState');
  try {
    const target = String(day || document.getElementById('runTimesDay')?.value || '').trim();
    const url = target
      ? `/api/run-times?day=${encodeURIComponent(target)}`
      : '/api/run-times';
    const data = await api(url);
    renderRunTimes(data);
  } catch (error) {
    if (state) {
      state.textContent = `Could not load run times: ${error.message || error}`;
      state.classList.add('is-error');
    }
  } finally {
    _runTimesLoading = false;
  }
}

/* -----------------------------------------------------------------
   Day timeline.

   The metrics panel above aggregates, and an aggregate is the one
   shape that hides the day this was built for: a set handed over, the
   operator started on the first sheet, and hours later he is on the
   second. Both sheets are ordinary. The hole between them is the
   finding, so it gets its own row and its own colour.

   Two rules the rendering must not break. A hand-marked sheet never
   renders in the shape of a measured one -- it has no duration, and
   showing it alike is what makes the report arguable the first time
   somebody contests it. And a gap in front of a hand mark is shown as
   unknown rather than as a number, because that sheet may have been
   cut in the morning and marked at four o'clock.
   ----------------------------------------------------------------- */
let _runTimelineLoading = false;

function formatClock(stamp) {
  const text = String(stamp || '').trim();
  if (!text) return '—';
  const match = text.match(/\b(\d{2}):(\d{2}):(\d{2})\b/);
  return match ? `${match[1]}:${match[2]}` : text;
}

function formatIdleSpan(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value < 0) return '—';
  const hours = Math.floor(value / 3600);
  const mins = Math.round((value % 3600) / 60);
  if (hours <= 0) return `${mins}m`;
  return `${hours}h ${String(mins).padStart(2, '0')}m`;
}

function idleSpanHasAMinute(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value < 0) return false;
  const hours = Math.floor(value / 3600);
  const mins = Math.round((value % 3600) / 60);
  return hours > 0 || mins > 0;
}

function resetHandleFromPayload(data) {
  const handle = data && data.reset_handle;
  return {
    sheetFloor: Number(handle && handle.sheet_floor_seconds) || 90,
    logMin: Number(handle && handle.operator_reset_minimum_seconds) || 3,
  };
}

function timelineEntryRow(entry, handle) {
  const kind = String(entry?.kind || '');
  if (kind === 'break') {
    // Scheduled break, sitting between the idle either side of it. Its own row
    // with the window's clock times, because a 62 minute stretch across lunch
    // is 18 idle + 30 lunch + 14 idle, and only the 32 belongs to anybody.
    const note = entry.break_note
      ? `<span class="tl-break-note">${escapeHtml(entry.break_note)}</span>` : '';
    return `<li class="tl-row tl-break">
      <span class="tl-clock">${escapeHtml(entry.tap || '')}</span>
      <span class="tl-body"><span class="tl-break-label">${escapeHtml(entry.break_label || 'Break')}</span>
      <span class="tl-break-span">${escapeHtml(formatIdleSpan(entry.break_seconds))} not counted</span>${note}</span>
    </li>`;
  }
  // A zero-length idle row is noise: it happens when a break lands exactly at
  // the start or end of a gap.
  if (kind === 'idle' && !idleSpanHasAMinute(entry.idle_seconds)) return '';
  if (kind === 'idle') {
    // A gap is not automatically idle. The control's own program numbers say
    // whether the operator was loading, whether a tool change was running, or
    // whether the machine was cutting another set entirely -- on 13 August
    // barely half of the time shown as idle was actually nobody responding,
    // and one 19-minute "idle" was 18 minutes of loading.
    const parts = [];
    if (entry.classified) {
      if (idleSpanHasAMinute(entry.loading_seconds)) {
        parts.push(`${escapeHtml(formatIdleSpan(entry.loading_seconds))} loading`);
      }
      if (idleSpanHasAMinute(entry.other_cutting_seconds)) {
        parts.push(`${escapeHtml(formatIdleSpan(entry.other_cutting_seconds))} machine on other work`);
      }
      if (idleSpanHasAMinute(entry.tool_change_seconds)) {
        parts.push(`${escapeHtml(formatIdleSpan(entry.tool_change_seconds))} tool change`);
      }
      if (idleSpanHasAMinute(entry.waiting_seconds)) {
        parts.push(`<b>${escapeHtml(formatIdleSpan(entry.waiting_seconds))} idle</b>`);
      }
    }
    const label = parts.length
      ? `${escapeHtml(formatIdleSpan(entry.idle_seconds))} gap &middot; ${parts.join(' &middot; ')}`
      : `${escapeHtml(formatIdleSpan(entry.idle_seconds))} ${entry.classified ? 'idle' : 'not cutting'}`;
    return `<li class="tl-row tl-idle">
      <span class="tl-clock"></span>
      <span class="tl-body"><span class="tl-idle-rule"></span>
      <span class="tl-idle-label">${label}</span></span>
    </li>`;
  }
  if (kind === 'set_loaded') {
    return `<li class="tl-row tl-loaded">
      <span class="tl-clock">${escapeHtml(formatClock(entry.at))}</span>
      <span class="tl-body"><strong>SET LOADED</strong></span>
    </li>`;
  }
  if (kind === 'unmark') {
    return `<li class="tl-row tl-unmark">
      <span class="tl-clock">${escapeHtml(formatClock(entry.at))}</span>
      <span class="tl-body"><strong>${escapeHtml(entry.tap || '—')}</strong>
      <span class="tl-note">mark removed</span></span>
    </li>`;
  }
  // Ran and measured, owner unknown. Must never render like a counted sheet:
  // the default row below carries a "measured" badge, and a run nobody could
  // name wearing that badge is how the wrong set gets credited on sight.
  if (kind === 'unattributed') {
    const ranFor = Number(entry.held_seconds);
    return `<li class="tl-row tl-rerun">
      <span class="tl-clock">${escapeHtml(formatClock(entry.started_at || entry.at))}</span>
      <span class="tl-body"><strong>${escapeHtml(entry.tap || '—')}</strong>
      <span class="tl-note">${ranFor ? `ran ${escapeHtml(formatCutTime(ranFor))} · ` : ''}ran, but no set could be named — not counted as a sheet</span></span>
    </li>`;
  }
  if (kind === 'station_launched' || kind === 'station_closed') {
    const label = kind === 'station_launched' ? 'STATION OPENED' : 'STATION CLOSED';
    const setNote = entry.set_name
      ? ` · ${escapeHtml(entry.set_name)}`
      : '';
    return `<li class="tl-row tl-station">
      <span class="tl-clock">${escapeHtml(formatClock(entry.at))}</span>
      <span class="tl-body"><strong>${label}</strong>
      <span class="tl-note">${escapeHtml(entry.station || 'station')}${setNote}</span></span>
    </li>`;
  }
  if (kind === 'spoilboard') {
    return `<li class="tl-row tl-spoilboard">
      <span class="tl-clock">${escapeHtml(formatClock(entry.started_at || entry.at))}</span>
      <span class="tl-body"><strong>RESURFACING SPOILBOARD</strong>
      <span class="tl-note">ran ${escapeHtml(formatCutTime(entry.held_seconds || entry.spoilboard_seconds))}</span>
      <span class="run-source is-spoilboard">maintenance</span></span>
    </li>`;
  }
  if (kind === 'other_cutting') {
    const held = Number(entry.held_seconds || entry.other_cutting_seconds);
    if (!idleSpanHasAMinute(held)) return '';
    const duration = Number.isFinite(held) && held > 0
      ? `ran ${escapeHtml(formatCutTime(held))}` : '';
    return `<li class="tl-row tl-othercut">
      <span class="tl-clock">${escapeHtml(formatClock(entry.started_at || entry.at))}</span>
      <span class="tl-body"><strong>${escapeHtml(entry.tap || 'CUTTING')}</strong>
      <span class="tl-note">${duration} — not counted as a sheet</span>
      <span class="run-source is-othercut">cutting</span></span>
    </li>`;
  }
  if (kind === 'alarm' || kind === 'machine_issue') {
    const held = Number(entry.held_seconds || entry.alarm_seconds);
    const duration = Number.isFinite(held) && held > 0
      ? `ran ${escapeHtml(formatCutTime(held))}` : '';
    const note = String(entry.fault_note || '').trim();
    const ack = note
      ? `<span class="tl-note">${escapeHtml(note)}</span>`
      : '';
    return `<li class="tl-row tl-alarm">
      <span class="tl-clock">${escapeHtml(formatClock(entry.started_at || entry.at))}</span>
      <span class="tl-body"><strong>Alarm detected</strong>
      <span class="tl-note">${duration}</span>
      ${ack}
      <span class="run-source is-alarm">e-stop</span></span>
    </li>`;
  }
  if (kind === 'abort') {
    const floor = Number(handle && handle.sheetFloor) || 90;
    const held = Number(entry.held_seconds);
    const heldNote = Number.isFinite(held) && held > 0
      ? `held ${held}s` : 'likely press';
    return `<li class="tl-row tl-abort">
      <span class="tl-clock">${escapeHtml(formatClock(entry.at))}</span>
      <span class="tl-body"><strong>${escapeHtml(entry.tap || '—')}</strong>
      <span class="tl-note">RESET pressed (${heldNote}, under ${floor}s) — not counted as a sheet</span></span>
    </li>`;
  }
  if (kind === 'rerun') {
    const held = Number(entry.held_seconds);
    const ran = Number.isFinite(held) && held > 0
      ? ` · ${escapeHtml(formatCutTime(held))}` : '';
    const replenishment = entry.intentional_replenishment === true;
    const rowClass = replenishment ? 'tl-rerun is-replenishment' : 'tl-rerun';
    const note = replenishment
      ? `stock replenishment repeat${ran}`
      : `same tap reran${ran} — not counted as a sheet`;
    return `<li class="tl-row ${rowClass}">
      <span class="tl-clock">${escapeHtml(formatClock(entry.started_at || entry.at))}</span>
      <span class="tl-body"><strong>${escapeHtml(entry.tap || '—')}</strong>
      <span class="tl-note">${note}</span></span>
    </li>`;
  }

  const measured = entry?.measured === true;
  // Number(null) is 0 and passes isFinite, so an absent ratio would print as
  // "pace 0.00" -- a fabricated number on a record that carries none.
  const pace = entry?.pace_ratio == null ? NaN : Number(entry.pace_ratio);
  const paceText = Number.isFinite(pace) ? ` · pace ${pace.toFixed(2)}` : '';
  // The clock shows when the sheet started, because that is the moment the
  // operator began. The stamp in the log is the release at the other end.
  const clock = measured ? formatClock(entry.started_at) : formatClock(entry.at);
  const detail = measured
    ? `ran ${formatCutTime(entry.held_seconds)}${paceText}`
    : 'marked by hand — no measured time';
  // Measured, but the operator had already marked it before the control
  // finished. The time is real; that he marked it early is worth seeing.
  const preMarked = measured && entry?.marked_by_hand === true;
  const badge = measured
    ? `<span class="run-source is-detected">measured</span>${preMarked
      ? '<span class="run-source is-premarked" title="Marked by the operator before the control finished the sheet.">marked early</span>'
      : ''}`
    : '<span class="run-source">hand</span>';
  return `<li class="tl-row tl-sheet${measured ? '' : ' is-hand'}">
    <span class="tl-clock">${escapeHtml(clock)}</span>
    <span class="tl-body"><strong>${escapeHtml(entry.tap || '—')}</strong>
    <span class="tl-note">${escapeHtml(detail)}</span>
    ${badge}</span>
  </li>`;
}

function timelineSetCard(set, handle) {
  const entries = set?.entries || [];
  const sheets = Number(set.sheets) || 0;
  const measured = Number(set.measured_sheets) || 0;
  const waiting = Number(set.waiting_seconds) || 0;
  const longestWait = Number(set.longest_waiting_seconds) || 0;
  const handNote = sheets > measured
    ? ` · ${sheets - measured} hand-marked`
    : '';
  const abortNote = Number(set.aborts)
    ? ` · ${set.aborts} RESET${Number(set.aborts) === 1 ? '' : 's'}`
    : '';
  // Waiting is operator engagement, not every hole. Loading, other work, and
  // changeovers under five minutes stay in the row breakdown, not this total.
  const waitNote = longestWait
    ? `<span class="tl-flag">longest idle ${escapeHtml(formatIdleSpan(longestWait))}</span>`
    : '';
  const openNote = set.loaded_at
    ? `loaded ${escapeHtml(formatClock(set.loaded_at))}`
    : 'load time unavailable';
  // A set the operator left and came back to gets one card per visit, so the
  // day reads in the order it happened. Only say so when there was more
  // than one -- on a normal set this line would be noise.
  const visitNote = Number(set.visit_count) > 1
    ? ` · visit ${escapeHtml(String(set.visit))} of ${escapeHtml(String(set.visit_count))}`
    : '';

  return `<article class="tl-set">
    <header class="tl-set-head">
      <div>
        <h3>${escapeHtml(set.set_name || set.set_id || 'Unnamed set')}</h3>
        <p class="tl-set-sub">${openNote}${visitNote} · ${escapeHtml(String(measured))} of ${escapeHtml(String(sheets))} sheet${sheets === 1 ? '' : 's'} measured${escapeHtml(handNote)}${escapeHtml(abortNote)}${set.station ? ` · ${escapeHtml(set.station)}` : ''}</p>
      </div>
      <div class="tl-set-figures">
        <span class="tl-figure"><span>${escapeHtml(formatCutTime(set.cutting_seconds))}</span>cutting</span>
        <span class="tl-figure${waiting ? ' is-flagged' : ''}"><span>${escapeHtml(formatIdleSpan(waiting))}</span>idle</span>
      </div>
    </header>
    ${waitNote}
    <ol class="tl-list">${entries.map((entry) => timelineEntryRow(entry, handle)).join('')}</ol>
  </article>`;
}

function renderRunTimeline(data) {
  const state = document.getElementById('runTimelineState');
  const host = document.getElementById('runTimelineSets');
  if (!state || !host) return;

  if (!data?.ok) {
    state.textContent = data?.error
      ? `Could not read the run log: ${data.error}`
      : 'Could not read the run log.';
    state.classList.add('is-error');
    host.innerHTML = '';
    return;
  }
  state.classList.remove('is-error');

  if (!data.exists) {
    // Name every folder that was looked in, not one of them. The reader is
    // handed the batch day plus today, so "no run log for 8-5" was both
    // incomplete and misleading -- it read as "nothing happened today" while
    // the station log for that very day sat in the batch day's folder.
    state.textContent = `No run log in ${describeDaysRead(data)}. `
      + 'The station writes it beside the set, so a day with no batches of its '
      + 'own has none here. The event log below reads the same folders.';
    host.innerHTML = '';
    return;
  }

  const sets = data.sets || [];
  if (!sets.length) {
    state.textContent = `${data.day}: the log exists but holds no sheets yet.`;
    host.innerHTML = '';
    return;
  }

  // Say plainly when the opening bookend is missing, rather than letting a
  // timeline that starts at the first finished sheet imply the set was loaded
  // then. A slow start is invisible without it.
  const loadNote = data.has_load_times
    ? ''
    : ' Load times were unavailable, so each set opens at its first finished sheet.';
  const handle = resetHandleFromPayload(data);
  const stationEvents = (data.station_events || []).map((entry) => timelineEntryRow(entry, handle)).join('');
  const stationStrip = stationEvents
    ? `<section class="tl-station-strip"><h4 class="tl-station-title">Station session</h4><ul class="tl-list">${stationEvents}</ul></section>`
    : '';
  state.textContent = `${data.day}: ${sets.length} set${sets.length === 1 ? '' : 's'}.`
    + ` Gaps over ${Math.round(Number(data.idle_floor_seconds || 300) / 60)} minutes are called out.`
    + loadNote;

  host.innerHTML = stationStrip + sets.map((set) => timelineSetCard(set, handle)).join('');
}

async function loadRunTimeline({ day = '' } = {}) {
  if (_runTimelineLoading) return;
  _runTimelineLoading = true;
  const state = document.getElementById('runTimelineState');
  try {
    const target = String(day || document.getElementById('runTimelineDay')?.value || '').trim();
    const url = target
      ? `/api/run-times/timeline?day=${encodeURIComponent(target)}`
      : '/api/run-times/timeline';
    const data = await api(url);
    renderRunTimeline(data);
  } catch (error) {
    if (state) {
      state.textContent = `Could not load the timeline: ${error.message || error}`;
      state.classList.add('is-error');
    }
  } finally {
    _runTimelineLoading = false;
  }
}

// The station log, straight through. Every other view of this data rolls it up
// into per-set totals; this one deliberately does not, because the question it
// answers is "what happened at 09:51", which a total cannot answer.
let _runEventLogLoading = false;
let _runEventLogText = '';

const RUN_EVENT_TAG_CLASS = {
  SYSTEM: 'is-system',
  JOB: 'is-job',
  TAP: 'is-tap',
  WARNING: 'is-warning',
  ERROR: 'is-error',
};

function renderRunEventLog(data) {
  const state = document.getElementById('runEventLogState');
  const console_ = document.getElementById('runEventLogConsole');
  if (!console_) return;
  _runEventLogText = String(data?.text || '');

  const sections = Array.isArray(data?.sections) ? data.sections : [];
  const days = Array.isArray(data?.days_read) ? data.days_read.join(' + ') : '';
  if (!sections.length) {
    console_.innerHTML = '';
    if (state) {
      state.textContent = data?.exists
        ? `No station events recorded for ${days || 'these days'}.`
        : `No station log for ${days || 'these days'}. Either the share is unreachable from here, or the station has not written.`;
      state.classList.remove('is-error');
    }
    return;
  }
  if (state) {
    state.textContent = `Reading ${days}. Times are the station's own clock.`;
    state.classList.remove('is-error');
  }

  const multi = sections.length > 1;
  const out = [];
  sections.forEach((section) => {
    if (multi) {
      out.push(`<div class="run-eventlog-date">--- ${escapeHtml(section.date || '')} ---</div>`);
    }
    let previousTag = '';
    (section.lines || []).forEach((line) => {
      const tag = String(line.tag || 'SYSTEM');
      if (previousTag && tag !== previousTag) out.push('<div class="run-eventlog-gap"></div>');
      previousTag = tag;
      const cls = RUN_EVENT_TAG_CLASS[tag] || 'is-system';
      out.push(
        `<div class="run-eventlog-line">`
        + `<span class="run-eventlog-time">${escapeHtml(line.time || '')}</span>`
        + `<span class="run-eventlog-tag ${cls}">[${escapeHtml(tag)}]</span>`
        + `<span class="run-eventlog-text">${escapeHtml(line.text || '')}</span>`
        + `</div>`
      );
      if (line.detail) {
        out.push(
          `<div class="run-eventlog-line is-detail">`
          + `<span class="run-eventlog-time"></span>`
          + `<span class="run-eventlog-tag"></span>`
          + `<span class="run-eventlog-text">${escapeHtml(line.detail)}</span>`
          + `</div>`
        );
      }
    });
    out.push('<div class="run-eventlog-gap"></div>');
    out.push(
      `<div class="run-eventlog-line is-summary">`
      + `<span class="run-eventlog-time"></span>`
      + `<span class="run-eventlog-tag is-summary">[SUMMARY]</span>`
      + `<span class="run-eventlog-text"></span></div>`
    );
    const tally = [
      ['Payload Loads', section.payload_loads],
      ['Distinct Jobs', section.distinct_jobs],
      ['Taps Completed', section.taps_completed],
      ['Released Early', section.taps_aborted],
      ['Runtime', formatRunClock(section.runtime_seconds)],
      ['Idle Time', formatRunClock(section.idle_seconds)],
    ];
    tally.forEach(([label, value]) => {
      if (value === null || value === undefined) return;
      out.push(
        `<div class="run-eventlog-line is-detail">`
        + `<span class="run-eventlog-time"></span>`
        + `<span class="run-eventlog-tag"></span>`
        + `<span class="run-eventlog-text">${escapeHtml(label)}: ${escapeHtml(String(value))}</span>`
        + `</div>`
      );
    });
  });
  console_.innerHTML = out.join('');
}

function formatRunClock(seconds) {
  if (seconds === null || seconds === undefined) return null;
  const total = Math.max(Number(seconds) || 0, 0);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours) return `${hours}h ${String(minutes).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`;
  if (minutes) return `${minutes}m ${String(secs).padStart(2, '0')}s`;
  return `${secs}s`;
}

async function loadRunEventLog({ day = '' } = {}) {
  if (_runEventLogLoading) return;
  _runEventLogLoading = true;
  const state = document.getElementById('runEventLogState');
  try {
    const target = String(day || document.getElementById('runEventLogDay')?.value || '').trim();
    const url = target
      ? `/api/run-times/events?day=${encodeURIComponent(target)}`
      : '/api/run-times/events';
    renderRunEventLog(await api(url));
  } catch (error) {
    if (state) {
      state.textContent = `Could not load the event log: ${error.message || error}`;
      state.classList.add('is-error');
    }
  } finally {
    _runEventLogLoading = false;
  }
}

let _glassPrepLoading = false;
let _glassPrepData = null;
const GLASS_PREP_LOCATION_KEY = 'cutHealthGlassPrepLocation';

const GLASS_FLAG_ORDER = [
  'no_glass_allocated',
  'panes_do_not_match_doors',
  'not_found_in_custom_feed',
  'glass_without_pfg',
  'pfg_without_glass',
];

const GLASS_FLAG_LABELS = {
  no_glass_allocated: 'No glass allocated',
  panes_do_not_match_doors: 'Panes do not match doors',
  not_found_in_custom_feed: 'Not in Custom yet',
  glass_without_pfg: 'Glass without PFG',
  pfg_without_glass: 'PFG without glass',
};

function glassPrepBadge(label, className = '', title = '') {
  return `<span class="pq-status-badge ${className}"${title ? ` title="${escapeHtml(title)}"` : ''}>${escapeHtml(label)}</span>`;
}

function glassPrepStockStatus(cab) {
  const status = String(cab?.stock?.status || 'needed').toLowerCase();
  return ['stocked', 'pulled'].includes(status) ? status : 'needed';
}

function glassPrepStockCounts(cabinets) {
  const counts = { needed: 0, stocked: 0, pulled: 0 };
  (cabinets || []).forEach((cab) => {
    const qty = Math.max(Number(cab.quantity) || 1, 1);
    counts[glassPrepStockStatus(cab)] += qty;
  });
  return counts;
}

function renderGlassPrepStockItem(cab) {
  const qty = Math.max(Number(cab.quantity) || 1, 1);
  const stock = cab.stock || {};
  const status = glassPrepStockStatus(cab);
  const item = String(cab.item_number || cab.product || 'Unknown door').trim();
  const identity = [cab.line_number ? `Line ${cab.line_number}` : '', cab.product || '', cab.icn_id ? `ICN ${cab.icn_id}` : '']
    .filter(Boolean)
    .join(' · ');
  const location = String(stock.location || '').trim();
  const when = status === 'pulled' ? stock.pulled_at : stock.cut_at;
  const statusCopy = status === 'stocked'
    ? `In stock${location ? ` · ${location}` : ''}`
    : status === 'pulled'
      ? `Pulled${location ? ` from ${location}` : ''}`
      : 'Needs routing';
  const statusClass = status === 'stocked'
    ? 'glass-prep-stocked'
    : status === 'pulled'
      ? 'glass-prep-pulled'
      : 'glass-prep-needed';

  let actions = '';
  if (status === 'needed') {
    actions = '<button class="button compact glass-prep-stock-action" type="button" data-glass-stock-action="cut">Mark routed</button>';
  } else if (status === 'stocked') {
    actions = `<button class="button compact glass-prep-stock-action" type="button" data-glass-stock-action="pull">Pull from stock</button>
      <button class="button secondary compact glass-prep-stock-action" type="button" data-glass-stock-action="cut">Update location</button>
      <button class="button secondary compact glass-prep-stock-action" type="button" data-glass-stock-action="reset">Undo</button>`;
  } else {
    actions = `<button class="button secondary compact glass-prep-stock-action" type="button" data-glass-stock-action="return">Return to stock</button>
      <button class="button secondary compact glass-prep-stock-action" type="button" data-glass-stock-action="reset">Undo</button>`;
  }

  return `<div class="glass-prep-stock-item" data-stock-id="${escapeHtml(stock.stock_id || '')}">
    <span class="glass-prep-stock-identity">
      <strong>${escapeHtml(`${item}${qty > 1 ? ` ×${qty}` : ''}`)}</strong>
      <small>${escapeHtml(identity || 'Glass door')}${when ? ` · ${escapeHtml(formatTimestamp(when))}` : ''}</small>
    </span>
    ${glassPrepBadge(statusCopy, statusClass)}
    <span class="glass-prep-stock-actions">${actions}</span>
  </div>`;
}

function renderGlassPrepGuide(data) {
  const byType = data?.totals?.by_glass_type || {};
  const flags = data?.flags || [];
  const flagLabels = new Map(flags.map((flag) => [flag.flag, flag.label]));
  const flagGroups = new Map();
  (data?.cabinets || []).forEach((cab) => {
    const qty = Math.max(Number(cab.quantity) || 1, 1);
    (cab.flags || []).forEach((flag) => {
      const current = flagGroups.get(flag) || { count: 0, label: flagLabels.get(flag) };
      current.count += qty;
      flagGroups.set(flag, current);
    });
  });

  const glassBadges = Object.entries(byType).map(([name, count]) => (
    glassPrepBadge(`${name} ${count}`, 'glass-prep-type')
  ));
  const flagBadges = [...flagGroups.entries()]
    .sort((a, b) => GLASS_FLAG_ORDER.indexOf(a[0]) - GLASS_FLAG_ORDER.indexOf(b[0]))
    .map(([flag, group]) => glassPrepBadge(
      `${GLASS_FLAG_LABELS[flag] || group.label || flag} ${group.count}`,
      'glass-prep-warning',
      group.label || GLASS_FLAG_LABELS[flag] || flag,
    ));
  const stockCounts = glassPrepStockCounts(data?.cabinets || []);

  return `<span class="pq-guide-group">
      <span class="pq-guide-label">Glass</span>
      ${glassBadges.join('') || glassPrepBadge('Unspecified', 'glass-prep-type')}
    </span>
    <span class="pq-guide-group">
      <span class="pq-guide-label">PFG stock</span>
      ${glassPrepBadge(`Need routing ${stockCounts.needed}`, 'glass-prep-needed')}
      ${glassPrepBadge(`In stock ${stockCounts.stocked}`, 'glass-prep-stocked')}
      ${glassPrepBadge(`Pulled ${stockCounts.pulled}`, 'glass-prep-pulled')}
    </span>
    ${flagBadges.length ? `<span class="pq-guide-group">
      <span class="pq-guide-label">Needs attention</span>
      ${flagBadges.join('')}
    </span>` : `<span class="pq-guide-group">
      <span class="pq-guide-label">Checks</span>
      ${glassPrepBadge('No mismatches', 'glass-prep-ready')}
    </span>`}`;
}

function renderGlassPrepJob(job) {
  const glassTypes = new Set();
  const colors = new Set();
  const cutStatuses = new Set();
  const doorStatuses = new Set();
  const flagCounts = new Map();
  let cabinetCount = 0;
  let doorCount = 0;
  let paneCount = 0;
  let unknownCount = 0;
  let glassCabinetCount = 0;
  const stockCounts = glassPrepStockCounts(job.cabinets);

  job.cabinets.forEach((cab) => {
    const qty = Math.max(Number(cab.quantity) || 1, 1);
    cabinetCount += qty;
    (cab.glass_types || []).forEach((name) => glassTypes.add(name));
    if (cab.pfg && !(cab.glass_types || []).length) glassTypes.add('PFG only');
    if (cab.color) colors.add(cab.color);
    if (cab.status) cutStatuses.add(cab.status);
    (cab.door_statuses || []).forEach((status) => doorStatuses.add(status));
    (cab.flags || []).forEach((flag) => flagCounts.set(flag, (flagCounts.get(flag) || 0) + qty));

    if (cab.glass) glassCabinetCount += qty;
    if (cab.doors === null || cab.doors === undefined) {
      if (cab.glass) unknownCount += qty;
    } else {
      doorCount += Number(cab.doors) * qty;
      paneCount += Number(cab.panes_allocated || 0) * qty;
    }
  });

  const colorSummary = [...colors].join(', ');
  const doorSummary = !glassCabinetCount
    ? 'no glass type on label'
    : unknownCount
      ? `${doorCount ? `${doorCount} known door${doorCount === 1 ? '' : 's'} · ` : ''}${unknownCount} cabinet${unknownCount === 1 ? '' : 's'} with doors unknown`
      : `${doorCount} door${doorCount === 1 ? '' : 's'} · ${paneCount} pane${paneCount === 1 ? '' : 's'}`;
  const statusSummary = [...doorStatuses].join(', ');
  const typeBadges = [...glassTypes].map((name) => glassPrepBadge(name, 'glass-prep-type'));
  const cutBadges = [...cutStatuses].map((status) => glassPrepBadge(status, 'glass-prep-cut'));
  const flagBadges = [...flagCounts.entries()]
    .sort((a, b) => GLASS_FLAG_ORDER.indexOf(a[0]) - GLASS_FLAG_ORDER.indexOf(b[0]))
    .map(([flag, count]) => glassPrepBadge(
      `${GLASS_FLAG_LABELS[flag] || flag}${count > 1 ? ` ×${count}` : ''}`,
      'glass-prep-warning',
    ));
  const stockBadges = [
    stockCounts.needed ? glassPrepBadge(`Need routing ${stockCounts.needed}`, 'glass-prep-needed') : '',
    stockCounts.stocked ? glassPrepBadge(`In stock ${stockCounts.stocked}`, 'glass-prep-stocked') : '',
    stockCounts.pulled ? glassPrepBadge(`Pulled ${stockCounts.pulled}`, 'glass-prep-pulled') : '',
  ].filter(Boolean);
  const flagged = flagCounts.size > 0;
  const doorValue = !glassCabinetCount || unknownCount ? (doorCount ? `${doorCount}+` : '—') : doorCount;
  const doorAria = !glassCabinetCount
    ? 'No glass doors specified'
    : unknownCount
      ? `${doorCount} known glass doors; door count unknown for ${unknownCount} cabinets`
      : `${doorCount} glass doors`;

  return `<article class="pq-job-row glass-prep-job-row${flagged ? ' is-flagged' : ''}">
    <span class="glass-prep-row-marker" aria-hidden="true"></span>
    <div class="pq-job-po">
      <span class="pq-job-name">${escapeHtml(job.poNumber || '—')}</span>
      <span class="pq-job-floor-meta">${escapeHtml(`${cabinetCount} door${cabinetCount === 1 ? '' : 's'} to route · ${doorSummary}${colorSummary ? ` · ${colorSummary}` : ''}`)}</span>
      <span class="pq-job-statuses" aria-label="Glass job status">
        ${typeBadges.join('')}
        ${cutBadges.join('')}
        ${glassCabinetCount ? (unknownCount ? glassPrepBadge('Doors unknown', 'glass-prep-unknown') : glassPrepBadge('Custom matched', 'glass-prep-ready')) : ''}
        ${statusSummary ? glassPrepBadge(`Doors: ${statusSummary}`, 'glass-prep-door-status') : ''}
        ${stockBadges.join('')}
        ${flagBadges.join('')}
      </span>
      <div class="glass-prep-stock-items" aria-label="PFG door stock">${job.cabinets.map(renderGlassPrepStockItem).join('')}</div>
    </div>
    <span class="pq-job-items" title="Doors to route" aria-label="${cabinetCount} door${cabinetCount === 1 ? '' : 's'} to route">${cabinetCount}</span>
    <span class="pq-job-unique" title="Glass doors" aria-label="${escapeHtml(doorAria)}">${doorValue}</span>
  </article>`;
}

function renderGlassPrepList(cabinets) {
  const groups = new Map();
  cabinets.forEach((cab) => {
    const date = String(cab.scheduled_date || '').trim();
    if (!groups.has(date)) groups.set(date, new Map());
    const jobs = groups.get(date);
    const poNumber = String(cab.po_number || '').trim();
    if (!jobs.has(poNumber)) jobs.set(poNumber, { poNumber, cabinets: [] });
    jobs.get(poNumber).cabinets.push(cab);
  });

  return [...groups.entries()].map(([date, jobs]) => {
    const jobList = [...jobs.values()];
    const cabinetCount = jobList.reduce(
      (total, job) => total + job.cabinets.reduce(
        (jobTotal, cab) => jobTotal + Math.max(Number(cab.quantity) || 1, 1),
        0,
      ),
      0,
    );
    return `<section class="pq-date-group glass-prep-date-group">
      <div class="pq-date-header glass-prep-date-header">
        <span class="pq-date-label"><strong>${date ? `Scheduled ${escapeHtml(formatDateUS(date))}` : 'Unscheduled'}</strong></span>
        <span class="pq-date-meta">${jobList.length} job${jobList.length === 1 ? '' : 's'}, ${cabinetCount} door${cabinetCount === 1 ? '' : 's'} to route</span>
      </div>
      <div class="pq-jobs-list">${jobList.map(renderGlassPrepJob).join('')}</div>
    </section>`;
  }).join('');
}

function renderGlassPrep(data) {
  const state = document.getElementById('glassPrepState');
  const metrics = document.getElementById('glassPrepMetrics');
  const flagBox = document.getElementById('glassPrepFlags');
  const list = document.getElementById('glassPrepList');
  const detail = document.getElementById('glassPrepDetail');
  if (!state || !metrics || !list) return;

  if (!data?.ok) {
    state.textContent = data?.error
      ? `Could not build the glass prep view: ${data.error}`
      : 'Could not build the glass prep view.';
    state.classList.add('is-error');
    metrics.innerHTML = '';
    if (flagBox) flagBox.innerHTML = '';
    list.innerHTML = '';
    if (detail) detail.hidden = true;
    return;
  }
  state.classList.remove('is-error');
  _glassPrepData = data;

  const cabinets = data.cabinets || [];
  const totals = data.totals || {};
  const custom = data.custom_feed || {};
  const customUsable = Boolean(custom.available && !custom.stale);
  const unknown = Number(totals.doors_unknown) || 0;

  if (!cabinets.length) {
    state.textContent = 'No glass doors currently need CNC panel removal.';
    metrics.innerHTML = '';
    if (flagBox) flagBox.innerHTML = '';
    list.innerHTML = '';
    if (detail) detail.hidden = true;
    return;
  }
  if (detail) detail.hidden = false;

  // The Custom workbook is enrichment. Say plainly when doors could not be
  // read, so an empty Doors column is never mistaken for "no doors exist".
  const customNote = custom.stale
    ? ` Custom enrichment is stale (${custom.refreshed_at ? escapeHtml(String(custom.refreshed_at).slice(0, 16).replace('T', ' ')) : 'refresh date unknown'}), so it is not being used for pane checks.`
    : custom.available
    ? ` Doors and panes read from Custom${custom.refreshed_at ? ` (refreshed ${escapeHtml(String(custom.refreshed_at).slice(0, 16).replace('T', ' '))})` : ''}.`
    : ' The Custom workbook could not be read from here, so door and pane counts are unknown.';
  const unknownNote = customUsable && unknown
    ? ` ${unknown} cabinet${unknown === 1 ? ' is' : 's are'} not in the Custom feed yet.`
    : '';
  state.textContent = `${Number(totals.cabinets) || 0} glass door${(Number(totals.cabinets) || 0) === 1 ? '' : 's'} awaiting CNC panel removal `
    + `across ${Number(totals.jobs) || 0} job${(Number(totals.jobs) || 0) === 1 ? '' : 's'}.${customNote}${unknownNote}`;

  const byType = totals.by_glass_type || {};
  const stockCounts = glassPrepStockCounts(cabinets);
  const typeText = Object.keys(byType).length
    ? Object.entries(byType).map(([name, count]) => `${count} ${name.toLowerCase()}`).join(' · ')
    : '—';
  metrics.innerHTML = [
    metricCard('Glass doors', escapeHtml(totals.doors ?? 0), 'live door ICNs'),
    metricCard('Panes allocated', escapeHtml(totals.panes_allocated ?? 0), 'LG- lines on those cabinets'),
    metricCard('Doors to route', escapeHtml(totals.cabinets ?? 0), escapeHtml(typeText)),
    metricCard('Doors unknown', escapeHtml(unknown), 'no Custom record yet'),
    metricCard('PFG stock', escapeHtml(stockCounts.stocked), `${stockCounts.needed} need routing · ${stockCounts.pulled} pulled`),
  ].join('');

  if (flagBox) flagBox.innerHTML = renderGlassPrepGuide(data);
  list.innerHTML = renderGlassPrepList(cabinets);
}

async function loadGlassPrep() {
  if (_glassPrepLoading) return;
  _glassPrepLoading = true;
  const state = document.getElementById('glassPrepState');
  try {
    const data = await api('/api/glass-prep');
    renderGlassPrep(data);
  } catch (error) {
    if (state) {
      state.textContent = `Could not load glass prep: ${error.message || error}`;
      state.classList.add('is-error');
    }
  } finally {
    _glassPrepLoading = false;
  }
}

async function updateGlassPrepStockFromButton(button) {
  const item = button.closest('.glass-prep-stock-item');
  const stockId = String(item?.dataset.stockId || '').trim();
  const action = String(button.dataset.glassStockAction || '').trim();
  const cab = (_glassPrepData?.cabinets || []).find(
    (candidate) => String(candidate?.stock?.stock_id || '') === stockId,
  );
  if (!cab || !action) return;

  const locationInput = document.getElementById('glassPrepLocation');
  const location = String(locationInput?.value || '').trim();
  if (action === 'cut' && !location) {
    locationInput?.focus();
    alert('Enter the rack, cart, or shelf in “Store in” before marking this door routed.');
    return;
  }
  if (action === 'reset' && !window.confirm('Remove the manual PFG routing / stock tracking for this door?')) {
    return;
  }

  button.disabled = true;
  const previousText = button.textContent;
  button.textContent = 'Saving…';
  try {
    const result = await api('/api/glass-prep/stock', {
      method: 'POST',
      body: JSON.stringify({
        action,
        stock_id: stockId,
        icn_id: cab.icn_id,
        po_number: cab.po_number,
        line_number: cab.line_number,
        product: cab.product,
        item_number: cab.item_number,
        quantity: Math.max(Number(cab.quantity) || 1, 1),
        location,
      }),
    });
    cab.stock = result.stock || { stock_id: stockId, status: 'needed' };
    if (action === 'cut') {
      localStorage.setItem(GLASS_PREP_LOCATION_KEY, location);
    }
    renderGlassPrep(_glassPrepData);
  } catch (error) {
    button.disabled = false;
    button.textContent = previousText;
    alert(error.message || String(error));
  }
}

function showCncWorkflowView(target, { scroll = false } = {}) {
  const requested = CNC_WORKFLOW_VIEW_ALIASES[target] || target;
  let next = CNC_WORKFLOW_VIEWS.includes(requested) ? requested : 'morning';
  if (window.__cutHealthCompanyMode && (next === 'glass' || next === 'pricing' || next === 'reference')) {
    next = 'production';
  }
  _cncWorkflowView = next;
  localStorage.setItem(CNC_WORKFLOW_VIEW_KEY, next);
  document.querySelectorAll('[data-cnc-workflow-view]').forEach((panel) => {
    panel.hidden = panel.dataset.cncWorkflowView !== next;
  });
  // Stock refreshes happen independently of navigation. Re-apply the view gate
  // after every workspace change so the Morning alert cannot leak elsewhere.
  syncRestockAlertVisibility();
  renderOfflineMode();
  document.querySelectorAll('[data-cnc-workflow-target]').forEach((tab) => {
    const active = tab.dataset.cncWorkflowTarget === next;
    tab.classList.toggle('is-active', active);
    tab.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  applyNewHireTaskVisibility();
  const copy = CNC_WORKFLOW_COPY[next] || CNC_WORKFLOW_COPY.morning;
  const title = document.getElementById('cncWorkflowTitle');
  const description = document.getElementById('cncWorkflowDescription');
  if (title) title.textContent = copy.title;
  if (description) description.textContent = copy.description;
  if (next === 'morning' && !_smartBatchPlan && !_smartBatchRunning) {
    // Landing / view switch: never pull Insight SQL (use shared snapshot).
    // Defer so the shell paints first; records fill in the same way as repo LC.
    scheduleDeferredDashboardLoad(() => {
      previewSmartBatches({ allowInsightRefresh: false }).catch(() => {});
    }, 0);
  }
  if (window.__cutHealthCompanyMode) {
    const scanPanel = document.getElementById('departmentScanPanel');
    if (scanPanel) scanPanel.hidden = true;
    const reviewPanel = document.getElementById('eodReviewPanel');
    if (reviewPanel) reviewPanel.hidden = true;
  }
  if (next === 'omni') {
    // Omni station history belongs beside the live queue and loads only when
    // that workspace is opened. Production Metrics remains department output.
    loadRunTimes().catch(() => {});
    loadRunTimeline().catch(() => {});
    loadRunEventLog().catch(() => {});
  }
  if (next === 'glass') {
    // Reads the shared snapshot and the Custom workbook; only on open.
    loadGlassPrep().catch(() => {});
  }
  if (next === 'production' && !window.__cutHealthCompanyMode) {
    loadDepartmentScanMetrics().catch(() => {});
    loadEodReview().catch(() => {});
  }
  if (next === 'pricing' && !window.__cutHealthCompanyMode) {
    loadPricingWorkspace().catch(() => {});
  }
  syncOmniFloorLiveStreamForView(next);
  if (scroll) {
    document.querySelector('.cnc-workflow-nav-panel')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  }
}

function getSmartBatchPayload(refreshOverride) {
  const maxEl = document.getElementById('smartBatchesMax');
  const capEl = document.getElementById('smartBatchesCap');
  const basisEl = document.getElementById('smartBatchesDateBasis');
  const refreshEl = document.getElementById('smartBatchesRefreshInsight');
  const rawMax = Number(maxEl?.value);
  return {
    max_cabinets: Number.isFinite(rawMax) && rawMax > 0 ? rawMax : SMART_BATCHES_MAX_DEFAULT,
    batch_cap: Math.max(1, Number(capEl?.value) || 15),
    date_basis: basisEl?.value || getPqDateBasis(),
    refresh_insight: typeof refreshOverride === 'boolean' ? refreshOverride : Boolean(refreshEl?.checked),
    output_route: getProductionOutputRoute(),
  };
}

function getProductionOutputRoute() {
  return document.querySelector('input[name="smartBatchesOutputRoute"]:checked')?.value || 'omni_tap';
}

function saveSmartBatchSettings() {
  const payload = getSmartBatchPayload(false);
  localStorage.setItem(SMART_BATCHES_MAX_KEY, String(payload.max_cabinets));
  localStorage.setItem(SMART_BATCHES_CAP_KEY, String(payload.batch_cap));
}

function restoreSmartBatchSettings() {
  const maxEl = document.getElementById('smartBatchesMax');
  const capEl = document.getElementById('smartBatchesCap');
  const basisEl = document.getElementById('smartBatchesDateBasis');
  const savedMax = localStorage.getItem(SMART_BATCHES_MAX_KEY);
  const savedCap = localStorage.getItem(SMART_BATCHES_CAP_KEY);
  if (maxEl) {
    // Migrate the one retired default (60). A saved value the operator chose
    // is theirs to keep; only 60 predates the control being exposed.
    const parsedMax = Number(savedMax);
    maxEl.value = savedMax && parsedMax > 0 && parsedMax !== 60 ? String(parsedMax) : String(SMART_BATCHES_MAX_DEFAULT);
  }
  if (capEl && savedCap) capEl.value = savedCap;
  if (basisEl) basisEl.value = getPqDateBasis();
}

function morningProducedTarget() {
  const raw = Number(
    _smartBatchPlan?.max_cabinets
      ?? document.getElementById('smartBatchesMax')?.value
      ?? SMART_BATCHES_MAX_DEFAULT,
  );
  return Number.isFinite(raw) ? Math.max(0, raw) : 0;
}

function morningProducedTargetLabel(target) {
  return target > 0 ? `${target} cabinet target` : 'no pipeline cap';
}

function paintMorningWipMetrics() {
  const wip = _morningWip;
  if (!wip) return;
  const strip = document.getElementById('smartBatchesWipMetrics');
  if (strip) {
    strip.innerHTML = [
      metricCard('Produced remaining', escapeHtml(wip.produced), morningProducedTargetLabel(wip.target)),
      metricCard('Awaiting TAPs', escapeHtml(wip.awaitingTaps), 'paperwork already produced'),
      metricCard('Ready & held', escapeHtml(wip.readyHeld), 'can be released to Omni'),
      metricCard('Recommended now', escapeHtml(wip.recommended), 'to refill the target'),
      metricCard('Cut awaiting wrap', escapeHtml(wip.cutAwaitingWrap), 'does not fill this target'),
    ].join('');
  }
  const stagingState = document.getElementById('smartStagingState');
  if (stagingState && !stagingState.classList.contains('is-error')) {
    const base = `${wip.produced} produced cabinet${wip.produced === 1 ? '' : 's'} remain unfinished.`;
    if (!stagingState.textContent.includes('left In Cutting')) {
      stagingState.textContent = base;
    }
  }
}

function applyMorningWip(pipeline, { recommended = null, fromPlan = false } = {}) {
  const outstanding = pipeline || {};
  const target = morningProducedTarget();
  const produced = Number(
    outstanding.produced_pipeline_cabinets
      ?? outstanding.cabinet_count
      ?? 0,
  );
  const available = target > 0 ? Math.max(target - produced, 0) : null;
  // Only the plan knows what it recommended. Staging polls every 20s carrying
  // pipeline counts and no recommendation, and this used to fall through to
  // `produced` -- a different quantity entirely, which made the tile mirror
  // "Produced remaining" and contradict the sentence directly above it (96 next
  // to "1325 more cabinets are recommended now").
  //
  // A caller without the figure must not overwrite one. When the pipeline
  // drifts, scheduleMorningPlanResyncIfWipDrifted re-runs the plan and supplies
  // a fresh number; until then the last real recommendation stands.
  let recommendedCabinets;
  if (recommended != null) {
    recommendedCabinets = Number(recommended);
  } else if (_morningWip && _morningWip.recommended != null) {
    recommendedCabinets = _morningWip.recommended;
  } else {
    // Nothing has planned yet: the target gap is the only honest answer, and
    // zero when there is no cap to refill.
    recommendedCabinets = available != null ? available : 0;
  }
  _morningWip = {
    produced,
    awaitingTaps: Number(outstanding.awaiting_taps_cabinets || 0),
    readyHeld: Number(outstanding.ready_held_cabinets || 0),
    cutAwaitingWrap: Number(outstanding.cut_awaiting_wrap_cabinets || 0),
    recommended: recommendedCabinets,
    target,
  };
  if (fromPlan) {
    _morningWipProducedAtPlan = produced;
  }
  paintMorningWipMetrics();
}

function scheduleMorningPlanResyncIfWipDrifted(produced) {
  if (_smartBatchRunning) return;
  if (_morningWipProducedAtPlan == null) return;
  if (Number(produced) === Number(_morningWipProducedAtPlan)) return;
  if (_morningWipResyncTimer) window.clearTimeout(_morningWipResyncTimer);
  // Staging polls every 20s; debounce so left plan catches up to the same WIP.
  _morningWipResyncTimer = window.setTimeout(() => {
    _morningWipResyncTimer = null;
    if (_cncWorkflowView !== 'morning' || _smartBatchRunning) return;
    previewSmartBatches({ allowInsightRefresh: false }).catch(() => {});
  }, 400);
}

function stainGradeSelectedRows(cabinets, requested) {
  let remaining = Math.max(0, Number(requested) || 0);
  const rows = [];
  for (const cabinet of cabinets || []) {
    if (remaining <= 0) break;
    const available = Math.max(1, Number(cabinet.quantity) || 1);
    const quantity = Math.min(available, remaining);
    rows.push({ ...cabinet, quantity });
    remaining -= quantity;
  }
  return rows;
}

function stainGradePreviewHtml(stainGrade, requested) {
  const rows = stainGradeSelectedRows(stainGrade.cabinets || [], requested);
  const count = rows.reduce((sum, row) => sum + (Number(row.quantity) || 0), 0);
  if (!count) return '<p class="pq-note-empty">Choose at least one cabinet.</p>';
  let html = `<p class="stain-grade-preview-summary">Next separate-material batch: <strong>${count} cabinet${count === 1 ? '' : 's'}</strong></p>
    <table class="mdb-wizard-table"><thead><tr><th>Due</th><th>Job</th><th>Cabinet</th><th>Colour</th><th>Qty</th></tr></thead><tbody>`;
  rows.forEach((cabinet) => {
    html += `<tr><td>${escapeHtml(cabinet.firm_date || '')}</td>`
      + `<td>${escapeHtml(cabinet.po_number || '')}</td>`
      + `<td>${escapeHtml(cabinet.item_number || '')}</td>`
      + `<td>${escapeHtml(cabinet.color || '')}</td>`
      + `<td>${Number(cabinet.quantity) || 0}</td></tr>`;
  });
  return `${html}</tbody></table>`;
}

function stainGradeQueueHtml(stainGrade) {
  const count = Number(stainGrade.cabinet_count) || 0;
  if (!count) return '';
  const jobCount = Number(stainGrade.job_count) || (stainGrade.jobs || []).length;
  const nextDue = String(stainGrade.next_due_date || '').trim();
  const dueLabel = String(stainGrade.date_label || 'Due date').trim();
  const storedQty = Number(localStorage.getItem(STAIN_GRADE_BATCH_QTY_KEY));
  const initialQty = Math.min(count, storedQty > 0 ? storedQty : 15);
  let queueRows = '';
  (stainGrade.cabinets || []).forEach((cabinet) => {
    queueRows += `<tr><td>${escapeHtml(cabinet.firm_date || '')}</td>`
      + `<td>${escapeHtml(cabinet.po_number || '')}</td>`
      + `<td>${escapeHtml(cabinet.item_number || '')}</td>`
      + `<td>${escapeHtml(cabinet.color || '')}</td>`
      + `<td>${Number(cabinet.quantity) || 0}</td></tr>`;
  });
  return `<section class="stain-grade-queue" aria-label="Stain-grade finished interiors">
    <button id="stainGradeQueueToggle" class="stain-grade-queue-toggle" type="button" aria-expanded="${_stainGradeQueueExpanded ? 'true' : 'false'}" aria-controls="stainGradeQueueBody" onclick="toggleStainGradeQueue()">
      <span class="stain-grade-queue-kicker">Separate material</span>
      <strong>Stain-grade finished interiors</strong>
      <span class="mdb-wizard-job-count">${count} cabinet${count === 1 ? '' : 's'} · ${jobCount} job${jobCount === 1 ? '' : 's'}</span>
      ${nextDue ? `<span class="stain-grade-next-due">Next ${escapeHtml(dueLabel.toLowerCase())}: ${escapeHtml(nextDue)}</span>` : ''}
    </button>
    <div id="stainGradeQueueBody" class="stain-grade-queue-body" ${_stainGradeQueueExpanded ? '' : 'hidden'}>
      <p>${escapeHtml(stainGrade.reason || '')}</p>
      <div class="stain-grade-batch-controls">
        <label class="date-control"><span>Batch quantity</span><input id="stainGradeBatchQty" type="number" min="1" max="${count}" step="1" value="${initialQty}"></label>
        <button id="stainGradePreviewBatch" class="button secondary compact" type="button" onclick="previewStainGradeQueueBatch()">Review next batch</button>
        <button id="stainGradeGenerateBatch" class="button compact" type="button" onclick="generateStainGradeQueueBatch()">Generate separate batch</button>
        <button id="stainGradeOpenOutput" class="button secondary compact" type="button" hidden>Open folder</button>
      </div>
      <p class="stain-grade-material-note">${escapeHtml(stainGrade.generation_note || '')}</p>
      <p id="stainGradeGenerateStatus" class="stain-grade-generate-status" role="status"></p>
      <div id="stainGradeBatchPreview" class="stain-grade-batch-preview">${stainGradePreviewHtml(stainGrade, initialQty)}</div>
      <h4>Full queue</h4>
      <div class="stain-grade-queue-table"><table class="mdb-wizard-table"><thead><tr><th>Due</th><th>Job</th><th>Cabinet</th><th>Colour</th><th>Qty</th></tr></thead><tbody>${queueRows}</tbody></table></div>
    </div>
  </section>`;
}

function toggleStainGradeQueue() {
  const toggle = document.getElementById('stainGradeQueueToggle');
  if (!toggle) return;
  const expanded = toggle.getAttribute('aria-expanded') === 'true';
  _stainGradeQueueExpanded = !expanded;
  toggle.setAttribute('aria-expanded', expanded ? 'false' : 'true');
  const queueBody = document.getElementById('stainGradeQueueBody');
  if (queueBody) queueBody.hidden = expanded;
}

function wireStainGradeQueue(stainGrade) {
  const input = document.getElementById('stainGradeBatchQty');
  const previewButton = document.getElementById('stainGradePreviewBatch');
  const generateButton = document.getElementById('stainGradeGenerateBatch');
  const openButton = document.getElementById('stainGradeOpenOutput');
  const status = document.getElementById('stainGradeGenerateStatus');
  const preview = document.getElementById('stainGradeBatchPreview');
  if (!input || !previewButton || !preview) return;
  const update = () => {
    const maximum = Math.max(1, Number(stainGrade.cabinet_count) || 1);
    const quantity = Math.min(maximum, Math.max(1, Number(input.value) || 1));
    input.value = String(quantity);
    localStorage.setItem(STAIN_GRADE_BATCH_QTY_KEY, String(quantity));
    preview.innerHTML = stainGradePreviewHtml(stainGrade, quantity);
  };
  window.previewStainGradeQueueBatch = update;
  input.addEventListener('change', update);
  window.generateStainGradeQueueBatch = async () => {
    update();
    const quantity = Number(input.value) || 1;
    const confirmed = window.confirm(
      `Generate one separate STAIN GRADE FIN_INT batch for the next ${quantity} cabinet${quantity === 1 ? '' : 's'}?\n\n`
      + 'The folder will be labeled STAIN GRADE FIN_INT. Parts keep their normal thickness; the operator must pull the stain-grade plywood.',
    );
    if (!confirmed) return;
    _smartBatchRunning = true;
    generateButton.disabled = true;
    previewButton.disabled = true;
    input.disabled = true;
    generateButton.textContent = 'Generating…';
    if (status) status.textContent = 'Generating the separate stain-grade files…';
    try {
      const result = await api('/api/stain-grade-batches/generate', {
        method: 'POST',
        body: JSON.stringify({
          quantity,
          date_basis: stainGrade.date_basis || getPqDateBasis(),
          refresh_insight: false,
          worksheet_profile: 'operator',
          generate_mdb: document.getElementById('smartBatchesGenMdb')?.checked !== false,
          generate_worksheets: document.getElementById('smartBatchesGenWorksheets')?.checked !== false,
          route_handcuts_to_omni: document.getElementById('smartBatchesRouteHandcuts')?.checked === true,
          output_route: getProductionOutputRoute(),
        }),
      });
      if (status) status.textContent = `${result.batch_name || 'STAIN GRADE FIN_INT'} generated successfully.`;
      if (openButton && result.output_dir) {
        openButton.hidden = false;
        openButton.dataset.dir = result.output_dir;
      }
      generateButton.textContent = 'Generated';
      loadProductionQueue().catch(() => {});
      loadOmniDispatch().catch(() => {});
    } catch (error) {
      if (status) status.textContent = error.message;
      generateButton.disabled = false;
      previewButton.disabled = false;
      input.disabled = false;
      generateButton.textContent = 'Generate separate batch';
    } finally {
      _smartBatchRunning = false;
    }
  };
  openButton?.addEventListener('click', () => {
    const outputDir = openButton.dataset.dir || '';
    if (!outputDir) return;
    api('/api/production-queue/open-output', {
      method: 'POST',
      body: JSON.stringify({ output_dir: outputDir }),
    }).catch((error) => {
      if (status) status.textContent = error.message;
    });
  });
}

// Delegation keeps the collapse control alive when background WIP reconciliation
// re-renders the plan while the operator is reviewing the separate-material queue.
document.addEventListener('click', (event) => {
  const toggle = event.target.closest?.('#stainGradeQueueToggle');
  if (toggle) return;
  if (event.target.closest?.('#stainGradePreviewBatch')) {
    const input = document.getElementById('stainGradeBatchQty');
    const preview = document.getElementById('stainGradeBatchPreview');
    const stainGrade = _currentStainGradeQueue || {};
    if (!input || !preview) return;
    const maximum = Math.max(1, Number(stainGrade.cabinet_count) || 1);
    const quantity = Math.min(maximum, Math.max(1, Number(input.value) || 1));
    input.value = String(quantity);
    localStorage.setItem(STAIN_GRADE_BATCH_QTY_KEY, String(quantity));
    preview.innerHTML = stainGradePreviewHtml(stainGrade, quantity);
  }
});

function renderSmartBatchPlan(plan) {
  const body = document.getElementById('smartBatchesBody');
  const summary = document.getElementById('smartBatchesSummary');
  if (!body || !summary) return;

  const outstanding = plan?.outstanding_paperwork || {};
  const producedPipeline = Number(
    plan?.produced_pipeline_cabinets
      ?? outstanding.produced_pipeline_cabinets
      ?? 0,
  );
  const cutAwaitingWrap = Number(
    plan?.cut_awaiting_wrap_cabinets
      ?? outstanding.cut_awaiting_wrap_cabinets
      ?? 0,
  );
  const inCuttingPipeline = Number(
    plan?.in_cutting_pipeline_cabinets
      ?? (producedPipeline + cutAwaitingWrap),
  );
  const available = Number(plan?.available_new_cabinets || 0);
  const target = Number(plan?.max_cabinets || getSmartBatchPayload(false).max_cabinets);
  const selected = Number(plan?.total_cabinets || 0);
  applyMorningWip(
    {
      ...outstanding,
      produced_pipeline_cabinets: producedPipeline,
      cut_awaiting_wrap_cabinets: cutAwaitingWrap,
    },
    { recommended: selected || (target > 0 ? available : null), fromPlan: true },
  );

  if (!plan?.ok) {
    summary.textContent = plan?.error || 'No smart batch plan available.';
    body.innerHTML = `
      <p class="pq-note-empty">Only gray-bulb In Cutting jobs without existing production files are eligible for new production.</p>`;
    return;
  }

  // Stain-grade FIN_INT cabinets are a separate running queue. Render it before
  // the "nothing to do" return so a stain-only forecast remains actionable.
  const stainGrade = plan.stain_grade || {};
  _currentStainGradeQueue = stainGrade;
  const stainCount = Number(stainGrade.cabinet_count) || 0;
  const stainHtml = stainGradeQueueHtml(stainGrade);

  const stainNote = stainCount
    ? ` ${stainCount} stain-grade cabinet${stainCount === 1 ? ' is' : 's are'} held out for separate material.`
    : '';
  const refreshNote = plan.refresh
    ? ` Insight refreshed (${plan.refresh.row_count || 0} rows).`
    : '';
  const targetNote = target > 0
    ? `${inCuttingPipeline} of the ${target}-cabinet In Cutting window are already prepared or cut; `
    : `${inCuttingPipeline} cabinets are already prepared or cut (no In Cutting cap); `;
  summary.textContent = targetNote
    + `${selected} more cabinet${selected === 1 ? '' : 's'} are recommended now. `
    + `${producedPipeline} prepared cabinet${producedPipeline === 1 ? '' : 's'} still need cutting; `
    + `${cutAwaitingWrap} cut cabinet${cutAwaitingWrap === 1 ? '' : 's'} await wrap. `
    + `${plan.eligible_job_count} eligible gray job${plan.eligible_job_count === 1 ? '' : 's'} remain.${stainNote}${refreshNote}`;

  if (!selected) {
    body.innerHTML = stainHtml
      + `<p class="pq-note-empty">No new gray-bulb jobs without production files are eligible right now.</p>`;
    wireStainGradeQueue(stainGrade);
    return;
  }

  // Batches first: they are what the button actually produces. The job table
  // is the evidence behind them, so it reads as support, not as the answer --
  // and 155 rows of it no longer push the produce button off the screen.
  const batches = plan.batches || [];
  let html = '';
  if (batches.length) {
    html += `<div class="plan-batch-set">
      <h3 class="plan-batch-set-title">Batches to produce
        <span class="mdb-wizard-job-count">${batches.length} batch${batches.length === 1 ? '' : 'es'} · ${selected} cabinet${selected === 1 ? '' : 's'}</span>
      </h3>
      <div id="smartPlanBatchList">`;
    batches.forEach((batch) => {
      html += `<div class="mdb-wizard-job">
        <h3 class="mdb-wizard-job-title">${escapeHtml(batch.name || 'Batch')}
          <span class="mdb-wizard-job-count">${Number(batch.cabinet_count) || 0} cabinets · ${Number(batch.job_count) || 0} jobs</span>
          <span class="pq-stage-status" data-depth="advanced">${escapeHtml((batch.jobs || []).join(', '))}</span>
        </h3>
      </div>`;
    });
    html += `</div>
      <button id="smartPlanBatchToggle" class="button secondary compact row-collapse-toggle" type="button" aria-expanded="false" hidden></button>
    </div>`;
  }

  html += stainHtml;

  const pickedJobs = plan.picked_jobs || [];
  html += `<div class="mdb-wizard-job plan-job-detail">
    <h3 class="mdb-wizard-job-title">Recommended jobs
      <span class="mdb-wizard-job-count">${pickedJobs.length} job${pickedJobs.length === 1 ? '' : 's'}</span>
    </h3>
    <table class="mdb-wizard-table" id="smartPlanJobsTable"><thead><tr><th>Job</th><th>Date</th><th>Cabinets</th></tr></thead><tbody>`;
  pickedJobs.forEach((job) => {
    html += `<tr><td>${escapeHtml(job.po_number)}</td><td>${escapeHtml(job.firm_date || '')}</td><td>${Number(job.cab_count) || 0}</td></tr>`;
  });
  html += `</tbody></table>
    <button id="smartPlanJobsToggle" class="button secondary compact row-collapse-toggle" type="button" aria-expanded="false" hidden></button>
  </div>`;
  body.innerHTML = html;
  registerRowCollapse(
    document.getElementById('smartPlanBatchList'),
    'smartPlanBatchToggle',
    { limit: 'cards', noun: 'batch', nounPlural: 'batches' },
  );
  registerRowCollapse(document.getElementById('smartPlanJobsTable'), 'smartPlanJobsToggle');
  wireStainGradeQueue(stainGrade);
  renderPipelineFromPlan(plan);
}

function renderSmartBatchResults(plan) {
  const body = document.getElementById('smartBatchesBody');
  if (!body) return;
  let html = '';
  const dailySaw = plan.daily_beam_saw || {};
  if (dailySaw.output_dir) {
    const halfCount = Number(dailySaw.half_inch_row_count) || 0;
    const shelfCount = Number(dailySaw.three_quarter_inch_row_count) || 0;
    html += `<div class="mdb-wizard-job">
      <h3 class="mdb-wizard-job-title">Combined daily beam-saw files
        <span class="mdb-wizard-job-count">${halfCount} half-inch rows Â· ${shelfCount} shelf rows</span>
        <span class="pq-stage-status"><span class="pill">Ready</span>
          <button type="button" class="button secondary smart-batch-open-btn" data-dir="${escapeHtml(dailySaw.output_dir)}">Open folder</button>
        </span>
      </h3>
    </div>`;
  }
  (plan.batch_results || []).forEach((batch) => {
    const status = batch.ok
      ? `<span class="pill">Done</span> <button type="button" class="button secondary smart-batch-open-btn" data-dir="${escapeHtml(batch.output_dir || '')}">Open folder</button>`
      : `<span class="pill">Failed</span> <span class="pq-note-text">${escapeHtml(batch.error || 'Generation failed')}</span>`;
    html += `<div class="mdb-wizard-job">
      <h3 class="mdb-wizard-job-title">${escapeHtml(batch.name || 'Batch')}
        <span class="mdb-wizard-job-count">${Number(batch.cabinet_count) || 0} cabinets · ${escapeHtml((batch.jobs || []).join(', '))}</span>
        <span class="pq-stage-status">${status}</span>
      </h3>
    </div>`;
  });
  if (html) body.innerHTML = html;
  body.querySelectorAll('.smart-batch-open-btn').forEach((button) => {
    button.addEventListener('click', () => {
      const dir = button.dataset.dir || '';
      if (dir) {
        api('/api/production-queue/open-output', {
          method: 'POST',
          body: JSON.stringify({ output_dir: dir }),
        }).catch((error) => alert(error.message));
      }
    });
  });
}

async function previewSmartBatches({ allowInsightRefresh = false } = {}) {
  if (_smartBatchRunning) return;
  saveSmartBatchSettings();
  const previewBtn = document.getElementById('smartBatchesPreview');
  const generateBtn = document.getElementById('smartBatchesGenerate');
  _smartBatchRunning = true;
  if (previewBtn) previewBtn.disabled = true;
  if (generateBtn) generateBtn.disabled = true;
  try {
    // Auto previews (landing, date-basis change) always skip Insight.
    // Manual "Refresh plan" may honor the checkbox when allowInsightRefresh is set.
    const payload = getSmartBatchPayload(allowInsightRefresh ? undefined : false);
    const plan = await api('/api/smart-batches/plan', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    _smartBatchPlan = plan;
    renderSmartBatchPlan(plan);
  } catch (error) {
    alert(error.message);
  } finally {
    _smartBatchRunning = false;
    if (previewBtn) previewBtn.disabled = false;
    if (generateBtn) generateBtn.disabled = false;
  }
}

async function runSmartBatchesGenerate() {
  if (_smartBatchRunning) return;
  const genMdb = document.getElementById('smartBatchesGenMdb')?.checked;
  const genWorksheets = document.getElementById('smartBatchesGenWorksheets')?.checked;
  if (!genMdb && !genWorksheets) {
    alert('Select at least one output type.');
    return;
  }
  const outputRoute = getProductionOutputRoute();
  if (outputRoute === 'python_mm_dxf') {
    const confirmed = window.confirm(
      'Python is in Onboarding. This will generate verified millimeter DXFs for EnRoute and will not generate or dispatch TAPs. Continue?'
    );
    if (!confirmed) return;
  }

  saveSmartBatchSettings();
  const previewBtn = document.getElementById('smartBatchesPreview');
  const generateBtn = document.getElementById('smartBatchesGenerate');
  const openBtn = document.getElementById('smartBatchesOpenOutput');
  _smartBatchRunning = true;
  if (previewBtn) previewBtn.disabled = true;
  if (generateBtn) {
    generateBtn.disabled = true;
    generateBtn.textContent = 'Generating…';
  }
  try {
    const payload = {
      ...getSmartBatchPayload(),
      worksheet_profile: 'operator',
      generate_mdb: genMdb,
      generate_worksheets: genWorksheets,
      route_handcuts_to_omni: document.getElementById('smartBatchesRouteHandcuts')?.checked === true,
      output_route: outputRoute,
    };
    const result = await api('/api/smart-batches/generate', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    _smartBatchPlan = result;
    renderSmartBatchPlan(result);
    renderSmartBatchResults(result);
    if (result.last_output_dir) {
      _smartBatchLastOutputDir = result.last_output_dir;
      if (openBtn) openBtn.hidden = false;
    }
    loadProductionQueue().catch(() => {});
    loadLabelPrintQueue().catch(() => {});
    loadPipelineAdmin().catch(() => {});
    if (!result.ok) alert(result.error || 'One or more batches failed.');
  } catch (error) {
    alert(error.message);
  } finally {
    _smartBatchRunning = false;
    if (previewBtn) previewBtn.disabled = false;
    if (generateBtn) {
      generateBtn.disabled = false;
      generateBtn.textContent = _smartBatchPlan?.failures ? 'Retry failed sets' : 'Produce recommended work';
    }
  }
}

function pipelineAdminEnabled() {
  return Boolean(document.getElementById('pipelineAdminPanel'));
}

function renderPipelineOutstanding(items) {
  const root = document.getElementById('pipelineOutstandingList');
  if (!root) return;
  if (!items.length) {
    root.innerHTML = '<p class="pq-note-empty">No produced pipeline sets are outstanding.</p>';
    return;
  }
  root.innerHTML = items.map((item) => {
    const pos = (item.po_numbers || []).join(', ') || 'No PO list';
    const action = item.droppable
      ? `<button type="button" class="button compact" data-pipeline-drop="${escapeHtml(item.set_id)}">Drop</button>`
      : `<span class="pill">${escapeHtml(item.drop_block_reason || 'Locked')}</span>`;
    // A set counting against the target while the operator board cannot show it
    // is the exact condition that cost a morning. Say so on the card.
    const hidden = item.visible_to_operator === false;
    const hiddenNote = hidden
      ? ' · <strong>not on the operator board</strong>'
      : '';
    return `<article class="pipeline-admin-card${hidden ? ' is-hidden-from-floor' : ''}">
      <div class="pipeline-admin-card-head">
        <label class="pipeline-admin-card-select">
          <input type="checkbox" data-pipeline-select="${escapeHtml(item.set_id)}">
          <strong>${escapeHtml(item.set_name || item.set_id)}</strong>
        </label>
        ${action}
      </div>
      <p>${escapeHtml(pos)} · ${Number(item.cabinets) || 0} cabinets · ${escapeHtml(item.day || '')} · ${escapeHtml(item.wip_state || item.execution_state || 'held')}${hiddenNote}</p>
    </article>`;
  }).join('');
  syncPipelineSelectionState();
}

function selectedPipelineSetIds() {
  return Array.from(
    document.querySelectorAll('#pipelineOutstandingList [data-pipeline-select]:checked'),
  ).map((box) => box.getAttribute('data-pipeline-select') || '').filter(Boolean);
}

function syncPipelineSelectionState() {
  const button = document.getElementById('pipelinePurgeSelected');
  if (!button) return;
  const count = selectedPipelineSetIds().length;
  button.disabled = count === 0;
  button.textContent = count ? `Drop selected (${count})` : 'Drop selected';
}

const PIPELINE_PURGE_LABELS = {
  smart_batches: 'produced batches',
  walkups: 'outstanding walk-up requests',
  selected: 'selected sets',
};

function describePurgePlan(plan) {
  const parts = [];
  if (plan.drop_count) parts.push(`${plan.drop_count} dropped`);
  if (plan.delete_count) parts.push(`${plan.delete_count} deleted off the share`);
  if (plan.terminate_count) {
    parts.push(`${plan.terminate_count} retired as abandoned (started on the Omni)`);
  }
  if (plan.blocked_count) parts.push(`${plan.blocked_count} left alone`);
  return parts.join(', ') || 'nothing';
}

function purgeBlockedLines(plan) {
  return (plan.items || [])
    .filter((item) => item.action === 'blocked')
    .map((item) => `  • ${item.set_name} — ${item.action_reason}`)
    .join('\n');
}

async function purgePipeline(mode) {
  const state = document.getElementById('pipelinePurgeState');
  const label = PIPELINE_PURGE_LABELS[mode] || 'items';
  const setIds = mode === 'selected' ? selectedPipelineSetIds() : [];
  if (mode === 'selected' && !setIds.length) return;
  if (state) state.textContent = 'Checking what would be dropped…';

  // Preview first, always. The confirm has to quote the real counts, and the
  // floor has to see what will be left behind before anything is removed.
  const query = new URLSearchParams({ mode });
  if (setIds.length) query.set('set_ids', setIds.join(','));
  const plan = await api(`/api/pipeline/purge-preview?${query.toString()}`);
  if (!plan.ok) throw new Error(plan.error || 'Could not preview the purge.');
  if (state) state.textContent = '';

  if (!plan.actionable_count) {
    const why = plan.blocked_count
      ? `\n\n${plan.blocked_count} item(s) are locked:\n${purgeBlockedLines(plan)}`
      : '';
    alert(`Nothing to drop under ${label}.${why}`);
    return;
  }

  const blockedNote = plan.blocked_count
    ? `\n\n${plan.blocked_count} item(s) will be left alone:\n${purgeBlockedLines(plan)}`
    : '';
  const forceNote = plan.requires_force
    ? `\n\n${plan.active_count} item(s) were already loaded or running on the Omni. `
      + 'Continuing retires them anyway, recorded against your name with the reason '
      + 'you give. Produced files stay on the share as evidence.'
    : '';
  const confirmed = window.confirm(
    `Drop ${plan.actionable_count} of ${plan.item_count} ${label}, `
    + `freeing ${plan.cabinets} cabinets from the morning target?\n\n`
    + `This will do: ${describePurgePlan(plan)}.`
    + `${forceNote}${blockedNote}`,
  );
  if (!confirmed) return;

  const note = window.prompt('Why are these being dropped? (recorded with your name)', '') ?? '';
  if (state) state.textContent = 'Dropping…';
  const result = await api('/api/pipeline/purge', {
    method: 'POST',
    body: JSON.stringify({
      mode,
      set_ids: setIds,
      note,
      force: Boolean(plan.requires_force),
    }),
  });
  if (!result.ok) throw new Error(result.error || 'The purge failed.');
  if (state) {
    // Partial success is normal. Saying "dropped 11" while two silently
    // survived is how the count stopped matching the board in the first place.
    const refusedNote = result.refused_count
      ? ` ${result.refused_count} could not be dropped: `
        + (result.refused || []).map((item) => `${item.set_name} — ${item.error}`).join('; ')
      : '';
    state.textContent = `Dropped ${result.purged_count} set(s), freeing ${result.cabinets} cabinets.${refusedNote}`;
  }
  await loadPipelineAdmin();
  loadProductionQueue().catch(() => {});
  loadOmniDispatch().catch(() => {});
  queueMorningPlanDraftRefresh();
}

function renderSmartBatchRuns(runs) {
  const root = document.getElementById('smartBatchRunLog');
  if (!root) return;
  if (!runs.length) {
    root.innerHTML = '<p class="pq-note-empty">No smart-batch runs have been logged yet. New Produce recommended work runs will appear here.</p>';
    return;
  }
  root.innerHTML = runs.map((run) => {
    const batches = (run.summary?.batches || []).map((batch) => batch.name).filter(Boolean).join(', ');
    const rolled = run.status === 'rolled_back';
    const action = rolled
      ? `<span class="pill">Rolled back</span>`
      : (run.can_rollback
        ? `<button type="button" class="button compact" data-pipeline-rollback="${escapeHtml(run.run_id)}">Roll back</button>`
        : `<span class="pill">${escapeHtml(run.rollback_block_reason || 'Locked')}</span>`);
    return `<article class="pipeline-admin-card">
      <div class="pipeline-admin-card-head">
        <strong>${escapeHtml(run.created_at || run.run_id)}</strong>
        ${action}
      </div>
      <p>${Number(run.batch_count) || 0} batch${Number(run.batch_count) === 1 ? '' : 'es'} · ${Number(run.cabinet_count) || 0} cabinets${batches ? ` · ${escapeHtml(batches)}` : ''}</p>
    </article>`;
  }).join('');
}

function pipelineDropBlockReason(item) {
  const execution = String(item?.execution_state || '').trim().toLowerCase();
  if (['loaded', 'in_progress', 'paused', 'completed'].includes(execution)) {
    if (execution === 'completed') {
      return 'This set is already cut. It cannot be dropped from the pipeline.';
    }
    return `This set is ${execution.replaceAll('_', ' ')} on the Omni. Hold it there instead of dropping it.`;
  }
  if (String(item?.source || '').trim().toLowerCase() === 'walkup') {
    return 'Delete a walk-up from the Omni Queue. Do not drop it here.';
  }
  return '';
}

function pipelineItemsFromPlan(plan) {
  return (plan?.outstanding_paperwork?.sets || [])
    // Same population the API view and the purge use: what holds the cap.
    // Without this filter a plan refresh replaced the admin list with every
    // already-cut set and dropped the day and visibility columns with it.
    .filter((record) => ['floor', 'prepared_held'].includes(record.wip_state || ''))
    .map((record) => {
      const poCounts = record.po_counts || {};
      const pos = Object.keys(poCounts).filter(Boolean);
      const block = pipelineDropBlockReason(record);
      return {
        kind: 'set',
        set_id: record.set_id || '',
        set_name: record.set_name || '',
        day: record.day || '',
        po_numbers: pos,
        cabinets: Number(record.cabinet_count) || 0,
        wip_state: record.wip_state || '',
        execution_state: record.execution_state || '',
        visible_to_operator: record.visible_to_operator !== false,
        droppable: !block,
        drop_block_reason: block,
      };
    }).filter((item) => item.set_id);
}

function renderPipelineFromPlan(plan) {
  if (!pipelineAdminEnabled() || !plan) return;
  renderPipelineOutstanding(pipelineItemsFromPlan(plan));
  const state = document.getElementById('pipelineAdminState');
  if (state) {
    const count = Number(
      plan.produced_pipeline_cabinets
      ?? plan.outstanding_paperwork?.produced_pipeline_cabinets
      ?? 0,
    );
    const hidden = Number(plan.outstanding_paperwork?.hidden_pipeline_cabinets) || 0;
    const hiddenNote = hidden
      ? ` ${hidden} of them are on sets the operator board does not show.`
      : '';
    state.textContent = `${count} cabinets still count as produced pipeline.${hiddenNote}`;
  }
}

async function loadPipelineAdmin() {
  const state = document.getElementById('pipelineAdminState');
  if (!pipelineAdminEnabled()) return;
  try {
    const runs = await api('/api/pipeline/smart-batch-runs');
    renderSmartBatchRuns(runs.runs || []);
  } catch (error) {
    if (state && !state.textContent) {
      state.textContent = error.message || 'Could not load smart-batch history.';
    }
  }
  if (_smartBatchPlan) renderPipelineFromPlan(_smartBatchPlan);
  try {
    const outstanding = await api('/api/pipeline/outstanding');
    renderPipelineOutstanding(outstanding.items || []);
    if (state) {
      const hidden = Number(outstanding.hidden_pipeline_cabinets) || 0;
      // The count alone is what misled the floor. Name the invisible share of
      // it in the same sentence.
      const hiddenNote = hidden
        ? ` ${hidden} of them are on sets the operator board does not show.`
        : '';
      state.textContent = `${Number(outstanding.produced_pipeline_cabinets) || 0} cabinets still count as produced pipeline.${hiddenNote}`;
    }
  } catch (error) {
    if (!_smartBatchPlan && state) {
      state.textContent = error.message || 'Could not load pipeline admin.';
    }
  }
}

async function dropPipelineSet(setId) {
  if (!window.confirm('Drop this unreleased set from the pipeline? Its folders move aside and it stops filling the morning target.')) {
    return;
  }
  await api('/api/pipeline/drop', {
    method: 'POST',
    body: JSON.stringify({ set_id: setId }),
  });
  await Promise.all([
    loadPipelineAdmin(),
    previewSmartBatches({ allowInsightRefresh: false }),
    typeof loadOmniDispatch === 'function' ? loadOmniDispatch() : Promise.resolve(),
  ]);
}

async function rollbackSmartBatchRun(runId) {
  if (!window.confirm('Roll back this smart-batch run? Unstarted sets move aside and the combined beam-saw files from that run are removed.')) {
    return;
  }
  await api('/api/pipeline/rollback-smart-batch', {
    method: 'POST',
    body: JSON.stringify({ run_id: runId }),
  });
  await Promise.all([
    loadPipelineAdmin(),
    previewSmartBatches({ allowInsightRefresh: false }),
    typeof loadOmniDispatch === 'function' ? loadOmniDispatch() : Promise.resolve(),
  ]);
}

function openSmartBatchesModal() {
  restoreSmartBatchSettings();
  showCncWorkflowView('morning', { scroll: true });
  previewSmartBatches().catch((error) => alert(error.message));
}

// ---------------------------------------------------------------------------
// Standard Files library administration
// ---------------------------------------------------------------------------
let _standardFilesData = null;
let _standardFilesBusy = false;
let _standardFilesEditingKey = '';

function standardFilesKey(category, program) {
  return `${String(category || '').toLocaleLowerCase()}\u0000${String(program || '').toLocaleLowerCase()}`;
}

function setStandardFilesBusy(busy, message = null) {
  _standardFilesBusy = Boolean(busy);
  const refresh = document.getElementById('standardFilesRefresh');
  const save = document.getElementById('standardFilesSave');
  const reset = document.getElementById('standardFilesReset');
  const canAdmin = Boolean(_standardFilesData?.can_admin);
  if (refresh) refresh.disabled = busy;
  document.querySelectorAll(
    '#standardFilesForm input, #standardFilesForm textarea, #standardFilesForm button',
  ).forEach((control) => {
    control.disabled = Boolean(busy) || !canAdmin;
  });
  if (save) save.disabled = Boolean(busy) || !canAdmin;
  if (reset) reset.disabled = Boolean(busy) || !canAdmin;
  const state = document.getElementById('standardFilesFormState');
  if (state && typeof message === 'string') state.textContent = message;
}

function resetStandardFilesForm() {
  _standardFilesEditingKey = '';
  const form = document.getElementById('standardFilesForm');
  if (form) form.reset();
  const category = document.getElementById('standardFilesCategory');
  const program = document.getElementById('standardFilesProgram');
  const quantity = document.getElementById('standardFilesExpectedQuantity');
  if (category) {
    category.value = '';
    category.readOnly = false;
  }
  if (program) {
    program.value = '';
    program.readOnly = false;
  }
  if (quantity) quantity.value = '1';
  const existing = document.getElementById('standardFilesExistingTaps');
  if (existing) {
    existing.textContent = 'Choose TAPs for a new program. Metadata-only edits preserve existing TAPs.';
  }
  const state = document.getElementById('standardFilesFormState');
  if (state) state.textContent = '';
}

function editStandardFilesProgram(category, program) {
  const item = (_standardFilesData?.programs || []).find(
    (candidate) => standardFilesKey(candidate.category, candidate.program)
      === standardFilesKey(category, program),
  );
  if (!item) return;
  _standardFilesEditingKey = standardFilesKey(item.category, item.program);
  const categoryInput = document.getElementById('standardFilesCategory');
  const programInput = document.getElementById('standardFilesProgram');
  categoryInput.value = item.category || '';
  categoryInput.readOnly = true;
  programInput.value = item.program || '';
  programInput.readOnly = true;
  document.getElementById('standardFilesExpectedQuantity').value =
    String(Number(item.expected_quantity) || 1);
  document.getElementById('standardFilesDescription').value = item.description || '';
  document.getElementById('standardFilesTapFiles').value = '';
  document.getElementById('standardFilesReplaceTaps').checked = false;
  document.getElementById('standardFilesExistingTaps').textContent =
    `${item.tap_count || 0} existing TAP${Number(item.tap_count) === 1 ? '' : 's'}: `
    + (item.tap_files || []).map((tap) => tap.name).join(', ');
  document.getElementById('standardFilesFormState').textContent =
    `Editing ${item.category} / ${item.program}`;
  document.getElementById('standardFilesEditorTitle')?.scrollIntoView({
    behavior: 'smooth',
    block: 'nearest',
  });
}

function renderStandardFiles(data) {
  _standardFilesData = data || {};
  const canAdmin = Boolean(data?.can_admin);
  const access = document.getElementById('standardFilesAccess');
  if (access) {
    access.textContent = canAdmin ? `Admin: ${data.actor || 'authorized'}` : 'Read only';
    access.classList.toggle('is-admin', canAdmin);
  }
  document.getElementById('standardFilesSummary').textContent =
    `${Number(data?.program_count || 0)} reusable program`
    + `${Number(data?.program_count || 0) === 1 ? '' : 's'} in `
    + `${Number(data?.category_count || 0)} categor`
    + `${Number(data?.category_count || 0) === 1 ? 'y' : 'ies'}. `
    + `${Number(data?.invalid_program_count || 0)} need attention.`;
  document.getElementById('standardFilesRoot').textContent =
    `Library root: ${data?.root || 'not available'}`;
  const count = document.getElementById('standardFilesCount');
  count.textContent = String(Number(data?.program_count || 0));
  count.className = `pill ${Number(data?.invalid_program_count || 0) ? 'pill-warning' : 'pill-success'}`;

  const categories = [...new Set((data?.programs || []).map((item) => item.category))]
    .sort((left, right) => String(left).localeCompare(String(right)));
  document.getElementById('standardFilesCategoryOptions').innerHTML =
    categories.map((category) => `<option value="${escapeHtml(category)}"></option>`).join('');

  const catalog = document.getElementById('standardFilesCatalog');
  catalog.innerHTML = (data?.programs || []).length
    ? (data.programs || []).map((item) => {
      const errors = (item.errors || []).map(
        (error) => `<li>${escapeHtml(error)}</li>`,
      ).join('');
      const taps = (item.tap_files || []).map((tap) => tap.name).join(', ');
      const encodedCategory = encodeURIComponent(item.category || '');
      const encodedProgram = encodeURIComponent(item.program || '');
      return `
        <article class="standard-files-program ${item.valid ? 'is-valid' : 'is-invalid'}"
          data-standard-category="${escapeHtml(encodedCategory)}"
          data-standard-program="${escapeHtml(encodedProgram)}">
          <div class="standard-files-program-head">
            <div>
              <span class="standard-files-category">${escapeHtml(item.category || '')}</span>
              <strong>${escapeHtml(item.program || '')}</strong>
            </div>
            <span class="pill ${item.valid ? 'pill-success' : 'pill-warning'}">${item.valid ? 'Ready' : 'Check'}</span>
          </div>
          <p>${escapeHtml(item.description || 'No description')}</p>
          <div class="standard-files-program-meta">
            <span>${Number(item.tap_count || 0)} TAP${Number(item.tap_count) === 1 ? '' : 's'}</span>
            <span>Quantity ${Number(item.expected_quantity || 1)}</span>
            <span>${escapeHtml(taps || 'No TAP files')}</span>
          </div>
          ${errors ? `<ul class="standard-files-errors">${errors}</ul>` : ''}
          ${canAdmin ? `<div class="inline-actions">
            <button class="button secondary compact" type="button" data-standard-action="edit">Edit</button>
            <button class="button danger compact" type="button" data-standard-action="archive">Archive</button>
          </div>` : ''}
        </article>`;
    }).join('')
    : '<div class="morning-plan-empty">No Standard Files programs were found. An admin can add the first one here.</div>';

  document.querySelectorAll(
    '#standardFilesForm input, #standardFilesForm textarea, #standardFilesForm button',
  ).forEach((control) => {
    control.disabled = !canAdmin || _standardFilesBusy;
  });
  document.getElementById('standardFilesReset').disabled = !canAdmin || _standardFilesBusy;
  setStandardFilesBusy(_standardFilesBusy);
}

async function loadStandardFiles({ quiet = false } = {}) {
  if (_standardFilesBusy) return null;
  setStandardFilesBusy(true, quiet ? '' : 'Refreshing library\u2026');
  try {
    const data = await api('/api/standard-files');
    renderStandardFiles(data);
    return data;
  } catch (error) {
    document.getElementById('standardFilesSummary').textContent =
      error.message || 'Could not load Standard Files.';
    throw error;
  } finally {
    setStandardFilesBusy(false, '');
  }
}

async function standardTapUpload(file) {
  if (!String(file?.name || '').toLocaleLowerCase().endsWith('.tap')) {
    throw new Error(`${file?.name || 'File'} is not a .tap file.`);
  }
  if (Number(file.size || 0) > 10 * 1024 * 1024) {
    throw new Error(`${file.name} exceeds the 10 MB file limit.`);
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return {
    name: file.name,
    content_base64: btoa(binary),
  };
}

async function saveStandardFilesProgram(event) {
  event.preventDefault();
  if (!_standardFilesData?.can_admin || _standardFilesBusy) return;
  const fileInput = document.getElementById('standardFilesTapFiles');
  const files = Array.from(fileInput?.files || []);
  const totalBytes = files.reduce((total, file) => total + Number(file.size || 0), 0);
  if (totalBytes > 50 * 1024 * 1024) {
    alert('The combined TAP upload exceeds 50 MB.');
    return;
  }
  const replaceTaps = Boolean(document.getElementById('standardFilesReplaceTaps')?.checked);
  if (replaceTaps && !files.length) {
    alert('Choose at least one TAP before replacing the existing TAP set.');
    return;
  }
  setStandardFilesBusy(true, files.length ? 'Reading TAP files\u2026' : 'Saving metadata\u2026');
  try {
    const uploads = [];
    for (const file of files) uploads.push(await standardTapUpload(file));
    const payload = {
      category: document.getElementById('standardFilesCategory').value.trim(),
      program: document.getElementById('standardFilesProgram').value.trim(),
      expected_quantity: Number(
        document.getElementById('standardFilesExpectedQuantity').value,
      ) || 1,
      description: document.getElementById('standardFilesDescription').value.trim(),
      tap_files: uploads,
      replace_taps: replaceTaps,
    };
    const result = await api('/api/standard-files/update', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    renderStandardFiles({
      ...(result.snapshot || {}),
      actor: result.actor || _standardFilesData.actor,
      can_admin: true,
    });
    resetStandardFilesForm();
    document.getElementById('standardFilesFormState').textContent =
      `${payload.category} / ${payload.program} saved.`;
  } catch (error) {
    document.getElementById('standardFilesFormState').textContent = error.message;
    alert(error.message);
  } finally {
    setStandardFilesBusy(false);
  }
}

async function archiveStandardFilesProgram(category, program) {
  if (!_standardFilesData?.can_admin || _standardFilesBusy) return;
  if (!window.confirm(
    `Archive ${category} / ${program}?\n\nIt will disappear from Omni but remain recoverable in _archive.`,
  )) return;
  setStandardFilesBusy(true, `Archiving ${program}\u2026`);
  try {
    const result = await api('/api/standard-files/archive', {
      method: 'POST',
      body: JSON.stringify({ category, program }),
    });
    renderStandardFiles({
      ...(result.snapshot || {}),
      actor: result.actor || _standardFilesData.actor,
      can_admin: true,
    });
    if (_standardFilesEditingKey === standardFilesKey(category, program)) {
      resetStandardFilesForm();
    }
  } finally {
    setStandardFilesBusy(false);
  }
}

function openStandardFilesModal() {
  const modal = document.getElementById('standardFilesModal');
  if (!modal) return;
  modal.hidden = false;
  syncModalBodyLock();
  resetStandardFilesForm();
  loadStandardFiles().catch((error) => alert(error.message));
}

function closeStandardFilesModal() {
  const modal = document.getElementById('standardFilesModal');
  if (!modal) return;
  modal.hidden = true;
  syncModalBodyLock();
}

document.getElementById('openStandardFilesAdminButton')?.addEventListener('click', openStandardFilesModal);
document.getElementById('closeStandardFilesModal')?.addEventListener('click', closeStandardFilesModal);
document.getElementById('standardFilesRefresh')?.addEventListener('click', () => {
  loadStandardFiles().catch((error) => alert(error.message));
});
document.getElementById('standardFilesReset')?.addEventListener('click', resetStandardFilesForm);
document.getElementById('standardFilesForm')?.addEventListener('submit', (event) => {
  saveStandardFilesProgram(event).catch((error) => alert(error.message));
});
document.getElementById('standardFilesModal')?.addEventListener('click', (event) => {
  if (event.target.id === 'standardFilesModal') closeStandardFilesModal();
});
document.getElementById('standardFilesCatalog')?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-standard-action]');
  const card = button?.closest('[data-standard-category][data-standard-program]');
  if (!button || !card) return;
  const category = decodeURIComponent(card.dataset.standardCategory || '');
  const program = decodeURIComponent(card.dataset.standardProgram || '');
  if (button.dataset.standardAction === 'edit') {
    editStandardFilesProgram(category, program);
  } else if (button.dataset.standardAction === 'archive') {
    archiveStandardFilesProgram(category, program).catch((error) => alert(error.message));
  }
});

// Production queue event listeners
document.getElementById('pqDateBasis').addEventListener('change', () => {
  localStorage.setItem(PQ_DATE_BASIS_KEY, getPqDateBasis());
  loadProductionQueue();
});
document.getElementById('pqShowCompleted').addEventListener('change', (event) => {
  localStorage.setItem(PQ_SHOW_COMPLETED_KEY, event.target.checked ? '1' : '0');
  if (_pqData) {
    renderProductionQueue(_pqData);
  } else {
    loadProductionQueue();
  }
});
document.getElementById('pqFloorMode').addEventListener('change', (event) => {
  const mode = String(event.target.value || 'hide');
  localStorage.setItem(PQ_FLOOR_MODE_KEY, mode);
  if (_pqData) {
    renderProductionQueue(_pqData);
  } else {
    loadProductionQueue();
  }
});
document.getElementById('pqAddFloorJobs').addEventListener('click', () => {
  openPqFloorAddModal().catch((error) => alert(error.message));
});
document.getElementById('closePqFloorAddModal').addEventListener('click', closePqFloorAddModal);
document.getElementById('pqFloorAddSubmit').addEventListener('click', () => {
  submitPqFloorAdd().catch((error) => alert(error.message));
});
document.getElementById('pqFloorAddModal').addEventListener('click', (event) => {
  if (event.target.id === 'pqFloorAddModal') closePqFloorAddModal();
});
document.getElementById('closePqJobCardModal')?.addEventListener('click', closePqJobCardModal);
document.getElementById('pqJobCardModal')?.addEventListener('click', (event) => {
  if (event.target.id === 'pqJobCardModal') closePqJobCardModal();
});
document.getElementById('pqReviewGenerate').addEventListener('click', openPqWizard);
document.getElementById('closePqWizard').addEventListener('click', closePqWizard);
document.getElementById('pqWizardGenerate').addEventListener('click', () => {
  pqProceedFromWizard();
});
document.getElementById('pqContinueWizard').addEventListener('click', () => pqWizardContinue('generate'));
document.getElementById('pqStageBatches').addEventListener('click', () => pqWizardContinue('staging'));
document.getElementById('pqNotesContinue').addEventListener('click', () => {
  pqProceedFromWizard();
});
document.getElementById('pqSuggestBatches').addEventListener('click', pqSuggestBatches);
document.getElementById('pqStageAddBatch').addEventListener('click', () => {
  if (_pqStagingRunning) return;
  _pqStagingGroups.push({
    name: pqStagingBatchName(_pqStagingGroups.length),
    selections: [],
    status: '',
    outputDir: '',
    error: '',
  });
  renderPqStaging();
});
document.getElementById('pqStagingBack').addEventListener('click', () => {
  if (_pqStagingRunning) return;
  _pqWizardDestination = 'generate';
  renderPqWizardReview(_pqWizardJobs);
  setPqWizardStep('review');
  document.getElementById('pqWizardSummary').textContent = _pqReviewSummaryText;
});
document.getElementById('pqGenerateAllBatches').addEventListener('click', () => {
  pqGenerateAllBatches().catch((error) => alert(error.message));
});
document.getElementById('pqNotesApply').addEventListener('click', () => {
  openPqDimensionEdit(getNotedSelectedCabinets(), true, 'notes_gate').catch((error) => alert(error.message));
});
document.getElementById('pqNotesEdit').addEventListener('click', () => {
  openPqDimensionEdit(getNotedSelectedCabinets(), false, 'notes_gate').catch((error) => alert(error.message));
});
document.getElementById('pqEditBack').addEventListener('click', pqReturnFromDimensionEdit);
document.getElementById('pqAdjustSelectedDims').addEventListener('click', () => {
  const selected = getSelectedPqCabinets();
  if (!selected.length) {
    alert('Select at least one cabinet first.');
    return;
  }
  captureSelectedPqCabKeys();
  openPqDimensionEdit(selected, false, 'review').catch((error) => alert(error.message));
});
document.getElementById('pqExpandParts').addEventListener('click', togglePqParts);
document.getElementById('pqSelectAll').addEventListener('click', () => {
  document.querySelectorAll('.pq-cab-cb').forEach((cb) => { cb.checked = true; });
  document.querySelectorAll('.pq-part-cb').forEach((cb) => { cb.checked = true; });
});
document.getElementById('pqClearAll').addEventListener('click', () => {
  document.querySelectorAll('.pq-cab-cb').forEach((cb) => { cb.checked = false; });
  document.querySelectorAll('.pq-part-cb').forEach((cb) => { cb.checked = false; });
});
document.getElementById('pqOpenOutput').addEventListener('click', async () => {
  if (_pqLastOutputDir) {
    await api('/api/production-queue/open-output', {
      method: 'POST',
      body: JSON.stringify({ output_dir: _pqLastOutputDir }),
    });
  }
});
document.getElementById('pqWizardModal').addEventListener('click', (event) => {
  if (event.target.id === 'pqWizardModal') closePqWizard();
});
document.getElementById('openSmartBatchesButton')?.addEventListener('click', openSmartBatchesModal);
document.querySelectorAll('[data-cnc-workflow-target]').forEach((tab) => {
  tab.addEventListener('click', () => showCncWorkflowView(tab.dataset.cncWorkflowTarget || 'morning'));
});
document.getElementById('runTimesRefresh')?.addEventListener('click', () => {
  loadRunTimes().catch(() => {});
});
document.getElementById('departmentScanRefresh')?.addEventListener('click', () => {
  loadDepartmentScanMetrics().catch(() => {});
});
document.getElementById('departmentScanDay')?.addEventListener('change', () => {
  loadDepartmentScanMetrics().catch(() => {});
});
document.getElementById('runTimesDay')?.addEventListener('change', () => {
  loadRunTimes().catch(() => {});
});
document.getElementById('runTimelineRefresh')?.addEventListener('click', () => {
  loadRunTimeline().catch(() => {});
});
document.getElementById('runTimelineDay')?.addEventListener('change', () => {
  loadRunTimeline().catch(() => {});
});
document.getElementById('runEventLogRefresh')?.addEventListener('click', () => {
  loadRunEventLog().catch(() => {});
});
document.getElementById('runEventLogDay')?.addEventListener('change', () => {
  loadRunEventLog().catch(() => {});
});
document.getElementById('runEventLogCopy')?.addEventListener('click', async () => {
  // Copies the plain-text render, not the DOM: what lands in a ticket should
  // look like the console, not like scraped markup.
  const button = document.getElementById('runEventLogCopy');
  try {
    await navigator.clipboard.writeText(_runEventLogText || '');
    if (button) {
      const original = button.textContent;
      button.textContent = 'Copied';
      setTimeout(() => { button.textContent = original; }, 1200);
    }
  } catch (error) {
    const state = document.getElementById('runEventLogState');
    if (state) state.textContent = `Could not copy: ${error.message || error}`;
  }
});
document.getElementById('glassPrepRefresh')?.addEventListener('click', () => {
  loadGlassPrep().catch(() => {});
});
const glassPrepLocationInput = document.getElementById('glassPrepLocation');
if (glassPrepLocationInput) {
  glassPrepLocationInput.value = localStorage.getItem(GLASS_PREP_LOCATION_KEY) || '';
  glassPrepLocationInput.addEventListener('change', () => {
    localStorage.setItem(GLASS_PREP_LOCATION_KEY, glassPrepLocationInput.value.trim());
  });
}
document.getElementById('glassPrepList')?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-glass-stock-action]');
  if (!button) return;
  updateGlassPrepStockFromButton(button).catch((error) => alert(error.message || String(error)));
});
document.getElementById('smartBatchesPreview')?.addEventListener('click', () => {
  previewSmartBatches({ allowInsightRefresh: true }).catch((error) => alert(error.message));
});
document.getElementById('smartBatchesGenerate')?.addEventListener('click', () => {
  runSmartBatchesGenerate().catch((error) => alert(error.message));
});
document.getElementById('smartBatchesOpenOutput')?.addEventListener('click', () => {
  if (!_smartBatchLastOutputDir) return;
  api('/api/production-queue/open-output', {
    method: 'POST',
    body: JSON.stringify({ output_dir: _smartBatchLastOutputDir }),
  }).catch((error) => alert(error.message));
});
document.getElementById('smartBatchesDateBasis')?.addEventListener('change', () => {
  saveSmartBatchSettings();
  const basis = document.getElementById('smartBatchesDateBasis')?.value;
  const productionBasis = document.getElementById('pqDateBasis');
  if (basis && productionBasis) {
    productionBasis.value = basis;
    localStorage.setItem(PQ_DATE_BASIS_KEY, basis);
  }
  previewSmartBatches({ allowInsightRefresh: false }).catch(() => {});
  loadProductionQueue().catch(() => {});
  loadOmniDispatch().catch(() => {});
});
document.getElementById('smartBatchesMax')?.addEventListener('change', saveSmartBatchSettings);
document.getElementById('smartBatchesCap')?.addEventListener('change', saveSmartBatchSettings);
document.getElementById('pipelineAdminRefresh')?.addEventListener('click', () => {
  loadPipelineAdmin().catch((error) => alert(error.message));
});
document.getElementById('pipelineOutstandingList')?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-pipeline-drop]');
  if (!button) return;
  dropPipelineSet(button.getAttribute('data-pipeline-drop') || '').catch((error) => alert(error.message));
});
document.getElementById('pipelineOutstandingList')?.addEventListener('change', (event) => {
  if (!event.target.closest('[data-pipeline-select]')) return;
  syncPipelineSelectionState();
});
document.getElementById('pipelinePurgeBatches')?.addEventListener('click', () => {
  purgePipeline('smart_batches').catch((error) => alert(error.message));
});
document.getElementById('pipelinePurgeWalkups')?.addEventListener('click', () => {
  purgePipeline('walkups').catch((error) => alert(error.message));
});
document.getElementById('pipelinePurgeSelected')?.addEventListener('click', () => {
  purgePipeline('selected').catch((error) => alert(error.message));
});
document.getElementById('smartBatchRunLog')?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-pipeline-rollback]');
  if (!button) return;
  rollbackSmartBatchRun(button.getAttribute('data-pipeline-rollback') || '').catch((error) => alert(error.message));
});

const savedPqDateBasis = localStorage.getItem(PQ_DATE_BASIS_KEY);
if (savedPqDateBasis) {
  const el = document.getElementById('pqDateBasis');
  if (el) el.value = savedPqDateBasis;
}
const savedPqShowCompleted = localStorage.getItem(PQ_SHOW_COMPLETED_KEY) === '1';
const pqShowCompletedEl = document.getElementById('pqShowCompleted');
if (pqShowCompletedEl) {
  pqShowCompletedEl.checked = savedPqShowCompleted;
}
const pqFloorModeEl = document.getElementById('pqFloorMode');
if (pqFloorModeEl) {
  let savedFloorMode = localStorage.getItem(PQ_FLOOR_MODE_KEY);
  if (!savedFloorMode) {
    // Migrate the retired checkbox pair. "Floor only" implied "show floor",
    // so it wins when both were set.
    if (localStorage.getItem(PQ_FLOOR_ONLY_KEY) === '1') savedFloorMode = 'only';
    else if (localStorage.getItem(PQ_SHOW_FLOOR_KEY) === '1') savedFloorMode = 'show';
    else savedFloorMode = 'hide';
    localStorage.setItem(PQ_FLOOR_MODE_KEY, savedFloorMode);
    localStorage.removeItem(PQ_SHOW_FLOOR_KEY);
    localStorage.removeItem(PQ_FLOOR_ONLY_KEY);
  }
  pqFloorModeEl.value = savedFloorMode;
}

// Omni set dispatch
const OMNI_DISPATCH_LOOKBACK_DAYS = 5;
const OMNI_DISPATCH_REFRESH_MS = 20000;
let _omniDispatchData = null;
let _omniDispatchBusy = false;
let _omniDispatchRefreshing = false;
let _omniDispatchLoadGen = 0;
let _omniDispatchDraggedSetId = '';
const _omniForceOverrides = new Set();

function omniPreparationLabel(value, item) {
  // "Posting taps" is only true while the taps are missing. A set whose taps
  // landed but whose publish never ran -- no previews, no preparation.json --
  // sat here reading as though it were waiting for taps that were already
  // there, which sent people looking in the wrong place. Readiness needs the
  // preview manifest, so say so.
  if (value === 'posting' && Number(item?.tap_count) > 0) {
    return 'Taps in, previews missing';
  }
  return ({
    paperwork_ready: 'Paperwork ready',
    posting: 'Posting taps',
    ready: 'Ready at router',
    error: 'Preparation error',
  })[value] || String(value || 'Unknown').replaceAll('_', ' ');
}

function omniHandcutsLabel(value) {
  return ({
    not_expected: '',
    pending: 'Hand cuts optional',
    posting: 'Hand cuts posting',
    ready: 'Hand cuts posted',
    error: 'Hand cuts error',
  })[value] || '';
}

function omniExecutionLabel(value, item) {
  if (item?.floor_spent) return 'Finished (not marked)';
  return ({
    not_started: 'Not started',
    loaded: 'Loaded',
    in_progress: 'In progress',
    paused: 'Paused',
    completed: 'Completed',
  })[value] || String(value || 'Unknown').replaceAll('_', ' ');
}

function _parseMirrorTimestamp(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  const normalized = text.includes('T') ? text : text.replace(' ', 'T');
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatMirrorClockTime(value) {
  const parsed = _parseMirrorTimestamp(value);
  if (!parsed) return '';
  return parsed.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatRelativeHeartbeat(value) {
  // Under 1 hour: "N min ago". At 1 hour and beyond: clock time (e.g. 2:15 PM).
  const parsed = _parseMirrorTimestamp(value);
  if (!parsed) return '';
  const sec = Math.floor((Date.now() - parsed.getTime()) / 1000);
  if (sec < 45) return 'just now';
  if (sec < 3600) {
    const min = Math.max(1, Math.floor(sec / 60));
    return `${min} min ago`;
  }
  return formatMirrorClockTime(value);
}

function formatFloorHeartbeatLine(lastSeenAt, { live } = {}) {
  const age = formatRelativeHeartbeat(lastSeenAt);
  if (!age) return '';
  if (live) return `Heartbeat ${age}`;
  if (age.endsWith('ago') || age === 'just now') return `Idle · ${age}`;
  return `Idle since ${age}`;
}

function omniFloorMirrorStreamTag() {
  if (_cncWorkflowView !== 'omni') return '';
  if (_omniFloorStreamState === 'live') return ' · live mirror';
  if (_omniFloorStreamState === 'connecting') return ' · connecting';
  if (_omniFloorStreamState === 'stale') return ' · mirror stale';
  return '';
}

function omniAlertInDispatchWindow(row, data = _omniDispatchData) {
  const kind = String(row?.kind || '');
  if (kind === 'floor_telemetry_unavailable') return true;
  const setId = String(row?.set_id || '').trim();
  if (!setId) return false;
  return (data?.sets || []).some((item) => String(item.set_id || '') === setId);
}

function renderOmniAlertRail(data) {
  const rail = document.getElementById('omniAlertRail');
  const list = document.getElementById('omniAlertRailList');
  const countEl = document.getElementById('omniAlertRailCount');
  if (!rail || !list) return;
  const alerts = (data?.floor_status?.alerts || []).filter(
    (row) => row && row.severity === 'loud' && omniAlertInDispatchWindow(row, data)
  );
  if (countEl) countEl.textContent = String(alerts.length);
  if (!alerts.length) {
    rail.hidden = true;
    list.innerHTML = '';
    return;
  }
  rail.hidden = false;
  list.innerHTML = alerts.map((row) => `
    <article class="omni-alert-rail-item" role="listitem" data-kind="${escapeHtml(row.kind || '')}">
      <div class="omni-alert-rail-item-copy">
        <strong>${escapeHtml(row.title || 'Alert')}</strong>
        <p>${escapeHtml(row.detail || '')}</p>
      </div>
      ${row.can_ack ? `<button type="button" class="button secondary compact omni-alert-seen" data-kind="${escapeHtml(row.kind || '')}" data-set-id="${escapeHtml(row.set_id || '')}" data-station="${escapeHtml(row.station || '')}" data-fingerprint="${escapeHtml(row.fingerprint || '')}">Seen</button>` : ''}
    </article>
  `).join('');
  list.querySelectorAll('.omni-alert-seen').forEach((button) => {
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        await api('/api/omni-alerts/seen', {
          method: 'POST',
          body: JSON.stringify({
            kind: button.dataset.kind || '',
            set_id: button.dataset.setId || '',
            station: button.dataset.station || '',
            fingerprint: button.dataset.fingerprint || '',
          }),
        });
        await loadOmniDispatch({ quiet: true });
      } catch (error) {
        button.disabled = false;
        alert(error.message || 'Could not mark that alert seen.');
      }
    });
  });
}

function renderOmniFloorStatus(data) {
  const status = data?.floor_status || {};
  const summary = status.summary || {};
  renderOmniAlertRail(data);
  const subtitle = document.getElementById('omniFloorStatusSubtitle');
  if (subtitle) {
    const day = status.day_label || 'today';
    const streamTag = omniFloorMirrorStreamTag();
    subtitle.textContent = status.generated_at
      ? `${day} · updated ${formatTimestamp(status.generated_at)}${streamTag}`
      : `Live viewer, progress, and recuts for ${day}.`;
    subtitle.classList.toggle('is-mirror-stale', _omniFloorStreamState === 'stale');
    subtitle.classList.toggle('is-mirror-live', _omniFloorStreamState === 'live');
    subtitle.classList.toggle('is-mirror-connecting', _omniFloorStreamState === 'connecting');
  }
  const metrics = document.getElementById('omniFloorStatusMetrics');
  if (metrics) {
    metrics.innerHTML = [
      omniDispatchMetric(summary.live_stations, 'Live stations'),
      omniDispatchMetric(summary.in_progress_today, 'Active today'),
      omniDispatchMetric(summary.completed_today, 'Completed today'),
      omniDispatchMetric(summary.needs_check, 'Needs check'),
      omniDispatchMetric(summary.recut_drafts, 'Recut drafts'),
      omniDispatchMetric(summary.submitted_recuts_today, 'Recuts submitted today'),
    ].join('');
  }

  const liveLane = document.getElementById('omniFloorLiveLane');
  const liveRows = status.live_now || [];
  const mirrorState = String(status.mirror_health?.state || 'unknown');
  if (liveLane) {
    liveLane.innerHTML = liveRows.length
      ? liveRows.map((row) => {
        const sheet = Number(row.viewing_sheet) || 0;
        const sheetTotal = Number(row.viewing_sheet_total) || 0;
        const sheetText = sheet > 0
          ? `Sheet ${sheet}${sheetTotal > 0 ? ` / ${sheetTotal}` : ''}`
          : (row.set_name ? 'Browsing queue' : 'No set loaded');
        const phase = row.viewing_phase === 'handcuts' ? ' · hand cuts' : '';
        const liveClass = row.live ? 'is-live' : (row.last_seen_at ? 'is-offline' : 'is-idle');
        const heartbeat = row.last_seen_at
          ? formatFloorHeartbeatLine(row.last_seen_at, { live: !!row.live })
          : '';
        const badges = [];
        if (row.check_ran_gap) badges.push('<span class="omni-floor-badge is-warn">Check</span>');
        if (Number(row.flags_pending) > 0) {
          badges.push(`<span class="omni-floor-badge is-pending">${Number(row.flags_pending)} draft</span>`);
        }
        const qualityIssues = Array.isArray(row.data_quality?.issues)
          ? row.data_quality.issues
          : [];
        if (qualityIssues.length) {
          badges.push(`<span class="omni-floor-badge is-warn" title="${escapeHtml(qualityIssues.join(', '))}">Telemetry check</span>`);
        }
        const setLabel = row.set_name || (row.live ? '—' : 'Offline');
        return `<div class="omni-floor-row ${liveClass}">
          <div class="omni-floor-row-head">
            <strong>${escapeHtml(setLabel)}</strong>
            <span class="omni-floor-station">${escapeHtml(row.station || 'CNC')}</span>
          </div>
          <p class="omni-floor-row-meta">${escapeHtml(sheetText)}${escapeHtml(phase)}${row.set_name ? ` · Ran ${Number(row.ran_count) || 0}/${Number(row.tap_count) || 0}` : ''}</p>
          ${heartbeat ? `<p class="omni-floor-row-heartbeat muted-text">${escapeHtml(heartbeat)}</p>` : ''}
          <div class="omni-floor-row-badges">${badges.join('')}</div>
        </div>`;
      }).join('')
      : (mirrorState === 'unavailable'
        ? '<p class="omni-dispatch-empty">Omni telemetry mirror is unavailable; station state is unknown.</p>'
        : '<p class="omni-dispatch-empty">No live Omni session on the floor right now.</p>');
  }

  const progressLane = document.getElementById('omniFloorProgressLane');
  const progress = status.progress_today || [];
  if (progressLane) {
    progressLane.innerHTML = progress.length
      ? progress.map((row) => {
        const taps = `${Number(row.ran_count) || 0}/${Number(row.tap_count) || 0} taps`;
        const done = row.operator_completed_at
          ? ` · complete ${_formatShortTs(row.operator_completed_at)}`
          : '';
        // Which sheet he finished last, not just how many. Absent on a set that
        // has not run a sheet yet, and on any status.json written before the
        // station started recording per-tap stamps -- so it degrades to the
        // count rather than showing a blank line.
        const lastTap = String(row.last_ran_tap || '').trim();
        const lastAt = String(row.last_ran_at || '').trim();
        const lastLine = lastTap && !row.operator_completed_at
          ? `<p class="omni-floor-row-lasttap">Last sheet: <strong>${escapeHtml(lastTap)}</strong>${lastAt ? ` · ${escapeHtml(_formatShortTs(lastAt))}` : ''}</p>`
          : '';
        return `<div class="omni-floor-row">
          <div class="omni-floor-row-head">
            <strong>${escapeHtml(row.set_name || '—')}</strong>
            <span class="omni-set-chip ${row.execution_state === 'completed' ? 'is-ready' : (row.live ? 'is-active' : '')}">${escapeHtml(omniExecutionLabel(row.execution_state))}</span>
          </div>
          <p class="omni-floor-row-meta">${escapeHtml(taps)}${escapeHtml(done)}</p>
          ${lastLine}
        </div>`;
      }).join('')
      : '<p class="omni-dispatch-empty">No sets started on the floor yet today.</p>';
  }

  const attentionLane = document.getElementById('omniFloorAttentionLane');
  const attention = status.needs_check || [];
  if (attentionLane) {
    const emptyAttention = mirrorState === 'unavailable'
      ? 'Ran tracking cannot be verified while the Omni telemetry mirror is unavailable.'
      : (mirrorState === 'degraded'
        ? 'Omni telemetry is incomplete; Ran tracking may also be incomplete.'
        : 'Nothing flagged — Ran tracking looks aligned.');
    attentionLane.innerHTML = attention.length
      ? attention.map((row) => {
        const reasons = [];
        if (row.check_ran_gap) reasons.push('Viewing ahead of marked Ran');
        if (Number(row.recut_flags_pending) > 0) {
          reasons.push(`${Number(row.recut_flags_pending)} recut flag(s) not submitted`);
        }
        return `<div class="omni-floor-row is-attention">
          <div class="omni-floor-row-head"><strong>${escapeHtml(row.set_name || '—')}</strong></div>
          <p class="omni-floor-row-meta">${escapeHtml(reasons.join(' · ') || 'Review')}</p>
        </div>`;
      }).join('')
      : `<p class="omni-dispatch-empty">${escapeHtml(emptyAttention)}</p>`;
  }

  const recutsLane = document.getElementById('omniFloorRecutsLane');
  const drafts = status.recut_drafts || [];
  const submitted = status.submitted_recuts_today || [];
  if (recutsLane) {
    let html = '';
    if (drafts.length) {
      html += drafts.map((row) => `<div class="omni-floor-row is-pending">
        <div class="omni-floor-row-head"><strong>${escapeHtml(row.set_name || '—')}</strong></div>
        <p class="omni-floor-row-meta">${Number(row.recut_flags_pending) || 0} draft flag(s) on floor — waiting for Submit</p>
      </div>`).join('');
    }
    if (submitted.length) {
      html += submitted.slice(0, 8).map((item) => `<div class="omni-floor-row">
        <div class="omni-floor-row-head"><strong>${escapeHtml(item.job || '—')}</strong></div>
        <p class="omni-floor-row-meta">${escapeHtml(item.part_name || 'Part')} · Cab ${escapeHtml(String(item.cabinet_number ?? '—'))} · ${_formatShortTs(item.submitted_at)}</p>
      </div>`).join('');
      if (submitted.length > 8) {
        html += `<p class="omni-floor-more muted-text">+ ${submitted.length - 8} more submitted today (see Omni Recuts)</p>`;
      }
      html += '<button type="button" class="button secondary compact omni-review-recuts">Review / rebatch</button>';
    }
    recutsLane.innerHTML = html || '<p class="omni-dispatch-empty">No recut drafts or submissions today.</p>';
    recutsLane.querySelector('.omni-review-recuts')?.addEventListener('click', openOmniRecutsModal);
  }
  // The recuts lane is quiet until the floor raises one; reveal it if it did.
  syncAdvancedEmptyLanes();
}

function applyOmniFloorLivePayload(payload) {
  if (!payload?.ok) return;
  if (!_omniDispatchData) {
    _omniDispatchData = {
      sets: [],
      summary: {},
      floor: payload.floor,
      floor_status: payload.floor_status,
    };
  } else {
    if (payload.floor) _omniDispatchData.floor = payload.floor;
    const previous = _omniDispatchData.floor_status || {};
    const incoming = payload.floor_status || {};
    _omniDispatchData.floor_status = {
      ...previous,
      ...incoming,
      live_now: incoming.live_now || previous.live_now,
      // Live SSE payload may omit ERP-backed alerts; keep the last full rail,
      // but drop rows whose set is no longer in the 5-day dispatch window.
      alerts: (Array.isArray(incoming.alerts) ? incoming.alerts : previous.alerts || [])
        .filter((row) => omniAlertInDispatchWindow(row, _omniDispatchData)),
      summary: { ...(previous.summary || {}), ...(incoming.summary || {}) },
    };
  }
  const bySetId = payload.presence_by_set_id || {};
  for (const setItem of _omniDispatchData.sets || []) {
    const setId = setItem.set_id;
    if (setId && bySetId[setId]) {
      setItem.floor_presence = bySetId[setId];
      continue;
    }
    for (const station of payload.floor?.stations || []) {
      if (
        station.set_name
        && String(station.set_name).toLowerCase() === String(setItem.set_name || '').toLowerCase()
      ) {
        setItem.floor_presence = station;
        break;
      }
    }
  }
  renderOmniFloorStatus(_omniDispatchData);
  if ((_omniDispatchData.sets || []).length) {
    renderOmniDispatch(_omniDispatchData);
  }
}

function clearOmniFloorStreamReconnectTimer() {
  if (_omniFloorStreamReconnectTimer) {
    window.clearTimeout(_omniFloorStreamReconnectTimer);
    _omniFloorStreamReconnectTimer = null;
  }
}

function scheduleOmniFloorStreamReconnect() {
  if (_omniFloorStreamReconnectTimer) return;
  if (_cncWorkflowView !== 'omni' || document.visibilityState !== 'visible') return;
  _omniFloorStreamReconnectTimer = window.setTimeout(() => {
    _omniFloorStreamReconnectTimer = null;
    if (_cncWorkflowView === 'omni' && document.visibilityState === 'visible') {
      startOmniFloorLiveStream();
    }
  }, OMNI_FLOOR_STREAM_RECONNECT_MS);
}

function stopOmniFloorLiveStream({ resetState = true } = {}) {
  clearOmniFloorStreamReconnectTimer();
  if (_omniFloorEventSource) {
    _omniFloorEventSource.close();
    _omniFloorEventSource = null;
  }
  if (resetState) {
    _omniFloorStreamState = 'off';
    if (_omniDispatchData) renderOmniFloorStatus(_omniDispatchData);
  }
}

function startOmniFloorLiveStream() {
  if (typeof EventSource === 'undefined') return;
  clearOmniFloorStreamReconnectTimer();
  if (_omniFloorEventSource) {
    _omniFloorEventSource.close();
    _omniFloorEventSource = null;
  }
  _omniFloorStreamState = 'connecting';
  if (_omniDispatchData) renderOmniFloorStatus(_omniDispatchData);
  const source = new EventSource('/api/omni-floor-stream');
  _omniFloorEventSource = source;
  source.onopen = () => {
    _omniFloorStreamState = 'live';
    if (_omniDispatchData) renderOmniFloorStatus(_omniDispatchData);
  };
  source.addEventListener('floor', (event) => {
    try {
      const payload = JSON.parse(event.data);
      _omniFloorStreamState = 'live';
      if (payload.fingerprint && payload.fingerprint === _omniFloorLiveFingerprint) return;
      _omniFloorLiveFingerprint = payload.fingerprint || '';
      applyOmniFloorLivePayload(payload);
    } catch (_error) {
      /* ignore malformed events */
    }
  });
  source.onerror = () => {
    if (_omniFloorEventSource) {
      _omniFloorEventSource.close();
      _omniFloorEventSource = null;
    }
    _omniFloorStreamState = 'stale';
    if (_omniDispatchData) renderOmniFloorStatus(_omniDispatchData);
    scheduleOmniFloorStreamReconnect();
  };
}

function syncOmniFloorLiveStreamForView(view) {
  if (view === 'omni' && document.visibilityState === 'visible') {
    startOmniFloorLiveStream();
    api('/api/omni-floor-live')
      .then((payload) => {
        if (payload?.fingerprint) _omniFloorLiveFingerprint = payload.fingerprint;
        applyOmniFloorLivePayload(payload);
      })
      .catch(() => {});
  } else {
    stopOmniFloorLiveStream({ resetState: true });
  }
}

function omniIsActiveSet(item) {
  if (item?.floor_spent) return false;
  return ['loaded', 'in_progress', 'paused'].includes(item?.execution_state);
}

function omniReleasedSets(data = _omniDispatchData) {
  return (data?.sets || [])
    .filter((item) => item.visible_to_operator && item.execution_state !== 'completed')
    .sort((left, right) => {
      if (Boolean(left.priority) !== Boolean(right.priority)) {
        return left.priority ? -1 : 1;
      }
      const leftPosition = Number(left.queue_position) || Number.MAX_SAFE_INTEGER;
      const rightPosition = Number(right.queue_position) || Number.MAX_SAFE_INTEGER;
      if (leftPosition !== rightPosition) return leftPosition - rightPosition;
      return String(left.created_at || '').localeCompare(String(right.created_at || ''));
    });
}

function omniSetById(setId) {
  return (_omniDispatchData?.sets || []).find((item) => item.set_id === setId) || null;
}

function omniIsWalkup(item) {
  if (String(item?.source || '').toLowerCase() === 'walkup') return true;
  return /walk-up requests/i.test(String(item?.set_dir || ''));
}

function omniDispatchMetric(value, label) {
  return `<div class="omni-dispatch-metric"><strong>${Number(value) || 0}</strong><span>${escapeHtml(label)}</span></div>`;
}

function omniCustodyLabel(stage) {
  return ({
    paperwork_ready: 'Dashboard planned',
    posting: 'Bridge posting',
    bridge_error: 'Bridge error',
    ready_held: 'Bridge ready · held',
    ready_released: 'Released to Omni',
    loaded: 'Loaded at Omni',
    in_progress: 'Cutting',
    paused: 'Paused',
    unknown: 'Status unknown',
    completed: 'Complete',
  })[String(stage || '')] || 'Pipeline state unknown';
}

function omniCustodyAge(minutes) {
  const value = Number(minutes);
  if (!Number.isFinite(value) || value < 0) return '';
  if (value < 60) return `${Math.floor(value)}m`;
  if (value < 1440) return `${Math.floor(value / 60)}h ${Math.floor(value % 60)}m`;
  return `${Math.floor(value / 1440)}d ${Math.floor((value % 1440) / 60)}h`;
}

function omniCustodyRow(item) {
  const custody = item?.custody || {};
  const health = ['warning', 'critical'].includes(custody.health) ? custody.health : 'ok';
  const age = omniCustodyAge(custody.stage_age_minutes);
  const revisionParts = [
    `Dispatch ${Number(custody.dispatch_revision) || 0}`,
    `Post ${Number(custody.post_revision) || 0}`,
    `Status ${Number(custody.status_revision) || 0}`,
  ];
  if (Number(custody.handcuts_post_revision) > 0) {
    revisionParts.splice(2, 0, `Hand cuts ${Number(custody.handcuts_post_revision)}`);
  }
  const issues = Array.isArray(custody.issues) ? custody.issues.join(', ') : '';
  return `
    <div class="omni-custody-row is-${health}" title="${escapeHtml(issues)}">
      <span class="omni-custody-stage">${escapeHtml(omniCustodyLabel(custody.stage))}${age ? ` · ${escapeHtml(age)}` : ''}</span>
      <span class="omni-custody-revisions">${escapeHtml(revisionParts.join(' · '))}</span>
    </div>
  `;
}

function copyPathToClipboard(text, toastLabel = 'Copied') {
  const value = String(text || '').trim();
  if (!value) return;
  const flash = () => {
    const state = document.getElementById('smartStagingState')
      || document.getElementById('omniDispatchState');
    if (!state) return;
    const prior = state.textContent;
    state.classList.remove('is-error');
    state.textContent = `${toastLabel}: ${value}`;
    window.setTimeout(() => {
      if (state.textContent.startsWith(toastLabel)) state.textContent = prior;
    }, 2500);
  };
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(value).then(flash).catch(() => {
      window.prompt('Copy path:', value);
    });
    return;
  }
  window.prompt('Copy path:', value);
  flash();
}

function omniCopyPathButtons(item, { awaitingTaps = false } = {}) {
  const mdb = String(item?.mdb_path || '').trim();
  const handcuts = String(item?.handcuts_mdb_path || '').trim();
  if (!mdb && !handcuts) return '';
  const primaryClass = awaitingTaps ? 'button omni-copy-mdb' : 'button secondary omni-copy-mdb';
  return `
    <div class="omni-set-copy-row">
      ${mdb ? `<button type="button" class="${primaryClass}" data-copy-mdb="${escapeHtml(mdb)}" title="${escapeHtml(mdb)}">Copy MDB path</button>` : ''}
      ${handcuts ? `<button type="button" class="button secondary omni-copy-mdb" data-copy-mdb="${escapeHtml(handcuts)}" title="${escapeHtml(handcuts)}">Copy handcuts MDB</button>` : ''}
    </div>
  `;
}

function omniSetCard(item, options = {}) {
  const canAdmin = Boolean(_omniDispatchData?.can_admin);
  const isReleased = Boolean(item.visible_to_operator) && item.execution_state !== 'completed';
  const isActive = omniIsActiveSet(item);
  const isReady = item.preparation_state === 'ready';
  const isCompleted = item.execution_state === 'completed';
  const isWalkup = omniIsWalkup(item);
  const canEdit = canAdmin && !isCompleted;
  const awaitingTaps = !isCompleted && !isReady;
  const jobs = (item.jobs || [])
    .map((job) => String(job?.po_number || job?.job_name || '').trim())
    .filter(Boolean);
  const jobLabel = isWalkup
    ? (item.walkup_description || item.set_name || 'Walk-up request')
    : (jobs.length ? jobs.join(', ') : 'No PO metadata');
  const releasePending = isReleased && !isReady;
  const classes = [
    'omni-set-card',
    item.priority ? 'is-priority' : '',
    isActive ? 'is-active' : '',
    releasePending ? 'is-release-pending' : '',
    awaitingTaps ? 'is-awaiting-taps' : '',
    !isCompleted && isReady && !isReleased ? 'is-ready-held' : '',
    item.erp_exception ? 'is-erp-exception' : '',
    item.erp_closeout ? 'is-erp-closeout' : '',
    awaitingTaps && item.mdb_path ? 'is-copyable' : '',
  ].filter(Boolean).join(' ');
  const checked = item.visible_to_operator ? ' checked' : '';
  // Busy state is applied via setOmniDispatchBusy on live controls only. Baking
  // _omniDispatchBusy into rendered HTML disabled every toggle after the first
  // visibility change when a quiet refresh overlapped the re-render.
  const disabled = canEdit ? '' : ' disabled';
  const draggable = canEdit && isReleased ? 'true' : 'false';
  const position = isReleased
    ? `<span class="omni-set-position">Queue ${Number(options.queueIndex) + 1}</span>`
    : '';
  const prepChipClass = isReady ? 'is-ready' : 'is-pending';
  const executionChipClass = isActive ? 'is-active' : (isCompleted ? 'is-ready' : '');
  const pendingChip = releasePending
    ? '<span class="omni-set-chip is-pending">Release when ready</span>'
    : '';
  const sourceChip = isWalkup
    ? '<span class="omni-set-chip is-walkup">Walk-up</span>'
    : '';
  const revisionChip = Number(item.post_revision) > 0
    ? `<span class="omni-set-chip">Post ${Number(item.post_revision)}</span>`
    : '';
  const handcutsRevisionChip = Number(item.handcuts_post_revision) > 0
    ? `<span class="omni-set-chip">Hand Cuts post ${Number(item.handcuts_post_revision)}</span>`
    : '';
  const handcutsState = String(item.handcuts_state || '').trim().toLowerCase();
  const handcutsOptionalChip = (
    isReady
    && item.handcuts_expected
    && handcutsState === 'pending'
  )
    ? '<span class="omni-set-chip is-pending" title="Router TAPs are ready. Hand cuts can be cut by hand if the beam saw is busy.">Hand cuts optional</span>'
    : '';
  const handcutsStateLabel = omniHandcutsLabel(handcutsState);
  const handcutsStateChip = handcutsStateLabel && handcutsState !== 'pending'
    ? `<span class="omni-set-chip ${handcutsState === 'ready' ? 'is-ready' : 'is-pending'}">${escapeHtml(handcutsStateLabel)}</span>`
    : '';
  // Two different things. An exception is a set part way through that ERP has
  // moved on without -- somebody has to look at it. A close-out is a set whose
  // every job has left In Cutting, so there is nothing outstanding and it just
  // needs marking off. Treating the second as the first is what buried the
  // first: eight close-outs shouting alongside one genuine exception.
  const erpExceptionChip = item.erp_exception
    ? '<span class="omni-set-chip is-exception">ERP review</span>'
    : item.erp_closeout
      ? '<span class="omni-set-chip is-closeout">Close out</span>'
      : '';
  // A close-out the office made must never read as one the operator made. The
  // board is used to answer "did this get cut", and the two are different
  // answers: one is observed, the other asserted.
  const officeClosedChip = item.office_completed
    ? `<span class="omni-set-chip is-closeout" title="${escapeHtml(
        'Closed out from the office'
        + (item.office_completed_by ? ` by ${item.office_completed_by}` : '')
        + (item.office_completed_at ? ` on ${String(item.office_completed_at).slice(0, 10)}` : '')
        + (item.office_completed_note ? ` - ${item.office_completed_note}` : '')
      )}">Office close-out</span>`
    : '';
  const floor = item.floor_presence;
  let floorChips = '';
  if (floor?.live) {
    const sheet = Number(floor.viewing_sheet) || 0;
    const viewing = sheet > 0
      ? `Live · sheet ${sheet}${floor.viewing_phase === 'handcuts' ? ' (hand cuts)' : ''}`
      : 'Omni live';
    floorChips += `<span class="omni-set-chip is-active" title="Station ${escapeHtml(floor.station || '')}">${escapeHtml(viewing)}</span>`;
  }
  if (floor?.check_ran_gap) {
    floorChips += '<span class="omni-set-chip is-exception" title="Viewing ahead of marked Ran taps">Check</span>';
  }
  if (Number(floor?.flags_pending) > 0) {
    floorChips += `<span class="omni-set-chip is-pending" title="Recut flags not submitted">${Number(floor.flags_pending)} recut draft${Number(floor.flags_pending) === 1 ? '' : 's'}</span>`;
  }
  if (Array.isArray(floor?.attention) && floor.attention.includes('stale') && !floor.live) {
    floorChips += '<span class="omni-set-chip is-pending" title="No recent Omni heartbeat">Stale</span>';
  }
  const telemetryIssues = Array.isArray(floor?.data_quality?.issues)
    ? floor.data_quality.issues
    : [];
  const statusIssues = Array.isArray(item.status_health?.issues)
    ? item.status_health.issues
    : [];
  if (telemetryIssues.length || statusIssues.length) {
    floorChips += `<span class="omni-set-chip is-exception" title="${escapeHtml([...telemetryIssues, ...statusIssues].join(', '))}">Telemetry check</span>`;
  }
  const holdReason = item.hold_reason
    ? `<p class="omni-set-hold-reason">Hold: ${escapeHtml(item.hold_reason)}</p>`
    : '';
  const preparationError = item.preparation_error
    ? `<p class="omni-set-preparation-error">${
        item.preparation_source === 'walkup_prerun'
          ? escapeHtml(item.preparation_error)
          : `Bridge error: ${escapeHtml(item.preparation_error)}`
      }</p>`
    : '';
  const erpException = item.erp_exception
    ? `<p class="omni-set-erp-exception">No longer fully In Cutting: ${escapeHtml((item.erp_stale_jobs || []).join(', ') || 'member job')}</p>`
    : item.erp_closeout
      ? `<p class="omni-set-erp-closeout">Nothing left In Cutting — never marked complete. Finished: ${escapeHtml((item.erp_stale_jobs || []).join(', ') || 'member job')}</p>`
      : '';

  let actions = '';
  if (canAdmin && isCompleted) {
    actions = `
      <div class="omni-set-card-actions">
        <button class="button secondary omni-reopen" type="button" data-omni-action="reopen" title="Clear the complete mark so this set can be cut again.">Undo complete</button>
        ${isWalkup ? `<button class="button secondary omni-delete" type="button" data-omni-action="delete" title="Remove this walk-up from Omni Cut Station and delete its folder.">Delete</button>` : ''}
      </div>
      <div class="omni-reopen-confirm" data-omni-reopen-confirm hidden>
        <p class="omni-delete-copy">Undo complete on <strong>${escapeHtml(item.set_name || 'this set')}</strong>? It will leave Completed and return to Omni Cut Station.</p>
        <div class="omni-closeout-row">
          <button class="button omni-reopen-go" type="button" data-omni-action="reopen-confirm">Undo complete</button>
          <button class="button secondary" type="button" data-omni-action="reopen-cancel">Cancel</button>
        </div>
        <p class="omni-closeout-warning" data-omni-reopen-warning hidden></p>
      </div>
      ${isWalkup ? `
      <div class="omni-delete-confirm" data-omni-delete-confirm hidden>
        <p class="omni-delete-copy">Delete <strong>${escapeHtml(item.set_name || 'this walk-up')}</strong>? It will leave Omni Cut Station and the walk-up folder will be removed.</p>
        <div class="omni-closeout-row">
          <button class="button omni-delete-go" type="button" data-omni-action="delete-confirm">Delete walk-up</button>
          <button class="button secondary" type="button" data-omni-action="delete-cancel">Cancel</button>
        </div>
        <p class="omni-closeout-warning" data-omni-delete-warning hidden></p>
      </div>` : ''}
    `;
  } else if (canAdmin && !isCompleted) {
    const priorityText = item.priority ? '★ Priority' : '☆ Priority';
    const priorityPressed = item.priority ? 'true' : 'false';
    const canMoveUp = isReleased
      && options.queueIndex > 0
      && Boolean(options.previous?.priority) === Boolean(item.priority);
    const canMoveDown = isReleased
      && options.queueIndex < options.queueLength - 1
      && Boolean(options.next?.priority) === Boolean(item.priority);
    actions = `
      <div class="omni-set-card-actions">
        <button class="button secondary omni-priority-toggle" type="button" data-omni-action="priority" aria-pressed="${priorityPressed}"${disabled}>${priorityText}</button>
        ${!item.visible_to_operator ? `<button class="button secondary" type="button" data-omni-action="reason"${disabled}>Hold note</button>` : ''}
        ${isReleased ? `<button class="button secondary" type="button" data-omni-action="up" aria-label="Move ${escapeHtml(item.set_name)} up"${canMoveUp && !_omniDispatchBusy ? '' : ' disabled'}>↑</button>` : ''}
        ${isReleased ? `<button class="button secondary" type="button" data-omni-action="down" aria-label="Move ${escapeHtml(item.set_name)} down"${canMoveDown && !_omniDispatchBusy ? '' : ' disabled'}>↓</button>` : ''}
        <button class="button secondary omni-closeout" type="button" data-omni-action="closeout" title="Close this set out from the office. Use when the work is done but never went through Omni."${disabled}>Mark complete</button>
        ${isWalkup ? `<button class="button secondary omni-delete" type="button" data-omni-action="delete" title="Remove this walk-up from Omni Cut Station and delete its folder."${disabled}>Delete</button>` : ''}
      </div>
      <div class="omni-closeout-confirm" data-omni-closeout-confirm hidden>
        <label class="omni-closeout-label" for="omni-closeout-note-${escapeHtml(item.set_id)}">Why is it complete? (optional)</label>
        <div class="omni-closeout-row">
          <input class="omni-closeout-note" id="omni-closeout-note-${escapeHtml(item.set_id)}" type="text" data-omni-closeout-note placeholder="e.g. cut from the 8-5 morning plan" maxlength="200">
          <button class="button omni-closeout-go" type="button" data-omni-action="closeout-confirm">Mark complete</button>
          <button class="button secondary" type="button" data-omni-action="closeout-cancel">Cancel</button>
        </div>
        <p class="omni-closeout-warning" data-omni-closeout-warning hidden></p>
      </div>
      <div class="omni-hide-confirm" data-omni-hide-confirm hidden>
        <p class="omni-delete-copy">Hide <strong>${escapeHtml(item.set_name || 'this set')}</strong> from Omni Cut Station?${omniIsActiveSet(item) ? ` It is ${escapeHtml(omniExecutionLabel(item.execution_state).toLowerCase())} on the floor.` : ''}</p>
        <div class="omni-closeout-row">
          <input class="omni-closeout-note" type="text" data-omni-hide-reason placeholder="Hold note (optional)" maxlength="200" value="${escapeHtml(item.hold_reason || '')}">
          <button class="button omni-hide-go" type="button" data-omni-action="hide-confirm">Hide</button>
          <button class="button secondary" type="button" data-omni-action="hide-cancel">Cancel</button>
        </div>
        <p class="omni-closeout-warning" data-omni-hide-warning hidden></p>
      </div>
      <div class="omni-hide-confirm" data-omni-reason-confirm hidden>
        <p class="omni-delete-copy">Hold note for <strong>${escapeHtml(item.set_name || 'this set')}</strong></p>
        <div class="omni-closeout-row">
          <input class="omni-closeout-note" type="text" data-omni-reason-note placeholder="Hold note (blank clears it)" maxlength="200" value="${escapeHtml(item.hold_reason || '')}">
          <button class="button omni-hide-go" type="button" data-omni-action="reason-confirm">Save note</button>
          <button class="button secondary" type="button" data-omni-action="reason-cancel">Cancel</button>
        </div>
        <p class="omni-closeout-warning" data-omni-reason-warning hidden></p>
      </div>
      <p class="omni-closeout-warning" data-omni-action-warning hidden></p>
      ${isWalkup ? `
      <div class="omni-delete-confirm" data-omni-delete-confirm hidden>
        <p class="omni-delete-copy">Delete <strong>${escapeHtml(item.set_name || 'this walk-up')}</strong>? It will leave Omni Cut Station and the walk-up folder will be removed.${omniIsActiveSet(item) ? ` It is ${escapeHtml(omniExecutionLabel(item.execution_state).toLowerCase())} on the floor.` : ''}</p>
        <div class="omni-closeout-row">
          <button class="button omni-delete-go" type="button" data-omni-action="delete-confirm">Delete walk-up</button>
          <button class="button secondary" type="button" data-omni-action="delete-cancel">Cancel</button>
        </div>
        <p class="omni-closeout-warning" data-omni-delete-warning hidden></p>
      </div>` : ''}
    `;
  }
  const copyRow = omniCopyPathButtons(item, { awaitingTaps });
  const mdbAttr = String(item.mdb_path || '').trim()
    ? ` data-mdb-path="${escapeHtml(String(item.mdb_path).trim())}"`
    : '';
  return `
    <article class="${classes}" data-set-id="${escapeHtml(item.set_id)}" data-priority="${item.priority ? '1' : '0'}" draggable="${draggable}"${mdbAttr}>
      <div class="omni-set-card-head">
        <div class="omni-set-card-title">
          ${position}
          <strong>${escapeHtml(item.set_name || 'Unnamed set')}</strong>
        </div>
        <label class="omni-set-visible" title="${canAdmin ? 'Control whether this set is released to Omni Cut Station' : 'Only a dispatch admin can change visibility'}">
          <input class="omni-visible-toggle" type="checkbox"${checked}${disabled}>
          <span>Visible</span>
        </label>
      </div>
      <p class="omni-set-meta">${escapeHtml(item.day || '')} · ${Number(item.cabinet_count) || 0} ${isWalkup ? 'requested unit(s)' : 'cabinets'} · ${Number(item.tap_count) || 0} TAP files</p>
      <p class="omni-set-jobs">${escapeHtml(jobLabel)}</p>
      <div class="omni-set-statuses">
        <span class="omni-set-chip ${prepChipClass}">${escapeHtml(omniPreparationLabel(item.preparation_state, item))}</span>
        <span class="omni-set-chip ${executionChipClass}">${escapeHtml(omniExecutionLabel(item.execution_state, item))}</span>
        ${sourceChip}
        ${revisionChip}
        ${handcutsRevisionChip}
        ${handcutsOptionalChip}
        ${handcutsStateChip}
        ${pendingChip}
        ${erpExceptionChip}
        ${officeClosedChip}
        ${floorChips}
      </div>
      ${omniCustodyRow(item)}
      ${holdReason}
      ${preparationError}
      ${erpException}
      ${copyRow}
      ${actions}
    </article>
  `;
}

function renderOmniDispatchLane(elementId, items, emptyText, released = false) {
  const lane = document.getElementById(elementId);
  if (!lane) return;
  if (!items.length) {
    lane.innerHTML = `<p class="omni-dispatch-empty">${escapeHtml(emptyText)}</p>`;
    return;
  }
  lane.innerHTML = items.map((item, index) => omniSetCard(item, {
    queueIndex: released ? index : -1,
    queueLength: released ? items.length : 0,
    previous: released ? items[index - 1] : null,
    next: released ? items[index + 1] : null,
  })).join('');
}

function renderOmniDispatch(data) {
  _omniDispatchData = data;
  const sets = data?.sets || [];
  const completed = sets.filter((item) => item.execution_state === 'completed');
  const released = omniReleasedSets(data);
  const exceptions = sets.filter((item) => (
    item.execution_state !== 'completed' && item.erp_exception
  ));
  const heldExceptions = exceptions.filter((item) => !item.visible_to_operator);
  const preparingHeld = sets.filter((item) => (
    item.execution_state !== 'completed'
    && !item.erp_exception
    && !item.visible_to_operator
    && item.preparation_state !== 'ready'
  ));
  const readyHeld = sets.filter((item) => (
    item.execution_state !== 'completed'
    && !item.erp_exception
    && !item.visible_to_operator
    && item.preparation_state === 'ready'
  ));
  const summary = data?.summary || {};
  const pipeline = data?.pipeline || {};
  const producedPipeline = Number(pipeline.produced_pipeline_cabinets || 0);
  // Keep the shared Morning strip current; replan if staging polling drifts.
  applyMorningWip(pipeline);
  scheduleMorningPlanResyncIfWipDrifted(producedPipeline);
  const summaryEl = document.getElementById('omniDispatchSummary');
  if (summaryEl) {
    summaryEl.innerHTML = [
      omniDispatchMetric(summary.set_count, 'Sets found'),
      omniDispatchMetric(summary.walkup_count, 'Walk-ups'),
      omniDispatchMetric(summary.held_count, 'Held'),
      omniDispatchMetric(summary.released_count, 'Released'),
      omniDispatchMetric(summary.operator_queue_count, 'Ready at Omni'),
      omniDispatchMetric(summary.in_progress_count, 'Active'),
      omniDispatchMetric(summary.custody_problem_count, 'Pipeline checks'),
      omniDispatchMetric(summary.erp_exception_count, 'ERP review'),
      omniDispatchMetric(summary.erp_closeout_count, 'Close out'),
    ].join('');
  }

  const access = document.getElementById('omniDispatchAccess');
  if (access) {
    access.textContent = data?.can_admin
      ? `Admin controls · ${data.actor || 'current user'}`
      : `Read only · ${data?.actor || 'current user'}`;
    access.classList.toggle('is-admin', Boolean(data?.can_admin));
  }
  const counts = {
    omniPreparingCount: preparingHeld.length,
    omniReadyHeldCount: readyHeld.length,
    omniReleasedCount: released.length,
    omniCompletedCount: completed.length,
    omniExceptionCount: heldExceptions.length,
    smartPreparingCount: preparingHeld.length,
    smartReadyHeldCount: readyHeld.length,
  };
  Object.entries(counts).forEach(([id, value]) => {
    const node = document.getElementById(id);
    if (node) node.textContent = String(value);
  });
  renderOmniDispatchLane('omniPreparingLane', preparingHeld, 'No held sets are waiting for TAP files.');
  renderOmniDispatchLane('omniReadyHeldLane', readyHeld, 'No ready sets are currently held.');
  renderOmniDispatchLane('omniReleasedLane', released, 'Nothing is released to the operator.', true);
  renderOmniDispatchLane('omniCompletedLane', completed, 'No completed sets in this window.');
  renderOmniDispatchLane(
    'omniExceptionLane',
    heldExceptions,
    exceptions.length
      ? 'Released ERP exceptions remain highlighted in the live Omni queue.'
      : 'No retained ERP exceptions need review.',
  );
  renderOmniDispatchLane(
    'smartPreparingLane',
    preparingHeld,
    'No produced sets are waiting for TAP files.',
  );
  renderOmniDispatchLane(
    'smartReadyHeldLane',
    readyHeld,
    'No ready sets are being held from the operator.',
  );
  // Lane membership just changed; a quiet lane that gained a set must appear.
  syncAdvancedEmptyLanes();

  const state = document.getElementById('omniDispatchState');
  if (state) {
    state.classList.remove('is-error');
    state.textContent = sets.length
      ? `Updated ${formatTimestamp(data.generated_at)} · Watching the last ${Number(data.days) || OMNI_DISPATCH_LOOKBACK_DAYS} days`
      : `No generated sets found in the last ${Number(data.days) || OMNI_DISPATCH_LOOKBACK_DAYS} days.`;
  }
  const suppressedCount = Number(summary.inactive_staged_count || 0);
  const stagingState = document.getElementById('smartStagingState');
  if (stagingState) {
    stagingState.classList.remove('is-error');
    const removedText = suppressedCount
      ? ` ${suppressedCount} staged set${suppressedCount === 1 ? '' : 's'} left In Cutting and were removed from active staging.`
      : '';
    stagingState.textContent = `${producedPipeline} produced cabinet${producedPipeline === 1 ? '' : 's'} remain unfinished.${removedText}`;
  }
  document.querySelectorAll('[data-omni-controls]').forEach((board) => {
    board.setAttribute('aria-busy', 'false');
  });
  // A repaint must not swallow a decision the operator is halfway through.
  restoreOmniDeleteConfirms();
  restoreOmniCloseoutConfirms();
  renderOmniFloorStatus(data);
}

function setOmniDispatchBusy(busy, message = '') {
  _omniDispatchBusy = busy;
  document.querySelectorAll('[data-omni-controls]').forEach((board) => {
    board.setAttribute('aria-busy', busy ? 'true' : 'false');
  });
  ['omniDispatchRefresh', 'smartStagingRefresh'].forEach((id) => {
    const refresh = document.getElementById(id);
    if (refresh) refresh.disabled = busy;
  });
  ['omniDispatchState', 'smartStagingState'].forEach((id) => {
    const state = document.getElementById(id);
    if (state && message) {
      state.classList.remove('is-error');
      state.textContent = message;
    }
  });
}

async function loadReclaimMarryUp({ quiet = false } = {}) {
  const lane = document.getElementById('reclaimMarryUpLane');
  const countEl = document.getElementById('reclaimMarryUpCount');
  const section = document.getElementById('reclaimMarryUpSection');
  if (!lane) return;
  try {
    const data = await api('/api/reclaim-marry-up');
    renderReclaimMarryUp(data);
  } catch (error) {
    if (section) section.classList.remove('is-empty-collapsed');
    if (!quiet) {
      lane.innerHTML = `<p class="muted-text">${escapeHtml(error.message || 'Could not load reclaim marry-up.')}</p>`;
    }
    if (countEl) countEl.textContent = '0';
    // After the count is zeroed: a lane that failed to load holds nothing.
    syncAdvancedEmptyLanes();
  }
}

async function loadCohTrim({ quiet = false } = {}) {
  const lane = document.getElementById('cohTrimLane');
  const countEl = document.getElementById('cohTrimCount');
  const section = document.getElementById('cohTrimSection');
  if (!lane) return;
  try {
    const data = await api('/api/coh-trim');
    renderCohTrim(data);
  } catch (error) {
    if (section) section.classList.remove('is-empty-collapsed');
    if (!quiet) {
      lane.innerHTML = `<p class="muted-text">${escapeHtml(error.message || 'Could not load COH trim queue.')}</p>`;
    }
    if (countEl) countEl.textContent = '0';
    // After the count is zeroed: a lane that failed to load holds nothing.
    syncAdvancedEmptyLanes();
  }
}

function cohTrimStatusLabel(item) {
  const state = String(item.card_state || '');
  if (state === 'released_needs_cut' || item.visible_to_omni) return 'Released · needs cut';
  if (state === 'ready_held' || item.in_index) return 'Ready · held';
  if (item.disposition === 'watchout_odd_stock') return 'Needs TAP · odd sheet';
  if (item.disposition === 'unknown_stock') return 'Needs TAP · stock unclear';
  if (item.produce_error || state === 'needs_tap' || item.disposition === 'missing_tap') return 'Needs TAP';
  return 'COH pending';
}

function cohJobLine(task) {
  const jobs = Array.isArray(task.po_lines)
    ? task.po_lines.map((row) => String(row?.po_number || '').trim()).filter(Boolean)
    : [];
  const unique = [...new Set(jobs)];
  return unique.length ? unique.join(', ') : 'No PO metadata';
}

async function setCohOmniVisible(task, visible) {
  const cohKey = task.coh_key || task.coh_catalog_program;
  if (!cohKey) return;
  await api('/api/coh-trim/visibility', {
    method: 'POST',
    body: JSON.stringify({
      coh_key: cohKey,
      visible: Boolean(visible),
      coh_display: task.coh_display || '',
    }),
  });
  await loadCohTrim();
}

function renderCohSizeCard(task, { watchout = false } = {}) {
  const released = Boolean(task.visible_to_omni) || task.card_state === 'released_needs_cut';
  const held = Boolean(task.in_index) && !released && !watchout;
  const needsTap = watchout || task.card_state === 'needs_tap' || Boolean(task.produce_error);
  const cardClass = [
    'coh-trim-card',
    needsTap ? 'is-watchout' : '',
    held ? 'is-held' : '',
    released ? 'is-ready' : '',
  ].filter(Boolean).join(' ');
  const qty = Number(task.quantity_needed) || 1;
  const reason = task.produce_error || task.watchout_reason
    ? `<p class="reclaim-marry-meta">${escapeHtml(task.produce_error || task.watchout_reason)}</p>`
    : '';
  const toggle = task.can_show_on_omni
    ? `<label class="omni-set-visible" title="Publish this size into Trim Library so Omni can load it">
        <input class="coh-omni-visible" type="checkbox"${released ? ' checked' : ''} data-coh-key="${escapeHtml(task.coh_key || '')}" data-display="${escapeHtml(task.coh_display || '')}">
        <span>Show on Omni</span>
      </label>`
    : '';
  return `
    <article class="${cardClass}">
      <header>
        <div>
          <strong>COH ${escapeHtml(task.coh_display || task.coh_key || '')}</strong>
          <div class="reclaim-marry-meta">${qty} waiting · ${escapeHtml(cohJobLine(task))}</div>
          ${reason}
        </div>
        <span class="pill ${released ? 'pill-success' : (needsTap ? 'pill-warn' : 'pill-info')}">${escapeHtml(cohTrimStatusLabel(task))}</span>
      </header>
      ${toggle}
    </article>`;
}

function paintCohTrimLane(lane, html, bindToggles) {
  if (!lane) return;
  lane.innerHTML = html;
  if (!bindToggles) return;
  lane.querySelectorAll('.coh-omni-visible').forEach((input) => {
    input.addEventListener('change', async () => {
      input.disabled = true;
      try {
        await setCohOmniVisible({
          coh_key: input.dataset.cohKey,
          coh_display: input.dataset.display || '',
        }, input.checked);
      } catch (error) {
        alert(error.message || 'Could not update Omni visibility.');
        input.checked = !input.checked;
        input.disabled = false;
      }
    });
  });
}

function renderCohTrim(data) {
  const lane = document.getElementById('cohTrimLane');
  const viewer = document.getElementById('cohViewerLane');
  const countEl = document.getElementById('cohTrimCount');
  const section = document.getElementById('cohTrimSection');
  const needsCreate = Array.isArray(data?.needs_create) ? data.needs_create : [];
  const ready = Array.isArray(data?.ready) ? data.ready : [];
  const released = Array.isArray(data?.released) ? data.released : [];
  const watchouts = Array.isArray(data?.watchouts) ? data.watchouts : [];
  const sizeCount = needsCreate.length + ready.length + released.length + watchouts.length;
  if (countEl) {
    countEl.textContent = sizeCount
      ? `${sizeCount} size${sizeCount === 1 ? '' : 's'}`
      : '0';
  }
  if (!sizeCount) {
    if (section) section.classList.add('is-empty-collapsed');
    syncAdvancedEmptyLanes();
    const empty = '<p class="muted-text">No in-cutting COH trim lines.</p>';
    paintCohTrimLane(lane, empty, false);
    paintCohTrimLane(viewer, empty, false);
    return;
  }
  if (section) section.classList.remove('is-empty-collapsed');
  syncAdvancedEmptyLanes();

  let html = '';
  if (needsCreate.length || watchouts.length) {
    html += '<section class="coh-trim-task-group"><p class="section-label">Needs TAP</p>';
    html += [...needsCreate, ...watchouts].map((task) => renderCohSizeCard(task, { watchout: true })).join('');
    html += '</section>';
  }
  if (ready.length) {
    html += '<section class="coh-trim-task-group"><p class="section-label">Ready · held</p>';
    html += ready.map((task) => renderCohSizeCard(task)).join('');
    html += '</section>';
  }
  if (released.length) {
    html += '<section class="coh-trim-task-group"><p class="section-label">Released · needs cut</p>';
    html += released.map((task) => renderCohSizeCard(task)).join('');
    html += '</section>';
  }

  paintCohTrimLane(lane, html, true);
  paintCohTrimLane(viewer, html, true);
}

function renderReclaimMarryUp(data) {
  const lane = document.getElementById('reclaimMarryUpLane');
  const countEl = document.getElementById('reclaimMarryUpCount');
  const section = document.getElementById('reclaimMarryUpSection');
  const jobs = Array.isArray(data?.jobs) ? data.jobs : [];
  if (countEl) countEl.textContent = String(jobs.length);
  if (!lane) return;
  if (!jobs.length) {
    if (section) section.classList.add('is-empty-collapsed');
    syncAdvancedEmptyLanes();
    lane.innerHTML = '<p class="muted-text">No jobs waiting for reclaim marry-up.</p>';
    return;
  }
  if (section) section.classList.remove('is-empty-collapsed');
  syncAdvancedEmptyLanes();
  lane.innerHTML = jobs.map((job) => {
    const label = job.pallet_label_printed ? 'Pallet label printed' : 'No pallet label on file yet';
    return `
      <article class="reclaim-marry-card" data-po="${escapeHtml(job.po_number)}">
        <header>
          <div>
            <strong>${escapeHtml(job.po_number)}</strong>
            <div class="reclaim-marry-meta">${escapeHtml(job.reclaimed_items_line || '')}</div>
            <div class="reclaim-marry-meta">FD ${escapeHtml(job.firm_date || '—')} · SDD ${escapeHtml(job.sched_departure_date || '—')}</div>
          </div>
          <span class="pill ${job.pallet_label_printed ? 'pill-success' : 'pill-info'}">${escapeHtml(label)}</span>
        </header>
        <button type="button" class="button secondary compact reclaim-marry-confirm" data-po="${escapeHtml(job.po_number)}">
          Reclaim married
        </button>
      </article>`;
  }).join('');
  lane.querySelectorAll('.reclaim-marry-confirm').forEach((button) => {
    button.addEventListener('click', async () => {
      const po = button.dataset.po;
      if (!po) return;
      if (!window.confirm(`Confirm reclaimed cabinets were married back to ${po}?`)) return;
      button.disabled = true;
      try {
        await api('/api/reclaim-marry-up/confirm', {
          method: 'POST',
          body: JSON.stringify({ po_number: po }),
        });
        await loadReclaimMarryUp();
        loadProductionQueue().catch(() => {});
      } catch (error) {
        alert(error.message || 'Could not save reclaim confirmation.');
        button.disabled = false;
      }
    });
  });
}

async function loadOmniDispatch({ quiet = false, refreshSnapshot = true } = {}) {
  if (quiet && (
    _omniDispatchBusy
    || _omniDispatchRefreshing
    || omniCloseoutIsOpen()
    || omniDeleteIsOpen()
    || omniReopenIsOpen()
    || omniHideIsOpen()
    || omniReasonIsOpen()
  )) {
    return;
  }
  if (quiet) _omniDispatchRefreshing = true;
  const loadGen = ++_omniDispatchLoadGen;
  if (!quiet && !_omniDispatchBusy) {
    ['omniDispatchState', 'smartStagingState'].forEach((id) => {
      const state = document.getElementById(id);
      if (state) {
        state.classList.remove('is-error');
        state.textContent = 'Refreshing set dispatch…';
      }
    });
  }
  try {
    const dateBasis = document.getElementById('smartBatchesDateBasis')?.value || getPqDateBasis();
    const query = new URLSearchParams({
      days: String(OMNI_DISPATCH_LOOKBACK_DAYS),
      date_basis: dateBasis,
      refresh_snapshot: refreshSnapshot ? '1' : '0',
    });
    const data = await api(`/api/omni-dispatch?${query.toString()}`);
    if (loadGen !== _omniDispatchLoadGen || _omniDispatchBusy) return;
    renderOmniDispatch(data);
    loadReclaimMarryUp({ quiet: true }).catch(() => {});
    loadCohTrim({ quiet: true }).catch(() => {});
  } catch (error) {
    if (loadGen !== _omniDispatchLoadGen || _omniDispatchBusy) return;
    if (_omniDispatchData) renderOmniDispatch(_omniDispatchData);
    ['omniDispatchState', 'smartStagingState'].forEach((id) => {
      const state = document.getElementById(id);
      if (state) {
        state.classList.add('is-error');
        state.textContent = error.message;
      }
    });
  } finally {
    if (quiet) _omniDispatchRefreshing = false;
  }
}

async function updateOmniDispatchSet(item, changes, { force = false } = {}) {
  if (!item) return;
  // Returning quietly here is what made the board feel dead: a click during an
  // in-flight save did nothing and said nothing. Say so instead.
  if (_omniDispatchBusy) {
    const error = new Error('Another change is still saving. Try again in a moment.');
    error.status = 0;
    throw error;
  }
  _omniDispatchLoadGen += 1;
  setOmniDispatchBusy(true, `Updating ${item.set_name}…`);
  try {
    const payload = {
      set_id: item.set_id,
      expected_revision: item.dispatch_revision,
      changes,
      force,
    };
    try {
      await api('/api/omni-dispatch/update', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    } catch (error) {
      if (isStaleRevision(error)) {
        setOmniDispatchBusy(false);
        await loadOmniDispatch({ quiet: true });
        const fresh = omniSetById(item.set_id);
        if (!fresh) throw error;
        payload.expected_revision = fresh.dispatch_revision;
        setOmniDispatchBusy(true, `Updating ${item.set_name}…`);
        await api('/api/omni-dispatch/update', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      } else {
        throw error;
      }
    }
    setOmniDispatchBusy(false);
    await loadOmniDispatch();
  } catch (error) {
    renderOmniDispatch(_omniDispatchData);
    throw error;
  } finally {
    setOmniDispatchBusy(false);
  }
}

/**
 * Close a staged set out from the office.
 *
 * These are sets that never reached Omni, so no operator completion is ever
 * coming and they sit in the lanes for good. The whole flow is inline: native
 * prompt/confirm/alert are suppressed inside an embedded webview, which made a
 * refused close-out look identical to a broken button.
 */
// Set ids whose close-out has been armed to override a refusal, mapped to the
// note the operator typed. Same defect as the delete path: the arming lived in
// `box.dataset.force` and every repaint replaced the card and lost it, so
// "Close out anyway" quietly reverted to an unforced call that was refused
// again. The note went with it, so a typed reason vanished too.
const _omniCloseoutArmed = new Map();

function omniCloseoutForce(setId) {
  return _omniCloseoutArmed.has(String(setId));
}

function restoreOmniCloseoutConfirms() {
  for (const [setId, note] of _omniCloseoutArmed) {
    const card = omniCardById(setId);
    if (!card) continue;
    const { box, note: field, warn, go } = omniCloseoutNodes(card);
    if (!box || !box.hidden) continue;
    box.hidden = false;
    if (field && note) field.value = note;
    if (warn) {
      warn.hidden = false;
      warn.textContent = 'This set is active on the floor. Press again to close it out anyway.';
    }
    if (go) go.textContent = 'Close out anyway';
  }
}

function omniCloseoutNodes(card) {
  return {
    box: card?.querySelector('[data-omni-closeout-confirm]') || null,
    note: card?.querySelector('[data-omni-closeout-note]') || null,
    warn: card?.querySelector('[data-omni-closeout-warning]') || null,
    go: card?.querySelector('[data-omni-action="closeout-confirm"]') || null,
  };
}

function openOmniCloseoutConfirm(card) {
  const { box, note, warn } = omniCloseoutNodes(card);
  if (!box) return;
  closeOmniDeleteConfirm(card);
  closeOmniHideConfirm(card);
  closeOmniReasonConfirm(card);
  box.hidden = false;
  if (warn) { warn.hidden = true; warn.textContent = ''; }
  _omniCloseoutArmed.delete(String(card?.dataset.setId || ''));
  note?.focus();
}

function closeOmniCloseoutConfirm(card) {
  const { box, note, warn } = omniCloseoutNodes(card);
  if (!box) return;
  box.hidden = true;
  if (note) note.value = '';
  if (warn) { warn.hidden = true; warn.textContent = ''; }
  // Backing out disarms; a repaint goes through restoreOmniCloseoutConfirms().
  _omniCloseoutArmed.delete(String(card?.dataset.setId || ''));
}

// A failed update re-renders the board, so the card element captured before the
// request is detached by the time the error is handled. Writing the warning
// into it puts the message nowhere -- which is precisely how a refused
// close-out came to look like a button that did nothing. Always re-acquire.
function omniCardById(setId) {
  const cards = [...document.querySelectorAll('.omni-set-card')]
    .filter((card) => card.dataset.setId === String(setId || ''));
  return cards.find((card) => card.offsetParent !== null) || cards[0] || null;
}

function showOmniCloseoutWarning(setId, message, { retry = false, note = '' } = {}) {
  const card = omniCardById(setId);
  const nodes = omniCloseoutNodes(card);
  const { box, warn, go } = nodes;
  if (!box || !warn) {
    // No card to attach to (lane changed underneath us). The board-level status
    // line is the fallback -- the message must land somewhere.
    showOmniDispatchError(message);
    return;
  }
  box.hidden = false;
  if (note && nodes.note) nodes.note.value = note;
  warn.hidden = false;
  warn.textContent = retry ? `${message} Press again to close it out anyway.` : message;
  if (retry) {
    _omniCloseoutArmed.set(String(setId), note || '');
    if (go) go.textContent = 'Close out anyway';
  }
}

// "Dispatch changed from revision 1 to 2" means this tab's copy went stale --
// someone else, or a background refresh, moved first. That is not a protection
// to override; forcing past it would blindly clobber the other change. The
// right response is to re-read and reapply.
function isStaleRevision(error) {
  return isOmniConflict(error) && /revision/i.test(error.message || '');
}

async function submitOmniCloseout(card, item) {
  const setId = item.set_id;
  const nodes = omniCloseoutNodes(card);
  const noteText = (nodes.note?.value || '').trim();
  const changes = { office_completed: true, office_completed_note: noteText };
  const force = omniCloseoutForce(setId);

  try {
    await updateOmniDispatchSet(item, changes, { force });
  } catch (error) {
    if (isStaleRevision(error)) {
      // Re-read, then reapply against the current revision. Once only: a second
      // failure means something is genuinely contending and should be seen.
      await loadOmniDispatch({ quiet: true });
      const fresh = omniSetById(setId);
      if (!fresh) {
        showOmniCloseoutWarning(setId, 'That set is no longer on the board.', { note: noteText });
        return;
      }
      await updateOmniDispatchSet(fresh, changes, { force });
      closeOmniCloseoutConfirm(omniCardById(setId));
      return;
    }
    if (!force && isOmniConflict(error)) {
      showOmniCloseoutWarning(setId, error.message, { retry: true, note: noteText });
      return;
    }
    throw error;
  }
  closeOmniCloseoutConfirm(omniCardById(setId));
}

function omniCloseoutIsOpen() {
  return Boolean(document.querySelector('[data-omni-closeout-confirm]:not([hidden])'));
}

// Set ids whose delete has been explicitly armed to override a refusal.
//
// This used to live in `box.dataset.force`, i.e. in the DOM. Every path that
// re-renders the board -- the reload after any action, an error handler, and
// the 60s auto-refresh -- replaces the card and takes the flag with it. The
// confirm closed, the arming vanished, and the next press sent an unforced
// delete that conflicted exactly like the first. From the outside that is a
// Delete button that never works no matter how many times you press it, which
// is how paused walk-ups sat on the queue for sixteen days.
//
// Keyed by set id and held outside the DOM so a repaint cannot forget it.
const _omniDeleteArmed = new Set();

function omniDeleteForce(setId, item) {
  // An active set always needs the override, and the confirm the operator is
  // looking at already says "Delete anyway" -- the confirm box is the consent,
  // not a dataset attribute. `_omniDeleteArmed` additionally covers a refusal
  // the server raised for some other reason.
  return _omniDeleteArmed.has(String(setId)) || omniIsActiveSet(item);
}

function omniDeleteNodes(card) {
  return {
    box: card?.querySelector('[data-omni-delete-confirm]') || null,
    warn: card?.querySelector('[data-omni-delete-warning]') || null,
    go: card?.querySelector('[data-omni-action="delete-confirm"]') || null,
  };
}

function openOmniDeleteConfirm(card) {
  const { box, warn, go } = omniDeleteNodes(card);
  if (!box) return;
  closeOmniCloseoutConfirm(card);
  closeOmniHideConfirm(card);
  closeOmniReasonConfirm(card);
  const setId = String(card?.dataset.setId || '');
  const item = omniSetById(setId);
  box.hidden = false;
  if (omniIsActiveSet(item)) {
    _omniDeleteArmed.add(setId);
    if (warn) {
      warn.hidden = false;
      warn.textContent = `${item.set_name} is ${omniExecutionLabel(item.execution_state).toLowerCase()} on the floor. Deleting it removes it from Omni Cut Station.`;
    }
    if (go) go.textContent = 'Delete anyway';
  } else {
    if (warn) { warn.hidden = true; warn.textContent = ''; }
    if (go) go.textContent = 'Delete walk-up';
  }
}

function restoreOmniDeleteConfirms() {
  // Re-open any delete confirm the operator had open before a repaint. Without
  // this the board silently swallows the interaction mid-decision.
  for (const setId of _omniDeleteArmed) {
    const card = omniCardById(setId);
    if (!card) continue;
    const { box, warn, go } = omniDeleteNodes(card);
    if (!box || !box.hidden) continue;
    const item = omniSetById(setId);
    if (!item || !omniIsActiveSet(item)) continue;
    box.hidden = false;
    if (warn) {
      warn.hidden = false;
      warn.textContent = `${item.set_name} is ${omniExecutionLabel(item.execution_state).toLowerCase()} on the floor. Deleting it removes it from Omni Cut Station.`;
    }
    if (go) go.textContent = 'Delete anyway';
  }
}

function closeOmniDeleteConfirm(card) {
  const { box, warn, go } = omniDeleteNodes(card);
  if (!box) return;
  box.hidden = true;
  if (warn) { warn.hidden = true; warn.textContent = ''; }
  if (go) go.textContent = 'Delete walk-up';
  // Closing the confirm is the operator backing out, so the override is
  // disarmed. A repaint calls the restore path instead and keeps it.
  _omniDeleteArmed.delete(String(card?.dataset.setId || ''));
}

function omniDeleteIsOpen() {
  return Boolean(document.querySelector('[data-omni-delete-confirm]:not([hidden])'));
}

function showOmniDeleteWarning(setId, message, { retry = false } = {}) {
  const card = omniCardById(setId);
  const { box, warn, go } = omniDeleteNodes(card);
  if (!box || !warn) {
    showOmniDispatchError(message);
    return;
  }
  box.hidden = false;
  warn.hidden = false;
  warn.textContent = retry ? `${message} Press again to delete it anyway.` : message;
  if (retry) {
    _omniDeleteArmed.add(String(setId));
    if (go) go.textContent = 'Delete anyway';
  }
}

async function submitOmniDelete(card, item) {
  const setId = item.set_id;
  const force = omniDeleteForce(setId, item);
  if (_omniDispatchBusy) {
    const error = new Error('Another change is still saving. Try again in a moment.');
    error.status = 0;
    throw error;
  }
  setOmniDispatchBusy(true, `Deleting ${item.set_name}…`);
  _omniDispatchLoadGen += 1;
  try {
    await api('/api/omni-dispatch/delete', {
      method: 'POST',
      body: JSON.stringify({
        set_id: setId,
        expected_revision: item.dispatch_revision,
        force,
      }),
    });
    setOmniDispatchBusy(false);
    _omniDeleteArmed.delete(String(setId));
    await loadOmniDispatch();
  } catch (error) {
    renderOmniDispatch(_omniDispatchData);
    if (isStaleRevision(error)) {
      await loadOmniDispatch();
      showOmniDeleteWarning(setId, error.message, { retry: false });
      return;
    }
    if (isOmniConflict(error)) {
      showOmniDeleteWarning(setId, error.message, { retry: true });
      return;
    }
    throw error;
  } finally {
    setOmniDispatchBusy(false);
  }
}

function omniReopenNodes(card) {
  return {
    box: card?.querySelector('[data-omni-reopen-confirm]') || null,
    warn: card?.querySelector('[data-omni-reopen-warning]') || null,
  };
}

function openOmniReopenConfirm(card) {
  const { box, warn } = omniReopenNodes(card);
  if (!box) return;
  box.hidden = false;
  if (warn) { warn.hidden = true; warn.textContent = ''; }
}

function closeOmniReopenConfirm(card) {
  const { box, warn } = omniReopenNodes(card);
  if (!box) return;
  box.hidden = true;
  if (warn) { warn.hidden = true; warn.textContent = ''; }
}

function omniReopenIsOpen() {
  return Boolean(document.querySelector('[data-omni-reopen-confirm]:not([hidden])'));
}

function showOmniReopenWarning(setId, message) {
  const card = omniCardById(setId);
  const { box, warn } = omniReopenNodes(card);
  if (!box || !warn) {
    showOmniDispatchError(message);
    return;
  }
  box.hidden = false;
  warn.hidden = false;
  warn.textContent = message;
}

async function submitOmniReopen(card, item) {
  const setId = item.set_id;
  if (_omniDispatchBusy) {
    const error = new Error('Another change is still saving. Try again in a moment.');
    error.status = 0;
    throw error;
  }
  setOmniDispatchBusy(true, `Reopening ${item.set_name}…`);
  try {
    await api('/api/omni-dispatch/reopen', {
      method: 'POST',
      body: JSON.stringify({
        set_id: setId,
        expected_revision: item.dispatch_revision,
      }),
    });
    setOmniDispatchBusy(false);
    await loadOmniDispatch();
  } catch (error) {
    renderOmniDispatch(_omniDispatchData);
    if (isStaleRevision(error)) {
      await loadOmniDispatch();
      showOmniReopenWarning(setId, error.message);
      return;
    }
    throw error;
  } finally {
    setOmniDispatchBusy(false);
  }
}

function showOmniDispatchError(message) {
  const state = document.getElementById('omniDispatchState');
  if (!state) return;
  state.classList.add('is-error');
  state.textContent = message;
}

async function changeOmniVisibility(item, visible, { force = false, holdReason = null } = {}) {
  const changes = { visible_to_operator: visible };
  if (visible) {
    changes.hold_reason = '';
  } else if (holdReason != null) {
    changes.hold_reason = String(holdReason).trim();
  }
  if (!visible && omniIsActiveSet(item) && !force) {
    const error = new Error(
      `${item.set_name} is ${omniExecutionLabel(item.execution_state).toLowerCase()} on the floor.`
    );
    error.status = 409;
    throw error;
  }
  await updateOmniDispatchSet(item, changes, {
    force: force || (!visible && omniIsActiveSet(item)),
  });
}

function omniHideNodes(card) {
  return {
    box: card?.querySelector('[data-omni-hide-confirm]') || null,
    warn: card?.querySelector('[data-omni-hide-warning]') || null,
    reason: card?.querySelector('[data-omni-hide-reason]') || null,
  };
}

function openOmniHideConfirm(card) {
  const { box, warn } = omniHideNodes(card);
  if (!box) return;
  closeOmniCloseoutConfirm(card);
  closeOmniDeleteConfirm(card);
  closeOmniReasonConfirm(card);
  box.hidden = false;
  if (warn) { warn.hidden = true; warn.textContent = ''; }
  omniHideNodes(card).reason?.focus();
}

function closeOmniHideConfirm(card) {
  const { box, warn } = omniHideNodes(card);
  if (!box) return;
  box.hidden = true;
  if (warn) { warn.hidden = true; warn.textContent = ''; }
}

function omniReasonNodes(card) {
  return {
    box: card?.querySelector('[data-omni-reason-confirm]') || null,
    warn: card?.querySelector('[data-omni-reason-warning]') || null,
    note: card?.querySelector('[data-omni-reason-note]') || null,
  };
}

function openOmniReasonConfirm(card) {
  const { box, warn, note } = omniReasonNodes(card);
  if (!box) return;
  closeOmniCloseoutConfirm(card);
  closeOmniDeleteConfirm(card);
  closeOmniHideConfirm(card);
  box.hidden = false;
  if (warn) { warn.hidden = true; warn.textContent = ''; }
  note?.focus();
}

function closeOmniReasonConfirm(card) {
  const { box, warn } = omniReasonNodes(card);
  if (!box) return;
  box.hidden = true;
  if (warn) { warn.hidden = true; warn.textContent = ''; }
}

function omniReasonIsOpen() {
  return Boolean(document.querySelector('[data-omni-reason-confirm]:not([hidden])'));
}

function showOmniReasonWarning(setId, message) {
  const card = omniCardById(setId);
  const { box, warn } = omniReasonNodes(card);
  if (!box || !warn) {
    showOmniDispatchError(message);
    return;
  }
  box.hidden = false;
  warn.hidden = false;
  warn.textContent = message;
}

async function submitOmniHoldReason(card, item) {
  const nodes = omniReasonNodes(card);
  const reason = (nodes.note?.value || '').trim();
  try {
    await updateOmniDispatchSet(item, { hold_reason: reason });
  } catch (error) {
    showOmniReasonWarning(item.set_id, error.message);
  }
}

function showOmniActionWarning(setId, message, { retry = false } = {}) {
  const card = omniCardById(setId);
  const warn = card?.querySelector('[data-omni-action-warning]') || null;
  if (!warn) {
    showOmniDispatchError(message);
    return;
  }
  warn.hidden = false;
  warn.textContent = retry
    ? `${message} Press the same control again to override.`
    : message;
}

function omniHideIsOpen() {
  return Boolean(document.querySelector('[data-omni-hide-confirm]:not([hidden])'));
}

function showOmniHideWarning(setId, message) {
  const card = omniCardById(setId);
  const { box, warn } = omniHideNodes(card);
  if (!box || !warn) {
    showOmniDispatchError(message);
    return;
  }
  box.hidden = false;
  warn.hidden = false;
  warn.textContent = message;
}

async function submitOmniHide(card, item) {
  const nodes = omniHideNodes(card);
  const reason = (nodes.reason?.value || '').trim();
  try {
    await changeOmniVisibility(item, false, {
      force: omniIsActiveSet(item),
      holdReason: reason,
    });
  } catch (error) {
    showOmniHideWarning(item.set_id, error.message);
  }
}

async function changeOmniPriority(item) {
  const forceKey = `priority:${item.set_id}`;
  const force = _omniForceOverrides.has(forceKey);
  try {
    await updateOmniDispatchSet(item, { priority: !item.priority }, { force });
    _omniForceOverrides.delete(forceKey);
  } catch (error) {
    if (!force && isOmniConflict(error) && !isStaleRevision(error)) {
      _omniForceOverrides.add(forceKey);
      showOmniActionWarning(item.set_id, error.message, { retry: true });
      return;
    }
    throw error;
  }
}

async function reorderOmniDispatch(setIds, { force = false, warnSetId = '' } = {}) {
  if (_omniDispatchBusy) return;
  const forceKey = `reorder:${(setIds || []).join(',')}`;
  const override = force || _omniForceOverrides.has(forceKey);
  setOmniDispatchBusy(true, 'Saving Omni queue order…');
  try {
    const data = await api('/api/omni-dispatch/reorder', {
      method: 'POST',
      body: JSON.stringify({ set_ids: setIds, force: override }),
    });
    _omniForceOverrides.delete(forceKey);
    _omniDispatchBusy = false;
    renderOmniDispatch(data);
  } catch (error) {
    _omniDispatchBusy = false;
    renderOmniDispatch(_omniDispatchData);
    if (!override && isOmniConflict(error) && !isStaleRevision(error)) {
      _omniForceOverrides.add(forceKey);
      showOmniActionWarning(warnSetId || setIds[0], error.message, { retry: true });
      return;
    }
    throw error;
  } finally {
    _omniDispatchBusy = false;
  }
}

async function moveOmniDispatchSet(setId, direction) {
  const released = omniReleasedSets();
  const index = released.findIndex((item) => item.set_id === setId);
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= released.length) return;
    if (Boolean(released[index].priority) !== Boolean(released[nextIndex].priority)) {
      showOmniActionWarning(setId, 'Priority sets stay above regular work. Change the priority flag first.');
      return;
    }
  const setIds = released.map((item) => item.set_id);
  [setIds[index], setIds[nextIndex]] = [setIds[nextIndex], setIds[index]];
  await reorderOmniDispatch(setIds, { warnSetId: setId });
}

function wireOmniDispatchControls(board) {
  board.addEventListener('change', (event) => {
    const toggle = event.target.closest('.omni-visible-toggle');
    if (!toggle) return;
    const card = toggle.closest('.omni-set-card');
    const item = omniSetById(card?.dataset.setId || '');
    if (!item) return;
    if (!toggle.checked) {
      toggle.checked = true;
      openOmniHideConfirm(card);
      return;
    }
    changeOmniVisibility(item, true)
      .catch((error) => {
        showOmniDispatchError(error.message);
        if (_omniDispatchData) renderOmniDispatch(_omniDispatchData);
      });
  });

  board.addEventListener('click', (event) => {
    const copyButton = event.target.closest('[data-copy-mdb]');
    if (copyButton) {
      event.preventDefault();
      event.stopPropagation();
      const label = copyButton.textContent?.includes('handcuts')
        ? 'Handcuts MDB copied'
        : 'MDB path copied';
      copyPathToClipboard(copyButton.getAttribute('data-copy-mdb') || '', label);
      return;
    }
    const awaitingCard = event.target.closest('.omni-set-card.is-awaiting-taps.is-copyable');
    if (
      awaitingCard
      && !event.target.closest('button, input, label, a, [data-omni-action]')
    ) {
      const path = awaitingCard.getAttribute('data-mdb-path') || '';
      if (path) {
        copyPathToClipboard(path, 'MDB path copied');
        return;
      }
    }
    const button = event.target.closest('[data-omni-action]');
    if (!button || button.disabled) return;
    const card = button.closest('.omni-set-card');
    const item = omniSetById(card?.dataset.setId || '');
    if (!item) return;
    const action = button.dataset.omniAction;
    // The close-out flow is deliberately free of alert/confirm/prompt: those are
    // suppressed in an embedded webview, which turned a refused close-out into a
    // button that silently did nothing.
    if (action === 'closeout') { openOmniCloseoutConfirm(card); closeOmniDeleteConfirm(card); closeOmniHideConfirm(card); closeOmniReasonConfirm(card); return; }
    if (action === 'closeout-cancel') { closeOmniCloseoutConfirm(card); return; }
    if (action === 'closeout-confirm') {
      submitOmniCloseout(card, item).catch((error) => {
        showOmniCloseoutWarning(item.set_id, error.message, { retry: false });
      });
      return;
    }
    if (action === 'delete') { openOmniDeleteConfirm(card); closeOmniHideConfirm(card); closeOmniReasonConfirm(card); return; }
    if (action === 'delete-cancel') { closeOmniDeleteConfirm(card); return; }
    if (action === 'delete-confirm') {
      submitOmniDelete(card, item).catch((error) => {
        showOmniDeleteWarning(item.set_id, error.message, { retry: false });
      });
      return;
    }
    if (action === 'hide-cancel') { closeOmniHideConfirm(card); return; }
    if (action === 'hide-confirm') {
      submitOmniHide(card, item).catch((error) => {
        showOmniHideWarning(item.set_id, error.message);
      });
      return;
    }
    if (action === 'reason') { openOmniReasonConfirm(card); return; }
    if (action === 'reason-cancel') { closeOmniReasonConfirm(card); return; }
    if (action === 'reason-confirm') {
      submitOmniHoldReason(card, item).catch((error) => {
        showOmniReasonWarning(item.set_id, error.message);
      });
      return;
    }
    if (action === 'reopen') { openOmniReopenConfirm(card); return; }
    if (action === 'reopen-cancel') { closeOmniReopenConfirm(card); return; }
    if (action === 'reopen-confirm') {
      submitOmniReopen(card, item).catch((error) => {
        showOmniReopenWarning(item.set_id, error.message);
      });
      return;
    }
    let operation = null;
    if (action === 'priority') operation = changeOmniPriority(item);
    if (action === 'up') operation = moveOmniDispatchSet(item.set_id, -1);
    if (action === 'down') operation = moveOmniDispatchSet(item.set_id, 1);
    operation?.catch((error) => showOmniDispatchError(error.message));
  });

  board.addEventListener('mousedown', (event) => {
    if (event.target.closest('button, input, label, a, [data-omni-action]')) {
      event.stopPropagation();
    }
  });
}

document.querySelectorAll('[data-omni-controls]').forEach(wireOmniDispatchControls);
const omniDispatchBoard = document.getElementById('omniDispatchBoard');

omniDispatchBoard?.addEventListener('dragstart', (event) => {
  if (event.target.closest('button, input, label, a, [data-omni-action]')) {
    event.preventDefault();
    return;
  }
  const card = event.target.closest('.omni-set-card[draggable="true"]');
  if (!card) return;
  _omniDispatchDraggedSetId = card.dataset.setId || '';
  card.classList.add('is-dragging');
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', _omniDispatchDraggedSetId);
});

omniDispatchBoard?.addEventListener('dragover', (event) => {
  const card = event.target.closest('#omniReleasedLane .omni-set-card');
  if (!card || !(_omniDispatchDraggedSetId || event.dataTransfer.types.includes('text/plain'))) return;
  event.preventDefault();
  document.querySelectorAll('.omni-set-card.is-drop-target').forEach((node) => {
    if (node !== card) node.classList.remove('is-drop-target');
  });
  card.classList.add('is-drop-target');
  event.dataTransfer.dropEffect = 'move';
});

omniDispatchBoard?.addEventListener('drop', (event) => {
  const targetCard = event.target.closest('#omniReleasedLane .omni-set-card');
  const draggedId = _omniDispatchDraggedSetId || event.dataTransfer.getData('text/plain');
  document.querySelectorAll('.omni-set-card.is-drop-target').forEach((node) => node.classList.remove('is-drop-target'));
  if (!targetCard || !draggedId || targetCard.dataset.setId === draggedId) return;
  event.preventDefault();
  const released = omniReleasedSets();
  const dragged = released.find((item) => item.set_id === draggedId);
  const target = released.find((item) => item.set_id === targetCard.dataset.setId);
  if (!dragged || !target) return;
  if (Boolean(dragged.priority) !== Boolean(target.priority)) {
    showOmniActionWarning(draggedId, 'Priority sets stay above regular work. Change the priority flag first.');
    return;
  }
  const setIds = released.map((item) => item.set_id).filter((setId) => setId !== draggedId);
  const targetIndex = setIds.indexOf(target.set_id);
  const rect = targetCard.getBoundingClientRect();
  const insertAfter = event.clientY > rect.top + (rect.height / 2);
  setIds.splice(targetIndex + (insertAfter ? 1 : 0), 0, draggedId);
  reorderOmniDispatch(setIds, { warnSetId: draggedId }).catch((error) => showOmniDispatchError(error.message));
});

omniDispatchBoard?.addEventListener('dragend', () => {
  _omniDispatchDraggedSetId = '';
  document.querySelectorAll('.omni-set-card.is-dragging, .omni-set-card.is-drop-target').forEach((node) => {
    node.classList.remove('is-dragging', 'is-drop-target');
  });
});

document.getElementById('omniDispatchRefresh')?.addEventListener('click', () => {
  loadOmniDispatch().catch(() => {});
});
document.getElementById('smartStagingRefresh')?.addEventListener('click', () => {
  loadOmniDispatch().catch(() => {});
  previewSmartBatches().catch(() => {});
  loadReclaimMarryUp().catch(() => {});
  loadCohTrim().catch(() => {});
});

// ---------------------------------------------------------------------------
// Recurring inventory catalog
// ---------------------------------------------------------------------------
const recurringInventoryState = { items: [], categories: [], filter: '' };

function recurringInventoryNumber(value) {
  if (value === null || value === undefined || value === '') return '-';
  return String(value);
}

function resetRecurringInventoryForm() {
  const form = document.getElementById('recurringInventoryForm');
  form?.reset();
  const id = document.getElementById('recurringInventoryId');
  const unit = document.getElementById('recurringInventoryUnit');
  if (id) id.value = '';
  if (unit) unit.value = 'each';
  const toggle = document.getElementById('toggleRecurringInventoryForm');
  if (toggle) toggle.textContent = 'Add new item';
}

function setRecurringInventoryFormOpen(open) {
  const panel = document.getElementById('recurringInventoryFormPanel');
  const toggle = document.getElementById('toggleRecurringInventoryForm');
  if (panel) panel.hidden = !open;
  toggle?.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function renderRecurringInventory() {
  const counts = recurringInventoryState.counts || {};
  const summary = document.getElementById('recurringInventorySummary');
  const metrics = document.getElementById('recurringInventoryMetrics');
  const body = document.getElementById('recurringInventoryBody');
  const categoryFilter = document.getElementById('recurringInventoryCategoryFilter');
  if (summary) {
    summary.textContent = counts.items
      ? `${counts.items} recurring item${counts.items === 1 ? '' : 's'} across ${counts.categories} categor${counts.categories === 1 ? 'y' : 'ies'}. Count sheets stay blank for a true physical count; saved counts drive the order request.`
      : 'Build a reusable catalog of supplies that should be counted and reordered regularly.';
  }
  if (metrics) {
    metrics.innerHTML = [
      ['Catalog items', counts.items || 0],
      ['Categories', counts.categories || 0],
      ['Need a count', counts.needs_count || 0],
      ['At reorder level', counts.needs_order || 0],
    ].map(([label, value]) => `<article><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`).join('');
  }
  if (categoryFilter) {
    const selected = recurringInventoryState.filter;
    categoryFilter.innerHTML = '<option value="">All categories</option>' + (recurringInventoryState.categories || [])
      .map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join('');
    categoryFilter.value = selected;
  }
  if (!body) return;
  const shown = (recurringInventoryState.items || []).filter((row) => !recurringInventoryState.filter || row.category === recurringInventoryState.filter);
  if (!shown.length) {
    body.innerHTML = `<tr><td colspan="10" class="muted-text">${recurringInventoryState.items.length ? 'No items in this category.' : 'No recurring items yet. Select Add new item to build the catalog.'}</td></tr>`;
    return;
  }
  body.innerHTML = shown.map((row) => `
    <tr class="${row.needs_order ? 'inventory-order-needed' : ''}" data-inventory-id="${escapeHtml(row.id)}">
      <td>${escapeHtml(row.category)}</td>
      <td><strong>${escapeHtml(row.item)}</strong>${row.specification ? `<br><span class="muted-text">${escapeHtml(row.specification)}</span>` : ''}</td>
      <td>${escapeHtml(row.location || '-')}</td>
      <td>${escapeHtml(row.unit)}</td>
      <td>${escapeHtml(recurringInventoryNumber(row.minimum_qty))}</td>
      <td>${escapeHtml(recurringInventoryNumber(row.target_qty))}</td>
      <td><strong>${escapeHtml(recurringInventoryNumber(row.current_qty))}</strong></td>
      <td>${row.needs_order ? `<span class="pill pill-pending">${escapeHtml(recurringInventoryNumber(row.order_qty))}</span>` : '-'}</td>
      <td>${escapeHtml(row.last_counted || '-')}</td>
      <td><div class="inventory-row-actions"><button class="button secondary compact" type="button" data-inventory-action="edit">Edit / count</button><button class="button secondary compact" type="button" data-inventory-action="archive">Remove</button></div></td>
    </tr>`).join('');
}

async function loadRecurringInventory() {
  const data = await api('/api/recurring-inventory');
  recurringInventoryState.items = data.items || [];
  recurringInventoryState.categories = data.categories || [];
  recurringInventoryState.counts = data.counts || {};
  renderRecurringInventory();
}

function editRecurringInventoryItem(row) {
  const fields = {
    recurringInventoryId: row.id,
    recurringInventoryCategory: row.category,
    recurringInventoryItem: row.item,
    recurringInventorySpecification: row.specification,
    recurringInventoryUnit: row.unit,
    recurringInventoryLocation: row.location,
    recurringInventorySupplier: row.supplier,
    recurringInventorySku: row.supplier_sku,
    recurringInventoryMinimum: row.minimum_qty,
    recurringInventoryTarget: row.target_qty,
    recurringInventoryCurrent: row.current_qty,
    recurringInventoryNotes: row.notes,
  };
  Object.entries(fields).forEach(([id, value]) => {
    const control = document.getElementById(id);
    if (control) control.value = value === null || value === undefined ? '' : value;
  });
  const toggle = document.getElementById('toggleRecurringInventoryForm');
  if (toggle) toggle.textContent = 'Editing item';
  setRecurringInventoryFormOpen(true);
  document.getElementById('recurringInventoryCurrent')?.focus();
}

document.getElementById('openRecurringInventoryButton')?.addEventListener('click', async () => {
  const modal = document.getElementById('recurringInventoryModal');
  if (modal) modal.hidden = false;
  syncModalBodyLock();
  try { await loadRecurringInventory(); } catch (error) { alert(error.message || String(error)); }
});

document.getElementById('closeRecurringInventoryModal')?.addEventListener('click', () => {
  const modal = document.getElementById('recurringInventoryModal');
  if (modal) modal.hidden = true;
  resetRecurringInventoryForm();
  setRecurringInventoryFormOpen(false);
  syncModalBodyLock();
});

document.getElementById('toggleRecurringInventoryForm')?.addEventListener('click', () => {
  const panel = document.getElementById('recurringInventoryFormPanel');
  const opening = Boolean(panel?.hidden);
  if (opening) resetRecurringInventoryForm();
  setRecurringInventoryFormOpen(opening);
});

document.getElementById('cancelRecurringInventoryEdit')?.addEventListener('click', () => {
  resetRecurringInventoryForm();
  setRecurringInventoryFormOpen(false);
});

document.getElementById('recurringInventoryCategoryFilter')?.addEventListener('change', (event) => {
  recurringInventoryState.filter = event.target.value;
  renderRecurringInventory();
});

document.getElementById('recurringInventoryForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const payload = { action: 'upsert' };
  form.forEach((value, key) => { payload[key] = String(value).trim(); });
  try {
    const data = await api('/api/recurring-inventory', { method: 'POST', body: JSON.stringify(payload) });
    recurringInventoryState.items = data.items || [];
    recurringInventoryState.categories = data.categories || [];
    recurringInventoryState.counts = data.counts || {};
    resetRecurringInventoryForm();
    setRecurringInventoryFormOpen(false);
    renderRecurringInventory();
  } catch (error) {
    alert(error.message || String(error));
  }
});

document.getElementById('recurringInventoryBody')?.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-inventory-action]');
  const tableRow = button?.closest('[data-inventory-id]');
  if (!button || !tableRow) return;
  const row = recurringInventoryState.items.find((item) => item.id === tableRow.dataset.inventoryId);
  if (!row) return;
  if (button.dataset.inventoryAction === 'edit') {
    editRecurringInventoryItem(row);
    return;
  }
  if (button.dataset.inventoryAction === 'archive') {
    if (!confirm(`Remove ${row.item} from recurring inventory? Its history will be retained.`)) return;
    try {
      const data = await api('/api/recurring-inventory', { method: 'POST', body: JSON.stringify({ action: 'archive', id: row.id }) });
      recurringInventoryState.items = data.items || [];
      recurringInventoryState.categories = data.categories || [];
      recurringInventoryState.counts = data.counts || {};
      renderRecurringInventory();
    } catch (error) { alert(error.message || String(error)); }
  }
});

async function openRecurringInventoryPdf(kind) {
  const result = await api('/api/recurring-inventory/pdf', { method: 'POST', body: JSON.stringify({ kind }) });
  return result;
}

document.getElementById('recurringInventoryCountPdf')?.addEventListener('click', () => {
  openRecurringInventoryPdf('count-sheet').catch((error) => alert(error.message || String(error)));
});

document.getElementById('recurringInventoryOrderPdf')?.addEventListener('click', () => {
  openRecurringInventoryPdf('order-request').catch((error) => alert(error.message || String(error)));
});

// ---------------------------------------------------------------------------
// Repository pricing queue (never surfaced by the frozen company release)
// ---------------------------------------------------------------------------
function pricingEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function pricingMoney(value, unavailable = '—') {
  if (value === null || value === undefined || value === '') return unavailable;
  return `$${Number(value).toFixed(2)}`;
}

function pricingQueueByPo() {
  return new Map((_pricingQueuePayload.jobs || []).map((row) => [String(row.po_number || ''), row]));
}

function renderPricingMetrics() {
  const counts = _pricingPayload.counts || {};
  const queueCounts = _pricingQueuePayload.counts || {};
  const values = {
    pricingMetricJobs: counts.all || 0,
    pricingMetricReady: counts.pricing_ready || 0,
    pricingMetricOutstanding: queueCounts.outstanding || 0,
    pricingMetricComplete: queueCounts.complete || 0,
    pricingMetricBlocked: queueCounts.blocked_mapping || 0,
  };
  Object.entries(values).forEach(([id, value]) => {
    const node = document.getElementById(id);
    if (node) node.textContent = String(value);
  });
}

function renderPricingQueueStatus() {
  const node = document.getElementById('pricingQueueStatus');
  if (!node) return;
  const counts = _pricingQueuePayload.counts || {};
  node.classList.remove('is-error');
  node.textContent = `${counts.outstanding || 0} outstanding · ${counts.complete || 0} complete · `
    + `${counts.blocked_mapping || 0} blocked mapping · ${counts.failed || 0} failed`;
}

function renderPricingDetail(detail) {
  const composition = detail.cost_composition || {};
  const v2 = detail.pricing_candidate_v2 || {};
  const runtime = v2.runtime || {};
  const material = v2.material || {};
  const range = v2.estimate_range || {};
  const missing = (detail.constituents || [])
    .filter((row) => row.mapping_status === 'MISSING')
    .map((row) => row.item_number)
    .filter(Boolean);
  const constituents = detail.constituents || [];
  const breakdown = detail.cabinet_breakdown || {};
  const constituentUnits = constituents.reduce((total, row) => total + (Number(row.quantity) || 0), 0);
  const cabinetRows = constituents.map((row) => {
    const subtitle = [row.description, row.product].filter(Boolean).join(' · ');
    const mapped = row.mapping_status && row.mapping_status !== 'MISSING';
    const sheets = (row.pw05_sheets == null && row.pw075_sheets == null)
      ? '—'
      : `${Number(row.pw05_sheets || 0).toFixed(2)} / ${Number(row.pw075_sheets || 0).toFixed(2)}`;
    return `<tr>
    <td><strong>${pricingEscape(row.item_number || '')}</strong>${subtitle ? `<br><span class="pricing-muted">${pricingEscape(subtitle)}</span>` : ''}</td>
    <td class="num">${pricingEscape(row.quantity || 0)}</td>
    <td class="${mapped ? 'pricing-ready' : 'pricing-blocked'}">${pricingEscape(row.mapping_status || '')}</td>
    <td class="num">${pricingEscape(sheets)}</td>
    <td class="num">${pricingEscape(pricingMoney(row.material_contribution))}</td>
    <td class="num">${pricingEscape(pricingMoney(row.machine_contribution))}</td>
    <td class="num"><strong>${pricingEscape(pricingMoney(row.forecast_contribution))}</strong></td>
    <td class="num">${pricingEscape(pricingMoney(row.unit_contribution))}</td>
  </tr>`;
  }).join('');
  const materialTotal = constituents.reduce((sum, row) => sum + (row.material_contribution == null ? 0 : Number(row.material_contribution)), 0);
  const machineTotal = constituents.reduce((sum, row) => sum + (row.machine_contribution == null ? 0 : Number(row.machine_contribution)), 0);
  const shareTotal = breakdown.contribution_total;
  const cabinetFooter = shareTotal == null ? '' : `<tfoot><tr>
    <td colspan="4">Mapped share of this job</td>
    <td class="num">${pricingEscape(pricingMoney(materialTotal))}</td>
    <td class="num">${pricingEscape(pricingMoney(machineTotal))}</td>
    <td class="num">${pricingEscape(pricingMoney(shareTotal))}</td>
    <td></td>
  </tr></tfoot>`;
  const readiness = (detail.readiness?.checks || [])
    .map((check) => `${check.state === 'pass' ? '✓' : check.state === 'fail' ? '✕' : '○'} ${pricingEscape(check.label || '')}`)
    .join('<br>');
  const v2Body = v2.available
    ? `<p><strong>${pricingEscape(pricingMoney(v2.pricing_standard_value))}</strong> V2 candidate</p>
       <p>${pricingEscape(material.pw05_whole_sheets || 0)} PW.5 + ${pricingEscape(material.pw075_whole_sheets || 0)} PW.75 whole sheets</p>
       <p>${pricingEscape(runtime.standard_machine_hours ?? '—')} machine hours · ${pricingEscape(runtime.tool_changes || 0)} tool calls · ${pricingEscape(runtime.bore_hits || 0)} bores</p>
       <p class="pricing-muted">Observed active-time range ${pricingEscape(pricingMoney(range.low))}–${pricingEscape(pricingMoney(range.high))}. Shelves and handcut-family parts are routed in the model.</p>`
    : `<p class="pricing-muted">${pricingEscape(v2.reason || 'Run this job through the V2 queue to generate its isolated virtual nest.')}</p>`;
  const compositionLines = (composition.components || []).map((part) => (
    `<p>${pricingEscape(part.label || '')}: <strong>${pricingEscape(pricingMoney(part.amount))}</strong><br><span class="pricing-muted">${pricingEscape(part.detail || '')}</span></p>`
  )).join('');
  return `<div class="pricing-detail">
    <article>
      <h3>Quote status</h3>
      <p><strong>${pricingEscape(constituentUnits)}</strong> cabinet units across ${pricingEscape(constituents.length)} item SKUs</p>
      ${composition.quote_ready
        ? `<p class="pricing-ready">Ready · ${pricingEscape(pricingMoney(composition.forecast_price))} V1</p>`
        : '<p class="pricing-blocked">NO QUOTE — unmapped item contained</p>'}
      ${missing.length ? `<p>Missing: <strong>${pricingEscape(missing.join(', '))}</strong></p>` : ''}
      <p class="pricing-muted">${pricingEscape(detail.readiness?.explanation || '')}</p>
    </article>
    <article>
      <h3>V2 virtual-nest estimate</h3>
      ${v2Body}
    </article>
    <article>
      <h3>Evidence checks</h3>
      <p>${readiness || 'No checks returned.'}</p>
      <p class="pricing-muted">${pricingEscape(detail.pricing_basis?.basis || '')}</p>
      ${compositionLines || ''}
    </article>
    <article class="pricing-cabinet-card">
      <h3>Cabinet contribution</h3>
      <p class="pricing-muted">${pricingEscape(breakdown.note || 'Material is SKU-derived. Machine is this cabinet\'s share of the job nest.')}</p>
      <div class="pricing-cabinet-breakdown-wrap">
        <table class="pricing-cabinet-breakdown"><thead><tr>
          <th>Item</th><th class="num">Qty</th><th>Mapping</th><th class="num">PW.5 / PW.75</th>
          <th class="num">Material</th><th class="num">Machine share</th><th class="num">Job share</th><th class="num">$/unit</th>
        </tr></thead>
        <tbody>${cabinetRows || '<tr><td colspan="8">No cabinet rows returned.</td></tr>'}</tbody>
        ${cabinetFooter}
        </table>
      </div>
    </article>
  </div>`;
}

function renderPricingTable() {
  const root = document.getElementById('pricingTable');
  if (!root) return;
  const needle = String(document.getElementById('pricingSearch')?.value || '').trim().toLowerCase();
  const queue = pricingQueueByPo();
  const jobs = (_pricingPayload.jobs || []).filter((job) => {
    if (!needle) return true;
    return `${job.po_number || ''} ${job.order_number || ''}`.toLowerCase().includes(needle);
  });
  if (!jobs.length) {
    root.innerHTML = '<p class="pricing-status">No jobs match this filter.</p>';
    return;
  }
  const rows = jobs.map((job) => {
    const po = String(job.po_number || '');
    const queued = queue.get(po) || {};
    const isOpen = _pricingExpandedPo === po;
    const v1 = job.pricing_ready
      ? `<strong>${pricingEscape(pricingMoney(job.forecast_price))}</strong>`
      : `<span class="pricing-blocked">NO QUOTE</span>${job.partial_forecast_price != null ? `<br><span class="pricing-muted">Mapped subtotal ${pricingEscape(pricingMoney(job.partial_forecast_price))}</span>` : ''}`;
    const v2 = queued.v2?.available ? `<strong>${pricingEscape(pricingMoney(queued.v2.pricing_standard_value))}</strong>` : '—';
    const queueStatus = String(queued.status || 'not queued').replaceAll('_', ' ');
    const readiness = job.pricing_ready
      ? '<span class="pricing-ready">Ready</span>'
      : `<span class="pricing-blocked">Missing ${pricingEscape((job.missing_items || []).join(', ') || 'mapping')}</span>`;
    const detail = _pricingDetailCache.get(po);
    let detailBody = '<p class="pricing-status">Loading job evidence…</p>';
    if (detail?.ok) detailBody = renderPricingDetail(detail);
    if (detail?.ok === false) detailBody = `<p class="pricing-status is-error">${pricingEscape(detail.error || 'Detail unavailable')}</p>`;
    return `<tr class="pricing-job-row${isOpen ? ' is-open' : ''}" data-pricing-po="${pricingEscape(po)}" tabindex="0" aria-expanded="${isOpen ? 'true' : 'false'}">
      <td><span class="pricing-expand">${isOpen ? '▼' : '▸'}</span><strong>${pricingEscape(po)}</strong><br><span class="pricing-muted">Order ${pricingEscape(job.order_number || '')}</span></td>
      <td>${pricingEscape(job.scheduled_departure_date || job.firm_date || 'Unscheduled')}</td>
      <td>${pricingEscape(job.stage || '')}</td>
      <td>${pricingEscape(job.cabinet_count || 0)}</td>
      <td>${v1}</td>
      <td>${v2}<br><span class="pricing-muted">${pricingEscape(queueStatus)}</span></td>
      <td>${readiness}</td>
    </tr>${isOpen ? `<tr><td class="pricing-detail-cell" colspan="7">${detailBody}</td></tr>` : ''}`;
  }).join('');
  root.innerHTML = `<table class="mdb-wizard-table"><thead><tr><th>Job</th><th>Due</th><th>Status</th><th>Cabinets</th><th>V1</th><th>V2 queue</th><th>Quote readiness</th></tr></thead><tbody>${rows}</tbody></table>`;
  root.querySelectorAll('[data-pricing-po]').forEach((row) => {
    const open = () => togglePricingJob(row.dataset.pricingPo || '');
    row.addEventListener('click', open);
    row.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        open();
      }
    });
  });
}

async function togglePricingJob(po) {
  if (!po) return;
  if (_pricingExpandedPo === po) {
    _pricingExpandedPo = '';
    renderPricingTable();
    return;
  }
  _pricingExpandedPo = po;
  renderPricingTable();
  if (!_pricingDetailCache.has(po)) {
    try {
      const detail = await api(`/api/pricing/jobs/${encodeURIComponent(po)}`);
      _pricingDetailCache.set(po, detail);
      // Summary and detail are separate requests. If Insight refreshed between
      // them, adopt the detail's count and V1 inputs so collapsed and expanded
      // views cannot display two versions of the same job.
      if (detail?.ok && detail.job) {
        const index = (_pricingPayload.jobs || []).findIndex((job) => String(job.po_number || '') === po);
        if (index >= 0) _pricingPayload.jobs[index] = { ..._pricingPayload.jobs[index], ...detail.job };
      }
    } catch (error) {
      _pricingDetailCache.set(po, { ok: false, error: error.message || String(error) });
    }
  }
  if (_pricingExpandedPo === po) renderPricingTable();
}

async function loadPricingWorkspace({ force = false } = {}) {
  if (window.__cutHealthCompanyMode || _pricingBusy || (_pricingLoaded && !force)) return;
  _pricingBusy = true;
  const sourceStatus = document.getElementById('pricingSourceStatus');
  if (sourceStatus) {
    sourceStatus.classList.remove('is-error');
    sourceStatus.textContent = 'Loading pricing evidence and queue…';
  }
  try {
    [_pricingPayload, _pricingQueuePayload] = await Promise.all([
      api(`/api/pricing/jobs?view=${encodeURIComponent(_pricingView)}&limit=1000`),
      api('/api/pricing/queue'),
    ]);
    _pricingLoaded = true;
    _pricingDetailCache.clear();
    const source = _pricingPayload.source || {};
    if (sourceStatus) {
      sourceStatus.textContent = `${_pricingPayload.displayed_count || 0} jobs · snapshot ${source.refreshed_at || 'unknown'}`
        + `${source.row_count != null ? ` · ${source.row_count} rows` : ''}. ${_pricingPayload.evidence_note || ''}`
        + `${source.routing_description_available ? ' Routing Description is present.' : ''}`;
    }
    renderPricingMetrics();
    renderPricingQueueStatus();
    renderPricingTable();
  } catch (error) {
    if (sourceStatus) {
      sourceStatus.classList.add('is-error');
      sourceStatus.textContent = error.message || String(error);
    }
  } finally {
    _pricingBusy = false;
  }
}

async function runPricingQueue() {
  if (_pricingBusy || window.__cutHealthCompanyMode) return;
  const button = document.getElementById('pricingRunQueue');
  const status = document.getElementById('pricingQueueStatus');
  const limit = Math.max(1, Math.min(25, Number(document.getElementById('pricingRunLimit')?.value || 1)));
  _pricingBusy = true;
  if (button) {
    button.disabled = true;
    button.textContent = `Running next ${limit}…`;
  }
  if (status) status.textContent = 'Generating isolated MDB/DXF nests and calculating V2…';
  try {
    _pricingQueuePayload = await api('/api/pricing/queue/run', {
      method: 'POST',
      body: JSON.stringify({ limit }),
    });
    _pricingDetailCache.clear();
    renderPricingMetrics();
    renderPricingQueueStatus();
    renderPricingTable();
  } catch (error) {
    if (status) {
      status.classList.add('is-error');
      status.textContent = error.message || String(error);
    }
  } finally {
    _pricingBusy = false;
    if (button) {
      button.disabled = false;
      button.textContent = 'Run next jobs';
    }
  }
}

function wirePricingWorkspace() {
  if (window.__cutHealthCompanyMode) return;
  document.getElementById('pricingRefresh')?.addEventListener('click', () => loadPricingWorkspace({ force: true }));
  document.getElementById('pricingSearch')?.addEventListener('input', renderPricingTable);
  document.getElementById('pricingRunQueue')?.addEventListener('click', runPricingQueue);
  document.querySelectorAll('[data-pricing-view]').forEach((button) => {
    button.addEventListener('click', () => {
      _pricingView = button.dataset.pricingView || 'all';
      document.querySelectorAll('[data-pricing-view]').forEach((candidate) => {
        candidate.classList.toggle('active', candidate === button);
      });
      _pricingLoaded = false;
      loadPricingWorkspace({ force: true });
    });
  });
}

// ---------------------------------------------------------------------------
// Bootstrap
//
// Everything that *runs* at load lives here, below every declaration in this
// file. Listener registrations can stay beside their feature — their bodies run
// after load, when every binding is initialized. Immediate calls cannot: a call
// placed above a later `let` reads it in the temporal dead zone, throws, and
// aborts the script from that line down. That is how the Omni floor stream, the
// dispatch board and the production queue all went dark in 6ed37a8c while tab
// switching still looked fine (function declarations hoist; `let` does not).
//
// New load-time work goes at the end of initDashboard(), never inline above.
// cut/tests/test_health_app_js_bootstrap.py fails if it drifts back.
// ---------------------------------------------------------------------------
function scheduleDeferredDashboardLoad(callback, timeout = 600) {
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(() => callback(), { timeout });
    return;
  }
  window.setTimeout(() => callback(), Math.min(timeout, 100));
}

function initDashboard() {
  // Paint last-known overview immediately so Recent Performance isn't a black void
  // while /api/overview recomputes 7/30-day history. Fresh data soft-replaces after.
  paintOverviewFromCache();
  rpEnsureInit();

  Promise.allSettled([
    loadOverview(),
    loadAutoRefreshStatus(),
  ]).then(() => {
    renderDepartmentRecordTiles();
  });
  startUiAutoRefresh();
  // These panels are collapsed or outside the initial Morning viewport. Let the
  // plan and staging requests paint first instead of competing during startup.
  window.setTimeout(() => {
    Promise.allSettled([
      loadNewHireTask(),
      loadDailyTraining(),
      loadMachineIssues(),
      loadPoSuggestions(),
      loadRestockViewer(),
    ]).catch(() => {});
  }, 12000);

  setNewHireTaskCollapsed(savedNewHireTaskCollapsed === null ? true : savedNewHireTaskCollapsed === '1');

  restoreSmartBatchSettings();
  // Before the first draft build, so a reload rebuilds the plan the lead had.
  restoreMorningPlanDraftState();
  // Ahead of the first view render, so panels paint at the right detail level
  // instead of flashing the full dashboard and then collapsing.
  initCutDepth();
  wirePricingWorkspace();
  showCncWorkflowView(localStorage.getItem(CNC_WORKFLOW_VIEW_KEY) || 'morning');
  // The full manual queue creates hundreds of DOM nodes below the fold. The
  // Smart Batch preview and Omni staging still load immediately above it.
  window.setTimeout(() => {
    loadProductionQueue().catch(() => {});
    loadLabelPrintQueue().catch(() => {});
  }, 8000);

  wireOfflineModeToggle();
  // Portable-media discovery can block on slow or waking drives. It is useful
  // status, but it must not compete with the initial Morning recommendation.
  window.setTimeout(() => {
    loadOfflineMode().catch(() => {});
  }, 12000);
  // Polled so a drive plugged in at the office is noticed without a reload,
  // the same way the station notices one at the machine.
  window.setInterval(() => {
    if (document.visibilityState === 'visible' && !_offlineModeBusy && !_smartBatchRunning) {
      loadOfflineMode().catch(() => {});
    }
  }, 8000);

  window.setTimeout(() => {
    if (pipelineAdminEnabled()) {
      api('/api/pipeline/smart-batch-runs')
        .then((payload) => renderSmartBatchRuns(payload.runs || []))
        .catch(() => {});
    }
  }, 6000);
  // Paint the completed dispatch read model at startup without launching a
  // network-share rescan beside the Morning-plan calculation. The settled-page
  // poll and the explicit Refresh staging button still request a fresh scan.
  window.setTimeout(() => {
    loadOmniDispatch({ refreshSnapshot: false }).catch(() => {});
  }, 3500);
  window.setTimeout(() => {
    loadEodReview({ notify: true }).catch(() => {});
  }, 5000);
  window.setInterval(() => {
    if (document.visibilityState === 'visible') {
      loadEodReview({ notify: true }).catch(() => {});
    }
  }, 60000);
  // loadOmniDispatch refreshes Reclaim and COH after staging paints; separate
  // bootstrap calls here used to request both endpoints twice.
  window.setInterval(() => {
    // A re-render replaces the cards, so refreshing under an open close-out box
    // throws away whatever note is half-typed in it.
    if (document.visibilityState === 'visible' && !_omniDispatchBusy
        && !omniCloseoutIsOpen() && !omniDeleteIsOpen() && !omniReopenIsOpen() && !omniHideIsOpen()) {
      loadOmniDispatch({ quiet: true })
        .then(() => loadLabelPrintQueue())
        .catch(() => {});
    }
  }, OMNI_DISPATCH_REFRESH_MS);
  document.addEventListener('visibilitychange', () => {
    syncOmniFloorLiveStreamForView(_cncWorkflowView);
  });
  syncOmniFloorLiveStreamForView(_cncWorkflowView);
  startHealthClientPresence();
  initRebatchPanel();
}

// ---------------------------------------------------------------------------
// Re-cut a set with rack parts held back.
//
// Status goes in the panel, never in alert()/confirm() -- native dialogs are
// suppressed in the webview, which is how the office close-out came to look
// like it did nothing at all.
// ---------------------------------------------------------------------------
let _rebatchInventory = null;

function normalizeRebatchPartName(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function recutItemMatchesPart(item, cabinet, partName) {
  if (Number(item?.cabinet_number) !== Number(cabinet)) return false;
  const flagged = normalizeRebatchPartName(item?.part_name);
  const offered = normalizeRebatchPartName(partName);
  if (flagged === offered) return true;
  // The DXF inventory may call the same physical component Back or Finished
  // Back.  Finish words are immaterial for the recut identity.
  const withoutFinish = (name) => name.replace(/^(?:un)?finished\s+/, '');
  return withoutFinish(flagged) === withoutFinish(offered);
}

async function prepareRebatchFromRecuts(setName, recutItems) {
  const items = Array.isArray(recutItems) ? recutItems.filter(Boolean) : [];
  if (!setName || !items.length) return;
  closeOmniRecutsModal();
  // The actionable rebatch panel belongs to Morning, while recut notices live
  // in Omni Queue. Move the user with the handoff so the prepared controls are
  // visible instead of being populated behind a hidden workspace.
  showCncWorkflowView('morning');
  const panel = document.getElementById('rebatchPanel');
  const body = document.getElementById('rebatchBody');
  const toggle = document.getElementById('rebatchToggle');
  if (panel) panel.hidden = false;
  if (body) body.hidden = false;
  if (toggle) toggle.textContent = 'Hide';
  panel?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  rebatchStatus(`Loading ${items.length} flagged part${items.length === 1 ? '' : 's'} from ${setName}…`);
  await loadRebatchSets();
  const select = document.getElementById('rebatchSet');
  if (!select || !Array.from(select.options).some((option) => option.value === setName)) {
    rebatchStatus(`${setName} is not available for rebatching. Its source DXFs may no longer be present.`, 'error');
    return;
  }
  select.value = setName;
  const cabinetFilter = document.getElementById('rebatchCabinets');
  // The whole set has to be on screen, not just the flagged cabinets: every
  // part that is not ticked becomes a held-back part, and a filtered view would
  // silently hold back nothing for the cabinets it hid.
  if (cabinetFilter) cabinetFilter.value = '';
  await loadRebatchParts();
  const boxes = Array.from(document.querySelectorAll('#rebatchParts input[type="checkbox"]'));
  boxes.forEach((box) => {
    box.checked = items.some((item) => recutItemMatchesPart(
      item, Number(box.dataset.cabinet), box.dataset.part,
    ));
  });
  updateRebatchRunState();
  const recutCount = rebatchQuantity(collectRebatchCuts());
  const held = rebatchQuantity(collectRebatchPulls());
  if (!recutCount) {
    rebatchStatus('The submitted recut names did not match the source DXFs. Review the parts before writing programs.', 'warn');
    return;
  }
  rebatchStatus(
    `${recutCount} flagged part${recutCount === 1 ? '' : 's'} ticked to cut; ${held} other part${held === 1 ? '' : 's'} held back. Review, then write programs.`,
    'ok',
  );
}

function rebatchStatus(message, tone) {
  const node = document.getElementById('rebatchStatus');
  if (!node) return;
  node.textContent = message || '';
  node.className = 'cnc-planning-note' + (tone ? ` is-${tone}` : '');
}

function parseCabinetFilter(text) {
  const wanted = new Set();
  String(text || '').split(',').forEach((chunk) => {
    const piece = chunk.trim();
    if (!piece) return;
    const span = piece.match(/^(\d+)\s*-\s*(\d+)$/);
    if (span) {
      const from = Number(span[1]);
      const to = Number(span[2]);
      for (let n = Math.min(from, to); n <= Math.max(from, to); n += 1) wanted.add(n);
      return;
    }
    const single = Number(piece);
    if (Number.isFinite(single)) wanted.add(single);
  });
  return wanted;
}

function renderRebatchParts() {
  const host = document.getElementById('rebatchParts');
  if (!host) return;
  host.innerHTML = '';
  if (!_rebatchInventory) {
    document.getElementById('rebatchRun').disabled = true;
    return;
  }
  const wanted = parseCabinetFilter(document.getElementById('rebatchCabinets')?.value);
  const cabinets = (_rebatchInventory.cabinets || [])
    .filter((row) => !wanted.size || wanted.has(row.cabinet_number));
  if (!cabinets.length) {
    host.textContent = wanted.size
      ? 'No cabinets in this set match those numbers.'
      : 'This set has no parts to show.';
    document.getElementById('rebatchRun').disabled = true;
    return;
  }
  cabinets.forEach((row) => {
    const block = document.createElement('div');
    block.className = 'rebatch-cabinet';
    const title = document.createElement('strong');
    title.textContent = `Cabinet ${row.cabinet_number}`;
    block.appendChild(title);
    (row.parts || []).forEach((part) => {
      const partName = typeof part === 'string' ? part : (part.part_name || '');
      const quantity = typeof part === 'string' ? 1 : Math.max(1, Number(part.quantity) || 1);
      if (!partName) return;
      const label = document.createElement('label');
      label.className = 'rebatch-part';
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.dataset.cabinet = String(row.cabinet_number);
      box.dataset.part = partName;
      box.dataset.abbrev = typeof part === 'string' ? '' : (part.part_abbrev || '');
      box.dataset.quantity = String(quantity);
      box.addEventListener('change', updateRebatchRunState);
      label.appendChild(box);
      label.appendChild(document.createTextNode(
        quantity > 1 ? ` ${partName} (${quantity})` : ` ${partName}`
      ));
      block.appendChild(label);
    });
    host.appendChild(block);
  });
  updateRebatchRunState();
}

// A ticked box is a part to CUT. That is the only reading that matches how the
// damage was reported: the operator picked the part that cut wrong, gave a
// reason, and the station flagged it on screen. Carrying the inverse into this
// panel -- tick everything you are NOT cutting -- meant the flagged part was
// the one box left clear, and "Write programs without 57 parts" described the
// correct action in the words of the wrong one.
//
// The emitter still works in held-back terms (``pulled_parts`` are dropped from
// the nest), so the negation happens here, at the boundary, once.
function collectRebatchCuts() {
  return Array.from(document.querySelectorAll('#rebatchParts input:checked')).map((box) => ({
    cabinet_number: Number(box.dataset.cabinet),
    part_name: box.dataset.part,
    part_abbrev: box.dataset.abbrev || '',
    quantity: Math.max(1, Number(box.dataset.quantity) || 1),
  }));
}

function collectRebatchPulls() {
  return Array.from(document.querySelectorAll('#rebatchParts input:not(:checked)')).map((box) => ({
    cabinet_number: Number(box.dataset.cabinet),
    part_name: box.dataset.part,
    part_abbrev: box.dataset.abbrev || '',
    quantity: Math.max(1, Number(box.dataset.quantity) || 1),
  }));
}

function rebatchQuantity(rows) {
  return rows.reduce((sum, row) => sum + Number(row.quantity || 1), 0);
}

function updateRebatchRunState() {
  const button = document.getElementById('rebatchRun');
  if (!button) return;
  const count = rebatchQuantity(collectRebatchCuts());
  // Nothing ticked is not a whole-set rebatch, it is an empty program. Refuse
  // it here rather than emitting a set with no parts.
  button.disabled = !_rebatchInventory || !count;
  button.textContent = count
    ? `Write programs for ${count} part${count === 1 ? '' : 's'}`
    : 'Write programs';
}

async function loadRebatchSets() {
  const select = document.getElementById('rebatchSet');
  if (!select) return;
  try {
    const data = await api('/api/rebatch/sets');
    select.innerHTML = '<option value="">Choose a set…</option>';
    (data.sets || []).forEach((row) => {
      const option = document.createElement('option');
      option.value = row.set_name;
      option.textContent = `${row.day}  ${row.set_name}`
        + (row.running ? '  (running)' : '');
      select.appendChild(option);
    });
    if (!(data.sets || []).length) rebatchStatus('No sets available to re-cut.', 'warn');
  } catch (error) {
    select.innerHTML = '<option value="">Could not load sets</option>';
    rebatchStatus(error.message || 'Could not load sets.', 'error');
  }
}

async function loadRebatchParts() {
  const setName = document.getElementById('rebatchSet')?.value || '';
  _rebatchInventory = null;
  renderRebatchParts();
  if (!setName) {
    rebatchStatus('Choose a set first.', 'warn');
    return;
  }
  rebatchStatus('Reading parts…');
  try {
    _rebatchInventory = await api(`/api/rebatch/sets?set=${encodeURIComponent(setName)}`);
    renderRebatchParts();
    rebatchStatus(`${(_rebatchInventory.cabinets || []).length} cabinet(s) from ${_rebatchInventory.dxf_dir}`);
  } catch (error) {
    rebatchStatus(error.message || 'Could not read that set.', 'error');
  }
}

async function runRebatch() {
  const button = document.getElementById('rebatchRun');
  const setName = document.getElementById('rebatchSet')?.value || '';
  if (!setName) return;
  const cuts = collectRebatchCuts();
  if (!cuts.length) {
    rebatchStatus('Tick the parts to cut first. Nothing ticked would write an empty set.', 'warn');
    return;
  }
  const pulled = collectRebatchPulls();
  const original = button.textContent;
  button.disabled = true;
  button.textContent = 'Writing…';
  rebatchStatus('Nesting and writing programs…');
  try {
    const data = await api('/api/rebatch/taps', {
      method: 'POST',
      body: JSON.stringify({ set_name: setName, pulled_parts: pulled }),
    });
    if (!data.ok) throw new Error(data.reason || data.error || 'Rebatch failed.');
    // An unmatched pull means the claim and the job disagree. It is reported
    // loudly here rather than after a cabinet turns up short.
    const warning = (data.unmatched || []).length
      ? `  Check: ${data.unmatched.join('; ')}`
      : '';
    const published = data.set_name && data.replaced_set_name
      && data.set_name !== data.replaced_set_name
      ? ` Omni job ${data.set_name}; original ${data.replaced_set_name} hidden.`
      : '';
    rebatchStatus(
      `${data.programs} program(s) from ${data.parts_nested} part(s); `
      + `${data.parts_pulled} held back. Written to ${data.output_dir}.${published}${warning}`,
      (data.unmatched || []).length ? 'warn' : 'ok',
    );
    loadOmniDispatch({ quiet: true }).catch(() => {});
  } catch (error) {
    rebatchStatus(error.message || 'Could not write programs.', 'error');
  } finally {
    button.disabled = false;
    button.textContent = original;
    updateRebatchRunState();
  }
}

function initRebatchPanel() {
  const panel = document.getElementById('rebatchPanel');
  if (!panel) return;
  panel.hidden = false;
  const body = document.getElementById('rebatchBody');
  const toggle = document.getElementById('rebatchToggle');
  toggle?.addEventListener('click', () => {
    const opening = body.hidden;
    body.hidden = !opening;
    toggle.textContent = opening ? 'Hide' : 'Show';
    // The markup ships a "Loading…" placeholder, so options.length is already
    // 1 before anything is fetched. Testing for empty meant the list never
    // loaded and the panel opened to a dead dropdown.
    if (opening && (document.getElementById('rebatchSet')?.options.length || 0) <= 1) {
      loadRebatchSets();
    }
  });
  document.getElementById('rebatchLoad')?.addEventListener('click', loadRebatchParts);
  document.getElementById('rebatchSet')?.addEventListener('change', loadRebatchParts);
  document.getElementById('rebatchCabinets')?.addEventListener('input', () => {
    if (_rebatchInventory) renderRebatchParts();
  });
  document.getElementById('rebatchRun')?.addEventListener('click', runRebatch);
}

initDashboard();
