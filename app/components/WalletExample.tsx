'use client';

/**
 * Example: Simple wallet integration for TheWudlands
 *
 * This is a minimal example showing how to use WalletConnect
 * in your pages. Replace or adapt as needed.
 */

import { useState } from 'react';
import { WalletConnect } from '@/app/components/WalletConnect';
import type { WalletAccount } from '@/lib/wallet';

export function WalletExample() {
  const [connectedAccount, setConnectedAccount] = useState<WalletAccount | null>(
    null
  );
  const [playerSigner, setPlayerSigner] = useState<any>(null);

  const handleAccountSelected = (account: WalletAccount, signer: any) => {
    setConnectedAccount(account);
    setPlayerSigner(signer);
    console.log('Player connected with account:', account.address);
    console.log('Signer available for transactions:', !!signer);
  };

  const handleWalletError = (error: string) => {
    console.error('Wallet connection error:', error);
    alert(`Wallet Error: ${error}`);
  };

  return (
    <div style={{ padding: '20px' }}>
      <h2>TheWudlands - Wallet Connection Example</h2>

      {/* Wallet UI Component */}
      <WalletConnect
        dappName="TheWudlands"
        onAccountSelected={handleAccountSelected}
        onError={handleWalletError}
        showSourceLabel={true}
      />

      {/* Display connected state */}
      {connectedAccount && playerSigner && (
        <div style={{ marginTop: '20px', padding: '16px', backgroundColor: '#f0f0f0' }}>
          <h3>Connected!</h3>
          <p>
            <strong>Address:</strong> {connectedAccount.address}
          </p>
          {connectedAccount.meta.name && (
            <p>
              <strong>Name:</strong> {connectedAccount.meta.name}
            </p>
          )}
          <p>
            <strong>Wallet:</strong> {connectedAccount.meta.source}
          </p>
          <p style={{ fontSize: '12px', color: '#666' }}>
            Signer is ready for game transactions. You can now sign transactions
            using the signer object.
          </p>
        </div>
      )}
    </div>
  );
}
