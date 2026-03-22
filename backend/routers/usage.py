from fastapi import APIRouter, Query

from backend.collectors.sessions import collector
from backend.routers.overview import _period_to_dates
from backend.aggregators.usage import (
    aggregate_by_model,
    aggregate_by_provider,
    aggregate_by_agent,
    aggregate_over_time,
    aggregate_by_model_over_time,
)

router = APIRouter()


@router.get("/usage")
def get_usage(
    period: str = Query("all"),
    agent: str | None = Query(None),
    model: str | None = Query(None),
    provider: str | None = Query(None),
    granularity: str = Query("day"),
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
):
    filters = _period_to_dates(period, start_date, end_date)
    if agent:
        filters["agent"] = agent
    if model:
        filters["model"] = model
    if provider:
        filters["provider"] = provider

    records = collector.collect(**filters)

    return {
        "by_model": aggregate_by_model(records),
        "by_provider": aggregate_by_provider(records),
        "by_agent": aggregate_by_agent(records),
        "over_time": aggregate_over_time(records, granularity),
        "by_model_over_time": aggregate_by_model_over_time(records, granularity),
    }
