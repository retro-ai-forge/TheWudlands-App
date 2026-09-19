"use client";

/**
 * App-wide wallet connection state.
 * The header's Connect button and the "Enter Wudlands" button both read the
 * same connected account from here, so the offline signing flow can reuse the
 * address that was connected in the header.
 */

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import {
  enableWalletExtension,
  getAccounts,
  resetWalletState,
  type WalletAccount,
} from "@/app/lib/wallet";

interface WalletContextValue {
  account: WalletAccount | null;
  isConnecting: boolean;
  connectError: string | null;
  /** True once the user has signed the challenge and the backend verified it. */
  verified: boolean;
  setVerified: (value: boolean) => void;
  /** Attempts to connect; resolves with the account on success, or null on failure. */
  connect: () => Promise<WalletAccount | null>;
  disconnect: () => void;
  /** Full sign-out: disconnects the wallet and clears the verified session. */
  logout: () => void;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<WalletAccount | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);

  const disconnect = useCallback(() => {
    resetWalletState();
    setAccount(null);
    setConnectError(null);
    setVerified(false);
  }, []);

  // Restore session on page reload — validate with backend using secure cookie.
  // Every localStorage/sessionStorage touch below is wrapped - some
  // browser contexts (strict tracking protection, a sandboxed/embedded
  // preview) throw "Access to storage is not allowed from this context"
  // just from accessing either at all. The ones inside .then()/.catch()
  // matter most: an uncaught throw there becomes an unhandled promise
  // rejection, not just a crashed effect.
  useEffect(() => {
    let address: string | null = null;
    try {
      address = localStorage.getItem("player_address");
    } catch {
      return;
    }
    if (!address) return;

    fetch("/api/auth/me", {
      credentials: "include", // Send cookies with request
    }).then((res) => {
      if (res.ok) {
        setAccount({ address, meta: { source: "restored" } });
        setVerified(true);
      } else {
        try {
          localStorage.removeItem("player_address");
        } catch {
          // Nothing to clean up if storage isn't reachable in the first place.
        }
      }
    }).catch(() => {
      // Backend unreachable — clear everything to avoid stuck state.
      try {
        localStorage.removeItem("player_address");
        sessionStorage.removeItem("user_id");
      } catch {
        // Same as above - storage was never reachable, nothing to clear.
      }
    });
  }, []);

  // Listen for logout events from other tabs.
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Try to use BroadcastChannel for reliable cross-tab communication.
    if ("BroadcastChannel" in window) {
      const channel = new BroadcastChannel("wallet_auth");
      broadcastChannelRef.current = channel;
      channel.onmessage = (event) => {
        if (event.data.type === "logout") {
          disconnect();
          try {
            localStorage.removeItem("player_address");
            sessionStorage.removeItem("user_id");
          } catch {
            // Storage unreachable in this context - disconnect() above
            // already cleared the in-memory state either way.
          }
        }
      };
      return () => channel.close();
    } else {
      // Fallback: listen for localStorage changes (for older browsers).
      const handleStorageChange = (e: StorageEvent) => {
        if (e.key === "player_address" && e.newValue === null) {
          disconnect();
          try {
            sessionStorage.removeItem("user_id");
          } catch {
            // Same as above.
          }
        }
      };
      const win = window as Window;
      win.addEventListener("storage", handleStorageChange);
      return () => win.removeEventListener("storage", handleStorageChange);
    }
  }, [disconnect]);

  const connect = async (): Promise<WalletAccount | null> => {
    setIsConnecting(true);
    try {
      await enableWalletExtension("TheWudlands");
      const accounts = await getAccounts();
      if (accounts.length === 0) {
        throw new Error("No accounts found in wallet");
      }
      setAccount(accounts[0]);
      setConnectError(null);
      return accounts[0];
    } catch {
      // Always set the error message on failure (not toggle).
      setConnectError("Select wallet in extension");
      return null;
    } finally {
      setIsConnecting(false);
    }
  };

  const logout = async () => {
    // Call backend logout to clear the session cookie
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include", // Send cookies with request
      });
    } catch (e) {
      console.error("Logout error:", e);
    }

    // Broadcast logout to other tabs.
    if (broadcastChannelRef.current) {
      broadcastChannelRef.current.postMessage({ type: "logout" });
    }

    disconnect();
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem("player_address");
        sessionStorage.removeItem("user_id");
      } catch {
        // Storage unreachable in this context - disconnect() above already
        // cleared the in-memory state either way, and logout() is async
        // with no guarantee its caller awaits/catches it, so an uncaught
        // throw here would surface as an unhandled promise rejection.
      }
    }
  };

  return (
    <WalletContext.Provider
      value={{ account, isConnecting, connectError, verified, setVerified, connect, disconnect, logout }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) {
    throw new Error("useWallet must be used within a WalletProvider");
  }
  return ctx;
}
