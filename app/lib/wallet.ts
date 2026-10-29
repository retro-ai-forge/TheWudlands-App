import type { InjectedExtension } from "@polkadot/extension-inject/types";
import type { InjectedAccountWithMeta } from "@polkadot/extension-inject/types";

export interface WalletAccount {
  address: string;
  meta: {
    name?: string;
    source: string;
  };
}

export interface DetectedWallet {
  name: string;
  version?: string;
  icon?: string;
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

const WALLET_META: Record<string, { label: string; icon: string }> = {
  "polkadot-js":  { label: "Polkadot.js",  icon: "/icons/wallets/polkadot-js.svg" },
  "nova-wallet":  { label: "Nova Wallet",   icon: "/icons/wallets/nova.svg" },
  "talisman":     { label: "Talisman",      icon: "/icons/wallets/talisman.svg" },
  "subwallet-js": { label: "SubWallet",     icon: "/icons/wallets/subwallet.svg" },
};

export async function detectWallets(dappName: string): Promise<{ extensions: InjectedExtension[]; wallets: DetectedWallet[] }> {
  if (typeof window === "undefined") {
    return { extensions: [], wallets: [] };
  }

  const { web3Enable } = await import("@polkadot/extension-dapp");
  const extensions = await web3Enable(dappName);

  const wallets: DetectedWallet[] = extensions.map((ext) => {
    const meta = WALLET_META[ext.name];
    return {
      name: ext.name,
      version: ext.version,
      icon: meta?.icon,
    };
  });

  return { extensions, wallets };
}

export async function enableSpecificWallet(dappName: string, walletName: string): Promise<void> {
  if (typeof window === "undefined") {
    throw new Error("Wallet extension only works in browser");
  }

  const { web3Enable } = await import("@polkadot/extension-dapp");
  const extensions = await web3Enable(dappName);

  const match = extensions.find((ext) => ext.name === walletName);
  if (!match) {
    throw new Error(`Wallet "${walletName}" not found among detected extensions.`);
  }

  injectedExtension = match;
}

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

  const accounts = await web3Accounts({ ss58Format: 0 });

  // Filter to only accounts from the selected wallet extension
  const sourceName = injectedExtension.name;
  const filtered = accounts.filter(
    (a: InjectedAccountWithMeta) => a.meta.source === sourceName
  );

  const pool = filtered.length > 0 ? filtered : accounts;

  cachedAccounts = pool.map((account: InjectedAccountWithMeta) => ({
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
