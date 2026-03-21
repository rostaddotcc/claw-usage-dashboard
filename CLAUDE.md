# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is Claw Usage Dashboard

Claw Usage Dashboard is a retro terminal-styled web dashboard for monitoring OpenClaw (AI gateway) usage. It reads session JSONL logs and presents token usage, cache rates, error rates, cost breakdowns, and tool usage via interactive charts.

## Commands

```bash
# Install dependencies
pip install -r requirements.txt

# Run locally (requires DATA_DIR pointing to an OpenClaw data directory)
# Must run from the project root — frontend is served via StaticFiles(directory="frontend")
DATA_DIR=/path/to/.openclaw uvicorn backend.main:app --port 8090

# Run locally with auto-reload for development
DATA_DIR=/path/to/.openclaw uvicorn backend.main:app --port 8090 --reload

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
JSONL files (/data/agents/*/sessions/*.jsonl*, /data/cron/runs/*.jsonl*)
  → Collectors (parse & filter raw data)
    → Aggregators (group & compute metrics)
      → Routers (FastAPI endpoints at /api/*)
        → Frontend (ApexCharts + vanilla JS)
```

FastAPI serves both the JSON API (`/api/*`) and the static frontend (`/`) from a single process. A middleware sets `no-cache` headers on `/js/` and `/css/` files to prevent stale browser caches after deploys.

### Collector pattern

`backend/collectors/base.py` defines an abstract `BaseCollector` with `collect(**filters)` and `source_name()`. Currently only `SessionCollector` exists. To add a new data source: subclass `BaseCollector`, create matching aggregator functions, and wire up a new router.

`SessionCollector` is instantiated as a module-level singleton (`backend/collectors/sessions.py:collector`) imported directly by routers. It maintains an in-memory cache with a 30-second TTL (`CACHE_TTL_SECONDS` in `backend/config.py`).

Only JSONL entries with `type: "message"` that contain a `usage` object are parsed — all other entry types (system, tool results, etc.) are silently skipped. Tool calls are extracted from the `content` array of these entries (blocks with `type: "toolCall"` or `type: "tool_use"`).

Cron runs (`/data/cron/runs/*.jsonl*`) are parsed separately via `_parse_cron_line()`. Cron entries use a different format: usage may be at the top level (not nested in `message`), and field names use snake_case (`input_tokens`, `output_tokens`) instead of camelCase. Cron records are assigned `agent: "cron"`.

### OpenClaw JSONL format

OpenClaw stores session data at `~/.openclaw/agents/<agentId>/sessions/<sessionId>.jsonl`. When a session is reset with `/new`, the file is renamed to `.jsonl.reset.<timestamp>` — these files still contain valid data. Deleted sessions become `.jsonl.deleted.<timestamp>`. The glob pattern `*.jsonl*` catches all variants.

Cron jobs log separately to `~/.openclaw/cron/runs/*.jsonl`.

Each line is a JSON object. The entries the dashboard parses have this structure:

```json
{
  "type": "message",
  "id": "...",
  "parentId": "...",
  "timestamp": "2026-03-21T14:38:00Z",
  "message": {
    "role": "assistant",
    "content": [
      {"type": "thinking", "...": "..."},
      {"type": "toolCall", "id": "toolu_...", "name": "exec", "input": {"..."}}
    ],
    "api": "messages",
    "provider": "anthropic",
    "model": "claude-opus-4-6",
    "usage": {"input": 4, "output": 300, "cacheRead": 71838, "totalTokens": 144131, "cost": {"input": 0.0, "output": 0.01, "cacheRead": 0.10, "total": 0.11}},
    "stopReason": "toolUse",
    "timestamp": "..."
  }
}
```

Key format details:
- Tool calls use `"type": "toolCall"` (not the Anthropic API's `"tool_use"`)
- Usage fields use short camelCase: `input`, `output`, `cacheRead`, `cacheWrite`, `totalTokens` (not `input_tokens` etc.)
- Stop reasons use camelCase: `stopReason: "toolUse"` (not `stop_reason: "tool_use"`)
- Cost is nested: `usage.cost.{input, output, cacheRead, cacheWrite, total}`

### Aggregators

Pure functions in `backend/aggregators/` that take a list of normalized records and return grouped/computed results. Four modules: `usage.py` (by model/provider/agent/time), `cache.py` (hit rates), `errors.py` (stop reason analysis), `tools.py` (tool call counts and trends). The shared `_time_key()` helper in `usage.py` is also imported by `cache.py`, `errors.py`, and `tools.py` for consistent time bucketing.

### Routers

All routers share a common pattern: they import the singleton `collector`, call `_period_to_dates()` from `backend/routers/overview.py` to convert period strings into date filters, then delegate to aggregator functions. Six endpoints: `/api/overview`, `/api/usage`, `/api/cache`, `/api/errors`, `/api/sessions`, `/api/tools`.

Debug endpoints exist at `/api/tools/debug` and `/api/tools/raw` for diagnosing tool parsing issues.

### Session data model

Each parsed record from `SessionCollector` contains: agent, session_id, timestamp, provider, model, api, stop_reason, role, input/output/cache_read/cache_write tokens, total_tokens, per-component cost breakdown (cost_input, cost_output, cost_cache_read, cost_cache_write, cost_total), and tools (list of tool names called in that message).

The `/api/sessions` endpoint aggregates records per session and computes `duration_minutes` from the time span between first and last message.

### API query parameters

All `/api/*` endpoints accept: `period` (hour/day/week/month/quarter/half/year/all), `agent`, `model`, `provider`. Endpoints with time-series data also accept `granularity` (minute/hour/day/week/month). The frontend auto-selects granularity based on period (e.g. hour→minute, day→hour, week/month→day, quarter/half→week, year→month, all→week).

### Frontend

Single-page HTML with no build step (`lang="sv"`). Uses ApexCharts via CDN. Terminal/retro theme (green-on-black, JetBrains Mono, scanlines). Date/time formatting uses `sv-SE` locale. Three JS files loaded in order: `api.js` (fetch wrapper), `charts.js` (ApexCharts configs and render functions), `app.js` (orchestrates data fetching, card updates, and chart rendering).

The header contains a model filter dropdown (populated from usage data) and period buttons (1H/1D/7D/30D/3M/6M/12M/ALL). Both filters trigger a full data refresh. The sessions table is collapsible (closed by default, toggled via CSS class `open` on the `.collapsible` section).

All charts go through `renderChart(id, options)` which destroys the previous instance (tracked in `chartInstances`) and deep-merges `CHART_DEFAULTS` (terminal theme colors, fonts) with the per-chart options. To add a new chart: call `renderChart('#my-chart', { ... })` — the theme is applied automatically. When data is empty, `clearChart(id)` destroys the chart and shows a "no data" message.

Script tags and the CSS link include `?v=N` cache-busting parameters — bump these when deploying frontend changes.

### Error classification

Stop reasons in `NORMAL_STOP_REASONS` (`backend/aggregators/errors.py`) are considered non-errors: `endTurn`, `end_turn`, `stop`, `toolUse`, `tool_use`. Anything else counts as an error.

## Deployment

Runs as a Docker container on port 8090. The OpenClaw data directory is mounted read-only at `/data`. The `DATA_DIR` environment variable controls where the backend looks for data (defaults to `/data`).
