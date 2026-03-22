let currentPeriod = 'all';
let currentModel = '';
let currentAgent = '';

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
            <td>${esc(s.session_id)}</td>
            <td>${esc(s.agent)}</td>
            <td>${esc(s.models_used.join(', '))}</td>
            <td>${fmtTokens(s.total_tokens)}</td>
            <td>${s.message_count}</td>
            <td>$${s.cost.toFixed(2)}</td>
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

// Update error codes table
function updateErrorTable(data) {
    const tbody = document.getElementById('errors-body');
    const countEl = document.getElementById('error-count');
    const reasons = data.stop_reasons || {};
    const entries = Object.entries(reasons).sort((a, b) => b[1] - a[1]);
    const total = entries.reduce((s, e) => s + e[1], 0);

    if (countEl) countEl.textContent = `(${entries.length})`;

    if (!entries.length) {
        tbody.innerHTML = '<tr><td colspan="4" style="color:var(--text-muted)">no data</td></tr>';
        return;
    }

    const normal = new Set(['endTurn', 'end_turn', 'stop', 'toolUse', 'tool_use']);
    tbody.innerHTML = entries.map(([reason, count]) => {
        const pct = (count / total * 100).toFixed(1);
        const isError = !normal.has(reason);
        const cls = isError ? 'style="color:var(--accent-red)"' : '';
        return `<tr>
            <td ${cls}>${esc(reason)}</td>
            <td>${count}</td>
            <td>${pct}%</td>
            <td>${isError ? 'ERROR' : 'OK'}</td>
        </tr>`;
    }).join('');

    // Errors by model
    const modelBody = document.getElementById('errors-by-model-body');
    const models = (data.by_model || []).filter(m => m.errors > 0);
    if (!models.length) {
        modelBody.innerHTML = '<tr><td colspan="4" style="color:var(--text-muted)">no errors</td></tr>';
        return;
    }
    modelBody.innerHTML = models.map(m => {
        const reasons = Object.entries(m.reasons).map(([r, c]) => `${esc(r)}(${c})`).join(', ');
        return `<tr>
            <td>${esc(m.model)}</td>
            <td style="color:var(--accent-red)">${m.errors}</td>
            <td>${m.error_rate}%</td>
            <td style="font-size:0.7rem">${reasons}</td>
        </tr>`;
    }).join('');
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
    const params = { period: currentPeriod, granularity: getGranularity(currentPeriod) };
    if (currentModel) params.model = currentModel;
    if (currentAgent) params.agent = currentAgent;

    try {
        const [overview, usage, cache, errors, sessions, tools] = await Promise.all([
            API.overview(params),
            API.usage(params),
            API.cache(params),
            API.errors(params),
            API.sessions(params),
            API.tools(params),
        ]);

        updateCards(overview);
        updateAgentFilter(overview);
        updateModelFilter(usage);
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
        renderToolTimeline(tools);
        renderDuration(sessions);
        updateTable(sessions);
    } catch (err) {
        console.error('fetch error:', err);
    } finally {
        document.body.classList.remove('loading');
    }
}

// Update model filter dropdown (only when no model filter is active, to preserve full list)
function updateModelFilter(usage) {
    if (currentModel) return;
    const select = document.getElementById('model-filter');
    const models = (usage.by_model || []).map(d => d.model).sort();
    const options = '<option value="">ALL MODELS</option>' +
        models.map(m => `<option value="${esc(m)}">${esc(m)}</option>`).join('');
    select.innerHTML = options;
}

// Update agent filter dropdown
function updateAgentFilter(overview) {
    if (currentAgent) return;
    const select = document.getElementById('agent-filter');
    const agents = overview.agents || [];
    const options = '<option value="">ALL AGENTS</option>' +
        agents.map(a => `<option value="${esc(a)}">${esc(a)}</option>`).join('');
    select.innerHTML = options;
}

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
    refresh();
});

// Agent filter change handler
document.getElementById('agent-filter').addEventListener('change', (e) => {
    currentAgent = e.target.value;
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
    refresh();
});

// Initial load
refresh();
