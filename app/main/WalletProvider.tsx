"use client";

/**
 * App-wide wallet connection state.
 * The header's Connect button and the "Enter Wudlands" button both read the
 * same connected account from here, so the offline signing flow can reuse the
 * address that was connected in the header.
 */

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import {
  enableSpecificWallet,
  getAccounts,
  resetWalletState,
  type WalletAccount,
} from "@/app/lib/wallet";
import { WalletSelectModal } from "./WalletSelectModal";

interface WalletContextValue {
  account: WalletAccount | null;
  isConnecting: boolean;
  connectError: string | null;
  /** True once the user has signed the challenge and the backend verified it. */
  verified: boolean;
  setVerified: (value: boolean) => void;
  /** Opens the wallet selection modal; resolves with the account on success, or null on failure/cancel. */
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
  const [showModal, setShowModal] = useState(false);
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);

  // Promise resolve/reject for the connect() caller while modal is open
  const connectResolveRef = useRef<((acct: WalletAccount | null) => void) | null>(null);

  const disconnect = useCallback(() => {
    resetWalletState();
    setAccount(null);
    setConnectError(null);
    setVerified(false);
  }, []);

  // Restore session on page reload — validate with backend using secure cookie.
  useEffect(() => {
    let address: string | null = null;
    try {
      address = localStorage.getItem("player_address");
    } catch {
      return;
    }
    if (!address) return;

    fetch("/api/auth/me", {
      credentials: "include",
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
      try {
        localStorage.removeItem("player_address");
        sessionStorage.removeItem("user_id");
      } catch {
        // Same as above.
      }
    });
  }, []);

  // Listen for logout events from other tabs.
  useEffect(() => {
    if (typeof window === "undefined") return;

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
            // Storage unreachable.
          }
        }
      };
      return () => channel.close();
    } else {
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

  const connect = (): Promise<WalletAccount | null> => {
    setIsConnecting(true);
    setShowModal(true);

    return new Promise<WalletAccount | null>((resolve) => {
      connectResolveRef.current = resolve;
    });
  };

  const handleWalletSelect = async (walletName: string) => {
    setShowModal(false);
    try {
      await enableSpecificWallet("TheWudlands", walletName);
      const accounts = await getAccounts();
      if (accounts.length === 0) {
        throw new Error("No accounts found in wallet");
      }
      setAccount(accounts[0]);
      setConnectError(null);
      setIsConnecting(false);
      connectResolveRef.current?.(accounts[0]);
      connectResolveRef.current = null;
    } catch {
      setConnectError("Select wallet in extension");
      setIsConnecting(false);
      connectResolveRef.current?.(null);
      connectResolveRef.current = null;
    }
  };

  const handleModalClose = () => {
    setShowModal(false);
    setIsConnecting(false);
    connectResolveRef.current?.(null);
    connectResolveRef.current = null;
  };

  const logout = async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch (e) {
      console.error("Logout error:", e);
    }

    if (broadcastChannelRef.current) {
      broadcastChannelRef.current.postMessage({ type: "logout" });
    }

    disconnect();
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem("player_address");
        sessionStorage.removeItem("user_id");
      } catch {
        // Storage unreachable.
      }
    }
  };

  return (
    <WalletContext.Provider
      value={{ account, isConnecting, connectError, verified, setVerified, connect, disconnect, logout }}
    >
      {children}
      {showModal && (
        <WalletSelectModal
          onSelect={handleWalletSelect}
          onClose={handleModalClose}
        />
      )}
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
