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


@router.get("/tools/debug")
def debug_tools(limit: int = Query(5)):
    """Show sample records to diagnose tool parsing."""
    records = collector.collect()
    with_tools = [r for r in records if r.get("tools")]
    tool_use_stops = [r for r in records if r.get("stop_reason") in ("toolUse", "tool_use")]

    samples = []
    for r in (with_tools or tool_use_stops)[:limit]:
        samples.append({
            "session_id": r["session_id"][:8],
            "stop_reason": r["stop_reason"],
            "tools": r.get("tools", []),
            "model": r["model"],
            "timestamp": r["timestamp"].isoformat(),
        })

    return {
        "total_records": len(records),
        "records_with_tools": len(with_tools),
        "records_with_toolUse_stop": len(tool_use_stops),
        "samples": samples,
    }
