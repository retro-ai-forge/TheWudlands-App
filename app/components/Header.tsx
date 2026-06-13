"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import styles from "./Header.module.css";
import { useWallet } from "./WalletProvider";

const NAV = [
  { label: "The Wudlands",       href: "/" },
  { label: "Guide",              href: "/guide" },
  { label: "Characters",         href: "/characters" },
  { label: "Storyteller",        href: "/storyteller" },
  { label: "Dev Section",        href: "/dev-section" },
  { label: "GTC",                href: "/gtc" },
];

function shortenAddress(address: string): string {
  if (!address || address.length < 6) return address;
  return `${address.slice(0, 3)}..${address.slice(-3)}`;
}

export default function Header() {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const { account: connectedAccount, isConnecting, connectError, verified, connect, disconnect, logout } =
    useWallet();

  const currentPage = NAV.find(({ href }) =>
    href === "/" ? pathname === "/" : pathname?.startsWith(href)
  );
  const currentLabel = currentPage?.label ?? "The Wudlands";

  useEffect(() => {
    setMenuOpen(false);
    const nav = navRef.current;
    if (!nav) return;
    const active = nav.querySelector(`.${styles.linkActive}`) as HTMLElement | null;
    if (active) {
      active.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    }
  }, [pathname]);

  const handleButtonClick = () => {
    if (isConnecting) return;
    if (connectedAccount) {
      if (verified) {
        logout();
      } else {
        disconnect();
      }
    } else {
      connect();
    }
  };

  const walletButtonJsx = (
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
              <span className={styles.verifiedDot} /> {shortenAddress(connectedAccount.address)}
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
  );

  return (
    <header className={styles.header}>

      {/* Desktop nav — hidden below 1000px */}
      <nav ref={navRef} className={styles.nav}>
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

      {/* Mobile hamburger button — hidden above 1000px */}
      <button
        className={styles.hamburger}
        onClick={() => setMenuOpen(o => !o)}
        aria-label="Toggle navigation"
        aria-expanded={menuOpen}
      >
        {menuOpen ? "✕" : "☰"}
      </button>

      {/* Mobile current page title — absolutely centred in header, hidden above 1000px */}
      <span className={styles.mobilePageTitle}>{currentLabel}</span>

      {walletButtonJsx}

      {/* Mobile dropdown — full-width second row, hidden above 1000px */}
      {menuOpen && (
        <nav className={styles.mobileMenu}>
          {NAV.map(({ label, href }) => {
            const isActive = href === "/" ? pathname === "/" : (pathname ? pathname.startsWith(href) : false);
            return (
              <Link
                key={href}
                href={href}
                className={`${styles.mobileMenuLink} ${isActive ? styles.mobileMenuLinkActive : ""}`}
                onClick={() => setMenuOpen(false)}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      )}

    </header>
  );
}
