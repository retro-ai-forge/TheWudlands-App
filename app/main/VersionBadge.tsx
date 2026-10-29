"use client";

import { useEffect, useState } from "react";
import { useWallet } from "./WalletProvider";
import { useHeaderVisibility } from "./HeaderVisibilityProvider";
import { APP_VERSION } from "./appVersion";
import styles from "./VersionBadge.module.css";

export function VersionBadge() {
  const { verified } = useWallet();
  const { hidden: headerHidden } = useHeaderVisibility();
  const [playerCount, setPlayerCount] = useState<number | null>(null);

  useEffect(() => {
    if (!verified) {
      setPlayerCount(null);
      return;
    }

    let cancelled = false;
    fetch("/api/auth/active-players/count", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) setPlayerCount(data.count);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
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
