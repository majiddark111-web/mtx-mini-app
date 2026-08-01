import { create } from 'zustand';
import { createGameSlice, type GameSlice } from './slices/gameSlice';
import { createInventorySlice, type InventorySlice } from './slices/inventorySlice';
import { createUserSlice, type UserSlice } from './slices/userSlice';
import { createWalletSlice, type WalletSlice } from './slices/walletSlice';

export type AppStore = GameSlice & UserSlice & WalletSlice & InventorySlice;
export const useAppStore = create<AppStore>()((...args) => ({
  ...createGameSlice(...args),
  ...createUserSlice(...args),
  ...createWalletSlice(...args),
  ...createInventorySlice(...args),
}));
