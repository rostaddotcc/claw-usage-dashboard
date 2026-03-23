import json
import time
from collections import deque
from pathlib import Path
from typing import Any

from backend.collectors.base import BaseCollector
from backend.config import DATA_DIR, CACHE_TTL_SECONDS


class CronCollector(BaseCollector):

    def __init__(self):
        self._cache: dict[str, Any] | None = None
        self._cache_time: float = 0

    def source_name(self) -> str:
        return "openclaw-cron"

    def collect(self, **filters) -> dict[str, Any]:
        now = time.time()
        if now - self._cache_time > CACHE_TTL_SECONDS or self._cache is None:
            self._cache = self._parse_all()
            self._cache_time = now
        return self._cache

    def _parse_all(self) -> dict[str, Any]:
        cron_path = Path(DATA_DIR) / "cron"
        jobs = self._parse_jobs(cron_path / "jobs.json")
        runs = self._parse_runs(cron_path / "runs", jobs)
        return {"jobs": jobs, "runs": runs}

    def _parse_jobs(self, path: Path) -> dict[str, dict[str, Any]]:
        """Parse jobs.json — returns dict keyed by jobId."""
        if not path.exists():
            return {}
        try:
            with open(path) as f:
                data = json.load(f)
        except (json.JSONDecodeError, OSError):
            return {}

        jobs = {}
        # jobs.json may be a list of job objects or a dict with a "jobs" key
        job_list = data if isinstance(data, list) else data.get("jobs", [])
        for job in job_list:
            if not isinstance(job, dict):
                continue
            job_id = job.get("jobId") or job.get("id", "")
            if not job_id:
                continue

            schedule = job.get("schedule", {})
            schedule_str = ""
            kind = schedule.get("kind", "")
            if kind == "cron":
                schedule_str = schedule.get("expr", "")
            elif kind == "every":
                ms = schedule.get("everyMs", 0)
                if ms >= 3600000:
                    schedule_str = f"every {ms // 3600000}h"
                elif ms >= 60000:
                    schedule_str = f"every {ms // 60000}m"
                else:
                    schedule_str = f"every {ms // 1000}s"
            elif kind == "at":
                schedule_str = schedule.get("at", "one-shot")

            jobs[job_id] = {
                "job_id": job_id,
                "name": job.get("name", job_id),
                "enabled": job.get("enabled", True),
                "schedule": schedule_str,
                "agent_id": job.get("agentId", ""),
                "session_target": job.get("sessionTarget", ""),
            }
        return jobs

    def _parse_runs(self, runs_dir: Path, jobs: dict) -> dict[str, list[dict]]:
        """Parse run log files — returns dict of jobId -> list of run entries."""
        if not runs_dir.exists():
            return {}

        runs: dict[str, list[dict]] = {}
        for run_file in runs_dir.glob("*.jsonl*"):
            if not run_file.is_file():
                continue
            job_id = run_file.name.split(".jsonl")[0]
            job_runs: list[dict] = []
            try:
                with open(run_file) as f:
                    for line in f:
                        entry = self._parse_run_line(line, job_id)
                        if entry:
                            job_runs.append(entry)
            except (OSError, json.JSONDecodeError):
                continue
            if job_runs:
                runs[job_id] = job_runs
        return runs

    def _parse_run_line(self, line: str, job_id: str) -> dict[str, Any] | None:
        try:
            entry = json.loads(line)
        except json.JSONDecodeError:
            return None

        if not isinstance(entry, dict):
            return None

        # Run log entries have action/status/durationMs fields
        # But also handle session-like entries that may exist
        action = entry.get("action", "")
        status = entry.get("status", "")
        ts = entry.get("ts", 0)
        duration_ms = entry.get("durationMs", 0)

        if not ts and not action:
            return None

        return {
            "job_id": job_id,
            "action": action,
            "status": status,
            "timestamp_ms": ts,
            "duration_ms": duration_ms,
            "run_id": entry.get("runId", ""),
            "error": entry.get("error"),
            "summary": entry.get("summary", ""),
            "next_run_ms": entry.get("nextRunAtMs", 0),
        }


cron_collector = CronCollector()
