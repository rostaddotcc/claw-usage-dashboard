import json
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from backend.collectors.base import BaseCollector
from backend.config import DATA_DIR, AGENTS_SUBDIR, CACHE_TTL_SECONDS


class SessionCollector(BaseCollector):

    def __init__(self):
        self._cache: list[dict[str, Any]] = []
        self._cache_time: float = 0

    def source_name(self) -> str:
        return "openclaw-sessions"

    def collect(self, **filters) -> list[dict[str, Any]]:
        now = time.time()
        if now - self._cache_time > CACHE_TTL_SECONDS or not self._cache:
            self._cache = self._parse_all()
            self._cache_time = now

        records = self._cache

        if filters.get("agent"):
            agents = [a.strip() for a in filters["agent"].split(",")]
            records = [r for r in records if r["agent"] in agents]
        if filters.get("model"):
            records = [r for r in records if r["model"] == filters["model"]]
        if filters.get("provider"):
            records = [r for r in records if r["provider"] == filters["provider"]]
        if filters.get("start_date"):
            start = datetime.fromisoformat(filters["start_date"]).replace(tzinfo=timezone.utc)
            records = [r for r in records if r["timestamp"] >= start]
        if filters.get("end_date"):
            end = datetime.fromisoformat(filters["end_date"]).replace(tzinfo=timezone.utc)
            records = [r for r in records if r["timestamp"] <= end]

        return records

    def _parse_all(self) -> list[dict[str, Any]]:
        records = []
        agents_path = Path(DATA_DIR) / AGENTS_SUBDIR

        if not agents_path.exists():
            return records

        for agent_dir in sorted(agents_path.iterdir()):
            if not agent_dir.is_dir():
                continue
            sessions_dir = agent_dir / "sessions"
            if not sessions_dir.exists():
                continue

            agent_name = agent_dir.name

            for session_file in sessions_dir.glob("*.jsonl"):
                if session_file.name == "sessions.json":
                    continue
                session_id = session_file.stem

                try:
                    with open(session_file) as f:
                        for line in f:
                            record = self._parse_line(line, agent_name, session_id)
                            if record:
                                records.append(record)
                except (OSError, json.JSONDecodeError):
                    continue

        records.sort(key=lambda r: r["timestamp"])
        return records

    def _parse_line(self, line: str, agent: str, session_id: str) -> dict[str, Any] | None:
        try:
            entry = json.loads(line)
        except json.JSONDecodeError:
            return None

        if entry.get("type") != "message":
            return None

        msg = entry.get("message", {})
        usage = msg.get("usage")
        if not usage:
            return None

        ts_str = entry.get("timestamp", "")
        try:
            ts = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
        except (ValueError, AttributeError):
            return None

        cost = usage.get("cost", {})

        tools = []
        # content may be in msg (nested format) or entry (flat format)
        content = msg.get("content") or entry.get("content") or []
        if isinstance(content, list):
            for block in content:
                if isinstance(block, dict) and block.get("type") == "tool_use":
                    tools.append(block.get("name", "unknown"))

        return {
            "agent": agent,
            "session_id": session_id,
            "timestamp": ts,
            "provider": msg.get("provider", "unknown"),
            "model": msg.get("model", "unknown"),
            "api": msg.get("api", ""),
            "stop_reason": msg.get("stopReason", "unknown"),
            "role": msg.get("role", ""),
            "input_tokens": usage.get("input", 0),
            "output_tokens": usage.get("output", 0),
            "cache_read": usage.get("cacheRead", 0),
            "cache_write": usage.get("cacheWrite", 0),
            "total_tokens": usage.get("totalTokens", 0),
            "cost_input": cost.get("input", 0),
            "cost_output": cost.get("output", 0),
            "cost_cache_read": cost.get("cacheRead", 0),
            "cost_cache_write": cost.get("cacheWrite", 0),
            "cost_total": cost.get("total", 0),
            "tools": tools,
        }


collector = SessionCollector()
