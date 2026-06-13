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
  const { account, isConnecting, connectError, connect, setVerified } = useWallet();
  const [isSigning, setIsSigning] = useState(false);

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
      const { signature } = await signer.signRaw({
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
    } catch (err: any) {
      onError?.(err?.message || 'Authentication failed');
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

  const notConnected = !account;
  const showHint = !!connectError && notConnected && !isConnecting && !isSigning;

  const label = isSigning
    ? '[ SIGNING… ]'
    : isConnecting
    ? '[ CONNECTING… ]'
    : showHint
    ? 'Select wallet in extension'
    : '[ ENTER WUDLANDS ]';

  return (
    <div className={styles.container}>
      <button
        className={`${styles.enterButton} ${notConnected ? styles.enterButtonJelly : ''} ${
          showHint ? styles.enterButtonError : ''
        }`}
        onClick={handleClick}
        disabled={disabled || isSigning || isConnecting}
        title={notConnected ? 'Connect your wallet to enter' : 'Sign to enter The Wudlands'}
      >
        {label}
      </button>
    </div>
  );
}
