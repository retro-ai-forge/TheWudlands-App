"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./page.module.css";
import { useWallet } from "./main/WalletProvider";
import { LandingView } from "./main/landing/LandingView";
import { WelcomeView } from "./main/welcome/WelcomeView";
import BannerSlideshow from "./main/landing/BannerSlideshow";
import { DUNGEON_FLAVOR_LINES } from "./dungeonFlavorText";

type View = "join" | "pending" | "game";

const FLAVOR_SWAP_INTERVAL_MS = 5000;

function pickRandomFlavorLine() {
  return DUNGEON_FLAVOR_LINES[Math.floor(Math.random() * DUNGEON_FLAVOR_LINES.length)];
}

export default function Home() {
  const [view, setView] = useState<View>("join");
  const [restoring, setRestoring] = useState(true);
  const [status, setStatus] = useState("Ready.");
  const [entering, setEntering] = useState(false);
  const [flavorLine, setFlavorLine] = useState("");
  const { verified, account } = useWallet();
  const wasVerified = useRef(false);

  // Rotate a random flavor line on the pending view so a slow backend
  // round-trip reads as atmosphere rather than a stall.
  useEffect(() => {
    if (view !== "pending") return;
    setFlavorLine(pickRandomFlavorLine());
    const interval = setInterval(() => {
      setFlavorLine(pickRandomFlavorLine());
    }, FLAVOR_SWAP_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [view]);

  function resetToJoin(message: string) {
    setEntering(false);
    setStatus(message);
    setView("join");
  }

  // Tear down the in-game session.
  // Triggered when the user logs out (verified -> false) from the header chip
  // or the on-page Sign Out button. Wallet/session/verified state is cleared
  // separately by the context's logout().
  function endGameSession() {
    resetToJoin("You have signed out.");
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

  async function enterGameSession() {
    setEntering(true);
    setStatus("Entering The Wudlands...");
    // Simulate entry delay for UX
    await new Promise(resolve => setTimeout(resolve, 500));
    setView("game");
    setEntering(false);
  }

  function handleEnterWudlands() {
    enterGameSession();
  }

  // The database backing login can occasionally take a while to respond —
  // switch to a full-screen pending view the moment a backend round-trip
  // starts, rather than leaving the user staring at the button.
  function handlePending() {
    setStatus("Entering The Wudlands...");
    setView("pending");
  }

  // A pending backend check (e.g. no existing session) fell through to the
  // wallet-connect step, which needs the landing page visible again.
  function handlePendingCancel() {
    setView("join");
  }

  function handleAuthError(error: string) {
    setStatus(`Auth error: ${error}`);
    setView("join");
  }

  // Session is validated via the secure cookie in WalletProvider
  useEffect(() => {
    setRestoring(false);
  }, []);

  if (restoring) return <main className={styles.restoring} />;

  if (view === "pending") {
    return (
      <main className={styles.pending}>
        <div className={styles.pendingSpinner} />
        <p className={styles.pendingText}>{status}</p>
        <p className={styles.pendingFlavorLine} key={flavorLine}>
          {flavorLine}
        </p>
      </main>
    );
  }

  return (
    <main className={view === "game" ? styles.welcomeScreen : styles.screen}>
      {view === "join" && (
        <>
          <BannerSlideshow />
          <LandingView
            status={status}
            joining={entering}
            onEnter={handleEnterWudlands}
            onError={handleAuthError}
            onPending={handlePending}
            onPendingCancel={handlePendingCancel}
          />
        </>
      )}

      {view === "game" && <WelcomeView />}
    </main>
  );
}
