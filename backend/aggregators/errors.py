from collections import defaultdict, Counter
from typing import Any

from backend.aggregators.usage import _time_key

NORMAL_STOP_REASONS = {"endTurn", "end_turn", "stop", "toolUse", "tool_use"}


def error_rate(records: list[dict[str, Any]]) -> float:
    if not records:
        return 0.0
    errors = sum(1 for r in records if r["stop_reason"] not in NORMAL_STOP_REASONS)
    return round(errors / len(records) * 100, 1)


def stop_reason_distribution(records: list[dict[str, Any]]) -> dict[str, int]:
    counts = Counter(r["stop_reason"] for r in records)
    return dict(counts.most_common())


def errors_by_model(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    groups: dict[str, dict] = defaultdict(lambda: {"total": 0, "errors": 0, "reasons": Counter()})
    for r in records:
        g = groups[r["model"]]
        g["total"] += 1
        if r["stop_reason"] not in NORMAL_STOP_REASONS:
            g["errors"] += 1
            g["reasons"][r["stop_reason"]] += 1

    result = []
    for model, g in sorted(groups.items()):
        rate = round(g["errors"] / g["total"] * 100, 1) if g["total"] > 0 else 0.0
        result.append({
            "model": model,
            "total": g["total"],
            "errors": g["errors"],
            "error_rate": rate,
            "reasons": dict(g["reasons"].most_common()),
        })
    result.sort(key=lambda x: x["errors"], reverse=True)
    return result


def errors_over_time(records: list[dict[str, Any]], granularity: str = "day") -> list[dict[str, Any]]:
    groups: dict[str, dict] = defaultdict(lambda: {"total": 0, "errors": 0})
    for r in records:
        key = _time_key(r["timestamp"], granularity)
        g = groups[key]
        g["total"] += 1
        if r["stop_reason"] not in NORMAL_STOP_REASONS:
            g["errors"] += 1

    result = []
    for date, g in sorted(groups.items()):
        rate = round(g["errors"] / g["total"] * 100, 1) if g["total"] > 0 else 0.0
        result.append({"date": date, "error_rate": rate, **g})

    return result
