"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useWallet } from "./WalletProvider";
import { useHeaderVisibility } from "./HeaderVisibilityProvider";
import styles from "./VersionBadge.module.css";

export function VersionBadge() {
  const { verified } = useWallet();
  const pathname = usePathname();
  const isMainPage = pathname === "/";
  // Soul creation (and anything else that blends the header out) hides the
  // online-player count too — it's about the same "focused flow" state.
  const { hidden: headerHidden } = useHeaderVisibility();
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
      {verified ? (
        isMainPage && !headerHidden && playerCount !== null && (
          <div className={styles.playerCount}>{playerCount} online</div>
        )
      ) : (
        <div className={styles.badge}>beta-0.72</div>
      )}
    </div>
  );
}
