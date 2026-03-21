from collections import defaultdict
from typing import Any

from backend.aggregators.usage import _time_key


def cache_hit_rate(records: list[dict[str, Any]]) -> float:
    total_input = sum(r["input_tokens"] + r["cache_read"] for r in records)
    if total_input == 0:
        return 0.0
    total_cache = sum(r["cache_read"] for r in records)
    return round(total_cache / total_input * 100, 1)


def cache_by_model(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    groups: dict[str, dict] = defaultdict(lambda: {"cache_read": 0, "total_input": 0})
    for r in records:
        g = groups[r["model"]]
        g["cache_read"] += r["cache_read"]
        g["total_input"] += r["input_tokens"] + r["cache_read"]

    result = []
    for model, g in groups.items():
        rate = round(g["cache_read"] / g["total_input"] * 100, 1) if g["total_input"] > 0 else 0.0
        result.append({"model": model, "rate": rate, **g})

    result.sort(key=lambda x: x["rate"], reverse=True)
    return result


def cache_over_time(records: list[dict[str, Any]], granularity: str = "day") -> list[dict[str, Any]]:
    groups: dict[str, dict] = defaultdict(lambda: {"cache_read": 0, "total_input": 0})
    for r in records:
        key = _time_key(r["timestamp"], granularity)
        g = groups[key]
        g["cache_read"] += r["cache_read"]
        g["total_input"] += r["input_tokens"] + r["cache_read"]

    result = []
    for date, g in sorted(groups.items()):
        rate = round(g["cache_read"] / g["total_input"] * 100, 1) if g["total_input"] > 0 else 0.0
        result.append({"date": date, "rate": rate, **g})

    return result
