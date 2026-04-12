# Release Notes

## v1.5 — 2026-04-12

### New Features

- **Theme Selector** — Choose between green, cyan, amber, and purple color themes. Theme persists via localStorage.
- **Tabbed Interface** — Three tabs: USAGE (charts), INFRA (system metrics), SESSIONS (session table).
- **Model Cost Efficiency** — Scatter plot showing cost per token by model, with bubble size proportional to total usage.
- **Token Velocity** — Timeline chart showing tokens processed per minute, revealing throughput patterns.
- **System Infrastructure Tab** — CPU, memory, disk usage, and uptime tracking for the dashboard host.
- **Period Selector** — Switched from buttons to a dropdown select for period filtering (cleaner UI).

### Improvements

- **Combined Provider/Agent Chart** — Single toggleable chart for "by provider" or "by agent" instead of two separate charts.
- **Removed Cost Forecast** — Replaced with Model Cost Efficiency for more actionable cost insights.
- **Removed Tool Usage Timeline** — Replaced with Token Velocity chart.
- **Updated Session Table** — Moved to its own tab with pagination.
- **v22 asset cache busting** — CSS and JS version bumped to v22.

### Backend

- **Stats Router** — New `/api/stats` endpoint for system infrastructure metrics.
- **System Router** — System health and uptime information.
- **Pricing Fallback** — `backend/pricing.py` provides cost calculation for models that don't report costs in logs (qwen3.6-plus, stepfun models).
- **Sessions Collector** — Fixed cache cost key normalization (`cacheRead` → `cache_read`).

### Security

- **XSS Prevention** — All user-controlled data from JSONL files is HTML-escaped before rendering.

---

## v1.1 — 2026-03-22

### New Features

- **Cost Forecast** — New chart showing historical cost with a linear regression-based projection into the next period.
- **Data Export** — Download the current filtered view as CSV, Markdown, or Excel (.xlsx).
- **Auto-Refresh** — Configurable auto-refresh interval (30s / 60s / 5m).
- **Filter Persistence** — Period, model, and agent filters saved to URL query parameters.
- **Sortable Error Tables** — Stop Reasons and Errors by Model tables support column sorting.
- **Click-to-Copy Session IDs** — Click to copy the full ID with toast confirmation.

### Improvements

- **Centered Header Layout** — Header controls stacked and centered.
- **Mobile Responsiveness** — Improved layout on narrow screens.
- **Loading Skeletons** — Shimmer animation on empty chart containers.
- **Favicon** — Green cat paw SVG favicon.
- **Tooltip Visibility** — ApexCharts tooltips render above CRT scanline overlay.
- **Null-Safe Cost Rendering** — Sessions without cost data display "--".

### Security

- **XSS Prevention** — All user-controlled data HTML-escaped via `esc()`.

## v1.0 — 2026-03-21

Initial release.
