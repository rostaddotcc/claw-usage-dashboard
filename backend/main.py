from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from backend.routers import overview, usage, cache, errors, sessions

app = FastAPI(title="Claw Usage Dashboard", version="1.0.0")

app.include_router(overview.router, prefix="/api")
app.include_router(usage.router, prefix="/api")
app.include_router(cache.router, prefix="/api")
app.include_router(errors.router, prefix="/api")
app.include_router(sessions.router, prefix="/api")

app.mount("/", StaticFiles(directory="frontend", html=True), name="frontend")
