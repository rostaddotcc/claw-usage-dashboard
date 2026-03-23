from collections import defaultdict
from typing import Any

from backend.aggregators.errors import NORMAL_STOP_REASONS


def aggregate_cron_jobs(records: list[dict[str, Any]]) -> dict[str, Any]:
    cron_records = [r for r in records if r["agent"] == "cron"]

    jobs: dict[str, dict] = defaultdict(lambda: {
        "messages": 0,
        "total_tokens": 0,
        "cost": 0.0,
        "start_time": None,
        "end_time": None,
        "last_stop_reason": "unknown",
        "models_used": set(),
    })

    for r in cron_records:
        j = jobs[r["session_id"]]
        j["messages"] += 1
        j["total_tokens"] += r["total_tokens"]
        j["cost"] += r["cost_total"]
        j["last_stop_reason"] = r["stop_reason"]
        j["models_used"].add(r["model"])

        ts = r["timestamp"]
        if j["start_time"] is None or ts < j["start_time"]:
            j["start_time"] = ts
        if j["end_time"] is None or ts > j["end_time"]:
            j["end_time"] = ts

    result = []
    for sid, j in jobs.items():
        duration_min = None
        if j["start_time"] and j["end_time"]:
            duration_min = round((j["end_time"] - j["start_time"]).total_seconds() / 60, 1)

        success = j["last_stop_reason"] in NORMAL_STOP_REASONS
        result.append({
            "session_id": sid[:8],
            "session_id_full": sid,
            "status": "OK" if success else "FAILED",
            "last_run": j["start_time"].isoformat() if j["start_time"] else None,
            "duration_minutes": duration_min,
            "messages": j["messages"],
            "total_tokens": j["total_tokens"],
            "cost": round(j["cost"], 4),
            "models_used": sorted(j["models_used"]),
            "stop_reason": j["last_stop_reason"],
        })

    result.sort(key=lambda x: x["last_run"] or "", reverse=True)

    total_jobs = len(result)
    successful = sum(1 for j in result if j["status"] == "OK")
    success_rate = round(successful / total_jobs * 100, 1) if total_jobs else 0

    return {
        "total_jobs": total_jobs,
        "success_rate": success_rate,
        "jobs": result,
    }
