export interface WalletConnection { address: string; network: 'mainnet' | 'testnet'; }
export interface TonConnectAdapter { available: boolean; connect(): Promise<WalletConnection>; disconnect(): Promise<void>; }
export interface NftWalletExtension { readonly enabled: false; }
export const nftWalletExtension: NftWalletExtension = { enabled: false };

class UnconfiguredTonConnectAdapter implements TonConnectAdapter {
  available = false;
  async connect(): Promise<WalletConnection> { throw new Error('TON Connect is not configured'); }
  async disconnect(): Promise<void> { return Promise.resolve(); }
}

let adapter: TonConnectAdapter = new UnconfiguredTonConnectAdapter();
export function configureTonConnect(next: TonConnectAdapter): void { adapter = next; }
export function tonConnect(): TonConnectAdapter { return adapter; }
