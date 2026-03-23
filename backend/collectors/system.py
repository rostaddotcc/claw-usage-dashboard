import time
from collections import deque
from datetime import datetime, timezone
from typing import Any

import psutil

from backend.collectors.base import BaseCollector
from backend.config import SYSTEM_CACHE_TTL_SECONDS


class SystemCollector(BaseCollector):

    def __init__(self):
        self._cache: dict[str, Any] | None = None
        self._cache_time: float = 0
        self._history: deque[dict[str, Any]] = deque(maxlen=1440)
        # Prime CPU percent (first call always returns 0)
        psutil.cpu_percent(interval=None)

    def source_name(self) -> str:
        return "system-metrics"

    def collect(self, **filters) -> dict[str, Any]:
        now = time.time()
        if now - self._cache_time > SYSTEM_CACHE_TTL_SECONDS or self._cache is None:
            snapshot = self._take_snapshot()
            self._history.append(snapshot)
            self._cache = snapshot
            self._cache_time = now
        return {"current": self._cache, "history": list(self._history)}

    def _take_snapshot(self) -> dict[str, Any]:
        cpu = psutil.cpu_percent(interval=None)
        mem = psutil.virtual_memory()
        disk = psutil.disk_usage("/")
        net = psutil.net_io_counters()
        return {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "cpu_pct": cpu,
            "ram_pct": mem.percent,
            "ram_used": mem.used,
            "ram_total": mem.total,
            "disk_pct": disk.percent,
            "disk_used": disk.used,
            "disk_total": disk.total,
            "net_sent": net.bytes_sent,
            "net_recv": net.bytes_recv,
        }


system_collector = SystemCollector()
