"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./page.module.css";

const HEARTBEAT_MS = 5 * 60 * 1000;

type View = "join" | "game";

export default function Home() {
  const [view, setView] = useState<View>("join");
  const [status, setStatus] = useState("Ready.");
  const [userId, setUserId] = useState<number | null>(null);
  const [joining, setJoining] = useState(false);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function stopHeartbeat() {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
  }

  function resetToJoin(message: string) {
    stopHeartbeat();
    sessionStorage.removeItem("user_id");
    setUserId(null);
    setStatus(message);
    setView("join");
  }

  async function sendHeartbeat(id: number) {
    try {
      const res = await fetch("/api/game/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: id }),
      });
      if (!res.ok) resetToJoin("Session expired. Please join again.");
    } catch {
      resetToJoin("Connection lost. Please join again.");
    }
  }

  function startHeartbeat(id: number) {
    stopHeartbeat();
    heartbeatRef.current = setInterval(() => sendHeartbeat(id), HEARTBEAT_MS);
  }

  function enterGame(id: number) {
    sessionStorage.setItem("user_id", String(id));
    setUserId(id);
    setJoining(false);
    setView("game");
    startHeartbeat(id);
  }

  async function joinGame() {
    setJoining(true);
    setStatus("Joining...");
    try {
      const res = await fetch("/api/game/join", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setStatus(data.detail ?? "Could not join.");
        setJoining(false);
        return;
      }
      enterGame(data.user_id);
    } catch {
      setStatus("Error: could not reach the server.");
      setJoining(false);
    }
  }

  function leaveGame() {
    const id = userId;
    resetToJoin("You have left the game.");
    if (id !== null) {
      fetch("/api/game/leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: id }),
      }).catch(() => { /* fire-and-forget, ignore errors */ });
    }
  }

  // Restore session on page reload
  useEffect(() => {
    const stored = sessionStorage.getItem("user_id");
    if (!stored) return;
    const id = parseInt(stored, 10);
    fetch("/api/game/heartbeat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: id }),
    }).then((res) => {
      if (res.ok) enterGame(id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className={styles.screen}>
      {view === "join" && (
        <>
          <p className={styles.status}>{status}</p>
          <button className={styles.btn} onClick={joinGame} disabled={joining}>
            [ ENTER WUDLANDS ]
          </button>
        </>
      )}

      {view === "game" && (
        <button className={styles.btn} onClick={leaveGame}>
          [ LEAVE WUDLANDS ]
        </button>
      )}

      {userId !== null && (
        <span className={styles.playerId}>#{userId}</span>
      )}
    </main>
  );
}
