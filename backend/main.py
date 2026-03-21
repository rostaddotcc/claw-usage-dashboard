from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from starlette.responses import Response

from backend.routers import overview, usage, cache, errors, sessions, tools

app = FastAPI(title="Claw Usage Dashboard", version="1.0.0")


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

app.mount("/", StaticFiles(directory="frontend", html=True), name="frontend")
