import json
from pathlib import Path

from fastapi import APIRouter, Query

from backend.collectors.sessions import collector
from backend.config import DATA_DIR, AGENTS_SUBDIR
from backend.routers.stats import _period_to_dates
from backend.aggregators.tools import (
    tool_counts,
    tool_usage_over_time,
    tool_usage_by_agent,
)

router = APIRouter()


@router.get("/tools")
def get_tools(
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
    tool_use_stops = [
        r for r in records if r.get("stop_reason") in ("toolUse", "tool_use")
    ]

    samples = []
    for r in (with_tools or tool_use_stops)[:limit]:
        samples.append(
            {
                "session_id": r["session_id"][:8],
                "stop_reason": r["stop_reason"],
                "tools": r.get("tools", []),
                "model": r["model"],
                "timestamp": r["timestamp"].isoformat(),
            }
        )

    return {
        "total_records": len(records),
        "records_with_tools": len(with_tools),
        "records_with_toolUse_stop": len(tool_use_stops),
        "samples": samples,
    }


@router.get("/tools/raw")
def raw_jsonl(lines: int = Query(10)):
    """Show raw JSONL entries to debug format. Looks for entries with stopReason=toolUse."""
    agents_path = Path(DATA_DIR) / AGENTS_SUBDIR
    if not agents_path.exists():
        return {"error": "no agents dir"}

    results = []
    for agent_dir in sorted(agents_path.iterdir()):
        if not agent_dir.is_dir():
            continue
        sessions_dir = agent_dir / "sessions"
        if not sessions_dir.exists():
            continue
        for session_file in sessions_dir.glob("*.jsonl"):
            if session_file.name == "sessions.json":
                continue
            try:
                with open(session_file) as f:
                    for line in f:
                        try:
                            entry = json.loads(line)
                        except json.JSONDecodeError:
                            continue
                        # Find entries that have toolUse stop reason
                        msg = entry.get("message", {})
                        if (
                            msg.get("stopReason") == "toolUse"
                            or entry.get("stopReason") == "toolUse"
                        ):
                            # Show top-level keys and message keys (truncate content)
                            summary = {"_top_keys": list(entry.keys())}
                            if "message" in entry:
                                msg_keys = list(entry["message"].keys())
                                summary["_msg_keys"] = msg_keys
                                if "content" in entry["message"]:
                                    content = entry["message"]["content"]
                                    if isinstance(content, list):
                                        summary["_msg_content_types"] = [
                                            {
                                                k: v
                                                for k, v in b.items()
                                                if k in ("type", "name", "id")
                                            }
                                            for b in content
                                            if isinstance(b, dict)
                                        ]
                                    else:
                                        summary["_msg_content_type"] = type(
                                            content
                                        ).__name__
                            if "content" in entry:
                                content = entry["content"]
                                if isinstance(content, list):
                                    summary["_entry_content_types"] = [
                                        {
                                            k: v
                                            for k, v in b.items()
                                            if k in ("type", "name", "id")
                                        }
                                        for b in content
                                        if isinstance(b, dict)
                                    ]
                                else:
                                    summary["_entry_content_type"] = type(
                                        content
                                    ).__name__
                            results.append(summary)
                            if len(results) >= lines:
                                return {"count": len(results), "entries": results}
            except OSError:
                continue

    return {"count": len(results), "entries": results}
