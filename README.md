# Claw Usage Dashboard

Retro terminal-styled web dashboard for monitoring [OpenClaw](https://github.com/openclaw) AI gateway usage. Reads session JSONL logs and presents token usage, cache rates, error rates, cost breakdowns, and tool usage via interactive charts.

![Python](https://img.shields.io/badge/python-3.13-blue)
![FastAPI](https://img.shields.io/badge/fastapi-0.115-green)

## Live Demo

[molt.rostad.cc](https://molt.rostad.cc)

## Features

- **Token usage tracking** — input, output, and cache tokens over time, by model, provider, and agent
- **Cost breakdown** — per-session and aggregate cost tracking with cost-over-time charts
- **Cost forecast** — linear regression-based cost projection for the next period
- **Tool usage tracking** — tracks tool calls (exec, web_search, read, web_fetch, edit, write, etc.) with counts and time-series charts
- **Cache hit rate monitoring** — overall and per-model cache performance with trend charts
- **Error analysis** — sortable stop reason distribution and error-by-model tables, error rate over time
- **Session browser** — collapsible, sortable table with model, tokens, cost, duration, and timestamps; click-to-copy session IDs
- **Session duration** — per-session duration chart with daily averages and scatter points
- **Filtering** — period (1H/1D/7D/30D/3M/6M/12M/ALL), model, and agent dropdowns; filters persist in URL params
- **Auto-refresh** — configurable interval (30s / 60s / 5m) for live monitoring
- **Data export** — download current view as CSV, Markdown, or Excel (.xlsx)
- **Zero dependencies frontend** — vanilla JS with ApexCharts and SheetJS via CDN, no build step

## Quick Start

### Docker (recommended)

```bash
docker compose up -d --build
```

The dashboard is available at `http://localhost:8090`.

By default, `docker-compose.yml` mounts `~/.openclaw` as the data directory. Edit the volume path if your OpenClaw data is elsewhere:

```yaml
volumes:
  - /path/to/your/.openclaw:/data:ro
```

### Local

```bash
pip install -r requirements.txt
DATA_DIR=/path/to/.openclaw uvicorn backend.main:app --port 8090
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `DATA_DIR` | `/data` | Path to the OpenClaw data directory |

The app expects JSONL session files at `$DATA_DIR/agents/*/sessions/*.jsonl*` (includes `.jsonl.reset.*` and `.jsonl.deleted.*`). Cron runs are read from `$DATA_DIR/cron/runs/*.jsonl*`.

## Architecture

```
JSONL files (/data/agents/*/sessions/*.jsonl)
  → Collectors (parse & filter raw data)
    → Aggregators (group & compute metrics)
      → Routers (FastAPI endpoints at /api/*)
        → Frontend (ApexCharts + vanilla JS)
```

FastAPI serves both the JSON API and the static frontend from a single process.

### API Endpoints

All endpoints accept query parameters: `period` (hour/day/week/month/quarter/half/year/all), `agent`, `model`, `provider`.

| Endpoint | Description |
|----------|-------------|
| `GET /api/overview` | Summary cards — total tokens, messages, sessions, cache rate, error rate, cost |
| `GET /api/usage` | Token usage grouped by model, provider, agent, and over time |
| `GET /api/cache` | Cache hit rates overall, by model, and over time |
| `GET /api/errors` | Error rate, stop reason distribution, and errors over time |
| `GET /api/sessions` | Per-session breakdown with models, tokens, cost, duration, and timestamps |
| `GET /api/tools` | Tool usage counts, over time, and by agent |

Endpoints with time-series data also accept `granularity` (minute/hour/day/week/month). The frontend auto-selects granularity based on period (hour→minute, day→hour, week/month→day, all→week).

## License

<!-- Add license here -->
