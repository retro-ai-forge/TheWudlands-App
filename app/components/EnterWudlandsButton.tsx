'use client';

/**
 * Enter Wudlands button.
 * Flow:
 * 1. Click in the "Enter Wudlands" state -> tries a wallet connect, exactly like
 *    the header Connect button (shared wallet context).
 * 2. On a successful connect -> the address is stored in the shared context, so
 *    the header button updates to show the shortened address.
 * 3. On a failed connect -> the label toggles to "Select wallet in extension",
 *    same behaviour as the Connect button.
 * 4. Once connected -> sends an offline signing request so the user proves
 *    ownership of the private key, verifies it on the backend, then enters.
 */

import { useState } from 'react';
import { useWallet } from './WalletProvider';
import { getSignerForAddress, type WalletAccount } from '@/lib/wallet';
import styles from './EnterWudlandsButton.module.css';

export interface EnterWudlandsButtonProps {
  onEnter?: (address: string) => void;
  onError?: (error: string) => void;
  disabled?: boolean;
}

export function EnterWudlandsButton({
  onEnter,
  onError,
  disabled = false,
}: EnterWudlandsButtonProps) {
  const { account, availableAccounts, isConnecting, connectError, connect, setVerified, verified } = useWallet();
  const [isSigning, setIsSigning] = useState(false);
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);

  /** Offline signing request -> backend verify -> enter the game. */
  const signAndEnter = async (acct: WalletAccount) => {
    setIsSigning(true);
    try {
      // 1. Generate auth challenge for the connected address.
      const challengeRes = await fetch('/api/auth/challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: acct.address }),
      });
      if (!challengeRes.ok) {
        throw new Error('Failed to generate challenge');
      }
      const { message, nonce } = await challengeRes.json();

      // 2. Offline signature proving private-key ownership (no transaction).
      const signer = await getSignerForAddress(acct.address);
      const signerObj = signer as { signRaw: (payload: { address: string; data: string; type: string }) => Promise<{ signature: string }> };
      const { signature } = await signerObj.signRaw({
        address: acct.address,
        data: message,
        type: 'bytes',
      });

      // 3. Verify the signature on the backend.
      const verifyRes = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: acct.address, message, signature, nonce }),
      });
      if (!verifyRes.ok) {
        const err = await verifyRes.json();
        throw new Error(err.detail || 'Signature verification failed');
      }
      const { session_token } = await verifyRes.json();

      // 4. Save session, flag the account as verified, and enter the game.
      localStorage.setItem('session_token', session_token);
      localStorage.setItem('player_address', acct.address);
      setVerified(true);
      onEnter?.(acct.address);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Authentication failed';
      onError?.(message);
    } finally {
      setIsSigning(false);
    }
  };

  const handleClick = async () => {
    if (isSigning || isConnecting) return;

    // Already connected -> go straight to offline signing.
    if (account) {
      await signAndEnter(account);
      return;
    }

    // Not connected -> try to connect (this also updates the header button).
    // On failure, connect() toggles connectError and we show the hint.
    const connected = await connect();
    if (connected) {
      await signAndEnter(connected);
    }
  };

  const handleSelectAddress = async (address: string) => {
    const selected = availableAccounts.find(acc => acc.address === address);
    if (selected) {
      setSelectedAddress(address);
      await signAndEnter(selected);
    }
  };

  const notConnected = !account;
  const showHint = !!connectError && notConnected && !isConnecting && !isSigning;
  const showAddressSelector = account && availableAccounts.length > 1 && !verified && !isSigning;

  const label = isSigning
    ? '[ SIGNING… ]'
    : isConnecting
    ? '[ CONNECTING… ]'
    : showHint
    ? 'Select wallet in extension'
    : verified
    ? '[ ENTERING… ]'
    : '[ ENTER WUDLANDS ]';

  return (
    <div className={styles.container}>
      {showAddressSelector && (
        <div style={{ marginBottom: '12px' }}>
          <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', fontWeight: 'bold' }}>
            Select Address:
          </label>
          <select
            value={selectedAddress || account.address}
            onChange={(e) => handleSelectAddress(e.target.value)}
            disabled={isSigning}
            style={{
              width: '100%',
              padding: '8px',
              fontSize: '12px',
              borderRadius: '4px',
              border: '1px solid #ccc',
              fontFamily: 'monospace',
            }}
          >
            {availableAccounts.map((acc) => (
              <option key={acc.address} value={acc.address}>
                {acc.address.substring(0, 10)}...{acc.address.substring(acc.address.length - 8)}
              </option>
            ))}
          </select>
        </div>
      )}
      <button
        className={`${styles.enterButton} ${
          notConnected ? styles.enterButtonJelly : styles.enterButtonConnected
        } ${showHint ? styles.enterButtonError : ''}`}
        onClick={handleClick}
        disabled={disabled || isSigning || isConnecting}
        title={notConnected ? 'Connect your wallet to enter' : 'Sign to enter The Wudlands'}
      >
        {verified && !notConnected && !showHint ? (
          <>
            <span className={styles.verifiedDot} />✓
          </>
        ) : (
          label
        )}
      </button>
    </div>
  );
}
