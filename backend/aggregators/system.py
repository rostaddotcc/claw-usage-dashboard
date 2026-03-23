from typing import Any


def system_overview(data: dict[str, Any]) -> dict[str, Any]:
    c = data["current"]
    return {
        "cpu_pct": c["cpu_pct"],
        "ram_pct": c["ram_pct"],
        "ram_used_gb": round(c["ram_used"] / (1024**3), 1),
        "ram_total_gb": round(c["ram_total"] / (1024**3), 1),
        "disk_pct": c["disk_pct"],
        "disk_used_gb": round(c["disk_used"] / (1024**3), 1),
        "disk_total_gb": round(c["disk_total"] / (1024**3), 1),
    }


def cpu_ram_over_time(data: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        {"timestamp": s["timestamp"], "cpu": s["cpu_pct"], "ram": s["ram_pct"]}
        for s in data["history"]
    ]


def network_over_time(data: dict[str, Any]) -> list[dict[str, Any]]:
    history = data["history"]
    result = []
    for i, s in enumerate(history):
        if i == 0:
            result.append({
                "timestamp": s["timestamp"],
                "sent_mb": 0,
                "recv_mb": 0,
            })
        else:
            prev = history[i - 1]
            result.append({
                "timestamp": s["timestamp"],
                "sent_mb": round((s["net_sent"] - prev["net_sent"]) / (1024**2), 2),
                "recv_mb": round((s["net_recv"] - prev["net_recv"]) / (1024**2), 2),
            })
    return result
