from datetime import datetime, timezone
from typing import Any


def aggregate_cron_jobs(data: dict[str, Any]) -> dict[str, Any]:
    """Combine job definitions with their run history."""
    jobs_def = data.get("jobs", {})
    runs = data.get("runs", {})

    # Collect all job IDs from both definitions and runs
    all_job_ids = set(jobs_def.keys()) | set(runs.keys())

    result = []
    for job_id in sorted(all_job_ids):
        job_info = jobs_def.get(job_id, {})
        job_runs = runs.get(job_id, [])

        # Get the latest "finished" run
        finished_runs = [r for r in job_runs if r.get("action") == "finished"]
        # If no "finished" runs, use all runs
        if not finished_runs:
            finished_runs = job_runs

        last_run = None
        last_status = "unknown"
        last_duration_ms = 0
        last_error = None
        next_run = None
        total_runs = len(finished_runs)
        successful_runs = sum(1 for r in finished_runs if r.get("status") == "ok")

        if finished_runs:
            # Sort by timestamp descending
            finished_runs.sort(key=lambda r: r.get("timestamp_ms", 0), reverse=True)
            latest = finished_runs[0]
            ts_ms = latest.get("timestamp_ms", 0)
            if ts_ms:
                last_run = datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc).isoformat()
            last_status = latest.get("status", "unknown")
            last_duration_ms = latest.get("duration_ms", 0)
            last_error = latest.get("error")
            next_ms = latest.get("next_run_ms", 0)
            if next_ms:
                next_run = datetime.fromtimestamp(next_ms / 1000, tz=timezone.utc).isoformat()

        result.append({
            "job_id": job_id,
            "name": job_info.get("name", job_id),
            "enabled": job_info.get("enabled", True),
            "schedule": job_info.get("schedule", ""),
            "agent_id": job_info.get("agent_id", ""),
            "last_status": last_status,
            "last_run": last_run,
            "last_duration_ms": last_duration_ms,
            "last_error": last_error,
            "next_run": next_run,
            "total_runs": total_runs,
            "successful_runs": successful_runs,
            "success_rate": round(successful_runs / total_runs * 100, 1) if total_runs else 0,
        })

    # Sort: enabled jobs first, then by name
    result.sort(key=lambda j: (not j["enabled"], j["name"].lower()))

    total_jobs = len(result)
    enabled_jobs = sum(1 for j in result if j["enabled"])
    all_runs = sum(j["total_runs"] for j in result)
    all_ok = sum(j["successful_runs"] for j in result)
    overall_success = round(all_ok / all_runs * 100, 1) if all_runs else 0

    return {
        "total_jobs": total_jobs,
        "enabled_jobs": enabled_jobs,
        "total_runs": all_runs,
        "success_rate": overall_success,
        "jobs": result,
    }
