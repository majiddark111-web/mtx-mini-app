import { useEffect } from 'react';
import { getRechargeInterval } from '../services/gameService';
import { useAppStore } from '../store/useAppStore';

export function useEnergyRecharge(): void {
  const energy = useAppStore((state) => state.energy);
  const maxEnergy = useAppStore((state) => state.maxEnergy);
  const energyLevel = useAppStore((state) => state.energyLevel);
  const recharge = useAppStore((state) => state.recharge);
  useEffect(() => {
    if (energy >= maxEnergy) return undefined;
    const timer = window.setTimeout(recharge, getRechargeInterval({ energy, maxEnergy, energyLevel }));
    return () => window.clearTimeout(timer);
  }, [energy, maxEnergy, energyLevel, recharge]);
}
