from fastapi import APIRouter, Query

from backend.collectors.sessions import collector
from backend.routers.overview import _period_to_dates
from backend.aggregators.tools import tool_counts, tool_usage_over_time, tool_usage_by_agent

router = APIRouter()


@router.get("/tools")
def get_tools(
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
        "by_tool": tool_counts(records),
        "over_time": tool_usage_over_time(records, granularity),
        "by_agent": tool_usage_by_agent(records),
    }
