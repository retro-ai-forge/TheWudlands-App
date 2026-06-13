from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import asyncio
import time

# Import auth routes
from backend.auth_routes import router as auth_router

MAX_USERS = 100
TIMEOUT_SECONDS = 30 * 60  # 30 minutes
CLEANUP_INTERVAL = 60       # check every minute

# user_id -> last_activity_timestamp (Unix seconds)
active_sessions: dict[int, float] = {}
next_id_counter: int = 1


def purge_inactive() -> list[int]:
    now = time.time()
    expired = [uid for uid, ts in active_sessions.items() if now - ts > TIMEOUT_SECONDS]
    for uid in expired:
        del active_sessions[uid]
    return expired


async def cleanup_loop():
    while True:
        await asyncio.sleep(CLEANUP_INTERVAL)
        purge_inactive()


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(cleanup_loop())
    yield
    task.cancel()


app = FastAPI(title="TheWudlands API", lifespan=lifespan)

# Add CORS middleware for frontend-backend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include authentication router
app.include_router(auth_router)


class UserRequest(BaseModel):
    user_id: int


@app.post("/api/game/join")
async def join_game():
    global next_id_counter
    purge_inactive()

    if len(active_sessions) >= MAX_USERS:
        raise HTTPException(
            status_code=503,
            detail="Total users used up, please wait.",
        )

    user_id = next_id_counter
    next_id_counter += 1
    active_sessions[user_id] = time.time()

    return {"user_id": user_id}


@app.post("/api/game/heartbeat")
async def heartbeat(req: UserRequest):
    if req.user_id not in active_sessions:
        raise HTTPException(status_code=404, detail="session_expired")
    active_sessions[req.user_id] = time.time()
    return {"status": "ok"}


@app.post("/api/game/leave")
async def leave_game(req: UserRequest):
    active_sessions.pop(req.user_id, None)
    return {"status": "ok"}


@app.get("/api/game/stats")
async def stats():
    return {"active_users": len(active_sessions), "max_users": MAX_USERS}
