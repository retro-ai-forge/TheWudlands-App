"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import styles from "./Header.module.css";
import { WalletConnect } from "./WalletConnect";
import type { WalletAccount } from "@/lib/wallet";

const NAV = [
  { label: "The Wudlands",       href: "/" },
  { label: "Guide",              href: "/guide" },
  { label: "Characters",         href: "/characters" },
  { label: "Contribute Stories", href: "/contribute-stories" },
  { label: "Dev Section",        href: "/dev-section" },
  { label: "AGB",                href: "/agb" },
];

function shortenAddress(address: string): string {
  if (!address || address.length < 6) return address;
  return `${address.slice(0, 3)}..${address.slice(-3)}`;
}

export default function Header() {
  const pathname = usePathname();
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [connectedAccount, setConnectedAccount] = useState<WalletAccount | null>(null);

  const handleAccountSelected = (account: WalletAccount, signer: any) => {
    setConnectedAccount(account);
    setShowWalletModal(false);
  };

  const handleButtonClick = () => {
    if (connectedAccount) {
      // If connected, clicking the address button disconnects and returns to wallet state
      setConnectedAccount(null);
      setShowWalletModal(true);
    } else {
      // If not connected, toggle modal
      setShowWalletModal(!showWalletModal);
    }
  };

  return (
    <header className={styles.header}>
      <nav className={styles.nav}>
        {NAV.map(({ label, href }) => {
          const isActive = href === "/" ? pathname === "/" : (pathname ? pathname.startsWith(href) : false);
          return (
            <Link
              key={href}
              href={href}
              className={`${styles.link} ${isActive ? styles.linkActive : ""}`}
            >
              {label}
            </Link>
          );
        })}
      </nav>
      <button
        className={`${styles.walletButton} ${connectedAccount ? styles.walletButtonConnected : ""}`}
        onClick={handleButtonClick}
      >
        {connectedAccount ? shortenAddress(connectedAccount.address) : "Wallet"}
      </button>
      {showWalletModal && !connectedAccount && (
        <div className={styles.walletModal}>
          <WalletConnect
            dappName="TheWudlands"
            onAccountSelected={handleAccountSelected}
            onError={(error) => {
              console.error(error);
            }}
          />
        </div>
      )}
    </header>
  );
}
