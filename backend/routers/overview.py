from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Query

from backend.collectors.sessions import collector
from backend.aggregators.cache import cache_hit_rate
from backend.aggregators.errors import error_rate

router = APIRouter()


def _period_to_dates(period: str) -> dict:
    now = datetime.now(timezone.utc)
    if period == "hour":
        return {"start_date": (now - timedelta(hours=1)).isoformat()}
    elif period == "day":
        return {"start_date": (now - timedelta(days=1)).isoformat()}
    elif period == "week":
        return {"start_date": (now - timedelta(weeks=1)).isoformat()}
    elif period == "month":
        return {"start_date": (now - timedelta(days=30)).isoformat()}
    return {}


@router.get("/overview")
def get_overview(
    period: str = Query("all"),
    agent: str | None = Query(None),
    model: str | None = Query(None),
    provider: str | None = Query(None),
):
    filters = _period_to_dates(period)
    if agent:
        filters["agent"] = agent
    if model:
        filters["model"] = model
    if provider:
        filters["provider"] = provider

    records = collector.collect(**filters)

    session_ids = set(r["session_id"] for r in records)
    agents = sorted(set(r["agent"] for r in records))
    models = sorted(set(r["model"] for r in records))
    providers = sorted(set(r["provider"] for r in records))

    total_tokens = sum(r["total_tokens"] for r in records)
    total_cost = round(sum(r["cost_total"] for r in records), 4)

    start = min((r["timestamp"] for r in records), default=None)
    end = max((r["timestamp"] for r in records), default=None)

    return {
        "total_tokens": total_tokens,
        "total_messages": len(records),
        "total_sessions": len(session_ids),
        "total_cost": total_cost,
        "cache_hit_rate": cache_hit_rate(records),
        "error_rate": error_rate(records),
        "agents": agents,
        "models": models,
        "providers": providers,
        "period": {
            "start": start.isoformat() if start else None,
            "end": end.isoformat() if end else None,
        },
    }
