import type { StateCreator } from 'zustand';
export interface WalletSlice { wallet: { address: string; connected: boolean }; }
export const createWalletSlice: StateCreator<WalletSlice, [], [], WalletSlice> = () => ({ wallet: { address: '', connected: false } });
