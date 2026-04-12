from fastapi import APIRouter

from backend.collectors.system import system_collector
from backend.aggregators.system import system_overview, cpu_ram_over_time, network_over_time

router = APIRouter()


@router.get("/system")
def get_system():
    data = system_collector.collect()
    return {
        "overview": system_overview(data),
        "cpu_ram_over_time": cpu_ram_over_time(data),
        "network_over_time": network_over_time(data),
    }
