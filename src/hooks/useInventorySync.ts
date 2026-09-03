import { useEffect } from 'react';
import { fetchInventory } from '../services/commerceService';
import { useAppStore } from '../store/useAppStore';

export function useInventorySync(): void {
  const authStatus = useAppStore((state) => state.authStatus);
  const setInventory = useAppStore((state) => state.setInventory);
  useEffect(() => {
    if (authStatus !== 'authenticated') return;
    let active = true;
    void fetchInventory().then((result) => { if (active) setInventory(result.items, result.purchases, result.equippedSkin); }).catch(() => undefined);
    return () => { active = false; };
  }, [authStatus, setInventory]);
}
