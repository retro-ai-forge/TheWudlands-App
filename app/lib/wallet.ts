import type { InjectedExtension } from "@polkadot/extension-inject/types";
import type { InjectedAccountWithMeta } from "@polkadot/extension-inject/types";

export interface WalletAccount {
  address: string;
  meta: {
    name?: string;
    source: string;
  };
}

export interface ExternalSignerAdapter {
  signRaw: (payload: {
    address: string;
    data: string;
    type: "bytes" | "payload";
  }) => Promise<{ signature: string }>;
}

let injectedExtension: InjectedExtension | null = null;
let cachedAccounts: WalletAccount[] = [];

export async function enableWalletExtension(dappName: string): Promise<void> {
  if (typeof window === "undefined") {
    throw new Error("Wallet extension only works in browser");
  }

  const { web3Enable } = await import(
    "@polkadot/extension-dapp"
  );

  const extensions = await web3Enable(dappName);

  if (extensions.length === 0) {
    throw new Error(
      "No wallet extension detected. Please install Polkadot.js, Nova, Talisman, or SubWallet."
    );
  }

  injectedExtension = extensions[0];
}

export async function getAccounts(): Promise<WalletAccount[]> {
  if (typeof window === "undefined") {
    throw new Error("Wallet access only works in browser");
  }

  if (!injectedExtension) {
    throw new Error(
      "Wallet extension not enabled. Call enableWalletExtension first."
    );
  }

  const { web3Accounts } = await import("@polkadot/extension-dapp");

  const accounts = await web3Accounts();

  cachedAccounts = accounts.map((account: InjectedAccountWithMeta) => ({
    address: account.address,
    meta: {
      name: account.meta.name,
      source: account.meta.source || "unknown",
    },
  }));

  return cachedAccounts;
}

export async function getSignerForAddress(): Promise<ExternalSignerAdapter> {
  if (typeof window === "undefined") {
    throw new Error("Signer access only works in browser");
  }

  if (!injectedExtension) {
    throw new Error(
      "Wallet extension not enabled. Call enableWalletExtension first."
    );
  }

  if (!injectedExtension.signer) {
    throw new Error("Wallet extension does not provide a signer");
  }

  const signer = injectedExtension.signer!;

  if (!signer.signRaw) {
    throw new Error("Signer does not support signRaw");
  }

  const signRaw = async (payload: {
    address: string;
    data: string;
    type: "bytes" | "payload";
  }) => {
    const result = await signer.signRaw!({
      address: payload.address,
      data: payload.data,
      type: payload.type,
    });

    return {
      signature: result.signature,
    };
  };

  return { signRaw };
}

export function resetWalletState(): void {
  injectedExtension = null;
  cachedAccounts = [];
}
