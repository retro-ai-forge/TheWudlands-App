"use client";

/**
 * App-wide wallet connection state.
 * The header's Connect button and the "Enter Wudlands" button both read the
 * same connected account from here, so the offline signing flow can reuse the
 * address that was connected in the header.
 */

import { createContext, useContext, useState, type ReactNode } from "react";
import {
  enableWalletExtension,
  getAccounts,
  resetWalletState,
  type WalletAccount,
} from "@/lib/wallet";

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

  const connect = async (): Promise<WalletAccount | null> => {
    setIsConnecting(true);
    try {
      await enableWalletExtension("TheWudlands");
      const accounts = await getAccounts();
      if (accounts.length === 0) {
        throw new Error("No accounts found in wallet");
      }
      // Connect directly to the first available account (no popup).
      setAccount(accounts[0]);
      // Clear the error only on success, so a failed retry keeps toggling.
      setConnectError(null);
      return accounts[0];
    } catch {
      // Toggle the label on each failed attempt: Connect -> hint -> Connect ...
      setConnectError((prev) => (prev ? null : "Select wallet in extension"));
      return null;
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnect = () => {
    resetWalletState();
    setAccount(null);
    setConnectError(null);
    setVerified(false);
  };

  const logout = () => {
    disconnect();
    if (typeof window !== "undefined") {
      localStorage.removeItem("session_token");
      localStorage.removeItem("player_address");
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
