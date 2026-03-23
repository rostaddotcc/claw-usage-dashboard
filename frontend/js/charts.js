const COLORS = ['#00ff41', '#00ffff', '#ffaa00', '#ff3333', '#aa55ff', '#4488ff', '#00aa2a', '#ff66aa'];

const CHART_DEFAULTS = {
    chart: {
        background: 'transparent',
        foreColor: '#00aa2a',
        fontFamily: "'JetBrains Mono', monospace",
        toolbar: { show: false },
        animations: {
            enabled: true,
            easing: 'easeinout',
            speed: 800,
        },
    },
    grid: {
        borderColor: '#1a3a1a',
        strokeDashArray: 3,
    },
    tooltip: {
        theme: 'dark',
        shared: true,
        intersect: false,
        style: { fontSize: '12px', fontFamily: "'JetBrains Mono', monospace" },
        x: { show: true },
    },
    legend: {
        fontSize: '12px',
        fontFamily: "'JetBrains Mono', monospace",
        labels: { colors: '#00aa2a' },
        markers: { radius: 2 },
    },
    xaxis: {
        labels: { style: { colors: '#00aa2a', fontSize: '11px' } },
        axisBorder: { color: '#1a3a1a' },
        axisTicks: { color: '#1a3a1a' },
    },
    yaxis: {
        labels: {
            style: { colors: '#00aa2a', fontSize: '11px' },
            formatter: val => formatNumber(val),
        },
    },
};

function formatNumber(n) {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
    return String(Math.round(n));
}

function fmtCost(n) {
    return '$' + n.toFixed(2);
}

// Store chart instances for cleanup
const chartInstances = {};

function clearChart(id) {
    if (chartInstances[id]) {
        chartInstances[id].destroy();
        delete chartInstances[id];
    }
    const el = document.querySelector(id);
    if (el) el.innerHTML = '<div class="no-data">no data</div>';
}

function renderChart(id, options) {
    if (chartInstances[id]) {
        chartInstances[id].destroy();
    }
    const el = document.querySelector(id);
    if (!el) return;
    el.innerHTML = '';
    const merged = mergeDeep({}, CHART_DEFAULTS, options);
    const chart = new ApexCharts(el, merged);
    chart.render();
    chartInstances[id] = chart;
}

function mergeDeep(target, ...sources) {
    for (const source of sources) {
        for (const key of Object.keys(source)) {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                if (!target[key]) target[key] = {};
                mergeDeep(target[key], source[key]);
            } else {
                target[key] = source[key];
            }
        }
    }
    return target;
}

// Group small items as "other" — keep top N
function groupTopN(items, n, labelKey, valueKey) {
    if (items.length <= n) return items;
    const top = items.slice(0, n);
    const rest = items.slice(n);
    const other = { [labelKey]: 'other' };
    // Sum all numeric fields from rest
    for (const key of Object.keys(rest[0])) {
        if (key === labelKey) continue;
        if (typeof rest[0][key] === 'number') {
            other[key] = rest.reduce((s, r) => s + (r[key] || 0), 0);
        }
    }
    return [...top, other];
}

// Donut helper — used by provider and agent charts
// Center labels are disabled — totals are shown in chart titles instead
const DONUT_DEFAULTS = {
    plotOptions: {
        pie: {
            donut: {
                size: '55%',
                labels: { show: false },
            },
        },
    },
    dataLabels: {
        style: { fontSize: '11px', fontFamily: "'JetBrains Mono', monospace" },
    },
    stroke: { width: 1, colors: ['#0a0a0a'] },
};

// --- 1. Token Usage Over Time - split: input+output bars, cache as line ---
function renderTimeline(data) {
    if (!data.over_time || !data.over_time.length) { clearChart('#chart-timeline'); return; }

    const dates = data.over_time.map(d => d.date);

    const totalData = data.over_time.map(d => (d.input || 0) + (d.output || 0) + (d.cache_read || 0));

    renderChart('#chart-timeline', {
        chart: { type: 'line', height: 280 },
        series: [
            { name: 'total', type: 'bar', data: totalData },
            { name: 'input', type: 'bar', data: data.over_time.map(d => d.input) },
            { name: 'output', type: 'bar', data: data.over_time.map(d => d.output) },
            { name: 'cache_read', type: 'line', data: data.over_time.map(d => d.cache_read) },
        ],
        colors: ['rgba(255,255,255,0.08)', '#00ff41', '#00ffff', '#ffaa00'],
        xaxis: {
            categories: dates,
            labels: { style: { colors: '#00aa2a', fontSize: '11px' } },
        },
        yaxis: [
            {
                title: { text: 'tokens', style: { color: '#00aa2a', fontSize: '11px' } },
                labels: {
                    style: { colors: '#00aa2a', fontSize: '11px' },
                    formatter: val => formatNumber(val),
                },
            },
            {
                opposite: true,
                title: { text: 'cache_read', style: { color: '#ffaa00', fontSize: '11px' } },
                labels: {
                    style: { colors: '#ffaa00', fontSize: '11px' },
                    formatter: val => formatNumber(val),
                },
            },
        ],
        plotOptions: {
            bar: { borderRadius: 2, columnWidth: '70%' },
        },
        stroke: { width: [0, 0, 0, 2], curve: 'smooth' },
        tooltip: {
            y: { formatter: val => val.toLocaleString('sv-SE') + ' tokens' },
        },
        dataLabels: { enabled: false },
    });
}

// --- 2. Cost Over Time - stacked area ---
function renderCostTimeline(data) {
    if (!data.over_time || !data.over_time.length) { clearChart('#chart-cost-timeline'); return; }

    const dates = data.over_time.map(d => d.date);

    renderChart('#chart-cost-timeline', {
        chart: { type: 'area', height: 280 },
        series: [{ name: 'cost', data: data.over_time.map(d => Math.round(d.cost * 100) / 100) }],
        colors: ['#ff3333'],
        xaxis: {
            categories: dates,
            labels: { style: { colors: '#00aa2a', fontSize: '11px' } },
        },
        yaxis: {
            labels: {
                style: { colors: '#00aa2a', fontSize: '11px' },
                formatter: val => fmtCost(val),
            },
        },
        fill: {
            type: 'gradient',
            gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.05, stops: [0, 100] },
        },
        stroke: { width: 2, curve: 'smooth' },
        tooltip: {
            y: { formatter: val => fmtCost(val) },
        },
        dataLabels: { enabled: false },
    });
}

// --- 3. Cost by Model - horizontal bar (top 8 + other) ---
function renderCostByModel(data) {
    if (!data.by_model || !data.by_model.length) { clearChart('#chart-cost-by-model'); return; }

    const sorted = [...data.by_model].sort((a, b) => b.cost - a.cost);
    const grouped = groupTopN(sorted, 8, 'model', 'cost');
    const models = grouped.map(d => d.model);
    const costs = grouped.map(d => Math.round(d.cost * 100) / 100);

    renderChart('#chart-cost-by-model', {
        chart: { type: 'bar', height: Math.max(250, models.length * 32) },
        series: [{ name: 'cost', data: costs }],
        colors: ['#ff3333'],
        plotOptions: {
            bar: { horizontal: true, borderRadius: 2, barHeight: '60%' },
        },
        xaxis: {
            categories: models,
            labels: {
                style: { colors: '#00aa2a', fontSize: '11px' },
                formatter: val => fmtCost(val),
            },
        },
        yaxis: {
            labels: {
                style: { colors: '#00aa2a', fontSize: '11px' },
                maxWidth: 180,
                formatter: val => val,
            },
        },
        tooltip: {
            y: { formatter: val => fmtCost(val) },
        },
        dataLabels: { enabled: false },
    });
}

// --- 4. Usage by Model - horizontal bar (top 8 + other) ---
function renderByModel(data) {
    if (!data.by_model || !data.by_model.length) { clearChart('#chart-by-model'); return; }

    const grouped = groupTopN(data.by_model, 8, 'model', 'total');
    const models = grouped.map(d => d.model);

    renderChart('#chart-by-model', {
        chart: { type: 'bar', height: Math.max(250, models.length * 32) },
        series: [
            { name: 'input', data: grouped.map(d => d.input) },
            { name: 'output', data: grouped.map(d => d.output) },
            { name: 'cache_read', data: grouped.map(d => d.cache_read) },
        ],
        colors: ['#00ff41', '#00ffff', '#ffaa00'],
        plotOptions: {
            bar: { horizontal: true, borderRadius: 2, barHeight: '60%' },
        },
        xaxis: {
            categories: models,
            labels: {
                style: { colors: '#00aa2a', fontSize: '11px' },
                formatter: val => formatNumber(val),
            },
        },
        yaxis: {
            labels: {
                style: { colors: '#00aa2a', fontSize: '11px' },
                maxWidth: 180,
                formatter: val => val,
            },
        },
        tooltip: {
            y: { formatter: val => val.toLocaleString('sv-SE') + ' tokens' },
        },
        dataLabels: { enabled: false },
    });
}

// Cache Hit Rate - area chart
function renderCache(data) {
    if (!data.over_time || !data.over_time.length) { clearChart('#chart-cache'); return; }

    renderChart('#chart-cache', {
        chart: { type: 'area', height: 250 },
        series: [{ name: 'cache rate %', data: data.over_time.map(d => d.rate) }],
        colors: ['#00ffff'],
        xaxis: {
            categories: data.over_time.map(d => d.date),
            labels: { style: { colors: '#00aa2a', fontSize: '11px' } },
        },
        yaxis: {
            min: 0,
            max: 100,
            labels: {
                style: { colors: '#00aa2a', fontSize: '11px' },
                formatter: val => val.toFixed(0) + '%',
            },
        },
        fill: {
            type: 'gradient',
            gradient: {
                shadeIntensity: 1,
                opacityFrom: 0.4,
                opacityTo: 0.05,
                stops: [0, 100],
            },
        },
        stroke: { width: 2 },
        dataLabels: { enabled: false },
        annotations: {
            yaxis: [{
                y: data.overall_rate,
                borderColor: '#00aa2a',
                strokeDashArray: 4,
                label: {
                    text: `avg ${data.overall_rate}%`,
                    style: {
                        color: '#00ff41',
                        background: '#0f0f0f',
                        fontSize: '11px',
                        fontFamily: "'JetBrains Mono', monospace",
                    },
                },
            }],
        },
    });
}

// Stop Reasons - donut
function renderErrors(data) {
    if (!data.stop_reasons || !Object.keys(data.stop_reasons).length) { clearChart('#chart-errors'); return; }

    const labels = Object.keys(data.stop_reasons);
    const values = Object.values(data.stop_reasons);
    const total = values.reduce((a, b) => a + b, 0);

    const colorMap = {
        endTurn: '#00ff41', end_turn: '#00ff41', stop: '#00ff41',
        toolUse: '#00ffff', tool_use: '#00ffff',
        maxTokens: '#ffaa00', max_tokens: '#ffaa00',
    };
    const colors = labels.map(l => colorMap[l] || '#ff3333');

    const titleEl = document.querySelector('#chart-errors')?.closest('.chart-box')?.querySelector('.chart-title');
    if (titleEl) titleEl.textContent = `> Stop Reasons (${formatNumber(total)} total)`;

    renderChart('#chart-errors', {
        chart: { type: 'donut', height: 250 },
        series: values,
        labels: labels,
        colors: colors,
        ...DONUT_DEFAULTS,
    });
}

// --- 5. Usage by Provider - donut with tokens/cost toggle ---
let providerMode = 'tokens';
let lastUsageData = null;

function renderByProvider(data) {
    lastUsageData = data;
    if (!data.by_provider || !data.by_provider.length) { clearChart('#chart-by-provider'); return; }

    const useCost = providerMode === 'cost';
    const values = data.by_provider.map(d => useCost ? Math.round(d.cost * 100) / 100 : d.total);
    const labels = data.by_provider.map(d => d.provider);
    const total = values.reduce((a, b) => a + b, 0);
    const totalStr = useCost ? fmtCost(total) : formatNumber(total) + ' tokens';

    const titleEl = document.querySelector('#chart-by-provider')?.closest('.chart-box')?.querySelector('.chart-title');
    if (titleEl) {
        // Update only the text node before the toggle span to preserve event listeners
        const firstText = titleEl.firstChild;
        if (firstText && firstText.nodeType === Node.TEXT_NODE) {
            firstText.textContent = `> By Provider (${totalStr}) `;
        }
    }

    renderChart('#chart-by-provider', {
        chart: { type: 'donut', height: 250 },
        series: values,
        labels: labels,
        colors: COLORS.slice(0, labels.length),
        ...DONUT_DEFAULTS,
        tooltip: {
            y: {
                formatter: val => useCost ? fmtCost(val) : val.toLocaleString('sv-SE') + ' tokens',
            },
        },
    });
}

// Usage by Agent - donut with tokens/cost toggle
let agentMode = 'tokens';

function renderByAgent(data) {
    lastUsageData = data;
    if (!data.by_agent || !data.by_agent.length) { clearChart('#chart-by-agent'); return; }

    const useCost = agentMode === 'cost';
    const values = data.by_agent.map(d => useCost ? Math.round(d.cost * 100) / 100 : d.total);
    const labels = data.by_agent.map(d => d.agent);
    const total = values.reduce((a, b) => a + b, 0);
    const totalStr = useCost ? fmtCost(total) : formatNumber(total) + ' tokens';

    const titleEl = document.querySelector('#chart-by-agent')?.closest('.chart-box')?.querySelector('.chart-title');
    if (titleEl) {
        const firstText = titleEl.firstChild;
        if (firstText && firstText.nodeType === Node.TEXT_NODE) {
            firstText.textContent = `> By Agent (${totalStr}) `;
        }
    }

    renderChart('#chart-by-agent', {
        chart: { type: 'donut', height: 250 },
        series: values,
        labels: labels,
        colors: COLORS.slice(0, labels.length),
        ...DONUT_DEFAULTS,
        tooltip: {
            y: {
                formatter: val => useCost ? fmtCost(val) : val.toLocaleString('sv-SE') + ' tokens',
            },
        },
    });
}

// Tool Usage - horizontal bar
function renderToolCounts(data) {
    if (!data.by_tool || !data.by_tool.length) { clearChart('#chart-tools'); return; }

    const tools = data.by_tool.map(d => d.tool);
    const counts = data.by_tool.map(d => d.count);

    renderChart('#chart-tools', {
        chart: { type: 'bar', height: Math.max(250, tools.length * 28) },
        series: [{ name: 'calls', data: counts }],
        colors: ['#00ffff'],
        plotOptions: {
            bar: { horizontal: true, borderRadius: 2, barHeight: '60%' },
        },
        xaxis: {
            categories: tools,
            labels: {
                style: { colors: '#00aa2a', fontSize: '11px' },
                formatter: val => formatNumber(val),
            },
        },
        yaxis: {
            labels: {
                style: { colors: '#00aa2a', fontSize: '11px' },
                maxWidth: 160,
                formatter: val => val,
            },
        },
        dataLabels: { enabled: false },
    });
}

// Cost Forecast — shows historical cost + projected trend
function renderCostForecast(data, period) {
    if (!data.over_time || data.over_time.length < 2) { clearChart('#chart-cost-forecast'); return; }

    const costs = data.over_time.map(d => Math.round(d.cost * 100) / 100);
    const dates = data.over_time.map(d => d.date);
    const n = costs.length;

    // Linear regression: y = slope * x + intercept
    const sumX = n * (n - 1) / 2;
    const sumY = costs.reduce((a, b) => a + b, 0);
    const sumXY = costs.reduce((s, y, i) => s + i * y, 0);
    const sumX2 = n * (n - 1) * (2 * n - 1) / 6;
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // How many forecast points to project
    const forecastSteps = Math.max(3, Math.ceil(n * 0.4));

    // Generate forecast dates (simple label: +1, +2, ...)
    const lastDate = dates[n - 1];
    const forecastDates = [];
    for (let i = 1; i <= forecastSteps; i++) forecastDates.push(lastDate + ' +' + i);

    const allDates = [...dates, ...forecastDates];

    // Historical series (null-padded for forecast range)
    const historicalData = [...costs, ...Array(forecastSteps).fill(null)];

    // Forecast series (null-padded for historical range, starts at last real value)
    const forecastData = [...Array(n - 1).fill(null)];
    for (let i = 0; i <= forecastSteps; i++) {
        const val = Math.max(0, slope * (n - 1 + i) + intercept);
        forecastData.push(Math.round(val * 100) / 100);
    }

    // Projected total for the title
    const dailyAvg = sumY / n;
    const periodDays = { hour: 1/24, day: 1, week: 7, month: 30, quarter: 90, half: 180, year: 365, all: n };
    const nextDays = periodDays[period] || n;
    const projected = Math.round(dailyAvg * nextDays * 100) / 100;

    const titleEl = document.querySelector('#chart-cost-forecast')?.closest('.chart-box')?.querySelector('.chart-title');
    if (titleEl) titleEl.textContent = `> Cost Forecast (next period ≈ $${projected.toFixed(2)})`;

    renderChart('#chart-cost-forecast', {
        chart: { type: 'line', height: 250 },
        series: [
            { name: 'actual', data: historicalData },
            { name: 'forecast', data: forecastData },
        ],
        colors: ['#ff3333', '#ffaa00'],
        xaxis: {
            categories: allDates,
            labels: { style: { colors: '#00aa2a', fontSize: '11px' }, rotate: -45, rotateAlways: false },
        },
        yaxis: {
            labels: {
                style: { colors: '#00aa2a', fontSize: '11px' },
                formatter: val => fmtCost(val),
            },
        },
        stroke: {
            width: [2, 2],
            curve: 'smooth',
            dashArray: [0, 5],
        },
        fill: { type: 'solid' },
        tooltip: {
            y: { formatter: val => val != null ? fmtCost(val) : '' },
        },
        dataLabels: { enabled: false },
        legend: { show: true },
        annotations: {
            xaxis: [{
                x: lastDate,
                borderColor: '#005a15',
                strokeDashArray: 3,
                label: {
                    text: 'now',
                    style: { color: '#00ff41', background: '#0f0f0f', fontSize: '11px', fontFamily: "'JetBrains Mono', monospace" },
                },
            }],
        },
    });
}

function fmtMinutes(val) {
    if (val < 1) return '<1m';
    if (val < 60) return Math.round(val) + 'm';
    const h = Math.floor(val / 60);
    const m = Math.round(val % 60);
    return m > 0 ? h + 'h ' + m + 'm' : h + 'h';
}

// Session Duration - avg per day area chart with individual session scatter
function renderDuration(data) {
    if (!data.sessions || !data.sessions.length) { clearChart('#chart-duration'); return; }

    const sessions = data.sessions
        .filter(s => s.duration_minutes != null && s.duration_minutes > 0 && s.start_time);

    if (!sessions.length) { clearChart('#chart-duration'); return; }

    // Group by day for averages
    const byDay = {};
    for (const s of sessions) {
        const day = s.start_time.slice(0, 10);
        if (!byDay[day]) byDay[day] = [];
        byDay[day].push(s.duration_minutes);
    }
    const days = Object.keys(byDay).sort();
    const avgData = days.map(d => {
        const vals = byDay[d];
        return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
    });

    // Scatter: individual sessions as points
    const scatterData = sessions.map(s => ({
        x: s.start_time.slice(0, 10),
        y: Math.round(s.duration_minutes),
    }));

    // Stats for title
    const allDurations = sessions.map(s => s.duration_minutes);
    const avg = Math.round(allDurations.reduce((a, b) => a + b, 0) / allDurations.length);
    const sorted = [...allDurations].sort((a, b) => a - b);
    const median = Math.round(sorted[Math.floor(sorted.length / 2)]);

    // Update title with stats
    const titleEl = document.querySelector('#chart-duration')?.closest('.chart-box')?.querySelector('.chart-title');
    if (titleEl) titleEl.textContent = `> Session Duration (avg ${fmtMinutes(avg)} \u00b7 median ${fmtMinutes(median)} \u00b7 ${sessions.length} sessions)`;

    renderChart('#chart-duration', {
        chart: { type: 'line', height: 280 },
        series: [
            { name: 'avg/day', type: 'area', data: avgData },
            { name: 'sessions', type: 'scatter', data: scatterData },
        ],
        colors: ['#aa55ff', 'rgba(170,85,255,0.4)'],
        xaxis: {
            categories: days,
            labels: { style: { colors: '#00aa2a', fontSize: '11px' } },
        },
        yaxis: {
            labels: {
                style: { colors: '#00aa2a', fontSize: '11px' },
                formatter: val => fmtMinutes(val),
            },
        },
        stroke: { width: [2, 0], curve: 'smooth' },
        fill: {
            type: ['gradient', 'solid'],
            gradient: { shadeIntensity: 1, opacityFrom: 0.3, opacityTo: 0.05, stops: [0, 100] },
        },
        markers: { size: [0, 3], strokeWidth: 0 },
        tooltip: {
            y: { formatter: val => fmtMinutes(val) },
        },
        dataLabels: { enabled: false },
        legend: { show: true },
    });
}

// --- INFRA: CPU & RAM Over Time ---
function renderCpuRam(data) {
    const series_data = data.cpu_ram_over_time || [];
    if (!series_data.length) { clearChart('#chart-cpu-ram'); return; }

    const timestamps = series_data.map(d => d.timestamp.slice(11, 19));

    renderChart('#chart-cpu-ram', {
        chart: { type: 'line', height: 280 },
        series: [
            { name: 'CPU %', data: series_data.map(d => d.cpu) },
            { name: 'RAM %', data: series_data.map(d => d.ram) },
        ],
        colors: ['#00ff41', '#00ffff'],
        xaxis: {
            categories: timestamps,
            labels: { style: { colors: '#00aa2a', fontSize: '11px' } },
        },
        yaxis: {
            min: 0,
            max: 100,
            labels: {
                style: { colors: '#00aa2a', fontSize: '11px' },
                formatter: val => val.toFixed(0) + '%',
            },
        },
        stroke: { width: 2, curve: 'smooth' },
        dataLabels: { enabled: false },
    });
}

// --- INFRA: Disk Usage gauge ---
function renderDiskChart(data) {
    const overview = data.overview;
    if (!overview) { clearChart('#chart-disk'); return; }

    renderChart('#chart-disk', {
        chart: { type: 'radialBar', height: 250 },
        series: [overview.disk_pct],
        labels: ['Disk'],
        colors: [overview.disk_pct >= 90 ? '#ff3333' : overview.disk_pct >= 70 ? '#ffaa00' : '#00ff41'],
        plotOptions: {
            radialBar: {
                hollow: { size: '55%' },
                track: { background: '#1a3a1a' },
                dataLabels: {
                    name: {
                        color: '#00aa2a',
                        fontSize: '12px',
                        fontFamily: "'JetBrains Mono', monospace",
                    },
                    value: {
                        color: '#00ff41',
                        fontSize: '20px',
                        fontFamily: "'JetBrains Mono', monospace",
                        formatter: val => val + '%',
                    },
                },
            },
        },
    });

    // Update title with details
    const titleEl = document.querySelector('#chart-disk')?.closest('.chart-box')?.querySelector('.chart-title');
    if (titleEl) titleEl.textContent = `> Disk Usage (${overview.disk_used_gb}GB / ${overview.disk_total_gb}GB)`;
}

// --- INFRA: Network I/O ---
function renderNetworkChart(data) {
    const net = data.network_over_time || [];
    if (net.length < 2) { clearChart('#chart-network'); return; }

    const timestamps = net.map(d => d.timestamp.slice(11, 19));

    renderChart('#chart-network', {
        chart: { type: 'area', height: 250 },
        series: [
            { name: 'sent (MB)', data: net.map(d => d.sent_mb) },
            { name: 'recv (MB)', data: net.map(d => d.recv_mb) },
        ],
        colors: ['#ff3333', '#00ffff'],
        xaxis: {
            categories: timestamps,
            labels: { style: { colors: '#00aa2a', fontSize: '11px' } },
        },
        yaxis: {
            labels: {
                style: { colors: '#00aa2a', fontSize: '11px' },
                formatter: val => val.toFixed(1) + ' MB',
            },
        },
        fill: {
            type: 'gradient',
            gradient: { shadeIntensity: 1, opacityFrom: 0.3, opacityTo: 0.05, stops: [0, 100] },
        },
        stroke: { width: 2, curve: 'smooth' },
        dataLabels: { enabled: false },
    });
}

// --- UPTIME: Response Time Over Time ---
function renderResponseTime(data) {
    const rt = data.response_time_over_time || [];
    if (!rt.length) { clearChart('#chart-response-time'); return; }

    const timestamps = rt.map(d => d.timestamp.slice(11, 19));

    renderChart('#chart-response-time', {
        chart: { type: 'area', height: 280 },
        series: [{ name: 'response time (ms)', data: rt.map(d => d.response_time) }],
        colors: ['#00ffff'],
        xaxis: {
            categories: timestamps,
            labels: { style: { colors: '#00aa2a', fontSize: '11px' } },
        },
        yaxis: {
            labels: {
                style: { colors: '#00aa2a', fontSize: '11px' },
                formatter: val => Math.round(val) + 'ms',
            },
        },
        fill: {
            type: 'gradient',
            gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.05, stops: [0, 100] },
        },
        stroke: { width: 2, curve: 'smooth' },
        dataLabels: { enabled: false },
    });
}

// --- UPTIME: Status Code Distribution ---
function renderStatusCodes(data) {
    const codes = data.status_codes || {};
    const entries = Object.entries(codes);
    if (!entries.length) { clearChart('#chart-status-codes'); return; }

    const labels = entries.map(([k]) => k === '0' ? 'timeout' : k);
    const values = entries.map(([, v]) => v);
    const total = values.reduce((a, b) => a + b, 0);

    const colorMap = {
        '200': '#00ff41', '201': '#00ff41', '204': '#00ff41',
        '301': '#00ffff', '302': '#00ffff', '304': '#00ffff',
        '400': '#ffaa00', '401': '#ffaa00', '403': '#ffaa00', '404': '#ffaa00',
        '500': '#ff3333', '502': '#ff3333', '503': '#ff3333',
        '0': '#ff3333',
    };
    const colors = entries.map(([k]) => colorMap[k] || '#aa55ff');

    const titleEl = document.querySelector('#chart-status-codes')?.closest('.chart-box')?.querySelector('.chart-title');
    if (titleEl) titleEl.textContent = `> Status Code Distribution (${total} checks)`;

    renderChart('#chart-status-codes', {
        chart: { type: 'donut', height: 250 },
        series: values,
        labels: labels,
        colors: colors,
        ...DONUT_DEFAULTS,
    });
}

// Tool Usage Over Time - stacked bar
function renderToolTimeline(data) {
    if (!data.over_time || !data.over_time.length) { clearChart('#chart-tools-timeline'); return; }

    const dates = data.over_time.map(d => d.date);
    const allKeys = Object.keys(data.over_time[0]).filter(k => k !== 'date' && k !== 'total');

    if (!allKeys.length) { clearChart('#chart-tools-timeline'); return; }

    const series = allKeys.map((tool, i) => ({
        name: tool,
        data: data.over_time.map(d => d[tool] || 0),
    }));

    renderChart('#chart-tools-timeline', {
        chart: { type: 'bar', height: 280, stacked: true },
        series: series,
        colors: COLORS.slice(0, allKeys.length),
        xaxis: {
            categories: dates,
            labels: { style: { colors: '#00aa2a', fontSize: '11px' } },
        },
        plotOptions: {
            bar: { borderRadius: 2, columnWidth: '60%' },
        },
        dataLabels: { enabled: false },
    });
}
