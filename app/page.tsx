"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import styles from "./page.module.css";
import { EnterWudlandsButton } from "./components/EnterWudlandsButton";

const HEARTBEAT_MS = 5 * 60 * 1000;

type View = "join" | "game";

export default function Home() {
  const [view, setView] = useState<View>("join");
  const [status, setStatus] = useState("Ready.");
  const [userId, setUserId] = useState<number | null>(null);
  const [joining, setJoining] = useState(false);
  const [playerAddress, setPlayerAddress] = useState<string | null>(null);
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
    setPlayerAddress(null);
    localStorage.removeItem("session_token");
    localStorage.removeItem("player_address");
    if (id !== null) {
      fetch("/api/game/leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: id }),
      }).catch(() => { /* fire-and-forget, ignore errors */ });
    }
  }

  async function joinGameAfterAuth(address: string) {
    setJoining(true);
    setStatus("Joining game...");
    try {
      const sessionToken = localStorage.getItem("session_token");
      const res = await fetch("/api/game/join", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${sessionToken}`,
        },
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus(data.detail ?? "Could not join.");
        setJoining(false);
        return;
      }
      setPlayerAddress(address);
      enterGame(data.user_id);
    } catch {
      setStatus("Error: could not reach the server.");
      setJoining(false);
    }
  }

  function handleEnterWudlands(address: string) {
    joinGameAfterAuth(address);
  }

  function handleAuthError(error: string) {
    setStatus(`Auth error: ${error}`);
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
    <main className={view === "game" ? styles.welcomeScreen : styles.screen}>
      {view === "join" && (
        <>
          <p className={styles.status}>{status}</p>
          <EnterWudlandsButton
            onEnter={handleEnterWudlands}
            onError={handleAuthError}
            disabled={joining}
          />
        </>
      )}

      {view === "game" && (
        <>
          <div className={styles.welcomeBody}>
            <h1 className={styles.welcomeHeadline}>Welcome to Wudlands</h1>
            <p className={styles.welcomeMessage}>
              Thanks for signing in — please read the{" "}
              <Link href="/guide" className={styles.welcomeLink}>guide</Link>{" "}
              on how to continue.
            </p>
          </div>
          <button className={styles.btn} onClick={leaveGame}>
            [ SIGN OUT ]
          </button>
        </>
      )}

      {userId !== null && (
        <span className={styles.playerId}>#{userId}</span>
      )}
      {playerAddress !== null && (
        <span className={styles.playerAddress}>{playerAddress.slice(0, 10)}...</span>
      )}
    </main>
  );
}
