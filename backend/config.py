import os


DATA_DIR = os.environ.get("DATA_DIR", "/data")
AGENTS_SUBDIR = "agents"
LOGS_SUBDIR = "logs"
CACHE_TTL_SECONDS = 30
SYSTEM_CACHE_TTL_SECONDS = 10
UPTIME_TARGET_URL = os.environ.get("UPTIME_TARGET_URL", "http://localhost:18789/health")
UPTIME_CHECK_INTERVAL = int(os.environ.get("UPTIME_CHECK_INTERVAL", "60"))
