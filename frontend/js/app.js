// Restore filter state from URL
const _params = new URLSearchParams(location.search);
let currentPeriod = _params.get('period') || 'all';
let currentModel = _params.get('model') || '';
let currentAgent = _params.get('agent') || '';
let currentTab = _params.get('tab') || 'usage';
let allModels = [];
let allAgents = [];
let refreshInterval = null;
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

// --- Format seconds as human-readable duration ---
function fmtUptime(seconds) {
    if (!seconds || seconds <= 0) return '--';
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d > 0) return d + 'd ' + h + 'h';
    if (h > 0) return h + 'h ' + m + 'm';
    return m + 'm';
}

// --- Update uptime cards ---
function updateUptimeCard(data) {
    const s = data.summary;
    const uptimeEl = document.getElementById('card-uptime');
    // Show process uptime duration in the global card
    if (s.process_uptime_seconds > 0) {
        uptimeEl.textContent = fmtUptime(s.process_uptime_seconds);
        uptimeEl.className = 'card-value status-green';
    } else {
        uptimeEl.textContent = 'DOWN';
        uptimeEl.className = 'card-value status-red';
    }
}

function updateUptimeTab(data) {
    const s = data.summary;
    document.getElementById('uptime-status').innerHTML = s.is_up
        ? '<span class="status-up">UP</span>'
        : '<span class="status-down">DOWN</span>';
    // Gateway continuous uptime
    document.getElementById('uptime-duration').textContent = s.is_up
        ? fmtUptime(s.uptime_seconds)
        : 'DOWN';
    // Process uptime
    document.getElementById('uptime-process').textContent = fmtUptime(s.process_uptime_seconds);
    document.getElementById('uptime-response').textContent = s.response_time_ms + 'ms';
    const pctEl = document.getElementById('uptime-pct');
    pctEl.textContent = s.uptime_pct + '%';
    pctEl.className = 'card-value ' + thresholdClass(100 - s.uptime_pct, 0.5, 5);
    document.getElementById('uptime-checks').textContent = s.total_checks;
}

// --- Update cron cards ---
function updateCronCards(data) {
    document.getElementById('cron-total').textContent = data.total_jobs;
    document.getElementById('cron-enabled').textContent = data.enabled_jobs;
    document.getElementById('cron-runs').textContent = data.total_runs;
    const successEl = document.getElementById('cron-success');
    successEl.textContent = data.total_runs > 0 ? data.success_rate + '%' : '--';
    if (data.total_runs > 0) {
        successEl.className = 'card-value ' + thresholdClass(100 - data.success_rate, 10, 30);
    }
}

function fmtDurationMs(ms) {
    if (!ms) return '--';
    const sec = ms / 1000;
    if (sec < 60) return Math.round(sec) + 's';
    return fmtDuration(sec / 60);
}

// --- Cron table - sortable ---
const CRON_COLS = [
    { key: 'name', type: 'string' },
    { key: 'schedule', type: 'string' },
    { key: 'last_status', type: 'string' },
    { key: 'last_run', type: 'date' },
    { key: 'last_duration_ms', type: 'number' },
    { key: 'total_runs', type: 'number' },
    { key: 'success_rate', type: 'number' },
];
let cronSort = { key: 'name', asc: true };
let lastCronData = null;

function renderCronRows(jobs) {
    const tbody = document.getElementById('cron-body');
    if (!jobs || !jobs.length) {
        tbody.innerHTML = '<tr><td colspan="7" style="color:var(--text-muted)">no cron jobs found</td></tr>';
        return;
    }

    const sorted = [...jobs].sort((a, b) => {
        const col = CRON_COLS.find(c => c.key === cronSort.key);
        let va = a[cronSort.key], vb = b[cronSort.key];
        if (col.type === 'string') return cronSort.asc ? String(va || '').localeCompare(String(vb || '')) : String(vb || '').localeCompare(String(va || ''));
        if (col.type === 'date') {
            va = va ? new Date(va).getTime() : 0;
            vb = vb ? new Date(vb).getTime() : 0;
        }
        va = va ?? -Infinity;
        vb = vb ?? -Infinity;
        return cronSort.asc ? va - vb : vb - va;
    });

    tbody.innerHTML = sorted.map(j => {
        const statusColor = j.last_status === 'ok' ? 'color:var(--text-primary)'
            : j.last_status === 'error' ? 'color:var(--accent-red)'
            : 'color:var(--text-muted)';
        const enabledCls = j.enabled ? '' : ' style="opacity:0.5"';
        return `<tr${enabledCls}>
            <td>${esc(j.name)}${j.enabled ? '' : ' <span style="color:var(--text-muted)">(off)</span>'}</td>
            <td>${esc(j.schedule || '--')}</td>
            <td style="${statusColor}">${esc(j.last_status)}</td>
            <td>${fmtDate(j.last_run)}</td>
            <td>${fmtDurationMs(j.last_duration_ms)}</td>
            <td>${j.total_runs}</td>
            <td>${j.total_runs > 0 ? j.success_rate + '%' : '--'}</td>
        </tr>`;
    }).join('');

    document.querySelectorAll('#cron-table th').forEach((th, i) => {
        const col = CRON_COLS[i];
        th.classList.toggle('sorted', col.key === cronSort.key);
        th.classList.toggle('asc', col.key === cronSort.key && cronSort.asc);
        th.classList.toggle('desc', col.key === cronSort.key && !cronSort.asc);
    });
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
    } else if (tab === 'uptime') {
        try {
            const uptime = await API.uptime();
            lastData.uptime = uptime;
            updateUptimeCard(uptime);
            updateUptimeTab(uptime);
            renderResponseTime(uptime);
            renderStatusCodes(uptime);
        } catch (err) { console.error('uptime fetch error:', err); }
    } else if (tab === 'cron') {
        try {
            const cronData = await API.cron();
            lastData.cron = cronData;
            updateCronCards(cronData);
            lastCronData = cronData.jobs;
            renderCronRows(cronData.jobs);
        } catch (err) { console.error('cron fetch error:', err); }
    }
}

// Session table sorting & pagination
let sessionSort = { key: 'start_time', asc: false };
let lastSessionData = null;
let sessionPage = 0;
const SESSIONS_PER_PAGE = 25;

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
    const totalPages = Math.ceil(sessions.length / SESSIONS_PER_PAGE);
    if (sessionPage >= totalPages) sessionPage = Math.max(0, totalPages - 1);
    const start = sessionPage * SESSIONS_PER_PAGE;
    const page = sessions.slice(start, start + SESSIONS_PER_PAGE);

    tbody.innerHTML = page.map(s => `
        <tr>
            <td class="session-id" data-sid="${esc(s.session_id)}" title="${esc(s.session_id)}">${esc(s.session_id.slice(0, 8))}\u2026</td>
            <td>${esc(s.agent)}</td>
            <td>${esc(s.models_used.join(', '))}</td>
            <td>${fmtTokens(s.total_tokens)}</td>
            <td>${s.message_count}</td>
            <td>${s.cost != null ? '$' + s.cost.toFixed(2) : '--'}</td>
            <td>${fmtDuration(s.duration_minutes)}</td>
            <td>${fmtDate(s.start_time)}</td>
        </tr>
    `).join('');

    // Update sort indicators
    document.querySelectorAll('#sessions-table th').forEach((th, i) => {
        const col = SESSION_COLUMNS[i];
        th.classList.toggle('sorted', col.key === sessionSort.key);
        th.classList.toggle('asc', col.key === sessionSort.key && sessionSort.asc);
        th.classList.toggle('desc', col.key === sessionSort.key && !sessionSort.asc);
    });

    // Update pagination controls
    const pag = document.getElementById('session-pagination');
    if (pag) {
        if (totalPages <= 1) {
            pag.style.display = 'none';
        } else {
            pag.style.display = 'flex';
            pag.querySelector('.page-info').textContent =
                `${start + 1}–${Math.min(start + SESSIONS_PER_PAGE, sessions.length)} of ${sessions.length}`;
            pag.querySelector('.page-prev').disabled = sessionPage === 0;
            pag.querySelector('.page-next').disabled = sessionPage >= totalPages - 1;
        }
    }
}

// Update sessions table
function updateTable(data) {
    const tbody = document.getElementById('sessions-body');
    if (!data.sessions || !data.sessions.length) {
        tbody.innerHTML = '<tr><td colspan="8" style="color:var(--text-muted)">no sessions found</td></tr>';
        lastSessionData = null;
        const pag = document.getElementById('session-pagination');
        if (pag) pag.style.display = 'none';
        return;
    }

    const countEl = document.getElementById('session-count');
    if (countEl) countEl.textContent = `(${data.sessions.length})`;

    sessionPage = 0;
    lastSessionData = data.sessions;
    renderTableRows(sortSessions(data.sessions, sessionSort.key, sessionSort.asc));
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
        const [overview, usage, cache, errors, sessions, tools, system, uptime] = await Promise.all([
            API.overview(params),
            API.usage(params),
            API.cache(params),
            API.errors(params),
            API.sessions(params),
            API.tools(params),
            API.system().catch(() => null),
            API.uptime().catch(() => null),
        ]);

        lastData = { overview, usage, cache, errors, sessions, tools, system, uptime };
        updateCards(overview);
        updateAgentFilter(overview);
        updateModelFilter(usage);

        // Update global summary cards for system/uptime
        if (system) updateSystemCards(system);
        if (uptime) updateUptimeCard(uptime);

        // Only render charts for the active tab (ApexCharts needs visible containers)
        if (currentTab === 'usage') {
            renderTimeline(usage);
            renderCostTimeline(usage);
            renderByModel(usage);
            renderCostByModel(usage);
            renderCache(cache);
            renderErrors(errors);
            updateErrorTable(errors);
            renderByProvider(usage);
            renderByAgent(usage);
            renderToolCounts(tools);
            renderCostForecast(usage, currentPeriod);
            renderToolTimeline(tools);
            renderDuration(sessions);
            updateTable(sessions);
        } else {
            // Store usage-tab data but render later when tab is activated
            lastData.usageRendered = false;
        }

        // Render active tab if not usage
        if (currentTab !== 'usage') {
            await refreshTab(currentTab);
        }
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

// Session pagination handlers
document.getElementById('session-pagination').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn || !lastSessionData) return;
    if (btn.classList.contains('page-prev') && sessionPage > 0) {
        sessionPage--;
    } else if (btn.classList.contains('page-next')) {
        sessionPage++;
    }
    renderTableRows(sortSessions(lastSessionData, sessionSort.key, sessionSort.asc));
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

    const prevTab = currentTab;
    currentTab = tab;
    updateURL();

    // If switching to usage and it hasn't been rendered yet, render now
    if (tab === 'usage' && lastData.usageRendered === false) {
        lastData.usageRendered = true;
        if (lastData.usage) {
            renderTimeline(lastData.usage);
            renderCostTimeline(lastData.usage);
            renderByModel(lastData.usage);
            renderCostByModel(lastData.usage);
            renderByProvider(lastData.usage);
            renderByAgent(lastData.usage);
            renderCostForecast(lastData.usage, currentPeriod);
        }
        if (lastData.cache) renderCache(lastData.cache);
        if (lastData.errors) { renderErrors(lastData.errors); updateErrorTable(lastData.errors); }
        if (lastData.tools) { renderToolCounts(lastData.tools); renderToolTimeline(lastData.tools); }
        if (lastData.sessions) { renderDuration(lastData.sessions); updateTable(lastData.sessions); }
    } else {
        refreshTab(tab);
    }
});

// Cron table sort handler
document.getElementById('cron-table').querySelector('thead').addEventListener('click', (e) => {
    const th = e.target.closest('th');
    if (!th || !lastCronData) return;
    const idx = Array.from(th.parentElement.children).indexOf(th);
    const col = CRON_COLS[idx];
    if (!col) return;
    if (cronSort.key === col.key) {
        cronSort.asc = !cronSort.asc;
    } else {
        cronSort.key = col.key;
        cronSort.asc = col.type === 'string';
    }
    renderCronRows(lastCronData);
});

// Provider tokens/cost toggle
document.getElementById('toggle-provider').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn || !lastUsageData) return;
    document.querySelectorAll('#toggle-provider button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    providerMode = btn.dataset.mode;
    renderByProvider(lastUsageData);
});

// Agent tokens/cost toggle
document.getElementById('toggle-agent').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn || !lastUsageData) return;
    document.querySelectorAll('#toggle-agent button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    agentMode = btn.dataset.mode;
    renderByAgent(lastUsageData);
});

// Period filter click handler
document.getElementById('period-filter').addEventListener('click', (e) => {
    if (e.target.tagName !== 'BUTTON') return;
    document.querySelectorAll('.period-filter button').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    currentPeriod = e.target.dataset.period;
    // Clear custom date range when using period buttons
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

// Auto-refresh handler
document.getElementById('auto-refresh').addEventListener('change', (e) => {
    if (refreshInterval) clearInterval(refreshInterval);
    refreshInterval = null;
    const seconds = parseInt(e.target.value);
    if (seconds > 0) {
        refreshInterval = setInterval(refresh, seconds * 1000);
    }
});

// Click-to-copy session ID
document.getElementById('sessions-body').addEventListener('click', (e) => {
    const td = e.target.closest('.session-id');
    if (!td) return;
    const sid = td.dataset.sid;
    navigator.clipboard.writeText(sid).then(() => showToast('copied: ' + sid));
});

// --- Export functions ---
function exportFilename(ext) {
    const date = new Date().toISOString().slice(0, 10);
    return `claw-${currentPeriod}-${date}.${ext}`;
}

function downloadFile(content, filename, type) {
    const blob = new Blob([content], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
}

function csvVal(v) {
    const s = String(v ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportFilterLabel() {
    const parts = [`Period: ${currentPeriod.toUpperCase()}`];
    parts.push(`Agent: ${currentAgent || 'ALL'}`);
    parts.push(`Model: ${currentModel || 'ALL'}`);
    return parts.join(', ');
}

function exportCSV() {
    if (!lastData.overview) return;
    const o = lastData.overview;
    const lines = [];

    lines.push('# ' + exportFilterLabel());
    lines.push('');
    lines.push('Metric,Value');
    lines.push(`Total Tokens,${o.total_tokens}`);
    lines.push(`Total Messages,${o.total_messages}`);
    lines.push(`Total Sessions,${o.total_sessions}`);
    lines.push(`Cache Hit Rate (%),${o.cache_hit_rate}`);
    lines.push(`Error Rate (%),${o.error_rate}`);
    lines.push(`Total Cost ($),${o.total_cost.toFixed(2)}`);
    lines.push('');

    const sessions = lastData.sessions?.sessions || [];
    if (sessions.length) {
        lines.push('Session ID,Agent,Models,Tokens,Messages,Cost,Duration (min),Start Time');
        for (const s of sessions) {
            lines.push([
                csvVal(s.session_id), csvVal(s.agent),
                csvVal((s.models_used || []).join('; ')),
                s.total_tokens, s.message_count,
                s.cost != null ? s.cost.toFixed(2) : '',
                s.duration_minutes != null ? Math.round(s.duration_minutes) : '',
                s.start_time || '',
            ].join(','));
        }
        lines.push('');
    }

    const byModel = lastData.usage?.by_model || [];
    if (byModel.length) {
        lines.push('Model,Input,Output,Cache Read,Total,Cost');
        for (const m of byModel) {
            lines.push([csvVal(m.model), m.input, m.output, m.cache_read, m.total,
                m.cost != null ? m.cost.toFixed(2) : ''].join(','));
        }
        lines.push('');
    }

    const byTool = lastData.tools?.by_tool || [];
    if (byTool.length) {
        lines.push('Tool,Count');
        for (const t of byTool) lines.push(`${csvVal(t.tool)},${t.count}`);
    }

    downloadFile('\uFEFF' + lines.join('\n'), exportFilename('csv'), 'text/csv;charset=utf-8');
    showToast('exported ' + exportFilename('csv'));
}

function exportMD() {
    if (!lastData.overview) return;
    const o = lastData.overview;
    const lines = [];

    lines.push('# Claw Usage Dashboard Export');
    lines.push('');
    lines.push(`**${exportFilterLabel()}**`);
    lines.push('');
    lines.push('## Summary');
    lines.push('');
    lines.push('| Metric | Value |');
    lines.push('|--------|-------|');
    lines.push(`| Total Tokens | ${fmtTokens(o.total_tokens)} |`);
    lines.push(`| Total Messages | ${fmtCount(o.total_messages)} |`);
    lines.push(`| Total Sessions | ${fmtCount(o.total_sessions)} |`);
    lines.push(`| Cache Hit Rate | ${o.cache_hit_rate}% |`);
    lines.push(`| Error Rate | ${o.error_rate}% |`);
    lines.push(`| Total Cost | $${o.total_cost.toFixed(2)} |`);
    lines.push('');

    const byModel = lastData.usage?.by_model || [];
    if (byModel.length) {
        lines.push('## Usage by Model');
        lines.push('');
        lines.push('| Model | Input | Output | Cache Read | Total | Cost |');
        lines.push('|-------|-------|--------|------------|-------|------|');
        for (const m of byModel) {
            lines.push(`| ${m.model} | ${fmtTokens(m.input)} | ${fmtTokens(m.output)} | ${fmtTokens(m.cache_read)} | ${fmtTokens(m.total)} | ${m.cost != null ? '$' + m.cost.toFixed(2) : '--'} |`);
        }
        lines.push('');
    }

    const byTool = lastData.tools?.by_tool || [];
    if (byTool.length) {
        lines.push('## Tool Usage');
        lines.push('');
        lines.push('| Tool | Count |');
        lines.push('|------|-------|');
        for (const t of byTool) lines.push(`| ${t.tool} | ${fmtCount(t.count)} |`);
        lines.push('');
    }

    const sessions = lastData.sessions?.sessions || [];
    if (sessions.length) {
        lines.push('## Sessions');
        lines.push('');
        lines.push('| ID | Agent | Model | Tokens | Msgs | Cost | Duration | Time |');
        lines.push('|----|-------|-------|--------|------|------|----------|------|');
        for (const s of sessions) {
            lines.push(`| ${s.session_id.slice(0, 8)}… | ${s.agent} | ${(s.models_used || []).join(', ')} | ${fmtTokens(s.total_tokens)} | ${s.message_count} | ${s.cost != null ? '$' + s.cost.toFixed(2) : '--'} | ${fmtDuration(s.duration_minutes)} | ${fmtDate(s.start_time)} |`);
        }
    }

    downloadFile(lines.join('\n'), exportFilename('md'), 'text/markdown;charset=utf-8');
    showToast('exported ' + exportFilename('md'));
}

function exportXLSX() {
    if (!lastData.overview || typeof XLSX === 'undefined') {
        showToast('XLSX library not loaded');
        return;
    }
    const o = lastData.overview;
    const wb = XLSX.utils.book_new();

    // Summary sheet
    const summary = [
        ['Claw Usage Dashboard Export'],
        [exportFilterLabel()],
        [],
        ['Metric', 'Value'],
        ['Total Tokens', o.total_tokens],
        ['Total Messages', o.total_messages],
        ['Total Sessions', o.total_sessions],
        ['Cache Hit Rate (%)', o.cache_hit_rate],
        ['Error Rate (%)', o.error_rate],
        ['Total Cost ($)', o.total_cost],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), 'Summary');

    // Sessions sheet
    const sessions = lastData.sessions?.sessions || [];
    if (sessions.length) {
        const rows = [['Session ID', 'Agent', 'Models', 'Tokens', 'Messages', 'Cost ($)', 'Duration (min)', 'Start Time']];
        for (const s of sessions) {
            rows.push([
                s.session_id, s.agent, (s.models_used || []).join(', '),
                s.total_tokens, s.message_count, s.cost ?? '',
                s.duration_minutes != null ? Math.round(s.duration_minutes) : '',
                s.start_time || '',
            ]);
        }
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Sessions');
    }

    // Usage by Model sheet
    const byModel = lastData.usage?.by_model || [];
    if (byModel.length) {
        const rows = [['Model', 'Input', 'Output', 'Cache Read', 'Total', 'Cost ($)']];
        for (const m of byModel) rows.push([m.model, m.input, m.output, m.cache_read, m.total, m.cost ?? '']);
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'By Model');
    }

    // By Provider sheet
    const byProvider = lastData.usage?.by_provider || [];
    if (byProvider.length) {
        const rows = [['Provider', 'Total Tokens', 'Cost ($)']];
        for (const p of byProvider) rows.push([p.provider, p.total, p.cost ?? '']);
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'By Provider');
    }

    // By Agent sheet
    const byAgent = lastData.usage?.by_agent || [];
    if (byAgent.length) {
        const rows = [['Agent', 'Total Tokens', 'Cost ($)']];
        for (const a of byAgent) rows.push([a.agent, a.total, a.cost ?? '']);
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'By Agent');
    }

    // Tool Usage sheet
    const byTool = lastData.tools?.by_tool || [];
    if (byTool.length) {
        const rows = [['Tool', 'Count']];
        for (const t of byTool) rows.push([t.tool, t.count]);
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Tools');
    }

    XLSX.writeFile(wb, exportFilename('xlsx'));
    showToast('exported ' + exportFilename('xlsx'));
}

// Export button handlers
document.getElementById('export-csv').addEventListener('click', exportCSV);
document.getElementById('export-md').addEventListener('click', exportMD);
document.getElementById('export-xlsx').addEventListener('click', exportXLSX);

// Restore active period button and date range from URL
document.querySelectorAll('.period-filter button').forEach(b => {
    b.classList.toggle('active', b.dataset.period === currentPeriod);
});
const _fromParam = _params.get('from');
const _toParam = _params.get('to');
if (_fromParam) document.getElementById('date-from').value = _fromParam;
if (_toParam) document.getElementById('date-to').value = _toParam;
if (_fromParam || _toParam) {
    document.querySelectorAll('.period-filter button').forEach(b => b.classList.remove('active'));
}

// Restore active tab from URL
if (currentTab !== 'usage') {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === currentTab));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    const tabEl = document.getElementById('tab-' + currentTab);
    if (tabEl) tabEl.classList.add('active');
}

// Initial load
refresh();
