"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { detectWallets, type DetectedWallet } from "@/app/lib/wallet";
import styles from "./WalletSelectModal.module.css";

const WALLET_META: Record<string, { label: string; icon: string }> = {
  "polkadot-js":  { label: "Polkadot.js",  icon: "/icons/wallets/polkadot-js.svg" },
  "nova-wallet":  { label: "Nova Wallet",   icon: "/icons/wallets/nova.svg" },
  "talisman":     { label: "Talisman",      icon: "/icons/wallets/talisman.svg" },
  "subwallet-js": { label: "SubWallet",     icon: "/icons/wallets/subwallet.svg" },
};

interface WalletSelectModalProps {
  onSelect: (walletName: string) => void;
  onClose: () => void;
}

export function WalletSelectModal({ onSelect, onClose }: WalletSelectModalProps) {
  const [wallets, setWallets] = useState<DetectedWallet[] | null>(null);

  useEffect(() => {
    detectWallets("TheWudlands").then(({ wallets: detected }) => {
      setWallets(detected);
    }).catch(() => {
      setWallets([]);
    });
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <p className={styles.title}>Select Wallet</p>

        {wallets === null ? (
          <div className={styles.spinner}>Detecting wallets...</div>
        ) : wallets.length === 0 ? (
          <div className={styles.noWallets}>
            <p>No wallet extension detected.</p>
            <p>
              Install{" "}
              <Link href="https://novawallet.io/" target="_blank" rel="noopener noreferrer">Nova Wallet</Link> (mobile),{" "}
              <Link href="https://www.talisman.xyz/" target="_blank" rel="noopener noreferrer">Talisman</Link>,{" "}
              <Link href="https://www.subwallet.app/" target="_blank" rel="noopener noreferrer">SubWallet</Link>, or{" "}
              <Link href="https://polkadot.js.org/extension/" target="_blank" rel="noopener noreferrer">Polkadot.js</Link>{" "}
              to continue.
            </p>
          </div>
        ) : (
          <div className={styles.walletList}>
            {wallets.map((w) => {
              const meta = WALLET_META[w.name];
              const label = meta?.label ?? w.name;
              const icon = w.icon ?? meta?.icon;
              return (
                <button
                  key={w.name}
                  className={styles.walletButton}
                  onClick={() => onSelect(w.name)}
                >
                  {icon ? (
                    <img src={icon} alt={label} className={styles.walletIcon} />
                  ) : (
                    <span className={styles.walletIconFallback}>
                      {label.charAt(0).toUpperCase()}
                    </span>
                  )}
                  <span className={styles.walletInfo}>
                    <span className={styles.walletName}>{label}</span>
                    {w.version && <span className={styles.walletVersion}>v{w.version}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <button className={styles.closeButton} onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}
