import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from starlette.responses import Response

from backend.routers import overview, usage, cache, errors, sessions, tools
from backend.routers import system, uptime, cron
from backend.collectors.uptime import uptime_collector
from backend.config import UPTIME_CHECK_INTERVAL


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Start uptime checker background task
    async def check_loop():
        # Wait for server to be ready before first check
        await asyncio.sleep(5)
        while True:
            await uptime_collector.perform_check()
            await asyncio.sleep(UPTIME_CHECK_INTERVAL)
    task = asyncio.create_task(check_loop())
    yield
    task.cancel()


app = FastAPI(title="Claw Usage Dashboard", version="1.2.0", lifespan=lifespan)


@app.middleware("http")
async def no_cache_static(request, call_next):
    response: Response = await call_next(request)
    if request.url.path.startswith("/js/") or request.url.path.startswith("/css/"):
        response.headers["Cache-Control"] = "no-cache, must-revalidate"
    return response


app.include_router(overview.router, prefix="/api")
app.include_router(usage.router, prefix="/api")
app.include_router(cache.router, prefix="/api")
app.include_router(errors.router, prefix="/api")
app.include_router(sessions.router, prefix="/api")
app.include_router(tools.router, prefix="/api")
app.include_router(system.router, prefix="/api")
app.include_router(uptime.router, prefix="/api")
app.include_router(cron.router, prefix="/api")

app.mount("/", StaticFiles(directory="frontend", html=True), name="frontend")
