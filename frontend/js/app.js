// Restore filter state from URL
const _params = new URLSearchParams(location.search);
let currentPeriod = _params.get('period') || 'all';
let currentModel = _params.get('model') || '';
let currentAgent = _params.get('agent') || '';
let currentTab = _params.get('tab') || 'usage';
let allModels = [];
let allAgents = [];
let lastData = {};

function updateURL() {
    const p = new URLSearchParams();
    if (currentPeriod !== 'all') p.set('period', currentPeriod);
    if (currentModel) p.set('model', currentModel);
    if (currentAgent) p.set('agent', currentAgent);
    if (currentTab !== 'usage') p.set('tab', currentTab);
    const df = document.getElementById('date-from')?.value;
    const dt = document.getElementById('date-to')?.value;
    if (df) p.set('from', df);
    if (dt) p.set('to', dt);
    const qs = p.toString();
    history.replaceState(null, '', qs ? '?' + qs : location.pathname);
}

function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 1500);
}

// Escape HTML special characters to prevent XSS
function esc(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
}

// Format helpers
function fmtTokens(n) {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
    return String(n);
}

function fmtDate(iso) {
    if (!iso) return '--';
    const d = new Date(iso);
    return d.toLocaleString('sv-SE', {
        month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

function fmtDuration(min) {
    if (min == null) return '--';
    if (min < 1) return '<1m';
    if (min < 60) return Math.round(min) + 'm';
    const h = Math.floor(min / 60);
    const m = Math.round(min % 60);
    return m > 0 ? h + 'h ' + m + 'm' : h + 'h';
}

// Trend indicator: returns HTML span with arrow and percentage change
function trend(current, previous, invert) {
    if (previous == null || previous === 0) return '';
    const diff = ((current - previous) / previous) * 100;
    if (Math.abs(diff) < 0.5) return '';
    const up = diff > 0;
    const good = invert ? !up : up;
    const arrow = up ? '▲' : '▼';
    const cls = good ? 'trend-good' : 'trend-bad';
    return ` <span class="trend ${cls}">${arrow}${Math.abs(diff).toFixed(0)}%</span>`;
}

function fmtCount(n) {
    return n.toLocaleString('sv-SE');
}

// Update summary cards
function updateCards(overview) {
    const p = overview.previous;
    document.getElementById('card-tokens').innerHTML = fmtTokens(overview.total_tokens) + trend(overview.total_tokens, p?.total_tokens);
    document.getElementById('card-messages').innerHTML = fmtCount(overview.total_messages) + trend(overview.total_messages, p?.total_messages);
    document.getElementById('card-sessions').innerHTML = fmtCount(overview.total_sessions) + trend(overview.total_sessions, p?.total_sessions);
    document.getElementById('card-cache').innerHTML = overview.cache_hit_rate + '%' + trend(overview.cache_hit_rate, p?.cache_hit_rate);
    document.getElementById('card-errors').innerHTML = overview.error_rate + '%' + trend(overview.error_rate, p?.error_rate, true);
    document.getElementById('card-cost').innerHTML = '$' + overview.total_cost.toFixed(2) + trend(overview.total_cost, p?.total_cost, true);
}

// --- Threshold helper for color-coded cards ---
function thresholdClass(value, yellowAt, redAt) {
    if (value >= redAt) return 'status-red';
    if (value >= yellowAt) return 'status-yellow';
    return 'status-green';
}

// --- Update system metric cards ---
function updateSystemCards(data) {
    const o = data.overview;
    const cpuEl = document.getElementById('card-cpu');
    cpuEl.textContent = o.cpu_pct + '%';
    cpuEl.className = 'card-value ' + thresholdClass(o.cpu_pct, 70, 90);

    const diskEl = document.getElementById('card-disk');
    diskEl.textContent = o.disk_pct + '%';
    diskEl.className = 'card-value ' + thresholdClass(o.disk_pct, 70, 90);
}

// --- Tab-specific data fetching ---
async function refreshTab(tab) {
    if (tab === 'infra') {
        try {
            const system = await API.system();
            lastData.system = system;
            updateSystemCards(system);
            renderCpuRam(system);
            renderDiskChart(system);
            renderNetworkChart(system);
        } catch (err) { console.error('system fetch error:', err); }
    }
}

// Session table sorting
let sessionSort = { key: 'start_time', asc: false };
let lastSessionData = null;

const SESSION_COLUMNS = [
    { key: 'session_id', type: 'string' },
    { key: 'agent', type: 'string' },
    { key: 'models_used', type: 'string' },
    { key: 'total_tokens', type: 'number' },
    { key: 'message_count', type: 'number' },
    { key: 'cost', type: 'number' },
    { key: 'duration_minutes', type: 'number' },
    { key: 'start_time', type: 'date' },
];

function sortSessions(sessions, key, asc) {
    const col = SESSION_COLUMNS.find(c => c.key === key);
    return [...sessions].sort((a, b) => {
        let va = a[key], vb = b[key];
        if (col.type === 'string') {
            va = Array.isArray(va) ? va.join(', ') : (va || '');
            vb = Array.isArray(vb) ? vb.join(', ') : (vb || '');
            return asc ? va.localeCompare(vb) : vb.localeCompare(va);
        }
        if (col.type === 'date') {
            va = va ? new Date(va).getTime() : 0;
            vb = vb ? new Date(vb).getTime() : 0;
        }
        va = va ?? -Infinity;
        vb = vb ?? -Infinity;
        return asc ? va - vb : vb - va;
    });
}

function renderTableRows(sessions) {
    const tbody = document.getElementById('sessions-body');
    const countEl = document.getElementById('session-count');
    if (countEl) countEl.textContent = `(${sessions.length})`;

    tbody.innerHTML = sessions.map(s => `
        <tr>
            <td class="session-id" data-sid="${esc(s.session_id_full)}" title="${esc(s.session_id_full)}">${esc(s.session_id)}…</td>
            <td>${esc(s.agent)}</td>
            <td>${esc(s.models_used.join(', '))}</td>
            <td>${fmtTokens(s.total_tokens)}</td>
            <td>${s.message_count}</td>
            <td>${s.cost != null ? '$' + s.cost.toFixed(2) : '--'}</td>
            <td>${fmtDuration(s.duration_minutes)}</td>
            <td>${fmtDate(s.start_time)}</td>
        </tr>
    `).join('');

    document.querySelectorAll('#sessions-table th').forEach((th, i) => {
        const col = SESSION_COLUMNS[i];
        th.classList.toggle('sorted', col.key === sessionSort.key);
        th.classList.toggle('asc', col.key === sessionSort.key && sessionSort.asc);
        th.classList.toggle('desc', col.key === sessionSort.key && !sessionSort.asc);
    });
}

// Update sessions table
function updateTable(data) {
    const tbody = document.getElementById('sessions-body');
    if (!data.sessions || !data.sessions.length) {
        tbody.innerHTML = '<tr><td colspan="8" style="color:var(--text-muted)">no sessions found</td></tr>';
        lastSessionData = null;
        return;
    }

    lastSessionData = sortSessions(data.sessions, sessionSort.key, sessionSort.asc);
    renderTableRows(lastSessionData);
}

// Update Top Sessions table (top 10 by cost)
function updateTopSessions(data) {
    const tbody = document.getElementById('top-sessions-body');
    if (!data.sessions || !data.sessions.length) {
        tbody.innerHTML = '<tr><td colspan="7" style="color:var(--text-muted)">no sessions found</td></tr>';
        return;
    }

    const top10 = [...data.sessions]
        .filter(s => s.cost != null && s.cost > 0)
        .sort((a, b) => b.cost - a.cost)
        .slice(0, 10);

    if (!top10.length) {
        tbody.innerHTML = '<tr><td colspan="7" style="color:var(--text-muted)">no cost data available</td></tr>';
        return;
    }

    tbody.innerHTML = top10.map(s => {
        const costPerToken = s.total_tokens > 0 ? (s.cost / s.total_tokens) * 1000000 : 0;
        return `
        <tr>
            <td class="session-id" data-sid="${esc(s.session_id_full)}" title="${esc(s.session_id_full)}">${esc(s.session_id)}…</td>
            <td>${esc(s.agent)}</td>
            <td>${esc(s.models_used.join(', '))}</td>
            <td>${fmtTokens(s.total_tokens)}</td>
            <td>$${s.cost.toFixed(2)}</td>
            <td>${fmtDuration(s.duration_minutes)}</td>
            <td>$${costPerToken.toFixed(2)}/1M</td>
        </tr>
    `}).join('');
}

// Stop reasons table — sortable
const STOP_REASON_COLS = [
    { key: 'reason', type: 'string' },
    { key: 'count', type: 'number' },
    { key: 'pct', type: 'number' },
    { key: 'status', type: 'string' },
];
let stopReasonSort = { key: 'count', asc: false };
let lastStopReasonRows = null;

const NORMAL_STOPS = new Set(['endTurn', 'end_turn', 'stop', 'toolUse', 'tool_use']);

function renderStopReasonRows(rows) {
    const tbody = document.getElementById('errors-body');
    const sorted = [...rows].sort((a, b) => {
        const col = STOP_REASON_COLS.find(c => c.key === stopReasonSort.key);
        let va = a[stopReasonSort.key], vb = b[stopReasonSort.key];
        if (col.type === 'string') return stopReasonSort.asc ? va.localeCompare(vb) : vb.localeCompare(va);
        return stopReasonSort.asc ? va - vb : vb - va;
    });
    tbody.innerHTML = sorted.map(r => {
        const cls = r.isError ? 'style="color:var(--accent-red)"' : '';
        return `<tr>
            <td ${cls}>${esc(r.reason)}</td>
            <td>${r.count}</td>
            <td>${r.pct}%</td>
            <td>${r.isError ? 'ERROR' : 'OK'}</td>
        </tr>`;
    }).join('');
    document.querySelectorAll('#stop-reasons-table th').forEach((th, i) => {
        const col = STOP_REASON_COLS[i];
        th.classList.toggle('sorted', col.key === stopReasonSort.key);
        th.classList.toggle('asc', col.key === stopReasonSort.key && stopReasonSort.asc);
        th.classList.toggle('desc', col.key === stopReasonSort.key && !stopReasonSort.asc);
    });
}

// Errors by model table — sortable
const ERROR_MODEL_COLS = [
    { key: 'model', type: 'string' },
    { key: 'errors', type: 'number' },
    { key: 'error_rate', type: 'number' },
    { key: 'reasons_str', type: 'string' },
];
let errorModelSort = { key: 'errors', asc: false };
let lastErrorModelRows = null;

function renderErrorModelRows(rows) {
    const modelBody = document.getElementById('errors-by-model-body');
    const sorted = [...rows].sort((a, b) => {
        const col = ERROR_MODEL_COLS.find(c => c.key === errorModelSort.key);
        let va = a[errorModelSort.key], vb = b[errorModelSort.key];
        if (col.type === 'string') return errorModelSort.asc ? va.localeCompare(vb) : vb.localeCompare(va);
        return errorModelSort.asc ? va - vb : vb - va;
    });
    modelBody.innerHTML = sorted.map(m => `<tr>
        <td>${esc(m.model)}</td>
        <td style="color:var(--accent-red)">${m.errors}</td>
        <td>${m.error_rate}%</td>
        <td style="font-size:0.7rem">${m.reasons_str}</td>
    </tr>`).join('');
    document.querySelectorAll('#errors-by-model-table th').forEach((th, i) => {
        const col = ERROR_MODEL_COLS[i];
        th.classList.toggle('sorted', col.key === errorModelSort.key);
        th.classList.toggle('asc', col.key === errorModelSort.key && errorModelSort.asc);
        th.classList.toggle('desc', col.key === errorModelSort.key && !errorModelSort.asc);
    });
}

// Update error codes table
function updateErrorTable(data) {
    const tbody = document.getElementById('errors-body');
    const countEl = document.getElementById('error-count');
    const reasons = data.stop_reasons || {};
    const entries = Object.entries(reasons);
    const total = entries.reduce((s, e) => s + e[1], 0);

    if (countEl) countEl.textContent = `(${entries.length})`;

    if (!entries.length) {
        tbody.innerHTML = '<tr><td colspan="4" style="color:var(--text-muted)">no data</td></tr>';
        lastStopReasonRows = null;
        lastErrorModelRows = null;
        return;
    }

    lastStopReasonRows = entries.map(([reason, count]) => ({
        reason,
        count,
        pct: parseFloat((count / total * 100).toFixed(1)),
        isError: !NORMAL_STOPS.has(reason),
        status: NORMAL_STOPS.has(reason) ? 'OK' : 'ERROR',
    }));
    renderStopReasonRows(lastStopReasonRows);

    // Errors by model
    const models = (data.by_model || []).filter(m => m.errors > 0);
    const modelBody = document.getElementById('errors-by-model-body');
    if (!models.length) {
        modelBody.innerHTML = '<tr><td colspan="4" style="color:var(--text-muted)">no errors</td></tr>';
        lastErrorModelRows = null;
        return;
    }
    lastErrorModelRows = models.map(m => ({
        model: m.model,
        errors: m.errors,
        error_rate: m.error_rate,
        reasons_str: Object.entries(m.reasons).map(([r, c]) => `${esc(r)}(${c})`).join(', '),
    }));
    renderErrorModelRows(lastErrorModelRows);
}

// Determine chart granularity based on period
function getGranularity(period) {
    if (period === 'hour') return 'minute';
    if (period === 'day') return 'hour';
    if (period === 'week') return 'day';
    if (period === 'month') return 'day';
    if (period === 'quarter') return 'week';
    if (period === 'half') return 'week';
    if (period === 'year') return 'month';
    return 'week';
}

// Fetch all data and render
async function refresh() {
    document.body.classList.add('loading');
    const dateFrom = document.getElementById('date-from').value;
    const dateTo = document.getElementById('date-to').value;
    const params = { period: currentPeriod, granularity: getGranularity(currentPeriod) };
    if (dateFrom) params.start_date = dateFrom + 'T00:00:00+00:00';
    if (dateTo) params.end_date = dateTo + 'T23:59:59+00:00';
    if (currentModel) params.model = currentModel;
    if (currentAgent) params.agent = currentAgent;

    try {
        const [overview, usage, cache, errors, sessions, tools, system] = await Promise.all([
            API.overview(params),
            API.usage(params),
            API.cache(params),
            API.errors(params),
            API.sessions(params),
            API.tools(params),
            API.system().catch(() => null),
        ]);

        lastData = { overview, usage, cache, errors, sessions, tools, system };
        updateCards(overview);
        updateAgentFilter(overview);
        updateModelFilter(usage);

        if (system) updateSystemCards(system);

        renderTimeline(usage);
        renderCostTimeline(usage);
        renderByModel(usage);
        renderCostByModel(usage);
        renderCache(cache);
        renderErrors(errors);
        updateErrorTable(errors);
        renderByBreakdown(usage);
        renderToolCounts(tools);
        renderModelEfficiency(usage);
        renderTokenVelocity(usage);
        updateTable(sessions);
        updateTopSessions(sessions);
    } catch (err) {
        console.error('fetch error:', err);
    } finally {
        document.body.classList.remove('loading');
    }
}

// Update model filter dropdown — cache full list so filtered responses don't shrink it
function updateModelFilter(usage) {
    const select = document.getElementById('model-filter');
    const models = (usage.by_model || []).map(d => d.model).sort();
    if (!currentModel) allModels = models;
    const list = allModels.length ? allModels : models;
    const options = '<option value="">ALL MODELS</option>' +
        list.map(m => `<option value="${esc(m)}">${esc(m)}</option>`).join('');
    select.innerHTML = options;
    if (currentModel) select.value = currentModel;
}

// Update agent filter dropdown — cache full list so filtered responses don't shrink it
function updateAgentFilter(overview) {
    const select = document.getElementById('agent-filter');
    const agents = overview.agents || [];
    if (!currentAgent) allAgents = agents;
    const list = allAgents.length ? allAgents : agents;
    const options = '<option value="">ALL AGENTS</option>' +
        list.map(a => `<option value="${esc(a)}">${esc(a)}</option>`).join('');
    select.innerHTML = options;
    if (currentAgent) select.value = currentAgent;
}

// Stop reasons table sort handler
document.getElementById('stop-reasons-table').querySelector('thead').addEventListener('click', (e) => {
    const th = e.target.closest('th');
    if (!th || !lastStopReasonRows) return;
    const idx = Array.from(th.parentElement.children).indexOf(th);
    const col = STOP_REASON_COLS[idx];
    if (!col) return;
    if (stopReasonSort.key === col.key) {
        stopReasonSort.asc = !stopReasonSort.asc;
    } else {
        stopReasonSort.key = col.key;
        stopReasonSort.asc = col.type === 'string';
    }
    renderStopReasonRows(lastStopReasonRows);
});

// Errors by model table sort handler
document.getElementById('errors-by-model-table').querySelector('thead').addEventListener('click', (e) => {
    const th = e.target.closest('th');
    if (!th || !lastErrorModelRows) return;
    const idx = Array.from(th.parentElement.children).indexOf(th);
    const col = ERROR_MODEL_COLS[idx];
    if (!col) return;
    if (errorModelSort.key === col.key) {
        errorModelSort.asc = !errorModelSort.asc;
    } else {
        errorModelSort.key = col.key;
        errorModelSort.asc = col.type === 'string';
    }
    renderErrorModelRows(lastErrorModelRows);
});

// Session table column sort handler
document.getElementById('sessions-table').querySelector('thead').addEventListener('click', (e) => {
    const th = e.target.closest('th');
    if (!th || !lastSessionData) return;
    const idx = Array.from(th.parentElement.children).indexOf(th);
    const col = SESSION_COLUMNS[idx];
    if (!col) return;
    if (sessionSort.key === col.key) {
        sessionSort.asc = !sessionSort.asc;
    } else {
        sessionSort.key = col.key;
        sessionSort.asc = col.type === 'string';
    }
    sessionPage = 0;
    renderTableRows(sortSessions(lastSessionData, sessionSort.key, sessionSort.asc));
});

// Model filter change handler
document.getElementById('model-filter').addEventListener('change', (e) => {
    currentModel = e.target.value;
    updateURL();
    refresh();
});

// Agent filter change handler
document.getElementById('agent-filter').addEventListener('change', (e) => {
    currentAgent = e.target.value;
    updateURL();
    refresh();
});



// Tab switching handler
document.getElementById('tab-bar').addEventListener('click', (e) => {
    const btn = e.target.closest('.tab-btn');
    if (!btn) return;
    const tab = btn.dataset.tab;
    if (tab === currentTab) return;

    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.getElementById('tab-' + tab).classList.add('active');

    currentTab = tab;
    updateURL();

    if (tab === 'sessions') {
        if (lastData.sessions) updateTable(lastData.sessions);
    } else if (tab === 'infra') {
        refreshTab(tab);
    }
});
// Breakdown toggle (provider/agent)
document.getElementById('toggle-breakdown').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn || !lastUsageData) return;
    document.querySelectorAll('#toggle-breakdown button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    breakdownMode = btn.dataset.mode;
    renderByBreakdown(lastUsageData);
});

// Period filter change handler
document.getElementById('period-select').addEventListener('change', (e) => {
    currentPeriod = e.target.value;
    document.getElementById('date-from').value = '';
    document.getElementById('date-to').value = '';
    updateURL();
    refresh();
});

// Date range filter handlers
document.getElementById('date-from').addEventListener('change', () => {
    // Deactivate period buttons when custom dates are set
    document.querySelectorAll('.period-filter button').forEach(b => b.classList.remove('active'));
    currentPeriod = 'all';
    updateURL();
    refresh();
});
document.getElementById('date-to').addEventListener('change', () => {
    document.querySelectorAll('.period-filter button').forEach(b => b.classList.remove('active'));
    currentPeriod = 'all';
    updateURL();
    refresh();
});
document.getElementById('date-clear').addEventListener('click', () => {
    document.getElementById('date-from').value = '';
    document.getElementById('date-to').value = '';
    // Re-activate ALL button
    document.querySelectorAll('.period-filter button').forEach(b => {
        b.classList.toggle('active', b.dataset.period === currentPeriod);
    });
    updateURL();
    refresh();
});

// Click-to-copy session ID
document.getElementById('sessions-body').addEventListener('click', (e) => {
    const td = e.target.closest('.session-id');
    if (!td) return;
    const sid = td.dataset.sid;
    navigator.clipboard.writeText(sid).then(() => showToast('copied: ' + sid));
});

// Click-to-copy top sessions ID
document.getElementById('top-sessions-body').addEventListener('click', (e) => {
    const td = e.target.closest('.session-id');
    if (!td) return;
    const sid = td.dataset.sid;
    navigator.clipboard.writeText(sid).then(() => showToast('copied: ' + sid));
});

// Theme selector
const themeSelect = document.getElementById('theme-select');
const savedTheme = localStorage.getItem('theme') || 'green';
if (themeSelect) {
    themeSelect.value = savedTheme;
    document.body.setAttribute('data-theme', savedTheme);
    themeSelect.addEventListener('change', (e) => {
        const theme = e.target.value;
        document.body.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
    });
}

// Restore filters from URL
const _fromParam = _params.get('from');
const _toParam = _params.get('to');
if (_fromParam) document.getElementById('date-from').value = _fromParam;
if (_toParam) document.getElementById('date-to').value = _toParam;

// Set period dropdown
const periodSelect = document.getElementById('period-select');
if (periodSelect) periodSelect.value = currentPeriod;

// Restore active tab from URL
if (currentTab !== 'usage') {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === currentTab));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    const tabEl = document.getElementById('tab-' + currentTab);
    if (tabEl) tabEl.classList.add('active');
}

// Initial load
refresh();
