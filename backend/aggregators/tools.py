from collections import Counter, defaultdict
from typing import Any

from backend.aggregators.usage import _time_key


def tool_counts(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    counts: Counter[str] = Counter()
    for r in records:
        for tool in r.get("tools", []):
            counts[tool] += 1

    return [{"tool": name, "count": count} for name, count in counts.most_common()]


def tool_usage_over_time(records: list[dict[str, Any]], granularity: str = "day") -> list[dict[str, Any]]:
    groups: dict[str, Counter[str]] = defaultdict(Counter)
    for r in records:
        key = _time_key(r["timestamp"], granularity)
        for tool in r.get("tools", []):
            groups[key][tool] += 1

    all_tools = sorted({tool for counts in groups.values() for tool in counts})

    result = []
    for date in sorted(groups):
        entry: dict[str, Any] = {"date": date, "total": sum(groups[date].values())}
        for tool in all_tools:
            entry[tool] = groups[date].get(tool, 0)
        result.append(entry)

    return result


def tool_usage_by_agent(records: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    groups: dict[str, Counter[str]] = defaultdict(Counter)
    for r in records:
        for tool in r.get("tools", []):
            groups[r["agent"]][tool] += 1

    return {
        agent: [{"tool": t, "count": c} for t, c in counts.most_common()]
        for agent, counts in groups.items()
    }
