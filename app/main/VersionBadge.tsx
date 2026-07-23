"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useWallet } from "./WalletProvider";
import styles from "./VersionBadge.module.css";

export function VersionBadge() {
  const { verified } = useWallet();
  const pathname = usePathname();
  const isMainPage = pathname === "/";
  const [playerCount, setPlayerCount] = useState<number | null>(null);

  useEffect(() => {
    if (!verified || !isMainPage) {
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
  }, [verified, isMainPage]);

  return (
    <div className={styles.wrapper}>
      <div className={styles.badge}>beta-0.62</div>
      {isMainPage && playerCount !== null && (
        <div className={styles.playerCount}>{playerCount} online</div>
      )}
    </div>
  );
}
