"use client";

/**
 * App-wide wallet connection state.
 * The header's Connect button and the "Enter Wudlands" button both read the
 * same connected account from here, so the offline signing flow can reuse the
 * address that was connected in the header.
 */

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  enableWalletExtension,
  getAccounts,
  resetWalletState,
  type WalletAccount,
} from "@/lib/wallet";

interface WalletContextValue {
  account: WalletAccount | null;
  availableAccounts: WalletAccount[];
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
  const [availableAccounts, setAvailableAccounts] = useState<WalletAccount[]>([]);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);

  // Restore session on page reload — validate with backend using secure cookie.
  useEffect(() => {
    const address = localStorage.getItem("player_address");
    if (!address) return;

    fetch("/api/auth/me", {
      credentials: "include", // Send cookies with request
    }).then((res) => {
      if (res.ok) {
        setAccount({ address, meta: { source: "restored" } });
        setVerified(true);
      } else {
        localStorage.removeItem("player_address");
      }
    }).catch(() => {
      // Backend unreachable — clear everything to avoid stuck state.
      localStorage.removeItem("player_address");
      sessionStorage.removeItem("user_id");
    });
  }, []);

  const connect = async (): Promise<WalletAccount | null> => {
    setIsConnecting(true);
    try {
      await enableWalletExtension("TheWudlands");
      const accounts = await getAccounts();
      if (accounts.length === 0) {
        throw new Error("No accounts found in wallet");
      }
      // Store all unique accounts for selection, and set first as default.
      setAvailableAccounts(accounts);
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

  const disconnect = () => {
    resetWalletState();
    setAccount(null);
    setAvailableAccounts([]);
    setConnectError(null);
    setVerified(false);
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

    disconnect();
    if (typeof window !== "undefined") {
      localStorage.removeItem("player_address");
      sessionStorage.removeItem("user_id");
    }
  };

  return (
    <WalletContext.Provider
      value={{ account, availableAccounts, isConnecting, connectError, verified, setVerified, connect, disconnect, logout }}
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
