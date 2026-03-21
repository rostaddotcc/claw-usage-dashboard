let currentPeriod = 'all';

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

// Update summary cards
function updateCards(overview) {
    document.getElementById('card-tokens').textContent = fmtTokens(overview.total_tokens);
    document.getElementById('card-messages').textContent = overview.total_messages;
    document.getElementById('card-sessions').textContent = overview.total_sessions;
    document.getElementById('card-cache').textContent = overview.cache_hit_rate + '%';
    document.getElementById('card-errors').textContent = overview.error_rate + '%';
    document.getElementById('card-cost').textContent = '$' + overview.total_cost.toFixed(2);
}

// Update sessions table
function updateTable(data) {
    const tbody = document.getElementById('sessions-body');
    if (!data.sessions || !data.sessions.length) {
        tbody.innerHTML = '<tr><td colspan="7" style="color:var(--text-muted)">no sessions found</td></tr>';
        return;
    }

    const countEl = document.getElementById('session-count');
    if (countEl) countEl.textContent = `(${data.sessions.length})`;

    tbody.innerHTML = data.sessions.map(s => `
        <tr>
            <td>${s.session_id}</td>
            <td>${s.agent}</td>
            <td>${s.models_used.join(', ')}</td>
            <td>${fmtTokens(s.total_tokens)}</td>
            <td>${s.message_count}</td>
            <td>$${s.cost.toFixed(2)}</td>
            <td>${fmtDate(s.start_time)}</td>
        </tr>
    `).join('');
}

// Determine chart granularity based on period
function getGranularity(period) {
    if (period === 'hour') return 'minute';
    if (period === 'day') return 'hour';
    if (period === 'week') return 'day';
    if (period === 'month') return 'day';
    return 'week';
}

// Fetch all data and render
async function refresh() {
    document.body.classList.add('loading');
    const params = { period: currentPeriod, granularity: getGranularity(currentPeriod) };

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
        renderTimeline(usage);
        renderByModel(usage);
        renderCache(cache);
        renderErrors(errors);
        renderByProvider(usage);
        renderByAgent(usage);
        renderToolCounts(tools);
        renderToolTimeline(tools);
        updateTable(sessions);
    } catch (err) {
        console.error('fetch error:', err);
    } finally {
        document.body.classList.remove('loading');
    }
}

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
