'use client';

/**
 * WalletConnect component for Polkadot.js injected wallets.
 * Client component that handles wallet detection, account selection, and signer access.
 *
 * Features:
 * - Auto-detects Polkadot.js extension, Nova, Talisman, SubWallet
 * - Displays available accounts with wallet source
 * - Allows account switching
 * - Returns signer for selected address
 * - Clean error handling
 */

import { useState } from 'react';
import {
  enableWalletExtension,
  getAccounts,
  getSignerForAddress,
  resetWalletState,
  type WalletAccount,
} from '@/lib/wallet';

export interface WalletConnectProps {
  dappName?: string;
  onAccountSelected?: (account: WalletAccount, signer: unknown) => void;
  onError?: (error: string) => void;
  showSourceLabel?: boolean;
}

export function WalletConnect({
  dappName = 'TheWudlands',
  onAccountSelected,
  onError,
  showSourceLabel = true,
}: WalletConnectProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [accounts, setAccounts] = useState<WalletAccount[]>([]);
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Connect to wallet extension and fetch available accounts.
   */
  const handleConnect = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Enable extension detection
      await enableWalletExtension(dappName);

      // Fetch available accounts
      const fetchedAccounts = await getAccounts();

      if (fetchedAccounts.length === 0) {
        throw new Error('No accounts found in wallet');
      }

      setAccounts(fetchedAccounts);
      setIsConnected(true);

      // Auto-select first account
      const firstAccount = fetchedAccounts[0];
      setSelectedAddress(firstAccount.address);

      if (onAccountSelected) {
        const signer = await getSignerForAddress(firstAccount.address);
        onAccountSelected(firstAccount, signer);
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to connect wallet';
      setError(errorMsg);
      setIsConnected(false);

      if (onError) {
        onError(errorMsg);
      }
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Disconnect wallet and clear state.
   */
  const handleDisconnect = () => {
    resetWalletState();
    setIsConnected(false);
    setAccounts([]);
    setSelectedAddress(null);
    setError(null);
  };

  /**
   * Handle account selection.
   */
  const handleSelectAccount = async (address: string) => {
    setIsLoading(true);
    setError(null);

    try {
      setSelectedAddress(address);

      // Get signer for new address
      const signer = await getSignerForAddress(address);

      // Find and notify about selected account
      const selected = accounts.find((acc) => acc.address === address);
      if (selected && onAccountSelected) {
        onAccountSelected(selected, signer);
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to select account';
      setError(errorMsg);

      if (onError) {
        onError(errorMsg);
      }
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Get currently selected account.
   */
  const selectedAccount = accounts.find((acc) => acc.address === selectedAddress);

  // Not connected state
  if (!isConnected) {
    return (
      <div style={styles.container}>
        <button
          onClick={handleConnect}
          disabled={isLoading}
          style={{
            ...styles.button,
            ...styles.buttonConnect,
            opacity: isLoading ? 0.6 : 1,
          }}
        >
          {isLoading ? 'Connecting...' : 'Connect Wallet'}
        </button>

        {error && <div style={styles.error}>{error}</div>}
      </div>
    );
  }

  // Connected state
  return (
    <div style={styles.container}>
      <div style={styles.connected}>
        <div style={styles.header}>
          <h3 style={styles.title}>Wallet Connected</h3>
          <button
            onClick={handleDisconnect}
            style={{
              ...styles.button,
              ...styles.buttonDisconnect,
            }}
          >
            Disconnect
          </button>
        </div>

        {selectedAccount && (
          <div style={styles.accountInfo}>
            <div style={styles.accountName}>
              {selectedAccount.meta.name || 'Unnamed Account'}
            </div>
            <div style={styles.address}>{selectedAccount.address}</div>
            {showSourceLabel && (
              <div style={styles.source}>{selectedAccount.meta.source}</div>
            )}
          </div>
        )}

        {accounts.length > 1 && (
          <div style={styles.accountSelector}>
            <label style={styles.label}>Switch Account:</label>
            <select
              value={selectedAddress || ''}
              onChange={(e) => handleSelectAccount(e.target.value)}
              disabled={isLoading}
              style={styles.select}
            >
              {accounts.map((account) => (
                <option key={account.address} value={account.address}>
                  {account.meta.name || 'Unnamed'} ({account.meta.source})
                </option>
              ))}
            </select>
          </div>
        )}

        {error && <div style={styles.error}>{error}</div>}
      </div>
    </div>
  );
}

/**
 * Simple styles for demonstration.
 * Replace with CSS Modules or your design system.
 */
const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '16px',
    border: '1px solid #ccc',
    borderRadius: '8px',
    maxWidth: '400px',
    fontFamily: 'monospace',
  },
  button: {
    padding: '8px 16px',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 'bold',
    transition: 'background-color 0.3s',
  },
  buttonConnect: {
    backgroundColor: '#0052cc',
    color: 'white',
  },
  buttonDisconnect: {
    backgroundColor: '#ff5630',
    color: 'white',
    padding: '6px 12px',
    fontSize: '12px',
  },
  connected: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    margin: 0,
    fontSize: '16px',
    color: '#0052cc',
  },
  accountInfo: {
    backgroundColor: '#f5f5f5',
    padding: '12px',
    borderRadius: '4px',
  },
  accountName: {
    fontSize: '14px',
    fontWeight: 'bold',
    marginBottom: '4px',
  },
  address: {
    fontSize: '12px',
    color: '#666',
    wordBreak: 'break-all',
    marginBottom: '4px',
  },
  source: {
    fontSize: '11px',
    color: '#999',
    textTransform: 'uppercase',
  },
  accountSelector: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  label: {
    fontSize: '12px',
    fontWeight: 'bold',
  },
  select: {
    padding: '6px',
    fontSize: '12px',
    borderRadius: '4px',
    border: '1px solid #ccc',
  },
  error: {
    color: '#ff5630',
    fontSize: '12px',
    padding: '8px',
    backgroundColor: '#ffe8e0',
    borderRadius: '4px',
  },
};
