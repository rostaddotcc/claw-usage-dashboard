# Release Notes

## v1.1 — 2026-03-22

### New Features

- **Cost Forecast** — New chart showing historical cost with a linear regression-based projection into the next period. Displays estimated total cost in the chart title.
- **Data Export** — Download the current filtered view as CSV, Markdown, or Excel (.xlsx). Exports include summary metrics, sessions, usage by model, tool counts, and active filter context. Excel exports contain multiple sheets (Summary, Sessions, By Model, By Provider, By Agent, Tools).
- **Auto-Refresh** — Configurable auto-refresh interval (30s / 60s / 5m) via a dropdown in the header for live monitoring.
- **Filter Persistence** — Period, model, and agent filters are saved to URL query parameters. Filters survive page refreshes and can be shared via URL.
- **Sortable Error Tables** — Stop Reasons and Errors by Model tables now support column sorting (click header to toggle ascending/descending), matching the existing sessions table behavior.
- **Click-to-Copy Session IDs** — Session IDs are truncated to 8 characters for readability. Click to copy the full ID to clipboard with a toast confirmation.

### Improvements

- **Centered Header Layout** — Header controls are now stacked below the title and centered. Controls wrap gracefully on smaller screens.
- **Mobile Responsiveness** — Improved layout on narrow screens: period buttons take full width, subtitle/separator hidden on mobile, tighter spacing.
- **Loading Skeletons** — Empty chart containers show a shimmer animation before data arrives. Chart boxes pulse their borders during data refresh.
- **Favicon** — Added a green cat paw SVG favicon matching the terminal theme.
- **Tooltip Visibility** — ApexCharts tooltips now render above the CRT scanline overlay instead of being dimmed by it.
- **Null-Safe Cost Rendering** — Sessions without cost data display "--" instead of crashing.

### Security

- **XSS Prevention** — All user-controlled data from JSONL files (agent names, model names, stop reasons, session IDs) is now HTML-escaped via `esc()` before rendering with `innerHTML`. Prevents stored XSS from malicious JSONL content.

## v1.0 — 2026-03-21

Initial release.
