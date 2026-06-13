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
  const { account: connectedAccount, isConnecting, connectError, verified, connect, disconnect, logout } =
    useWallet();

  const handleButtonClick = () => {
    if (isConnecting) return;
    if (connectedAccount) {
      // Green chip (verified) -> full logout; amber chip -> just disconnect.
      if (verified) {
        logout();
      } else {
        disconnect();
      }
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
          className={`${styles.walletButton} ${
            connectedAccount
              ? verified
                ? styles.walletButtonVerified
                : styles.walletButtonConnected
              : ""
          } ${connectError && !connectedAccount && !isConnecting ? styles.walletButtonError : ""}`}
          onClick={handleButtonClick}
          disabled={isConnecting}
          title={
            connectedAccount
              ? verified
                ? "Verified — click to disconnect"
                : "Click to disconnect"
              : "Connect wallet"
          }
        >
          {connectedAccount ? (
            verified ? (
              <>
                <span className={styles.verifiedDot} />✓ {shortenAddress(connectedAccount.address)}
              </>
            ) : (
              shortenAddress(connectedAccount.address)
            )
          ) : isConnecting ? (
            "Connecting…"
          ) : connectError ? (
            connectError
          ) : (
            "Connect"
          )}
        </button>
      </div>
    </header>
  );
}
