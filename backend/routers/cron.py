from fastapi import APIRouter, Query

from backend.collectors.sessions import collector
from backend.routers.overview import _period_to_dates
from backend.aggregators.cron import aggregate_cron_jobs

router = APIRouter()


@router.get("/cron")
def get_cron(
    period: str = Query("all"),
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
):
    filters = _period_to_dates(period, start_date, end_date)
    filters["agent"] = "cron"
    records = collector.collect(**filters)
    return aggregate_cron_jobs(records)
