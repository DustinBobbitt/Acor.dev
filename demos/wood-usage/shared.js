async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { error: text || `Request failed: ${response.status}` };
  }
  if (!response.ok) {
    throw new Error(payload.error || `Request failed: ${response.status}`);
  }
  return payload;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

function metricCard(label, value, sub = '') {
  return `
    <article class="metric">
      <div class="label">${escapeHtml(label)}</div>
      <div class="value">${escapeHtml(value)}</div>
      <div class="sub">${escapeHtml(sub)}</div>
    </article>
  `;
}

function formatTimestamp(value) {
  if (!value) return '--';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function renderSuiteNav(_active = '') {
  return `<nav class="suite-nav"><a href="../cut-health/">Cut</a><a href="../pallet-locator/">Pallet Locator</a><a href="../wood-usage/">Wood Usage</a><a href="../warehouse-mapper/">Warehouse</a></nav>`;
}

function renderTable(columns, rows, rowMapper) {
  if (!rows.length) {
    return '<p class="muted-cell">No rows to show.</p>';
  }
  const head = columns.map((col) => `<th>${escapeHtml(col)}</th>`).join('');
  const body = rows.map(rowMapper).join('');
  return `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

async function postAction(path, body = {}) {
  return api(path, { method: 'POST', body: JSON.stringify(body) });
}

function setStatus(node, message, ok = true) {
  if (!node) return;
  node.textContent = message;
  node.style.color = ok ? 'var(--accent)' : 'var(--danger)';
}

function selectedQueueItems() {
  return Array.from(document.querySelectorAll('.queue-select:checked')).map((input) => ({
    item_number: input.dataset.item || '',
    po_number: input.dataset.po || '',
    qty: input.dataset.qty || '',
  }));
}
