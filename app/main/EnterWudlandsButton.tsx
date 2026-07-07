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

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useWallet } from './WalletProvider';
import { getSignerForAddress, type WalletAccount } from '@/lib/wallet';
import styles from './EnterWudlandsButton.module.css';

export interface EnterWudlandsButtonProps {
  onEnter?: (address: string) => void;
  onError?: (error: string) => void;
  onNoWallet?: () => void;
  disabled?: boolean;
}

export function EnterWudlandsButton({
  onEnter,
  onError,
  onNoWallet,
  disabled = false,
}: EnterWudlandsButtonProps) {
  const { account, isConnecting, connectError, connect, setVerified, verified } = useWallet();
  const [isSigning, setIsSigning] = useState(false);
  const [showErrorHint, setShowErrorHint] = useState(false);
  const [attemptKey, setAttemptKey] = useState(0);

  // Auto-dismiss the error hint after 2 seconds.
  // Depend on attemptKey so the effect re-triggers on each new attempt even if
  // connectError is the same string both times.
  useEffect(() => {
    if (connectError) {
      setShowErrorHint(true);
      const timer = setTimeout(() => setShowErrorHint(false), 2000);
      return () => clearTimeout(timer);
    } else {
      setShowErrorHint(false);
    }
  }, [connectError, attemptKey]);

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
      // The session token is automatically set as a secure HTTP-only cookie by the backend.
      const verifyRes = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // Send cookies with request
        body: JSON.stringify({ address: acct.address, message, signature, nonce }),
      });
      if (!verifyRes.ok) {
        const err = await verifyRes.json();
        throw new Error(err.detail || 'Signature verification failed');
      }

      // 4. Save player address and flag the account as verified, then enter the game.
      // The session token is stored in a secure HTTP-only cookie (not accessible to JavaScript).
      localStorage.setItem('player_address', acct.address);
      setVerified(true);
      onEnter?.(acct.address);
    } catch (err: unknown) {
      let message = 'Authentication failed';
      if (err instanceof Error) {
        // Replace generic wallet error with clearer message for active sessions
        if (err.message.includes('Wallet extension not enabled')) {
          message = 'Session already active — use a single browser tab';
        } else {
          message = err.message;
        }
      }
      onError?.(message);
    } finally {
      setIsSigning(false);
    }
  };

  const handleClick = async () => {
    if (isSigning || isConnecting) return;

    // Increment attemptKey so the effect re-runs even if connectError is the same.
    setAttemptKey(k => k + 1);

    // Already connected -> go straight to offline signing.
    if (account) {
      await signAndEnter(account);
      return;
    }

    // First tap without a wallet connected -> notify parent to show wallet hint.
    onNoWallet?.();

    // Not connected -> try to connect (this also updates the header button).
    // On failure, connect() sets connectError and the effect will show the hint.
    const connected = await connect();
    if (connected) {
      await signAndEnter(connected);
    }
  };


  const notConnected = !account;
  const showHint = showErrorHint && notConnected && !isConnecting && !isSigning;

  const label = isSigning
    ? '[ SIGNING… ]'
    : isConnecting
    ? '[ CONNECTING… ]'
    : showHint
    ? 'Select wallet in extension'
    : verified
    ? '[ ENTERING… ]'
    : '[ ENTER THE WUDLANDS ]';

  return (
    <div className={styles.container}>
      <button
        className={`${styles.enterButton} ${
          notConnected ? styles.enterButtonJelly : styles.enterButtonConnected
        } ${showHint ? styles.enterButtonError : ''}`}
        onClick={handleClick}
        disabled={disabled || isSigning || isConnecting}
        title={notConnected ? 'Begin — your progress is saved forever' : 'Sign to enter The Wudlands'}
      >
        {label}
      </button>

    </div>
  );
}
