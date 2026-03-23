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

    def source_name(self) -> str:
        return "uptime-checks"

    def collect(self, **filters) -> dict[str, Any]:
        checks = list(self._checks)
        up_count = sum(1 for c in checks if c["is_up"])
        total = len(checks) or 1
        current = checks[-1] if checks else {
            "is_up": False, "response_time_ms": 0, "status_code": 0,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        return {
            "current": current,
            "uptime_pct": round(up_count / total * 100, 1),
            "history": checks,
            "status_codes": dict(Counter(c["status_code"] for c in checks)),
        }

    async def perform_check(self):
        ts = datetime.now(timezone.utc).isoformat()
        start = time.monotonic()
        try:
            req = urllib.request.Request(UPTIME_TARGET_URL, method="GET")
            with urllib.request.urlopen(req, timeout=10) as resp:
                status = resp.status
                elapsed = round((time.monotonic() - start) * 1000)
                self._checks.append({
                    "timestamp": ts,
                    "status_code": status,
                    "response_time_ms": elapsed,
                    "is_up": 200 <= status < 400,
                })
        except Exception:
            elapsed = round((time.monotonic() - start) * 1000)
            self._checks.append({
                "timestamp": ts,
                "status_code": 0,
                "response_time_ms": elapsed,
                "is_up": False,
            })


uptime_collector = UptimeCollector()
