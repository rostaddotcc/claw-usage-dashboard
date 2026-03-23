import asyncio
import time
import urllib.request
import urllib.error
from collections import Counter, deque
from datetime import datetime, timezone
from typing import Any

from backend.collectors.base import BaseCollector
from backend.config import UPTIME_TARGET_URL


class UptimeCollector(BaseCollector):

    def __init__(self):
        self._checks: deque[dict[str, Any]] = deque(maxlen=1440)
        self._started_at: datetime = datetime.now(timezone.utc)
        self._last_up_since: datetime | None = None

    def source_name(self) -> str:
        return "uptime-checks"

    def collect(self, **filters) -> dict[str, Any]:
        checks = list(self._checks)
        up_count = sum(1 for c in checks if c["is_up"])
        total = len(checks) or 1
        now = datetime.now(timezone.utc)
        current = checks[-1] if checks else {
            "is_up": False, "response_time_ms": 0, "status_code": 0,
            "timestamp": now.isoformat(),
        }

        # Calculate continuous uptime duration
        up_since = self._last_up_since
        uptime_seconds = 0
        if up_since and current["is_up"]:
            uptime_seconds = int((now - up_since).total_seconds())

        # Process uptime (how long this server process has been running)
        process_uptime_seconds = int((now - self._started_at).total_seconds())

        return {
            "current": current,
            "uptime_pct": round(up_count / total * 100, 1),
            "uptime_seconds": uptime_seconds,
            "up_since": up_since.isoformat() if up_since else None,
            "process_uptime_seconds": process_uptime_seconds,
            "started_at": self._started_at.isoformat(),
            "history": checks,
            "status_codes": dict(Counter(c["status_code"] for c in checks)),
        }

    def _do_check(self) -> dict[str, Any]:
        """Synchronous HTTP check — must run in an executor to avoid blocking."""
        ts = datetime.now(timezone.utc).isoformat()
        start = time.monotonic()
        try:
            req = urllib.request.Request(UPTIME_TARGET_URL, method="GET")
            with urllib.request.urlopen(req, timeout=10) as resp:
                status = resp.status
                elapsed = round((time.monotonic() - start) * 1000)
                return {
                    "timestamp": ts,
                    "status_code": status,
                    "response_time_ms": elapsed,
                    "is_up": 200 <= status < 400,
                }
        except Exception:
            elapsed = round((time.monotonic() - start) * 1000)
            return {
                "timestamp": ts,
                "status_code": 0,
                "response_time_ms": elapsed,
                "is_up": False,
            }

    async def perform_check(self):
        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(None, self._do_check)
        self._checks.append(result)

        # Track continuous uptime: when was the last transition to "up"?
        if result["is_up"]:
            if self._last_up_since is None:
                self._last_up_since = datetime.fromisoformat(result["timestamp"])
        else:
            self._last_up_since = None


uptime_collector = UptimeCollector()
