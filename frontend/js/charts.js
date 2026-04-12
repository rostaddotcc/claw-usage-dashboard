const COLORS = ['#d4884a', '#d4a03a', '#c45c6a', '#8b6aae', '#5a8fbf', '#5a9e6f', '#e07a5f', '#c97d5a'];

const CHART_DEFAULTS = {
    chart: {
        background: 'transparent',
        foreColor: '#7a6555',
        fontFamily: "'Inter', -apple-system, sans-serif",
        toolbar: { show: false },
        animations: {
            enabled: true,
            easing: 'easeinout',
            speed: 600,
        },
    },
    grid: {
        borderColor: '#e6dfd6',
        strokeDashArray: 3,
    },
    tooltip: {
        theme: 'light',
        shared: true,
        intersect: false,
        style: { fontSize: '12px', fontFamily: "'Inter', sans-serif" },
        x: { show: true },
    },
    legend: {
        fontSize: '12px',
        fontFamily: "'Inter', sans-serif",
        labels: { colors: '#7a6555' },
        markers: { radius: 3 },
    },
    xaxis: {
        labels: { style: { colors: '#7a6555', fontSize: '11px' } },
        axisBorder: { color: '#e6dfd6' },
        axisTicks: { color: '#e6dfd6' },
    },
    yaxis: {
        labels: {
            style: { colors: '#7a6555', fontSize: '11px' },
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

const chartInstances = {};

function clearChart(id) {
    if (chartInstances[id]) {
        chartInstances[id].destroy();
        delete chartInstances[id];
    }
    const el = document.querySelector(id);
    if (el) el.innerHTML = '<div class="no-data">No data</div>';
}

function renderChart(id, options) {
    if (chartInstances[id]) {
        chartInstances[id].destroy();
    }
    const el = document.querySelector(id);
    if (!el) return;
    el.innerHTML = '';
    const merged = mergeDeep({}, CHART_DEFAULTS, options);
    try {
        const chart = new ApexCharts(el, merged);
        chart.render();
        chartInstances[id] = chart;
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

function groupTopN(items, n, labelKey, valueKey) {
    if (items.length <= n) return items;
    const top = items.slice(0, n);
    const rest = items.slice(n);
    const other = { [labelKey]: 'other' };
    for (const key of Object.keys(rest[0])) {
        if (key === labelKey) continue;
        if (typeof rest[0][key] === 'number') {
            other[key] = rest.reduce((s, r) => s + (r[key] || 0), 0);
        }
    }
    return [...top, other];
}

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
        style: { fontSize: '11px', fontFamily: "'Inter', sans-serif" },
    },
    stroke: { width: 2, colors: ['#ffffff'] },
};

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
        colors: ['#e6dfd6', '#d4884a', '#d4a03a', '#5a8fbf'],
        xaxis: {
            categories: dates,
            labels: { style: { colors: '#7a6555', fontSize: '11px' } },
        },
        yaxis: [
            {
                title: { text: 'tokens', style: { color: '#7a6555', fontSize: '11px' } },
                labels: {
                    style: { colors: '#7a6555', fontSize: '11px' },
                    formatter: val => formatNumber(val),
                },
            },
            {
                opposite: true,
                title: { text: 'cache_read', style: { color: '#5a8fbf', fontSize: '11px' } },
                labels: {
                    style: { colors: '#5a8fbf', fontSize: '11px' },
                    formatter: val => formatNumber(val),
                },
            },
        ],
        plotOptions: {
            bar: { borderRadius: 4, columnWidth: '70%' },
        },
        stroke: { width: [0, 0, 0, 2], curve: 'smooth' },
        tooltip: {
            y: { formatter: val => val.toLocaleString('sv-SE') + ' tokens' },
        },
        dataLabels: { enabled: false },
    });
}

function renderCostTimeline(data) {
    if (!data.over_time || !data.over_time.length) { clearChart('#chart-cost-timeline'); return; }

    const dates = data.over_time.map(d => d.date);

    renderChart('#chart-cost-timeline', {
        chart: { type: 'area', height: 280 },
        series: [{ name: 'cost', data: data.over_time.map(d => Math.round(d.cost * 100) / 100) }],
        colors: ['#c45c6a'],
        xaxis: {
            categories: dates,
            labels: { style: { colors: '#7a6555', fontSize: '11px' } },
        },
        yaxis: {
            labels: {
                style: { colors: '#7a6555', fontSize: '11px' },
                formatter: val => fmtCost(val),
            },
        },
        fill: {
            type: 'gradient',
            gradient: { shadeIntensity: 1, opacityFrom: 0.3, opacityTo: 0.05, stops: [0, 100] },
        },
        stroke: { width: 2, curve: 'smooth' },
        tooltip: {
            y: { formatter: val => fmtCost(val) },
        },
        dataLabels: { enabled: false },
    });
}

function renderCostByModel(data) {
    if (!data.by_model || !data.by_model.length) { clearChart('#chart-cost-by-model'); return; }

    const sorted = [...data.by_model].sort((a, b) => b.cost - a.cost);
    const grouped = groupTopN(sorted, 8, 'model', 'cost');
    const models = grouped.map(d => d.model);
    const costs = grouped.map(d => Math.round(d.cost * 100) / 100);

    renderChart('#chart-cost-by-model', {
        chart: { type: 'bar', height: Math.max(250, models.length * 32) },
        series: [{ name: 'cost', data: costs }],
        colors: ['#c45c6a'],
        plotOptions: {
            bar: { horizontal: true, borderRadius: 4, barHeight: '60%' },
        },
        xaxis: {
            categories: models,
            labels: {
                style: { colors: '#7a6555', fontSize: '11px' },
                formatter: val => fmtCost(val),
            },
        },
        yaxis: {
            labels: {
                style: { colors: '#7a6555', fontSize: '11px' },
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
        colors: ['#d4884a', '#d4a03a', '#5a8fbf'],
        plotOptions: {
            bar: { horizontal: true, borderRadius: 4, barHeight: '60%' },
        },
        xaxis: {
            categories: models,
            labels: {
                style: { colors: '#7a6555', fontSize: '11px' },
                formatter: val => formatNumber(val),
            },
        },
        yaxis: {
            labels: {
                style: { colors: '#7a6555', fontSize: '11px' },
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

function renderCache(data) {
    if (!data.over_time || !data.over_time.length) { clearChart('#chart-cache'); return; }

    renderChart('#chart-cache', {
        chart: { type: 'area', height: 250 },
        series: [{ name: 'cache rate %', data: data.over_time.map(d => d.rate) }],
        colors: ['#5a9e6f'],
        xaxis: {
            categories: data.over_time.map(d => d.date),
            labels: { style: { colors: '#7a6555', fontSize: '11px' } },
        },
        yaxis: {
            min: 0,
            max: 100,
            labels: {
                style: { colors: '#7a6555', fontSize: '11px' },
                formatter: val => val.toFixed(0) + '%',
            },
        },
        fill: {
            type: 'gradient',
            gradient: {
                shadeIntensity: 1,
                opacityFrom: 0.3,
                opacityTo: 0.05,
                stops: [0, 100],
            },
        },
        stroke: { width: 2 },
        dataLabels: { enabled: false },
        annotations: {
            yaxis: [{
                y: data.overall_rate,
                borderColor: '#5a9e6f',
                strokeDashArray: 4,
                label: {
                    text: `avg ${data.overall_rate}%`,
                    style: {
                        color: '#5a9e6f',
                        background: '#ffffff',
                        fontSize: '11px',
                        fontFamily: "'Inter', sans-serif",
                    },
                },
            }],
        },
    });
}

function renderErrors(data) {
    if (!data.stop_reasons || !Object.keys(data.stop_reasons).length) { clearChart('#chart-errors'); return; }

    const labels = Object.keys(data.stop_reasons);
    const values = Object.values(data.stop_reasons);
    const total = values.reduce((a, b) => a + b, 0);

    const colorMap = {
        endTurn: '#5a9e6f', end_turn: '#5a9e6f', stop: '#5a9e6f',
        toolUse: '#5a8fbf', tool_use: '#5a8fbf',
        maxTokens: '#d4a03a', max_tokens: '#d4a03a',
    };
    const colors = labels.map(l => colorMap[l] || '#c45c6a');

    const titleEl = document.querySelector('#chart-errors')?.closest('.chart-box')?.querySelector('.chart-title');
    if (titleEl) titleEl.textContent = `Stop reasons (${formatNumber(total)} total)`;

    renderChart('#chart-errors', {
        chart: { type: 'donut', height: 250 },
        series: values,
        labels: labels,
        colors: colors,
        ...DONUT_DEFAULTS,
    });
}

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
            firstText.textContent = `By ${useProvider ? 'provider' : 'agent'} (${totalStr}) `;
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

function renderToolCounts(data) {
    if (!data.by_tool || !data.by_tool.length) { clearChart('#chart-tools'); return; }

    const tools = data.by_tool.map(d => d.tool);
    const counts = data.by_tool.map(d => d.count);

    renderChart('#chart-tools', {
        chart: { type: 'bar', height: Math.max(250, tools.length * 28) },
        series: [{ name: 'calls', data: counts }],
        colors: ['#d4884a'],
        plotOptions: {
            bar: { horizontal: true, borderRadius: 4, barHeight: '60%' },
        },
        xaxis: {
            categories: tools,
            labels: {
                style: { colors: '#7a6555', fontSize: '11px' },
                formatter: val => formatNumber(val),
            },
        },
        yaxis: {
            labels: {
                style: { colors: '#7a6555', fontSize: '11px' },
                maxWidth: 160,
                formatter: val => val,
            },
        },
        dataLabels: { enabled: false },
    });
}

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
        colors: ['#d4884a', '#5a8fbf'],
        xaxis: {
            categories: timestamps,
            labels: { style: { colors: '#7a6555', fontSize: '11px' } },
        },
        yaxis: {
            min: 0,
            max: 100,
            labels: {
                style: { colors: '#7a6555', fontSize: '11px' },
                formatter: val => val.toFixed(0) + '%',
            },
        },
        stroke: { width: 2, curve: 'smooth' },
        dataLabels: { enabled: false },
    });
}

function renderDiskChart(data) {
    const overview = data.overview;
    if (!overview) { clearChart('#chart-disk'); return; }

    renderChart('#chart-disk', {
        chart: { type: 'radialBar', height: 250 },
        series: [overview.disk_pct],
        labels: ['Disk'],
        colors: [overview.disk_pct >= 90 ? '#c45c6a' : overview.disk_pct >= 70 ? '#d4a03a' : '#5a9e6f'],
        plotOptions: {
            radialBar: {
                hollow: { size: '55%' },
                track: { background: '#e6dfd6' },
                dataLabels: {
                    name: {
                        color: '#7a6555',
                        fontSize: '12px',
                        fontFamily: "'Inter', sans-serif",
                    },
                    value: {
                        color: '#3d2e22',
                        fontSize: '20px',
                        fontFamily: "'Inter', sans-serif",
                        fontWeight: 700,
                        formatter: val => val + '%',
                    },
                },
            },
        },
    });

    const titleEl = document.querySelector('#chart-disk')?.closest('.chart-box')?.querySelector('.chart-title');
    if (titleEl) titleEl.textContent = `Disk usage (${overview.disk_used_gb}GB / ${overview.disk_total_gb}GB)`;
}

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
        colors: ['#c45c6a', '#5a8fbf'],
        xaxis: {
            categories: timestamps,
            labels: { style: { colors: '#7a6555', fontSize: '11px' } },
        },
        yaxis: {
            labels: {
                style: { colors: '#7a6555', fontSize: '11px' },
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
        colors: ['#5a8fbf'],
        xaxis: {
            labels: { style: { colors: '#7a6555', fontSize: '10px', rotate: -45 }, trim: true },
        },
        yaxis: {
            labels: {
                style: { colors: '#7a6555', fontSize: '11px' },
                formatter: val => '$' + val.toFixed(2) + '/1M',
            },
            title: { text: 'Cost per 1M tokens', style: { color: '#7a6555', fontSize: '11px' } },
        },
        tooltip: {
            shared: false,
            custom: ({ dataPointIndex }) => {
                const m = data.by_model[dataPointIndex];
                return `<div class="apexcharts-tooltip-text" style="font-family:'Inter',sans-serif;font-size:11px">
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

function renderTokenVelocity(data, granularity) {
    if (!data.over_time || !data.over_time.length) { clearChart('#chart-token-velocity'); return; }

    const bucketLabels = { minute: 'tok/min', hour: 'tok/h', day: 'tok/day', week: 'tok/week', month: 'tok/mo' };
    const unit = bucketLabels[granularity] || 'tok/day';

    const velocityData = data.over_time.map(d => {
        const tokens = (d.input || 0) + (d.output || 0) + (d.cache_read || 0);
        return { date: d.date, velocity: Math.round(tokens) };
    });

    const dates = velocityData.map(d => d.date);
    const velocities = velocityData.map(d => d.velocity);
    const avgVelocity = Math.round(velocities.reduce((a, b) => a + b, 0) / velocities.length);

    const titleEl = document.querySelector('#chart-token-velocity')?.closest('.chart-box')?.querySelector('.chart-title');
    if (titleEl) titleEl.textContent = `Token velocity (avg ${formatNumber(avgVelocity)} ${unit})`;

    renderChart('#chart-token-velocity', {
        chart: { type: 'area', height: 280 },
        series: [{ name: unit, data: velocities }],
        colors: ['#d4884a'],
        xaxis: { categories: dates, labels: { style: { colors: '#7a6555', fontSize: '11px' } } },
        yaxis: {
            labels: { style: { colors: '#7a6555', fontSize: '11px' }, formatter: val => formatNumber(val) },
            title: { text: unit, style: { color: '#7a6555', fontSize: '11px' } },
        },
        fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.3, opacityTo: 0.05, stops: [0, 100] } },
        stroke: { width: 2, curve: 'smooth' },
        dataLabels: { enabled: false },
        annotations: {
            yaxis: [{
                y: avgVelocity,
                borderColor: '#d4884a',
                strokeDashArray: 3,
                label: { text: `avg ${formatNumber(avgVelocity)}`, style: { color: '#d4884a', background: '#ffffff', fontSize: '11px' } },
            }],
        },
    });
}
