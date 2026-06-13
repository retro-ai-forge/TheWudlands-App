from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import asyncio
import time
import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from dotenv import load_dotenv
from pathlib import Path

# Load environment variables from .env file
env_path = Path(__file__).parent.parent / ".env"
load_dotenv(env_path)

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


class FeedbackRequest(BaseModel):
    feedback: str
    address: str | None = None


@app.post("/api/feedback")
async def send_feedback(req: FeedbackRequest):
    try:
        if not req.feedback or not req.feedback.strip():
            raise HTTPException(status_code=400, detail="Feedback is required")

        # Get SMTP configuration from environment variables
        smtp_host = os.getenv("SMTP_HOST")
        smtp_port = int(os.getenv("SMTP_PORT", "587"))
        smtp_user = os.getenv("SMTP_USER")
        smtp_password = os.getenv("SMTP_PASSWORD")
        smtp_from = os.getenv("SMTP_FROM", "noreply@thewudlands.eu")
        smtp_secure = os.getenv("SMTP_SECURE", "false").lower() == "true"

        print(f"SMTP Config - Host: {smtp_host}, Port: {smtp_port}, User: {smtp_user}, Secure: {smtp_secure}")

        if not all([smtp_host, smtp_user, smtp_password]):
            print(f"Missing config - Host: {smtp_host}, User: {smtp_user}, Pass: {'*' * 5 if smtp_password else 'None'}")
            raise HTTPException(
                status_code=500,
                detail="Email configuration is missing"
            )

        # Create email message
        msg = MIMEMultipart()
        msg["From"] = smtp_from
        msg["To"] = "webmaster@thewudlands.eu"
        msg["Subject"] = "New Player Feedback from The Wudlands"

        # Email body
        address_line = f"Polkadot address:\n{req.address}\n\n" if req.address else ""
        body = f"""New player feedback received:

{address_line}{req.feedback.strip()}

---
Timestamp: {time.strftime('%Y-%m-%d %H:%M:%S')}
"""

        msg.attach(MIMEText(body, "plain"))

        print(f"[Feedback email]\nTo: {msg['To']}\nSubject: {msg['Subject']}\n\n{body}")
        print(f"Connecting to {smtp_host}:{smtp_port}...")
        # Send email
        with smtplib.SMTP(smtp_host, smtp_port) as server:
            if not smtp_secure:
                print("Starting TLS...")
                server.starttls()
            print(f"Logging in as {smtp_user}...")
            server.login(smtp_user, smtp_password)
            print("Sending message...")
            server.send_message(msg)
            print("Message sent!")

        return {"message": "Feedback sent successfully"}

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error sending feedback: {type(e).__name__}: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to send feedback: {str(e)}"
        )
