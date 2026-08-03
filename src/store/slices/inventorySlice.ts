import type { StateCreator } from 'zustand';
import type { InventoryEntry, PurchaseRecord } from '../../services/commerceService';
export interface InventorySlice { inventory: { items: InventoryEntry[]; purchases: PurchaseRecord[] }; setInventory: (items: InventoryEntry[], purchases: PurchaseRecord[]) => void; }
export const createInventorySlice: StateCreator<InventorySlice, [], [], InventorySlice> = (set) => ({ inventory: { items: [], purchases: [] }, setInventory: (items, purchases) => set({ inventory: { items, purchases } }) });
