import { useEffect } from 'react';
import { getRechargeInterval } from '../services/gameService';
import { useAppStore } from '../store/useAppStore';

export function useEnergyRecharge(): void {
  const energy = useAppStore((state) => state.energy);
  const maxEnergy = useAppStore((state) => state.maxEnergy);
  const energyLevel = useAppStore((state) => state.energyLevel);
  const authStatus = useAppStore((state) => state.authStatus);
  const recharge = useAppStore((state) => state.recharge);
  useEffect(() => {
    if (energy >= maxEnergy) return undefined;
    const interval = authStatus === 'authenticated' ? 1_000 : getRechargeInterval({ energy, maxEnergy, energyLevel });
    const timer = window.setTimeout(recharge, interval);
    return () => window.clearTimeout(timer);
  }, [authStatus, energy, maxEnergy, energyLevel, recharge]);
}
