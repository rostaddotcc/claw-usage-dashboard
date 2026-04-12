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
    console.log('renderChart called:', id, 'options:', options);
    if (chartInstances[id]) {
        chartInstances[id].destroy();
    }
    const el = document.querySelector(id);
    console.log('Element found:', el);
    if (!el) {
        console.log('Element not found for:', id);
        return;
    }
    el.innerHTML = '';
    const merged = mergeDeep({}, CHART_DEFAULTS, options);
    console.log('Merged options:', merged);
    console.log('ApexCharts available:', typeof ApexCharts !== 'undefined');
    try {
        const chart = new ApexCharts(el, merged);
        chart.render();
        chartInstances[id] = chart;
        console.log('Chart rendered successfully for:', id);
    } catch (err) {
        console.error('Error rendering chart:', err);
    }
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

// By Provider/Agent - donut with breakdown toggle
let breakdownMode = 'provider';
let lastUsageData = null;

function renderByBreakdown(data) {
    lastUsageData = data;
    const useProvider = breakdownMode === 'provider';
    const sourceData = useProvider ? data.by_provider : data.by_agent;
    const labelKey = useProvider ? 'provider' : 'agent';

    if (!sourceData || !sourceData.length) { clearChart('#chart-by-breakdown'); return; }

    const values = sourceData.map(d => d.total);
    const labels = sourceData.map(d => d[labelKey]);
    const total = values.reduce((a, b) => a + b, 0);
    const totalStr = formatNumber(total) + ' tokens';

    const titleEl = document.querySelector('#chart-by-breakdown')?.closest('.chart-box')?.querySelector('.chart-title');
    if (titleEl) {
        const firstText = titleEl.firstChild;
        if (firstText && firstText.nodeType === Node.TEXT_NODE) {
            firstText.textContent = `> By ${useProvider ? 'Provider' : 'Agent'} (${totalStr}) `;
        }
    }

    renderChart('#chart-by-breakdown', {
        chart: { type: 'donut', height: 250 },
        series: values,
        labels: labels,
        colors: COLORS.slice(0, labels.length),
        ...DONUT_DEFAULTS,
        tooltip: {
            y: { formatter: val => val.toLocaleString('sv-SE') + ' tokens' },
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

// Model Cost Efficiency - scatter plot (cost per token vs usage)
function renderModelEfficiency(data) {
    if (!data.by_model || !data.by_model.length) { clearChart('#chart-model-efficiency'); return; }

    const seriesData = data.by_model.map(m => {
        const costPerToken = m.total > 0 ? (m.cost / m.total) * 1000000 : 0;
        return { x: m.model, y: costPerToken, z: m.total };
    });

    renderChart('#chart-model-efficiency', {
        chart: { type: 'bubble', height: 280 },
        series: [{
            name: 'Model',
            data: seriesData.map((d, i) => ({ x: d.x, y: parseFloat(d.y.toFixed(4)), z: d.z })),
        }],
        colors: ['#00ffff'],
        xaxis: {
            labels: { style: { colors: '#00aa2a', fontSize: '10px', rotate: -45 }, trim: true },
        },
        yaxis: {
            labels: {
                style: { colors: '#00aa2a', fontSize: '11px' },
                formatter: val => '$' + val.toFixed(2) + '/1M',
            },
            title: { text: 'Cost per 1M tokens', style: { color: '#00aa2a', fontSize: '11px' } },
        },
        tooltip: {
            shared: false,
            custom: ({ dataPointIndex }) => {
                const m = data.by_model[dataPointIndex];
                return `<div class="apexcharts-tooltip-text" style="font-family:'JetBrains Mono',monospace;font-size:11px">
                    <strong>${m.model}</strong><br/>
                    Tokens: ${m.total.toLocaleString('sv-SE')}<br/>
                    Cost: $${m.cost.toFixed(2)}<br/>
                    $/1M: ${(m.cost / m.total * 1000000).toFixed(2)}
                </div>`;
            },
        },
        dataLabels: { enabled: false },
        markers: { size: 6 },
    });
}

// Token Velocity - tokens per minute over time
function renderTokenVelocity(data) {
    if (!data.over_time || !data.over_time.length) { clearChart('#chart-token-velocity'); return; }

    const velocityData = data.over_time.map((d, i, arr) => {
        const tokens = (d.input || 0) + (d.output || 0) + (d.cache_read || 0);
        const minutesPerBucket = arr.length > 24 ? 1440 : arr.length > 7 ? 60 : 1;
        return { date: d.date, velocity: Math.round(tokens / minutesPerBucket) };
    });

    const dates = velocityData.map(d => d.date);
    const velocities = velocityData.map(d => d.velocity);
    const avgVelocity = Math.round(velocities.reduce((a, b) => a + b, 0) / velocities.length);

    const titleEl = document.querySelector('#chart-token-velocity')?.closest('.chart-box')?.querySelector('.chart-title');
    if (titleEl) titleEl.textContent = `> Token Velocity (avg ${formatNumber(avgVelocity)} tok/min)`;

    renderChart('#chart-token-velocity', {
        chart: { type: 'area', height: 280 },
        series: [{ name: 'tokens/min', data: velocities }],
        colors: ['#00ff41'],
        xaxis: { categories: dates, labels: { style: { colors: '#00aa2a', fontSize: '11px' } } },
        yaxis: {
            labels: { style: { colors: '#00aa2a', fontSize: '11px' }, formatter: val => formatNumber(val) },
            title: { text: 'tokens/min', style: { color: '#00aa2a', fontSize: '11px' } },
        },
        fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.05, stops: [0, 100] } },
        stroke: { width: 2, curve: 'smooth' },
        dataLabels: { enabled: false },
        annotations: {
            yaxis: [{
                y: avgVelocity,
                borderColor: '#005a15',
                strokeDashArray: 3,
                label: { text: `avg ${formatNumber(avgVelocity)}`, style: { color: '#00ff41', background: '#0f0f0f', fontSize: '11px' } },
            }],
        },
    });
}
