"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./page.module.css";
import { useWallet } from "./main/WalletProvider";
import { LandingView } from "./main/LandingView";
import { WelcomeView } from "./main/WelcomeView";
import BannerSlideshow from "./main/BannerSlideshow";

type View = "join" | "game";

export default function Home() {
  const [view, setView] = useState<View>("join");
  const [restoring, setRestoring] = useState(true);
  const [status, setStatus] = useState("Ready.");
  const [entering, setEntering] = useState(false);
  const { verified, account } = useWallet();
  const wasVerified = useRef(false);

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

  function handleAuthError(error: string) {
    setStatus(`Auth error: ${error}`);
  }

  // Session is validated via the secure cookie in WalletProvider
  useEffect(() => {
    setRestoring(false);
  }, []);

  if (restoring) return <main className={styles.restoring} />;

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
          />
        </>
      )}

      {view === "game" && <WelcomeView />}
    </main>
  );
}
