from fastapi import APIRouter, Query

from backend.collectors.sessions import collector
from backend.routers.overview import _period_to_dates
from backend.aggregators.cache import cache_hit_rate, cache_by_model, cache_over_time

router = APIRouter()


@router.get("/cache")
def get_cache(
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
        "overall_rate": cache_hit_rate(records),
        "by_model": cache_by_model(records),
        "over_time": cache_over_time(records, granularity),
    }
