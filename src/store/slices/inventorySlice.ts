import type { StateCreator } from 'zustand';
export interface InventorySlice { inventory: { itemIds: string[] }; }
export const createInventorySlice: StateCreator<InventorySlice, [], [], InventorySlice> = () => ({ inventory: { itemIds: [] } });
