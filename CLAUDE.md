# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is Claw Usage Dashboard

Claw Usage Dashboard is a retro terminal-styled web dashboard for monitoring OpenClaw (AI gateway) usage. It reads session JSONL logs and presents token usage, cache rates, error rates, and cost breakdowns via interactive charts.

## Commands

```bash
# Run locally (requires DATA_DIR pointing to an OpenClaw data directory)
# Must run from the project root — frontend is served via StaticFiles(directory="frontend")
DATA_DIR=/path/to/.openclaw uvicorn backend.main:app --port 8090

# Build and run with Docker
docker compose up -d --build

# The container mounts /home/rostads/.openclaw as /data (read-only)
```

Requires Python 3.13. Dependencies are minimal: just `fastapi` and `uvicorn` (see `requirements.txt`).

There are no tests, linters, or build steps configured.

Note: the docker-compose service and `BaseCollector` docstring still reference "Molt", a legacy name for this project.

## Architecture

Data flows through a three-layer pipeline:

```
JSONL files (/data/agents/*/sessions/*.jsonl)
  → Collectors (parse & filter raw data)
    → Aggregators (group & compute metrics)
      → Routers (FastAPI endpoints at /api/*)
        → Frontend (ApexCharts + vanilla JS)
```

FastAPI serves both the JSON API (`/api/*`) and the static frontend (`/`) from a single process.

### Collector pattern

`backend/collectors/base.py` defines an abstract `BaseCollector` with `collect(**filters)` and `source_name()`. Currently only `SessionCollector` exists. To add a new data source: subclass `BaseCollector`, create matching aggregator functions, and wire up a new router.

`SessionCollector` is instantiated as a module-level singleton (`backend/collectors/sessions.py:collector`) imported directly by routers. It maintains an in-memory cache with a 30-second TTL (`CACHE_TTL_SECONDS` in `backend/config.py`).

Only JSONL entries with `type: "message"` that contain a `usage` object are parsed — all other entry types (system, tool results, etc.) are silently skipped.

### Aggregators

Pure functions in `backend/aggregators/` that take a list of normalized records and return grouped/computed results. Three modules: `usage.py` (by model/provider/agent/time), `cache.py` (hit rates), `errors.py` (stop reason analysis). The shared `_time_key()` helper in `usage.py` is also imported by `cache.py` and `errors.py` for consistent time bucketing.

### Routers

All routers share a common pattern: they import the singleton `collector`, call `_period_to_dates()` from `backend/routers/overview.py` to convert period strings into date filters, then delegate to aggregator functions. Five endpoints: `/api/overview`, `/api/usage`, `/api/cache`, `/api/errors`, `/api/sessions`.

### Session data model

Each parsed record from `SessionCollector` contains: agent, session_id, timestamp, provider, model, api, stop_reason, role, input/output/cache_read/cache_write tokens, total_tokens, and per-component cost breakdown (cost_input, cost_output, cost_cache_read, cost_cache_write, cost_total).

### API query parameters

All `/api/*` endpoints accept: `period` (day/week/month/all), `agent`, `model`, `provider`. Endpoints with time-series data also accept `granularity` (day/week/month).

### Frontend

Single-page HTML with no build step. Uses ApexCharts via CDN. Terminal/retro theme (green-on-black, JetBrains Mono, scanlines). Three JS files loaded in order: `api.js` (fetch wrapper), `charts.js` (ApexCharts configs and render functions), `app.js` (orchestrates data fetching, card updates, and chart rendering).

All charts go through `renderChart(id, options)` which destroys the previous instance (tracked in `chartInstances`) and deep-merges `CHART_DEFAULTS` (terminal theme colors, fonts) with the per-chart options. To add a new chart: call `renderChart('#my-chart', { ... })` — the theme is applied automatically.

### Error classification

Stop reasons in `NORMAL_STOP_REASONS` (`backend/aggregators/errors.py`) are considered non-errors: `endTurn`, `end_turn`, `stop`, `toolUse`, `tool_use`. Anything else counts as an error.

## Deployment

Runs as a Docker container on port 8090. The OpenClaw data directory is mounted read-only at `/data`. The `DATA_DIR` environment variable controls where the backend looks for data (defaults to `/data`).
