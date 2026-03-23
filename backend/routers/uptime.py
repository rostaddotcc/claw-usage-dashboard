from fastapi import APIRouter

from backend.collectors.uptime import uptime_collector
from backend.aggregators.uptime import uptime_summary, response_time_over_time, status_code_distribution

router = APIRouter()


@router.get("/uptime")
def get_uptime():
    data = uptime_collector.collect()
    return {
        "summary": uptime_summary(data),
        "response_time_over_time": response_time_over_time(data),
        "status_codes": status_code_distribution(data),
    }
