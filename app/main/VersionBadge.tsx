"use client";

import { useEffect, useState } from "react";
import { useWallet } from "./WalletProvider";
import { useHeaderVisibility } from "./HeaderVisibilityProvider";
import { APP_VERSION } from "./appVersion";
import styles from "./VersionBadge.module.css";

const POLL_MS = 5 * 60 * 1000;
const MIN_REFRESH_MS = 60 * 1000;

export function VersionBadge() {
  const { verified } = useWallet();
  const { hidden: headerHidden } = useHeaderVisibility();
  const [playerCount, setPlayerCount] = useState<number | null>(null);

  // Asked again every few minutes while the tab is visible. The request also
  // keeps this player counted as online (backend/active_players.py: 15 min
  // window), so it has to stay well below that.
  useEffect(() => {
    if (!verified) {
      setPlayerCount(null);
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    let lastLoad = 0;

    const load = () => {
      lastLoad = Date.now();
      fetch("/api/auth/active-players/count", { credentials: "include" })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!cancelled && data) setPlayerCount(data.count);
        })
        .catch(() => {});
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        if (timer !== null) return;
        // Coming back to the tab: refresh unless it was asked just now.
        if (Date.now() - lastLoad >= MIN_REFRESH_MS) load();
        timer = setInterval(load, POLL_MS);
      } else if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };

    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      if (timer !== null) clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [verified]);

  return (
    <div className={styles.wrapper}>
      {verified ? (
        !headerHidden && playerCount !== null && (
          <div className={styles.playerCount}>{playerCount} online</div>
        )
      ) : (
        <div className={styles.badge}>{APP_VERSION}</div>
      )}
    </div>
  );
}
