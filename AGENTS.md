# Agent Instructions

## Key Files

- `CLAUDE.md` — Detailed architecture docs (collectors, aggregators, routers, data flow)
- `docker-compose.yml` — Mounts `~/.openclaw` read-only at `/data`
- `backend/main.py` — FastAPI entry point, 7 API routers
- `frontend/index.html` — Single-page app, no build step, ApexCharts via CDN

## Commands

```bash
# Run locally (requires OpenClaw data directory)
DATA_DIR=/path/to/.openclaw uvicorn backend.main:app --port 8090

# Run with Docker (primary deployment)
docker compose up -d --build

# Install dependencies
pip install -r requirements.txt
```

## Architecture

**Data flow:** `JSONL files → Collectors → Aggregators → Routers (/api/*) → Frontend`

**Two collectors:**
- `SessionCollector` — Parses `agents/*/sessions/*.jsonl*` (30s cache TTL), includes cron runs as "cron" agent
- `SystemCollector` — CPU/RAM/disk via `psutil` (10s TTL, rolling history)

**API endpoints (7):** `/api/overview`, `/api/usage`, `/api/cache`, `/api/errors`, `/api/sessions`, `/api/tools`, `/api/system`

## Important Constraints

- **No tests exist** — Do not add tests unless explicitly requested
- **No linters/typecheck** — No `ruff`, `mypy`, or formatting config present
- **Frontend is vanilla JS** — No npm, no build step, CDN dependencies only
- **Port 8090** — Hardcoded in Dockerfile, docker-compose, and docs
- **Python 3.13** — Required for Docker image
- **Read-only data mount** — Container mounts data as `:ro`

## OpenClaw JSONL Format

Session files at `$DATA_DIR/agents/<agentId>/sessions/<sessionId>.jsonl*`:
- Fields use camelCase: `input`, `output`, `cacheRead`, `totalTokens`, `stopReason`
- Tool calls: `{type: "toolCall", name: "exec", input: {...}}`
- Cost nested: `usage.cost.{input, output, cacheRead, total}`
- File variants: `.jsonl`, `.jsonl.reset.<ts>`, `.jsonl.deleted.<ts>` (all matched by `*.jsonl*`)

## Frontend Quirks

- Cache-busting via `?v=N` on script/link tags — bump version on deploy
- Filter state persists in URL query params via `history.replaceState`
- Charts only render when tab is visible (ApexCharts needs visible containers)
- All user data escaped via `esc()` before `innerHTML` (XSS prevention)
- Language: Swedish (`lang="sv"`, `sv-SE` locale for dates)
- Three tabs: USAGE (default), INFRA, SESSIONS
- Period filter is a dropdown (not buttons)
- Sessions table has no pagination (shows all)
- Theme selector (green/cyan/amber/purple) saves to localStorage
- Click-to-copy session IDs in both sessions tables
- New charts: Model Cost Efficiency (bubble), Token Velocity (area)
- Top Sessions table shows 10 most expensive sessions

## Known Issues

- Cloudflare Rocket Loader rewrites `<script>` tags — breaks JS execution. Disable for this site.
- Service name in docker-compose is `molt` (legacy name) — container name is `claw-usage-dashboard`
