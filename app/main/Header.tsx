"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./Header.module.css";
import { useWallet } from "./WalletProvider";

const NAV = [
  { label: "Play",       href: "/" },
  { label: "The World",  href: "/theworld" },
  { label: "Guide",      href: "/guide" },
  { label: "Create",     href: "/create" },
];

function shortenAddress(address: string): string {
  if (!address || address.length < 6) return address;
  return `${address.slice(0, 3)}..${address.slice(-3)}`;
}

export default function Header() {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [faded, setFaded] = useState(false);
  const [showConnectError, setShowConnectError] = useState(false);
  const [connectAttemptKey, setConnectAttemptKey] = useState(0);
  const lastScrollY = useRef(0);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuOpenRef = useRef(false);
  const { account: connectedAccount, isConnecting, connectError, verified, connect, disconnect, logout } =
    useWallet();

  // Auto-dismiss the connect error hint after 2 seconds.
  // Depend on connectAttemptKey so the effect re-triggers on each new attempt.
  useEffect(() => {
    if (connectError) {
      setShowConnectError(true);
      const timer = setTimeout(() => setShowConnectError(false), 2000);
      return () => clearTimeout(timer);
    } else {
      setShowConnectError(false);
    }
  }, [connectError, connectAttemptKey]);

  const clearIdle = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
  }, []);

  const startIdle = useCallback(() => {
    clearIdle();
    if (!menuOpenRef.current && window.scrollY > 0) {
      idleTimer.current = setTimeout(() => setFaded(true), 4000);
    }
  }, [clearIdle]);

  const show = useCallback(() => {
    setFaded(false);
    startIdle();
  }, [startIdle]);

  // Keep ref in sync; pause idle timer while menu is open.
  useEffect(() => {
    menuOpenRef.current = menuOpen;
    if (menuOpen) {
      clearIdle();
      setFaded(false);
    } else {
      startIdle();
    }
  }, [menuOpen, clearIdle, startIdle]);

  useEffect(() => {
    lastScrollY.current = window.scrollY;

    // At top on load → stay visible without idle timer
    if (window.scrollY === 0) {
      setFaded(false);
    } else {
      startIdle();
    }

    const handleScroll = () => {
      const currentY = window.scrollY;
      const delta = currentY - lastScrollY.current;
      if (Math.abs(delta) < 5) return;
      if (currentY === 0) {
        // At the very top → always keep visible, no idle timer
        setFaded(false);
        clearIdle();
      } else if (delta > 0) {
        // Scrolling down → fade out
        setFaded(true);
        clearIdle();
      } else {
        // Scrolling up → fade in
        show();
      }
      lastScrollY.current = currentY;
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("mousemove", show, { passive: true });
    window.addEventListener("touchstart", show, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("mousemove", show);
      window.removeEventListener("touchstart", show);
      clearIdle();
    };
  }, [show, startIdle, clearIdle]);

  // Close menu on navigation.
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
      if (verified) logout();
      else disconnect();
    } else {
      // Increment the key so the effect re-runs even if connectError is the same.
      setConnectAttemptKey(k => k + 1);
      connect();
    }
  };

  // Left half of header → toggle menu. Right half → wallet action.
  // Real interactive elements (nav links, wallet button) handle themselves.
  const handleHeaderClick = (e: React.MouseEvent<HTMLElement>) => {
    if ((e.target as HTMLElement).closest("a, button")) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (e.clientX < rect.left + rect.width / 2) {
      setMenuOpen(o => !o);
    } else {
      setMenuOpen(false);
      handleButtonClick();
    }
  };

  const currentPage = NAV.find(({ href }) =>
    href === "/" ? pathname === "/" : pathname?.startsWith(href)
  );
  const currentLabel = currentPage?.label ?? "The Wudlands";

  return (
    <>
    {menuOpen && (
      <div className={styles.menuBackdrop} onClick={() => setMenuOpen(false)} />
    )}
    <header
      className={`${styles.header} ${faded ? styles.headerFaded : ""}`}
      onClick={handleHeaderClick}
    >

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

      {/* Mobile hamburger icon — hidden above 1000px; clicking anywhere on the
          left half of the header also toggles the menu via handleHeaderClick */}
      <button
        className={styles.hamburger}
        onClick={() => setMenuOpen(o => !o)}
        aria-label="Toggle navigation"
        aria-expanded={menuOpen}
      >
        {menuOpen ? "✕" : "☰"}
      </button>

      {/* Mobile current page title — hidden above 1000px */}
      <span className={styles.mobilePageTitle}>{currentLabel}</span>

      {/* Wallet connect button — pinned to top-right corner */}
      <div className={styles.walletArea}>
        <button
          className={`${styles.walletButton} ${
            connectedAccount
              ? verified ? styles.walletButtonVerified : styles.walletButtonConnected
              : ""
          } ${showConnectError && !connectedAccount && !isConnecting ? styles.walletButtonError : ""}`}
          onClick={handleButtonClick}
          disabled={isConnecting}
          title={
            connectedAccount
              ? verified ? "Verified — click to disconnect" : "Click to disconnect"
              : "Connect wallet"
          }
        >
          {connectedAccount ? (
            verified ? (
              <><span className={styles.verifiedDot} /> {shortenAddress(connectedAccount.address)}</>
            ) : (
              shortenAddress(connectedAccount.address)
            )
          ) : isConnecting ? "Connecting…" : showConnectError ? connectError : "Connect"}
        </button>
      </div>

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
    </>
  );
}
