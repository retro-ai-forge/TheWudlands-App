"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./page.module.css";
import { useWallet } from "./main/WalletProvider";
import { LandingView } from "./main/LandingView";
import { WelcomeView } from "./main/WelcomeView";
import BannerSlideshow from "./main/BannerSlideshow";
import HomeBackground from "./main/HomeBackground";

const HEARTBEAT_MS = 5 * 60 * 1000;

type View = "join" | "game";

export default function Home() {
  const [view, setView] = useState<View>("join");
  const [restoring, setRestoring] = useState(true);
  const [status, setStatus] = useState("Ready.");
  const [userId, setUserId] = useState<number | null>(null);
  const [joining, setJoining] = useState(false);
  const [playerAddress, setPlayerAddress] = useState<string | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { verified, account, logout } = useWallet();
  const wasVerified = useRef(false);

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
      if (!res.ok) {
        logout();
        window.location.href = '/';
      }
    } catch {
      logout();
      window.location.href = '/';
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

  // Tear down the in-game session (heartbeat, view, server-side leave).
  // Triggered when the user logs out (verified -> false) from the header chip
  // or the on-page Sign Out button. Wallet/session/verified state is cleared
  // separately by the context's logout().
  function endGameSession() {
    const id = userId;
    resetToJoin("You have signed out.");
    setPlayerAddress(null);
    if (id !== null) {
      fetch("/api/game/leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: id }),
      }).catch(() => { /* fire-and-forget, ignore errors */ });
    }
  }

  // Primary: tear down the game session when verified drops to false.
  useEffect(() => {
    if (wasVerified.current && !verified) {
      endGameSession();
    }
    wasVerified.current = verified;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verified]);

  // Safety net for mobile: some browsers don't reliably fire the effect above
  // when context state changes. Watching account (goes null on logout) gives a
  // second trigger. wasVerified guards against firing during session restore
  // (where account is null but wasVerified is false from the start).
  useEffect(() => {
    if (!account && view === "game" && wasVerified.current) {
      endGameSession();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account]);

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
    if (!stored) { setRestoring(false); return; }
    const id = parseInt(stored, 10);
    fetch("/api/game/heartbeat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: id }),
    }).then((res) => {
      if (res.ok) enterGame(id);
      else { logout(); sessionStorage.removeItem("user_id"); }
    }).catch(() => {
      logout(); sessionStorage.removeItem("user_id");
    }).finally(() => {
      setRestoring(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (restoring) return <main className={styles.restoring} />;

  return (
    <main className={view === "game" ? styles.welcomeScreen : styles.screen}>
      {view === "join" && (
        <>
          <HomeBackground />
          <BannerSlideshow />
          <LandingView
            status={status}
            joining={joining}
            onEnter={handleEnterWudlands}
            onError={handleAuthError}
          />
        </>
      )}

      {view === "game" && (
        <WelcomeView
          userId={userId}
          playerAddress={playerAddress}
        />
      )}
    </main>
  );
}
