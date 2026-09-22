const data = window.CUT_HEALTH_DEMO_DATA;
let showCompleted = false;
let palletLabelMode = 'ready';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

function formatTimestamp(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || '--';
  return date.toLocaleString([], {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function metricCard(label, value, sub = '', id = '') {
  const tag = id ? 'button' : 'article';
  const idAttr = id ? ` id="${id}" type="button"` : '';
  const actionClass = id ? ' metric-action' : '';
  return `
    <${tag}${idAttr} class="metric${actionClass}">
      <div class="label">${escapeHtml(label)}</div>
      <div class="value">${value}</div>
      <div class="sub">${sub}</div>
    </${tag}>
  `;
}

function setModalOpen(id, open) {
  const modal = document.getElementById(id);
  modal.hidden = !open;
  document.body.classList.toggle('modal-open', [...document.querySelectorAll('.modal-backdrop')].some((node) => !node.hidden));
}

function statusBulb(status) {
  if (status === 'complete') return '<span class="bulb bulb-green" title="cutting complete"></span>';
  if (status === 'partial') return '<span class="bulb bulb-yellow" title="partial complete"></span>';
  if (status === 'zombie') return '<span class="bulb bulb-zombie" title="returned after completion"></span>';
  return '<span class="bulb bulb-gray" title="not generated"></span>';
}

function packetPill(packet) {
  if (packet === 'printed') return '<span class="pill">packet printed</span>';
  if (packet === 'ready') return '<span class="pill">in progress</span>';
  return '<span class="pill">not generated</span>';
}

function renderHero() {
  document.getElementById('heroMetrics').innerHTML = [
    metricCard('Completed Today', data.today.completed, `${data.today.carcass} carcass / ${data.today.trim} trim`),
    metricCard('Manual Added', data.today.manualAdded, `${data.today.manualRequests} requests`),
    metricCard('Jobs To Goal', data.backlog.jobsToGoal, `${data.backlog.linesToGoal} lines inside ${data.backlog.daysAhead} days`),
    metricCard('Pallet Labels Ready', data.palletLabels.ready.length, 'completed jobs awaiting labels', 'palletLabelsCard'),
  ].join('');
  document.getElementById('sourceState').textContent = `Source: ${data.source.state}`;
  document.getElementById('refreshState').textContent = `Latest refresh: ${formatTimestamp(data.source.latestRefresh)}`;
  document.getElementById('palletLabelsCard').addEventListener('click', () => openPalletLabels('ready'));
}

function renderPerformance() {
  document.getElementById('sevenDayAverage').textContent = `${data.performance.last7.average} per day average`;
  const max = Math.max(...data.performance.trend.map((entry) => entry.total), 1);
  document.getElementById('trendChart').innerHTML = data.performance.trend.map((entry) => `
    <div class="trend-row">
      <span>${escapeHtml(entry.day)}</span>
      <div class="trend-track"><div class="trend-fill" style="width:${(entry.total / max) * 100}%"></div></div>
      <strong>${entry.total}</strong>
    </div>
  `).join('');

  document.getElementById('workloadMap').innerHTML = data.workload.map((entry) => `
    <div class="workload-cell ${escapeHtml(entry.kind)}">
      <span>${escapeHtml(entry.label)}</span>
      <strong>${entry.total}</strong>
      <span>queue lines</span>
    </div>
  `).join('');
}

function renderBacklog() {
  document.getElementById('daysAhead').value = data.backlog.daysAhead;
  document.getElementById('backlogMetrics').innerHTML = [
    metricCard('Due Within Goal', data.backlog.dueWithinGoal, `${data.backlog.daysAhead} business day target`),
    metricCard('Overdue', data.backlog.overdue, 'past target date'),
    metricCard('Due Today', data.backlog.dueToday, 'current day demand'),
    metricCard('Snapshot Rows', data.backlog.snapshotRows, 'latest sanitized snapshot'),
  ].join('');
}

function queueDateLabel(group, basis) {
  if (basis === 'departure') {
    const first = group.jobs[0];
    return `Scheduled Departure ${first.departureDate}`;
  }
  return `Firm Date ${group.label}`;
}

function renderQueue() {
  const basis = document.getElementById('dateBasis').value;
  document.getElementById('queueList').innerHTML = data.queue.map((group) => {
    const jobs = group.jobs.map((job) => {
      const hidden = job.status === 'complete' && !showCompleted;
      return `
        <label class="job-row${hidden ? ' is-hidden' : ''}">
          <input class="queue-job-checkbox" type="checkbox" value="${escapeHtml(job.id)}" ${job.status !== 'complete' ? 'checked' : ''}>
          <div>
            <strong>${escapeHtml(job.name)}</strong>
            <div class="job-meta">Firm ${escapeHtml(job.firmDate)} · Depart ${escapeHtml(job.departureDate)}${job.floor ? ' · on floor' : ''}</div>
          </div>
          <span class="job-counts">${job.items} lines</span>
          <span class="job-counts">${job.uniqueItems} unique</span>
          <span>${statusBulb(job.status)}${packetPill(job.packet)}</span>
        </label>
      `;
    }).join('');
    return `
      <section class="date-group">
        <div class="date-header">
          <input type="checkbox" checked>
          <strong>${escapeHtml(queueDateLabel(group, basis))}</strong>
          <span class="job-counts">${group.jobs.length} jobs</span>
          <span class="job-counts">${group.jobs.reduce((sum, job) => sum + job.items, 0)} lines</span>
          <span></span>
        </div>
        ${jobs}
      </section>
    `;
  }).join('');
}

function renderChecklist() {
  const check = data.morningChecklist;
  document.getElementById('checklistBody').innerHTML = `
    <div class="task-column">
      <p class="section-label">Daily Task</p>
      <strong>${escapeHtml(check.title)}</strong>
      <ol>${check.tasks.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ol>
    </div>
    <div class="task-column">
      <p class="section-label">If Waiting For Work</p>
      <ul>${check.waiting.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
    </div>
    <div class="task-column">
      <p class="section-label">Scrap Conversion Priority</p>
      <ol>${check.priorities.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ol>
    </div>
  `;
}

function renderRequests() {
  document.getElementById('requestList').innerHTML = data.requests.map((request) => `
    <div class="request-row">
      <span>${escapeHtml(request.time)}</span>
      <div>
        <strong>${escapeHtml(request.request)}</strong>
        <div class="job-meta">${escapeHtml(request.job)}</div>
      </div>
      <span>${request.qty} lines</span>
    </div>
  `).join('');
}

function renderReports() {
  document.getElementById('reportsTable').innerHTML = data.reports.map((report) => `
    <tr>
      <td><input type="checkbox"></td>
      <td>${escapeHtml(report.day)}</td>
      <td>${escapeHtml(report.name)}</td>
      <td>${escapeHtml(report.finalized)}</td>
      <td><span class="pill">${escapeHtml(report.status)}</span></td>
    </tr>
  `).join('');
}

function openPalletLabels(mode = 'ready') {
  palletLabelMode = mode;
  renderPalletLabels();
  setModalOpen('palletLabelsModal', true);
}

function renderPalletLabels() {
  const rows = data.palletLabels[palletLabelMode];
  const isReady = palletLabelMode === 'ready';
  document.getElementById('palletLabelsTitle').textContent = isReady ? 'Pallet labels ready' : 'Recently printed pallet labels';
  document.getElementById('palletLabelsSummary').textContent = isReady
    ? `${rows.length} completed jobs are waiting for pallet labels.`
    : `${rows.length} recent jobs are available for reprint.`;
  document.getElementById('printLabels').textContent = isReady ? 'Print Selected' : 'Reprint Selected';
  document.getElementById('readyLabelsTab').classList.toggle('active', isReady);
  document.getElementById('printedLabelsTab').classList.toggle('active', !isReady);
  document.getElementById('palletLabelsTable').innerHTML = rows.map((row) => `
    <tr>
      <td><input class="label-checkbox" type="checkbox" checked></td>
      <td>${escapeHtml(row.job)}</td>
      <td>${escapeHtml(row.firmDate)}</td>
      <td><span class="pill">${escapeHtml(row.status)}</span></td>
      <td>${escapeHtml(row.queued)}</td>
      <td>${escapeHtml(row.printed || '--')}</td>
      <td>${row.count}</td>
    </tr>
  `).join('');
}

function selectedQueueJobs() {
  const selected = new Set([...document.querySelectorAll('.queue-job-checkbox:checked')].map((node) => node.value));
  const jobs = [];
  for (const group of data.queue) {
    for (const job of group.jobs) {
      if (selected.has(job.id)) jobs.push(job);
    }
  }
  return jobs;
}

function openPacketModal() {
  const jobs = selectedQueueJobs();
  renderPacketJobs(jobs.length ? jobs : data.queue.flatMap((group) => group.jobs).filter((job) => job.status !== 'complete'));
  setModalOpen('packetModal', true);
}

function renderPacketJobs(jobs) {
  document.getElementById('packetSummary').textContent =
    `${jobs.length} selected job${jobs.length === 1 ? '' : 's'} · ${jobs.reduce((sum, job) => sum + job.items, 0)} queue lines`;
  document.getElementById('packetBody').innerHTML = jobs.map((job) => `
    <article class="packet-job">
      <div class="packet-job-header">
        <input class="packet-job-checkbox" type="checkbox" checked data-job="${escapeHtml(job.id)}">
        <div>
          <strong>${escapeHtml(job.name)}</strong>
          <div class="job-meta">Firm ${escapeHtml(job.firmDate)} · ${job.cabinets.length} cabinet groups</div>
        </div>
      </div>
      <div class="cabinet-grid">
        ${job.cabinets.map((cab) => `
          <div class="cabinet-item">
            <strong>${escapeHtml(cab.item)} ×${cab.qty}</strong>
            <div class="job-meta">${escapeHtml(cab.note)}</div>
            <ul>${cab.parts.map((part) => `<li>${escapeHtml(part)}</li>`).join('')}</ul>
          </div>
        `).join('')}
      </div>
    </article>
  `).join('');
  document.getElementById('packetResult').hidden = true;
}

function generatePacket() {
  const selected = document.querySelectorAll('.packet-job-checkbox:checked').length;
  const profile = document.getElementById('packetProfile').value === 'northwood'
    ? 'Northwood packet: full component worksheet, cabinet list, 4x2 labels, MDB output'
    : 'Omni packet: hand-cut companion, cabinet list, 4x2 labels';
  document.getElementById('packetResult').innerHTML = `
    <strong>Packet generated.</strong>
    <div class="job-meta">${selected} job${selected === 1 ? '' : 's'} · ${profile}</div>
  `;
  document.getElementById('packetResult').hidden = false;
}

function wireEvents() {
  document.getElementById('openPalletLabelsTop').addEventListener('click', () => openPalletLabels('ready'));
  document.getElementById('openPacketTop').addEventListener('click', openPacketModal);
  document.getElementById('reviewGenerate').addEventListener('click', openPacketModal);
  document.getElementById('dateBasis').addEventListener('change', renderQueue);
  document.getElementById('toggleCompleted').addEventListener('click', (event) => {
    showCompleted = !showCompleted;
    event.currentTarget.setAttribute('aria-pressed', showCompleted ? 'true' : 'false');
    event.currentTarget.textContent = showCompleted ? 'Hide Completed' : 'Show Completed';
    renderQueue();
  });
  document.getElementById('toggleChecklist').addEventListener('click', (event) => {
    const body = document.getElementById('checklistBody');
    body.hidden = !body.hidden;
    event.currentTarget.textContent = body.hidden ? 'Expand' : 'Collapse';
    event.currentTarget.setAttribute('aria-expanded', body.hidden ? 'false' : 'true');
  });
  document.getElementById('closePalletLabels').addEventListener('click', () => setModalOpen('palletLabelsModal', false));
  document.getElementById('closePacket').addEventListener('click', () => setModalOpen('packetModal', false));
  document.getElementById('readyLabelsTab').addEventListener('click', () => {
    palletLabelMode = 'ready';
    renderPalletLabels();
  });
  document.getElementById('printedLabelsTab').addEventListener('click', () => {
    palletLabelMode = 'printed';
    renderPalletLabels();
  });
  document.getElementById('selectAllLabels').addEventListener('click', () => {
    document.querySelectorAll('.label-checkbox').forEach((box) => { box.checked = true; });
  });
  document.getElementById('printLabels').addEventListener('click', () => {
    const count = document.querySelectorAll('.label-checkbox:checked').length;
    document.getElementById('palletLabelsSummary').textContent =
      `${count} label${count === 1 ? '' : 's'} queued to the printer.`;
  });
  document.getElementById('selectAllJobs').addEventListener('click', () => {
    document.querySelectorAll('.packet-job-checkbox').forEach((box) => { box.checked = true; });
  });
  document.getElementById('clearAllJobs').addEventListener('click', () => {
    document.querySelectorAll('.packet-job-checkbox').forEach((box) => { box.checked = false; });
  });
  document.getElementById('generatePacket').addEventListener('click', generatePacket);
  document.querySelectorAll('.modal-backdrop').forEach((modal) => {
    modal.addEventListener('click', (event) => {
      if (event.target === modal) setModalOpen(modal.id, false);
    });
  });
}

function init() {
  renderHero();
  renderPerformance();
  renderBacklog();
  renderQueue();
  renderChecklist();
  renderRequests();
  renderReports();
  wireEvents();
}

init();
