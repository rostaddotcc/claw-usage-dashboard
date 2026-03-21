# Claw Usage Dashboard

Retro terminal-styled web dashboard for monitoring [OpenClaw](https://github.com/openclaw) AI gateway usage. Reads session JSONL logs and presents token usage, cache rates, error rates, and cost breakdowns via interactive charts.

![Python](https://img.shields.io/badge/python-3.13-blue)
![FastAPI](https://img.shields.io/badge/fastapi-0.115-green)

## Screenshots

<!-- Add screenshots here -->

## Features

- **Token usage tracking** — input, output, and cache tokens over time, by model, provider, and agent
- **Cache hit rate monitoring** — overall and per-model cache performance with trend charts
- **Error analysis** — stop reason distribution and error rate over time
- **Cost breakdown** — per-session and aggregate cost tracking
- **Session browser** — table view of all sessions with model, token, and cost details
- **Time filtering** — 1D / 7D / 30D / ALL period selection
- **Zero dependencies frontend** — vanilla JS with ApexCharts via CDN, no build step

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

The app expects JSONL session files at `$DATA_DIR/agents/*/sessions/*.jsonl`.

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

All endpoints accept query parameters: `period` (day/week/month/all), `agent`, `model`, `provider`.

| Endpoint | Description |
|----------|-------------|
| `GET /api/overview` | Summary cards — total tokens, messages, sessions, cache rate, error rate, cost |
| `GET /api/usage` | Token usage grouped by model, provider, agent, and over time |
| `GET /api/cache` | Cache hit rates overall, by model, and over time |
| `GET /api/errors` | Error rate, stop reason distribution, and errors over time |
| `GET /api/sessions` | Per-session breakdown with models, tokens, cost, and timestamps |

Endpoints with time-series data also accept `granularity` (day/week/month).

## License

<!-- Add license here -->
