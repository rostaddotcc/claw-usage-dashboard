from datetime import datetime, timezone

from fastapi import APIRouter, Query

from backend.collectors.cron import cron_collector
from backend.aggregators.cron import aggregate_cron_jobs
from backend.routers.overview import _period_to_dates

router = APIRouter()


def _filter_runs_by_date(data: dict, filters: dict) -> dict:
    """Filter cron run entries by date range, preserving job definitions."""
    if not filters:
        return data

    start = None
    end = None
    if filters.get("start_date"):
        start = datetime.fromisoformat(filters["start_date"]).replace(tzinfo=timezone.utc)
    if filters.get("end_date"):
        end = datetime.fromisoformat(filters["end_date"]).replace(tzinfo=timezone.utc)

    if not start and not end:
        return data

    filtered_runs = {}
    for job_id, job_runs in data.get("runs", {}).items():
        filtered = []
        for run in job_runs:
            ts_ms = run.get("timestamp_ms", 0)
            if not ts_ms:
                filtered.append(run)
                continue
            ts = datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc)
            if start and ts < start:
                continue
            if end and ts > end:
                continue
            filtered.append(run)
        if filtered:
            filtered_runs[job_id] = filtered

    return {"jobs": data.get("jobs", {}), "runs": filtered_runs}


@router.get("/cron")
def get_cron(
    period: str = Query("all"),
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
):
    data = cron_collector.collect()
    filters = _period_to_dates(period, start_date, end_date)
    data = _filter_runs_by_date(data, filters)
    return aggregate_cron_jobs(data)
