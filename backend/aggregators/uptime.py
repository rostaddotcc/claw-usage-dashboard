from typing import Any


def uptime_summary(data: dict[str, Any]) -> dict[str, Any]:
    return {
        "is_up": data["current"]["is_up"],
        "response_time_ms": data["current"].get("response_time_ms", 0),
        "uptime_pct": data["uptime_pct"],
        "uptime_seconds": data.get("uptime_seconds", 0),
        "up_since": data.get("up_since"),
        "process_uptime_seconds": data.get("process_uptime_seconds", 0),
        "started_at": data.get("started_at"),
        "last_check": data["current"].get("timestamp"),
        "total_checks": len(data["history"]),
    }


def response_time_over_time(data: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        {"timestamp": c["timestamp"], "response_time": c["response_time_ms"]}
        for c in data["history"]
    ]


def status_code_distribution(data: dict[str, Any]) -> dict[str, int]:
    return data["status_codes"]
