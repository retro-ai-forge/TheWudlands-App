"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./Header.module.css";
import { useWallet } from "./WalletProvider";

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
  const { account: connectedAccount, isConnecting, connectError, connect, disconnect } =
    useWallet();

  const handleButtonClick = () => {
    if (isConnecting) return;
    if (connectedAccount) {
      disconnect();
    } else {
      connect();
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
      <div className={styles.walletArea}>
        <button
          className={`${styles.walletButton} ${connectedAccount ? styles.walletButtonConnected : ""} ${
            connectError && !connectedAccount && !isConnecting ? styles.walletButtonError : ""
          }`}
          onClick={handleButtonClick}
          disabled={isConnecting}
          title={connectedAccount ? "Click to disconnect" : "Connect wallet"}
        >
          {connectedAccount
            ? shortenAddress(connectedAccount.address)
            : isConnecting
            ? "Connecting…"
            : connectError
            ? connectError
            : "Connect"}
        </button>
      </div>
    </header>
  );
}
