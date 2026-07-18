"use client";

import { useEffect, useState } from "react";
import { useWallet } from "./WalletProvider";
import styles from "./VersionBadge.module.css";

export function VersionBadge() {
  const { verified } = useWallet();
  const [playerCount, setPlayerCount] = useState<number | null>(null);

  useEffect(() => {
    if (!verified) return;

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
      {playerCount !== null && (
        <div className={styles.playerCount}>{playerCount} online</div>
      )}
      <div className={styles.badge}>beta-0.6</div>
    </div>
  );
}
