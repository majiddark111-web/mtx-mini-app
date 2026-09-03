import { useEffect } from 'react';
import { ENERGY_RECHARGE_INTERVAL_MS } from '../../economy/economyConfig';
import { useAppStore } from '../store/useAppStore';

export function useEnergyRecharge(): void {
  const recharge = useAppStore((state) => state.recharge);
  useEffect(() => {
    let lastRechargeAt = Date.now();
    const tick = () => {
      const now = Date.now();
      const { energy, maxEnergy } = useAppStore.getState();
      if (energy >= maxEnergy) { lastRechargeAt = now; return; }
      const rechargeUnits = Math.floor((now - lastRechargeAt) / ENERGY_RECHARGE_INTERVAL_MS);
      if (rechargeUnits < 1) return;
      lastRechargeAt += rechargeUnits * ENERGY_RECHARGE_INTERVAL_MS;
      recharge(rechargeUnits);
    };
    const timer = window.setInterval(tick, 1_000);
    document.addEventListener('visibilitychange', tick);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', tick); };
  }, [recharge]);
}
