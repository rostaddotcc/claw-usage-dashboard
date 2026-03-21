from fastapi import APIRouter, Query

from backend.collectors.sessions import collector
from backend.routers.overview import _period_to_dates
from backend.aggregators.errors import error_rate, stop_reason_distribution, errors_by_model, errors_over_time

router = APIRouter()


@router.get("/errors")
def get_errors(
    period: str = Query("all"),
    agent: str | None = Query(None),
    model: str | None = Query(None),
    provider: str | None = Query(None),
    granularity: str = Query("day"),
):
    filters = _period_to_dates(period)
    if agent:
        filters["agent"] = agent
    if model:
        filters["model"] = model
    if provider:
        filters["provider"] = provider

    records = collector.collect(**filters)

    return {
        "error_rate": error_rate(records),
        "stop_reasons": stop_reason_distribution(records),
        "by_model": errors_by_model(records),
        "over_time": errors_over_time(records, granularity),
    }
