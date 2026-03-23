from fastapi import APIRouter

from backend.collectors.cron import cron_collector
from backend.aggregators.cron import aggregate_cron_jobs

router = APIRouter()


@router.get("/cron")
def get_cron():
    data = cron_collector.collect()
    return aggregate_cron_jobs(data)
