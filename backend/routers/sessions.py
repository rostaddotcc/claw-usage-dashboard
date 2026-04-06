from collections import defaultdict

from fastapi import APIRouter, Query

from backend.collectors.sessions import collector
from backend.routers.stats import _period_to_dates

router = APIRouter()


@router.get("/sessions")
def get_sessions(
    period: str = Query("all"),
    agent: str | None = Query(None),
    model: str | None = Query(None),
    provider: str | None = Query(None),
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

    sessions: dict[str, dict] = defaultdict(
        lambda: {
            "agent": "",
            "models_used": set(),
            "total_tokens": 0,
            "message_count": 0,
            "cost": 0.0,
            "start_time": None,
            "end_time": None,
        }
    )

    for r in records:
        s = sessions[r["session_id"]]
        s["agent"] = r["agent"]
        s["models_used"].add(r["model"])
        s["total_tokens"] += r["total_tokens"]
        s["message_count"] += 1
        s["cost"] += r["cost_total"]

        ts = r["timestamp"]
        if s["start_time"] is None or ts < s["start_time"]:
            s["start_time"] = ts
        if s["end_time"] is None or ts > s["end_time"]:
            s["end_time"] = ts

    result = []
    for sid, s in sessions.items():
        duration_min = None
        if s["start_time"] and s["end_time"]:
            duration_min = round(
                (s["end_time"] - s["start_time"]).total_seconds() / 60, 1
            )
        result.append(
            {
                "session_id": sid[:8],
                "session_id_full": sid,
                "agent": s["agent"],
                "models_used": sorted(s["models_used"]),
                "total_tokens": s["total_tokens"],
                "message_count": s["message_count"],
                "cost": round(s["cost"], 4),
                "duration_minutes": duration_min,
                "start_time": s["start_time"].isoformat() if s["start_time"] else None,
                "end_time": s["end_time"].isoformat() if s["end_time"] else None,
            }
        )

    result.sort(key=lambda x: x["start_time"] or "", reverse=True)
    return {"sessions": result}
