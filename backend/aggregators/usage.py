from collections import defaultdict
from typing import Any


def aggregate_by_model(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    groups: dict[str, dict] = defaultdict(lambda: {
        "input": 0, "output": 0, "cache_read": 0, "total": 0, "count": 0, "cost": 0.0,
    })
    for r in records:
        g = groups[r["model"]]
        g["input"] += r["input_tokens"]
        g["output"] += r["output_tokens"]
        g["cache_read"] += r["cache_read"]
        g["total"] += r["total_tokens"]
        g["count"] += 1
        g["cost"] += r["cost_total"]

    result = [{"model": k, **v} for k, v in groups.items()]
    result.sort(key=lambda x: x["total"], reverse=True)
    return result


def aggregate_by_provider(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    groups: dict[str, dict] = defaultdict(lambda: {
        "input": 0, "output": 0, "cache_read": 0, "total": 0, "count": 0, "cost": 0.0,
    })
    for r in records:
        g = groups[r["provider"]]
        g["input"] += r["input_tokens"]
        g["output"] += r["output_tokens"]
        g["cache_read"] += r["cache_read"]
        g["total"] += r["total_tokens"]
        g["count"] += 1
        g["cost"] += r["cost_total"]

    result = [{"provider": k, **v} for k, v in groups.items()]
    result.sort(key=lambda x: x["total"], reverse=True)
    return result


def aggregate_by_agent(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    groups: dict[str, dict] = defaultdict(lambda: {
        "input": 0, "output": 0, "cache_read": 0, "total": 0, "count": 0, "cost": 0.0,
    })
    for r in records:
        g = groups[r["agent"]]
        g["input"] += r["input_tokens"]
        g["output"] += r["output_tokens"]
        g["cache_read"] += r["cache_read"]
        g["total"] += r["total_tokens"]
        g["count"] += 1
        g["cost"] += r["cost_total"]

    result = [{"agent": k, **v} for k, v in groups.items()]
    result.sort(key=lambda x: x["total"], reverse=True)
    return result


def aggregate_over_time(records: list[dict[str, Any]], granularity: str = "day") -> list[dict[str, Any]]:
    groups: dict[str, dict] = defaultdict(lambda: {
        "input": 0, "output": 0, "cache_read": 0, "total": 0, "count": 0, "cost": 0.0,
    })
    for r in records:
        key = _time_key(r["timestamp"], granularity)
        g = groups[key]
        g["input"] += r["input_tokens"]
        g["output"] += r["output_tokens"]
        g["cache_read"] += r["cache_read"]
        g["total"] += r["total_tokens"]
        g["count"] += 1
        g["cost"] += r["cost_total"]

    result = [{"date": k, **v} for k, v in sorted(groups.items())]
    return result


def aggregate_by_model_over_time(records: list[dict[str, Any]], granularity: str = "day") -> dict[str, list[dict]]:
    groups: dict[str, dict[str, dict]] = defaultdict(lambda: defaultdict(lambda: {
        "input": 0, "output": 0, "cache_read": 0, "total": 0, "count": 0,
    }))
    for r in records:
        key = _time_key(r["timestamp"], granularity)
        g = groups[r["model"]][key]
        g["input"] += r["input_tokens"]
        g["output"] += r["output_tokens"]
        g["cache_read"] += r["cache_read"]
        g["total"] += r["total_tokens"]
        g["count"] += 1

    return {
        model: [{"date": k, **v} for k, v in sorted(dates.items())]
        for model, dates in groups.items()
    }


def _time_key(ts, granularity: str) -> str:
    if granularity == "minute":
        return ts.strftime("%H:%M")
    elif granularity == "hour":
        return ts.strftime("%Y-%m-%d %H:00")
    elif granularity == "month":
        return ts.strftime("%Y-%m")
    elif granularity == "week":
        iso = ts.isocalendar()
        return f"{iso.year}-W{iso.week:02d}"
    else:
        return ts.strftime("%Y-%m-%d")
