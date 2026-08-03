import type { StateCreator } from 'zustand';
import type { PaymentRecord } from '../../services/commerceService';
export interface WalletSlice { wallet: { address: string; connected: boolean; transactions: PaymentRecord[] }; setWalletConnection: (address: string) => void; setTransactions: (transactions: PaymentRecord[]) => void; }
export const createWalletSlice: StateCreator<WalletSlice, [], [], WalletSlice> = (set) => ({ wallet: { address: '', connected: false, transactions: [] }, setWalletConnection: (address) => set((state) => ({ wallet: { ...state.wallet, address, connected: Boolean(address) } })), setTransactions: (transactions) => set((state) => ({ wallet: { ...state.wallet, transactions } })) });
