# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is Claw Usage Dashboard

Claw Usage Dashboard is a retro terminal-styled web dashboard for monitoring OpenClaw (AI gateway) usage. It reads session JSONL logs and presents token usage, cache rates, error rates, cost breakdowns, and tool usage via interactive charts. It also monitors server health (CPU, RAM, disk, network), gateway uptime, and cron job status.

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

Requires Python 3.13. Dependencies: `fastapi`, `uvicorn`, `psutil` (see `requirements.txt`).

There are no tests, linters, or build steps configured.

Note: the docker-compose service and `BaseCollector` docstring still reference "Molt", a legacy name for this project.

**Cloudflare warning**: If the site is behind Cloudflare with Rocket Loader enabled, it rewrites all `<script>` tags and inline `onclick` handlers, which can break JS execution. The site works best with Rocket Loader disabled or Cloudflare proxy off.

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

### Collectors

`backend/collectors/base.py` defines an abstract `BaseCollector` with `collect(**filters)` and `source_name()`. Three collectors exist:

- **`SessionCollector`** (`sessions.py`) — Parses JSONL session files. Module-level singleton (`collector`). In-memory cache with 30-second TTL (`CACHE_TTL_SECONDS`). Only parses entries with `type: "message"` containing a `usage` object. Cron runs use `_parse_cron_line()` with a different format (snake_case fields, top-level usage). Cron records get `agent: "cron"`.

- **`SystemCollector`** (`system.py`) — Reads CPU, RAM, disk, network via `psutil`. Module-level singleton (`system_collector`). 10-second cache TTL (`SYSTEM_CACHE_TTL_SECONDS`). Maintains an in-memory deque of snapshots (max 1440 entries, ~24h at 1/min). History resets on process restart.

- **`UptimeCollector`** (`uptime.py`) — Performs periodic HTTP health checks against `UPTIME_TARGET_URL`. Module-level singleton (`uptime_collector`). Runs as an asyncio background task started via the FastAPI `lifespan` handler in `main.py`. Stores check results in an in-memory deque (max 1440). Uses stdlib `urllib.request` (no extra dependencies).

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

Pure functions in `backend/aggregators/` that take a list of normalized records and return grouped/computed results. Six modules:
- `usage.py` (by model/provider/agent/time) — contains shared `_time_key()` helper imported by other aggregators
- `cache.py` (hit rates)
- `errors.py` (stop reason analysis) — defines `NORMAL_STOP_REASONS`
- `tools.py` (tool call counts and trends)
- `system.py` (CPU/RAM overview, time series, network deltas)
- `uptime.py` (uptime summary, response time series, status code distribution)
- `cron.py` (groups cron records by session_id into per-job summaries, computes success rate)

### Routers

Session-based routers share a common pattern: import the singleton `collector`, call `_period_to_dates()` from `backend/routers/overview.py` to convert period strings into date filters, then delegate to aggregator functions.

Nine endpoints:
- `/api/overview`, `/api/usage`, `/api/cache`, `/api/errors`, `/api/sessions`, `/api/tools` — session-based, accept period/agent/model/provider filters
- `/api/system` — real-time server metrics (no filters, returns current + history)
- `/api/uptime` — gateway health check results (no filters)
- `/api/cron` — cron job summaries (accepts period filter, forces `agent="cron"`)

Debug endpoints exist at `/api/tools/debug` and `/api/tools/raw` for diagnosing tool parsing issues.

### Session data model

Each parsed record from `SessionCollector` contains: agent, session_id, timestamp, provider, model, api, stop_reason, role, input/output/cache_read/cache_write tokens, total_tokens, per-component cost breakdown (cost_input, cost_output, cost_cache_read, cost_cache_write, cost_total), and tools (list of tool names called in that message).

The `/api/sessions` endpoint aggregates records per session and computes `duration_minutes` from the time span between first and last message.

### API query parameters

Session-based `/api/*` endpoints accept: `period` (hour/day/week/month/quarter/half/year/all), `agent`, `model`, `provider`. Endpoints with time-series data also accept `granularity` (minute/hour/day/week/month). The frontend auto-selects granularity based on period (e.g. hour→minute, day→hour, week/month→day, quarter/half→week, year→month, all→week).

### Frontend

Single-page HTML with no build step (`lang="sv"`). Uses ApexCharts via CDN. Terminal/retro theme (green-on-black, JetBrains Mono, scanlines). Date/time formatting uses `sv-SE` locale. Three JS files loaded in order: `api.js` (fetch wrapper), `charts.js` (ApexCharts configs and render functions), `app.js` (orchestrates data fetching, card updates, tab switching, and chart rendering).

#### Tab system

The dashboard uses a tab bar below the summary cards with four tabs: **USAGE** (default), **INFRA**, **UPTIME**, **CRON**. Tab state persists in the `tab` URL query parameter. Charts are only rendered when their tab is active (ApexCharts needs visible containers). When switching to a tab, `refreshTab(tab)` fetches tab-specific data and renders charts. The USAGE tab's charts are lazily rendered if the user navigated directly to another tab.

#### Summary cards

Nine global summary cards are always visible regardless of active tab: TOKENS, MESSAGES, SESSIONS, CACHE HIT, ERRORS, COST, UPTIME, CPU, DISK. The last three use color-coded thresholds (green/yellow/red) via `thresholdClass()`.

#### Header controls

Agent filter, model filter, period buttons (1H/1D/7D/30D/3M/6M/12M/ALL), auto-refresh dropdown (OFF/30s/60s/5m), date range inputs, and export buttons (.csv/.md/.xlsx). All filters trigger a full data refresh and persist to URL query params via `history.replaceState` — filters survive page refreshes and are shareable.

The model and agent filter dropdowns cache the full option list in `allModels`/`allAgents` so that filtering by one model doesn't shrink the dropdown to only that model's data.

#### Chart rendering

All charts go through `renderChart(id, options)` which destroys the previous instance (tracked in `chartInstances`) and deep-merges `CHART_DEFAULTS` (terminal theme colors, fonts) with the per-chart options. To add a new chart: call `renderChart('#my-chart', { ... })` — the theme is applied automatically. When data is empty, `clearChart(id)` destroys the chart and shows a "no data" message.

All user-controlled data rendered via `innerHTML` is escaped through the `esc()` function to prevent stored XSS from malicious JSONL content. Session IDs are truncated to 8 characters with click-to-copy (uses `navigator.clipboard` + toast notification).

Script tags and the CSS link include `?v=N` cache-busting parameters — bump these when deploying frontend changes. The frontend also loads SheetJS (`xlsx.mini.min.js`) from CDN for Excel export.

### Data export

Three export formats are available via header buttons. All exports include the active filter context (period/agent/model) and pull from `lastData` (stored after each `refresh()` call):

- **CSV**: BOM-prefixed UTF-8 with summary metrics, sessions, usage by model, and tool counts
- **Markdown**: Formatted tables suitable for pasting into GitHub issues or docs
- **XLSX**: Multi-sheet workbook (Summary, Sessions, By Model, By Provider, By Agent, Tools) via SheetJS

Export filenames follow the pattern `claw-{period}-{date}.{ext}`.

### Cost forecast

The Cost Forecast chart (`renderCostForecast` in `charts.js`) uses linear regression on the `cost` field from `usage.over_time` data. It shows historical cost as a solid red line and projects a dashed amber forecast line forward (~40% of the period length). The chart title dynamically updates with the projected cost for the next equivalent period based on daily average extrapolation. Requires at least 2 data points to render.

### Sortable tables

Four sortable tables exist (Stop Reasons, Errors by Model, Sessions, Cron Jobs). All follow the same pattern: a `*_COLS` array defines column keys and types, a `*Sort` state object tracks current key and direction, and a `render*Rows()` function sorts and re-renders. Click a header to sort descending; click again to toggle ascending. Sort indicators (▲/▼) use CSS classes (`sorted`, `asc`, `desc`).

### Error classification

Stop reasons in `NORMAL_STOPS` (frontend) and `NORMAL_STOP_REASONS` (`backend/aggregators/errors.py`) are considered non-errors: `endTurn`, `end_turn`, `stop`, `toolUse`, `tool_use`. Anything else counts as an error. The cron aggregator also uses `NORMAL_STOP_REASONS` to determine job success/failure.

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATA_DIR` | `/data` | Path to the OpenClaw data directory |
| `UPTIME_TARGET_URL` | `http://localhost:8090/api/overview` | URL to health-check for uptime monitoring |
| `UPTIME_CHECK_INTERVAL` | `60` | Seconds between uptime checks |

## Deployment

Runs as a Docker container on port 8090. The OpenClaw data directory is mounted read-only at `/data`. The `DATA_DIR` environment variable controls where the backend looks for data (defaults to `/data`).
