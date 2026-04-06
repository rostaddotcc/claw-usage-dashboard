import hashlib
import json
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Query, Request
from fastapi.responses import JSONResponse

from backend.collectors.sessions import collector
from backend.aggregators.cache import cache_hit_rate, cache_by_model, cache_over_time
from backend.aggregators.errors import error_rate, stop_reason_distribution, errors_by_model, errors_over_time

router = APIRouter()

PERIOD_DELTAS = {
    "hour": timedelta(hours=1),
    "day": timedelta(days=1),
    "week": timedelta(weeks=1),
    "month": timedelta(days=30),
    "quarter": timedelta(days=90),
    "half": timedelta(days=180),
    "year": timedelta(days=365),
}


def _period_to_dates(period: str, start_date: str | None = None, end_date: str | None = None) -> dict:
    if start_date:
        result = {"start_date": start_date}
        if end_date:
            result["end_date"] = end_date
        return result
    now = datetime.now(timezone.utc)
    delta = PERIOD_DELTAS.get(period)
    if delta:
        return {"start_date": (now - delta).isoformat()}
    return {}


def _prev_period_dates(period: str) -> dict | None:
    now = datetime.now(timezone.utc)
    delta = PERIOD_DELTAS.get(period)
    if not delta:
        return None
    return {
        "start_date": (now - delta - delta).isoformat(),
        "end_date": (now - delta).isoformat(),
    }


def _compute_etag(data: dict) -> str:
    return hashlib.md5(json.dumps(data, sort_keys=True).encode()).hexdigest()


@router.get("/stats")
def get_stats(
    request: Request,
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

    session_ids = set(r["session_id"] for r in records)
    agents = sorted(set(r["agent"] for r in records))
    models = sorted(set(r["model"] for r in records))
    providers = sorted(set(r["provider"] for r in records))

    total_tokens = sum(r["total_tokens"] for r in records)
    total_cost = round(sum(r["cost_total"] for r in records), 4)

    start = min((r["timestamp"] for r in records), default=None)
    end = max((r["timestamp"] for r in records), default=None)

    prev = None
    prev_dates = _prev_period_dates(period)
    if prev_dates:
        prev_filters = {**prev_dates}
        if agent:
            prev_filters["agent"] = agent
        if model:
            prev_filters["model"] = model
        if provider:
            prev_filters["provider"] = provider
        prev_records = collector.collect(**prev_filters)
        prev = {
            "total_tokens": sum(r["total_tokens"] for r in prev_records),
            "total_messages": len(prev_records),
            "total_sessions": len(set(r["session_id"] for r in prev_records)),
            "total_cost": round(sum(r["cost_total"] for r in prev_records), 4),
            "cache_hit_rate": cache_hit_rate(prev_records),
            "error_rate": error_rate(prev_records),
        }

    data = {
        "overview": {
            "total_tokens": total_tokens,
            "total_messages": len(records),
            "total_sessions": len(session_ids),
            "total_cost": total_cost,
            "cache_hit_rate": cache_hit_rate(records),
            "error_rate": error_rate(records),
            "previous": prev,
            "agents": agents,
            "models": models,
            "providers": providers,
            "period": {
                "start": start.isoformat() if start else None,
                "end": end.isoformat() if end else None,
            },
        },
        "cache": {
            "overall_rate": cache_hit_rate(records),
            "by_model": cache_by_model(records),
            "over_time": cache_over_time(records, granularity),
        },
        "errors": {
            "error_rate": error_rate(records),
            "stop_reasons": stop_reason_distribution(records),
            "by_model": errors_by_model(records),
            "over_time": errors_over_time(records, granularity),
        },
    }

    etag = _compute_etag(data)
    if request.headers.get("if-none-match") == etag:
        return JSONResponse(status_code=304, headers={"ETag": etag})

    return JSONResponse(content=data, headers={"ETag": etag})
