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

            for session_file in sessions_dir.glob("*.jsonl*"):
                if not session_file.is_file():
                    continue
                session_id = session_file.name.split(".jsonl")[0]

                try:
                    with open(session_file) as f:
                        for line in f:
                            record = self._parse_line(line, agent_name, session_id)
                            if record:
                                records.append(record)
                except (OSError, json.JSONDecodeError):
                    continue

        # Parse cron runs (different format: top-level usage, snake_case fields)
        cron_path = Path(DATA_DIR) / "cron" / "runs"
        if cron_path.exists():
            for cron_file in cron_path.glob("*.jsonl*"):
                if not cron_file.is_file():
                    continue
                session_id = cron_file.name.split(".jsonl")[0]
                try:
                    with open(cron_file) as f:
                        for line in f:
                            record = self._parse_cron_line(line, session_id)
                            if record:
                                records.append(record)
                except (OSError, json.JSONDecodeError):
                    continue

        records.sort(key=lambda r: r["timestamp"])
        return records

    def _parse_cron_line(self, line: str, session_id: str) -> dict[str, Any] | None:
        try:
            entry = json.loads(line)
        except json.JSONDecodeError:
            return None

        # Cron entries may have usage at top level with snake_case fields,
        # or nested in message with camelCase fields (try both)
        msg = entry.get("message", {})
        if not isinstance(msg, dict):
            msg = {}

        usage = msg.get("usage") or entry.get("usage") or entry.get("data", {}).get("usage")
        if not usage:
            return None

        # Need at least some token usage
        input_t = usage.get("input", 0) or usage.get("input_tokens", 0)
        output_t = usage.get("output", 0) or usage.get("output_tokens", 0)
        if input_t == 0 and output_t == 0:
            return None

        ts_str = entry.get("timestamp", "") or msg.get("timestamp", "")
        try:
            ts = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
        except (ValueError, AttributeError):
            return None

        cache_read = usage.get("cacheRead", 0) or usage.get("cache_read", 0) or usage.get("cache_read_input_tokens", 0)
        cache_write = usage.get("cacheWrite", 0) or usage.get("cache_write", 0) or usage.get("cache_creation_input_tokens", 0)
        total = usage.get("totalTokens", 0) or (input_t + output_t + cache_read + cache_write)
        cost = usage.get("cost", {})

        return {
            "agent": "cron",
            "session_id": session_id,
            "timestamp": ts,
            "provider": msg.get("provider") or entry.get("provider", "unknown"),
            "model": msg.get("model") or entry.get("model", "unknown"),
            "api": msg.get("api", ""),
            "stop_reason": msg.get("stopReason") or entry.get("stop_reason", "unknown"),
            "role": msg.get("role", ""),
            "input_tokens": input_t,
            "output_tokens": output_t,
            "cache_read": cache_read,
            "cache_write": cache_write,
            "total_tokens": total,
            "cost_input": cost.get("input", 0),
            "cost_output": cost.get("output", 0),
            "cost_cache_read": cost.get("cacheRead", 0) or cost.get("cache_read", 0),
            "cost_cache_write": cost.get("cacheWrite", 0) or cost.get("cache_write", 0),
            "cost_total": cost.get("total", 0),
            "tools": [],
        }

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
                if isinstance(block, dict) and block.get("type") in ("tool_use", "toolCall"):
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
