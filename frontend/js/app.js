let currentPeriod = 'all';
let currentModel = '';

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

// Update summary cards
function updateCards(overview) {
    document.getElementById('card-tokens').textContent = fmtTokens(overview.total_tokens);
    document.getElementById('card-messages').textContent = overview.total_messages;
    document.getElementById('card-sessions').textContent = overview.total_sessions;
    document.getElementById('card-cache').textContent = overview.cache_hit_rate + '%';
    document.getElementById('card-errors').textContent = overview.error_rate + '%';
    document.getElementById('card-cost').textContent = '$' + overview.total_cost.toFixed(2);
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
    tbody.innerHTML = sessions.map(s => `
        <tr>
            <td>${s.session_id}</td>
            <td>${s.agent}</td>
            <td>${s.models_used.join(', ')}</td>
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
}

// Update sessions table
function updateTable(data) {
    const tbody = document.getElementById('sessions-body');
    if (!data.sessions || !data.sessions.length) {
        tbody.innerHTML = '<tr><td colspan="8" style="color:var(--text-muted)">no sessions found</td></tr>';
        lastSessionData = null;
        return;
    }

    const countEl = document.getElementById('session-count');
    if (countEl) countEl.textContent = `(${data.sessions.length})`;

    lastSessionData = data.sessions;
    renderTableRows(sortSessions(data.sessions, sessionSort.key, sessionSort.asc));
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
        updateModelFilter(usage);
        renderTimeline(usage);
        renderByModel(usage);
        renderCache(cache);
        renderErrors(errors);
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
        models.map(m => `<option value="${m}">${m}</option>`).join('');
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
    renderTableRows(sortSessions(lastSessionData, sessionSort.key, sessionSort.asc));
});

// Model filter change handler
document.getElementById('model-filter').addEventListener('change', (e) => {
    currentModel = e.target.value;
    refresh();
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
