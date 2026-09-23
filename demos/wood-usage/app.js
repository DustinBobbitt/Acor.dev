document.getElementById('suiteNav').innerHTML = renderSuiteNav('/wood-usage');
const actionStatus = document.getElementById('actionStatus');
let _lastResults = [];
let _jobPricing = { jobs: [], counts: {}, source: {} };
let _jobView = 'all';

function renderPricingStandard(pricing, context) {
  if (!pricing || pricing.available === false) {
    const reason = pricing?.reason || pricing?.error || 'Pricing standard unavailable.';
    return `<p class="task-note"><strong>Traditional pricing:</strong> ${escapeHtml(reason)}</p>`;
  }
  const rates = pricing.rates || {};
  return `<div class="panel-header"><div><p class="section-label">Pricing standard</p><h2>${escapeHtml(context)}</h2></div></div>
    <div class="metric-band">
      ${metricCard('Forecast price', `$${Number(pricing.pricing_standard_value || 0).toFixed(2)}`, 'traditional nesting standard')}
    </div>
    <p class="task-note">Includes known material usage and machine time at $${Number(rates.machine_hour || 0).toFixed(2)}/hr. Small parts use the traditional two-pass method; production improvements never reduce the customer-pricing basis.</p>`;
}

function renderJobPricing() {
  const needle = (document.getElementById('jobSearch').value || '').trim().toLowerCase();
  const jobs = (_jobPricing.jobs || []).filter((job) => {
    if (!needle) return true;
    return `${job.po_number || ''} ${job.order_number || ''}`.toLowerCase().includes(needle);
  });
  document.getElementById('jobPricingTable').innerHTML = renderTable(
    ['job', 'due', 'status', 'cabinets', 'forecast', 'readiness'],
    jobs,
    (job) => {
      const price = job.forecast_price == null ? 'Needs mapping' : `$${Number(job.forecast_price).toFixed(2)}`;
      const readiness = job.pricing_ready ? 'Ready' : `Partial · ${Number(job.coverage_percent || 0).toFixed(0)}%`;
      return `<tr>
        <td><strong>${escapeHtml(job.po_number || '')}</strong><br><span class="task-note">Order ${escapeHtml(job.order_number || '')}</span></td>
        <td>${escapeHtml(job.scheduled_departure_date || job.firm_date || 'Unscheduled')}</td>
        <td>${escapeHtml(job.stage || '')}<br><span class="task-note">${escapeHtml(job.evidence || '')}</span></td>
        <td>${escapeHtml(job.cabinet_count || 0)}</td>
        <td><strong>${escapeHtml(price)}</strong></td>
        <td>${escapeHtml(readiness)}</td>
      </tr>`;
    },
  );
}

async function loadJobPricing(view = _jobView) {
  _jobView = view;
  _jobPricing = await api(`/api/wood-usage/job-pricing?view=${encodeURIComponent(view)}&limit=1000`);
  const source = _jobPricing.source || {};
  document.getElementById('jobPricingStatus').textContent =
    `${_jobPricing.displayed_count || 0} jobs · snapshot ${formatTimestamp(source.refreshed_at || '')}. ` +
    (_jobPricing.evidence_note || '');
  document.querySelectorAll('.job-view-button').forEach((button) => {
    const active = button.dataset.view === view;
    button.classList.toggle('secondary', !active);
  });
  renderJobPricing();
  return _jobPricing;
}

async function loadOverview() {
  const [data, history, pending] = await Promise.all([
    api('/api/wood-usage/overview'),
    api('/api/wood-usage/history?limit=25'),
    api('/api/wood-usage/pending?limit=40'),
  ]);
  const totals = data.totals || {};
  document.getElementById('heroMetrics').innerHTML = [
    metricCard('Product Mappings', totals.product_mappings || 0, 'active maps'),
    metricCard('Pending Cabinets', pending.count || pending.total || 0, 'awaiting lookup'),
    metricCard('Recent Calculations', (history.items || data.recent_calculations || []).length, 'loaded'),
  ].join('');
  document.getElementById('coverageMetrics').innerHTML = [
    metricCard('Product Mappings', totals.product_mappings || 0, 'active maps'),
    metricCard('History File', data.data_files?.calculation_history?.exists ? 'Found' : 'Missing', data.data_files?.calculation_history?.modified_at || ''),
    metricCard('Woodusage DB', data.data_files?.woodusage_db?.exists ? 'Found' : 'Missing', `${Math.round((data.data_files?.woodusage_db?.size_bytes || 0) / 1024)} KB`),
  ].join('');
  document.getElementById('historyTable').innerHTML = renderTable(
    ['timestamp', 'sku_count', 'pw05', 'pw075'],
    history.items || data.recent_calculations || [],
    (row) => `<tr>
      <td>${escapeHtml(formatTimestamp(row.timestamp))}</td>
      <td>${escapeHtml(row.sku_count)}</td>
      <td>${escapeHtml(Number(row.pw05 || 0).toFixed(2))}</td>
      <td>${escapeHtml(Number(row.pw075 || 0).toFixed(2))}</td>
    </tr>`,
  );
  document.getElementById('missingTable').innerHTML = renderTable(
    ['item_number', 'search_count', 'status', 'last_seen'],
    data.top_missing_items || [],
    (row) => `<tr>
      <td>${escapeHtml(row.item_number)}</td>
      <td>${escapeHtml(row.search_count)}</td>
      <td>${escapeHtml(row.status || 'pending')}</td>
      <td>${escapeHtml(row.last_seen || '')}</td>
    </tr>`,
  );
  document.getElementById('pendingTable').innerHTML = renderTable(
    ['item_number', 'type', 'pw05', 'pw075', 'submitted_at'],
    pending.items || [],
    (row) => `<tr>
      <td>${escapeHtml(row.item_number)}</td>
      <td>${escapeHtml(row.type || '')}</td>
      <td>${escapeHtml(row.pw05 || '')}</td>
      <td>${escapeHtml(row.pw075 || '')}</td>
      <td>${escapeHtml(row.submitted_at || '')}</td>
    </tr>`,
  );

  const optional = await Promise.allSettled([
    api('/api/wood-usage/forecast?days=7'),
    loadJobPricing(_jobView),
  ]);
  const forecastResult = optional[0];
  const pricingResult = optional[1];
  if (pricingResult.status === 'fulfilled') {
    const jobPricing = pricingResult.value || {};
    const jobCounts = jobPricing.counts || {};
    const pricedJobs = (jobPricing.jobs || []).filter((job) => job.forecast_price != null);
    const averagePrice = pricedJobs.length
      ? pricedJobs.reduce((sum, job) => sum + Number(job.forecast_price || 0), 0) / pricedJobs.length
      : 0;
    document.getElementById('heroMetrics').innerHTML = [
      metricCard('Known jobs', jobCounts.all || 0, 'with carcass rows'),
      metricCard('Upcoming', jobCounts.upcoming || 0, 'scheduled'),
      metricCard('In Cut', jobCounts.in_cut || 0, 'status evidence'),
      metricCard('Cut Complete', jobCounts.cut_complete || 0, 'recent evidence'),
      metricCard('Average forecast', `$${averagePrice.toFixed(2)}`, `${jobCounts.pricing_ready || 0} jobs fully mapped`),
    ].join('');
  } else {
    document.getElementById('jobPricingStatus').textContent =
      `Pricing forecast unavailable: ${pricingResult.reason?.message || pricingResult.reason || 'optional request failed'}`;
  }
  if (forecastResult.status === 'fulfilled') {
    document.getElementById('calculatePricing').innerHTML = renderPricingStandard(
      forecastResult.value.pricing_standard,
      'Anticipated customer-pricing basis',
    );
  }
}

document.getElementById('refreshButton').addEventListener('click', () => loadOverview().catch((err) => alert(err.message)));
document.querySelectorAll('.job-view-button').forEach((button) => {
  button.addEventListener('click', () => loadJobPricing(button.dataset.view).catch((err) => alert(err.message)));
});
document.getElementById('jobSearch').addEventListener('input', renderJobPricing);
document.getElementById('openDesktopApp').addEventListener('click', async () => {
  const result = await postAction('/api/launch-app', { app_id: 'wood_usage' });
  setStatus(actionStatus, result.ok ? 'Launched Wood Usage desktop app.' : result.error, result.ok);
});
document.getElementById('calculateForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const raw = document.getElementById('skuInput').value;
  setStatus(actionStatus, 'Calculating...', true);
  try {
    const result = await postAction('/api/wood-usage/calculate', { skus: raw });
    _lastResults = result.results || [];
    const totals = result.totals || {};
    setStatus(
      actionStatus,
      `Calculated ${result.sku_count} SKU(s): ${totals.found || 0} found, ${totals.pending || 0} pending, ${totals.missing || 0} missing.`,
      true,
    );
    document.getElementById('calculateResults').innerHTML = [
      metricCard('PW .5 Total', Number(totals.pw05 || 0).toFixed(2), 'sheets'),
      metricCard('PW .75 Total', Number(totals.pw075 || 0).toFixed(2), 'sheets'),
    ].join('') + renderTable(
      ['sku', 'status', 'resolved_sku', 'pw05', 'pw075'],
      _lastResults,
      (row) => `<tr>
        <td>${escapeHtml(row.sku)}</td>
        <td>${escapeHtml(row.status)}</td>
        <td>${escapeHtml(row.resolved_sku || '')}</td>
        <td>${escapeHtml(Number(row.pw05 || 0).toFixed(2))}</td>
        <td>${escapeHtml(Number(row.pw075 || 0).toFixed(2))}</td>
      </tr>`,
    );
    document.getElementById('calculatePricing').innerHTML = renderPricingStandard(
      result.pricing_standard,
      'Quoted cabinet scenario',
    );
    await loadOverview();
  } catch (err) {
    setStatus(actionStatus, err.message, false);
  }
});
document.getElementById('exportCsvButton').addEventListener('click', async () => {
  try {
    const result = await postAction('/api/wood-usage/export', {
      skus: document.getElementById('skuInput').value,
      results: _lastResults.length ? _lastResults : undefined,
    });
    if (result.ok) {
      await postAction('/api/open-path', { path: result.path });
      setStatus(actionStatus, `Exported ${result.row_count} rows.`, true);
    } else {
      setStatus(actionStatus, result.error, false);
    }
  } catch (err) {
    setStatus(actionStatus, err.message, false);
  }
});
document.getElementById('similarForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const sku = document.getElementById('similarInput').value;
  const data = await api(`/api/wood-usage/find-similar?sku=${encodeURIComponent(sku)}`);
  document.getElementById('similarResults').innerHTML = renderTable(
    ['item_number', 'type', 'pw05', 'pw075'],
    data.items || [],
    (row) => `<tr>
      <td>${escapeHtml(row.item_number)}</td>
      <td>${escapeHtml(row.type || '')}</td>
      <td>${escapeHtml(row.pw05 || '')}</td>
      <td>${escapeHtml(row.pw075 || '')}</td>
    </tr>`,
  );
});

loadOverview().catch((err) => alert(err.message));
