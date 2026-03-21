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
        style: { fontSize: '11px', fontFamily: "'JetBrains Mono', monospace" },
        x: { show: true },
    },
    legend: {
        fontSize: '11px',
        fontFamily: "'JetBrains Mono', monospace",
        labels: { colors: '#00aa2a' },
        markers: { radius: 2 },
    },
    xaxis: {
        labels: { style: { colors: '#005a15', fontSize: '10px' } },
        axisBorder: { color: '#1a3a1a' },
        axisTicks: { color: '#1a3a1a' },
    },
    yaxis: {
        labels: {
            style: { colors: '#005a15', fontSize: '10px' },
            formatter: val => formatNumber(val),
        },
    },
};

function formatNumber(n) {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
    return String(Math.round(n));
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

// Token Usage Over Time - stacked bar
function renderTimeline(data) {
    if (!data.over_time || !data.over_time.length) { clearChart('#chart-timeline'); return; }

    const dates = data.over_time.map(d => d.date);

    renderChart('#chart-timeline', {
        chart: { type: 'bar', height: 280, stacked: true },
        series: [
            { name: 'input', data: data.over_time.map(d => d.input) },
            { name: 'output', data: data.over_time.map(d => d.output) },
            { name: 'cache_read', data: data.over_time.map(d => d.cache_read) },
        ],
        colors: ['#00ff41', '#00ffff', '#ffaa00'],
        xaxis: {
            categories: dates,
            labels: { style: { colors: '#005a15', fontSize: '10px' } },
        },
        plotOptions: {
            bar: { borderRadius: 2, columnWidth: '60%' },
        },
        dataLabels: { enabled: false },
    });
}

// Usage by Model - horizontal bar
function renderByModel(data) {
    if (!data.by_model || !data.by_model.length) { clearChart('#chart-by-model'); return; }

    const models = data.by_model.map(d => d.model);

    renderChart('#chart-by-model', {
        chart: { type: 'bar', height: 280 },
        series: [
            { name: 'input', data: data.by_model.map(d => d.input) },
            { name: 'output', data: data.by_model.map(d => d.output) },
            { name: 'cache_read', data: data.by_model.map(d => d.cache_read) },
        ],
        colors: ['#00ff41', '#00ffff', '#ffaa00'],
        plotOptions: {
            bar: { horizontal: true, borderRadius: 2, barHeight: '60%' },
        },
        xaxis: {
            categories: models,
            labels: {
                style: { colors: '#005a15', fontSize: '10px' },
                formatter: val => formatNumber(val),
            },
        },
        yaxis: {
            labels: {
                style: { colors: '#00aa2a', fontSize: '10px' },
                maxWidth: 160,
            },
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
            labels: { style: { colors: '#005a15', fontSize: '10px' } },
        },
        yaxis: {
            min: 0,
            max: 100,
            labels: {
                style: { colors: '#005a15', fontSize: '10px' },
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
                        fontSize: '10px',
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

    const colorMap = {
        endTurn: '#00ff41', end_turn: '#00ff41', stop: '#00ff41',
        toolUse: '#00ffff', tool_use: '#00ffff',
        maxTokens: '#ffaa00', max_tokens: '#ffaa00',
    };
    const colors = labels.map(l => colorMap[l] || '#ff3333');

    renderChart('#chart-errors', {
        chart: { type: 'donut', height: 250 },
        series: values,
        labels: labels,
        colors: colors,
        plotOptions: {
            pie: {
                donut: {
                    size: '55%',
                    labels: {
                        show: true,
                        total: {
                            show: true,
                            label: 'total',
                            color: '#00aa2a',
                            fontSize: '12px',
                            fontFamily: "'JetBrains Mono', monospace",
                        },
                    },
                },
            },
        },
        dataLabels: {
            style: { fontSize: '10px', fontFamily: "'JetBrains Mono', monospace" },
        },
        stroke: { width: 1, colors: ['#0a0a0a'] },
    });
}

// Usage by Provider - donut
function renderByProvider(data) {
    if (!data.by_provider || !data.by_provider.length) { clearChart('#chart-by-provider'); return; }

    renderChart('#chart-by-provider', {
        chart: { type: 'donut', height: 250 },
        series: data.by_provider.map(d => d.total),
        labels: data.by_provider.map(d => d.provider),
        colors: COLORS.slice(0, data.by_provider.length),
        plotOptions: {
            pie: {
                donut: {
                    size: '55%',
                    labels: {
                        show: true,
                        total: {
                            show: true,
                            label: 'tokens',
                            color: '#00aa2a',
                            fontSize: '12px',
                            fontFamily: "'JetBrains Mono', monospace",
                        },
                    },
                },
            },
        },
        dataLabels: {
            style: { fontSize: '10px', fontFamily: "'JetBrains Mono', monospace" },
        },
        stroke: { width: 1, colors: ['#0a0a0a'] },
    });
}

// Usage by Agent - bar
function renderByAgent(data) {
    if (!data.by_agent || !data.by_agent.length) { clearChart('#chart-by-agent'); return; }

    renderChart('#chart-by-agent', {
        chart: { type: 'bar', height: 250 },
        series: [
            { name: 'input', data: data.by_agent.map(d => d.input) },
            { name: 'output', data: data.by_agent.map(d => d.output) },
            { name: 'cache_read', data: data.by_agent.map(d => d.cache_read) },
        ],
        colors: ['#00ff41', '#00ffff', '#ffaa00'],
        xaxis: {
            categories: data.by_agent.map(d => d.agent),
            labels: { style: { colors: '#005a15', fontSize: '10px' } },
        },
        plotOptions: {
            bar: { borderRadius: 2, columnWidth: '50%' },
        },
        dataLabels: { enabled: false },
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
                style: { colors: '#005a15', fontSize: '10px' },
                formatter: val => formatNumber(val),
            },
        },
        yaxis: {
            labels: {
                style: { colors: '#00aa2a', fontSize: '10px' },
                maxWidth: 160,
            },
        },
        dataLabels: { enabled: false },
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
            labels: { style: { colors: '#005a15', fontSize: '10px' } },
        },
        plotOptions: {
            bar: { borderRadius: 2, columnWidth: '60%' },
        },
        dataLabels: { enabled: false },
    });
}
