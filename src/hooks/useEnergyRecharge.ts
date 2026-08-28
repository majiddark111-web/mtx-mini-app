import { useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';

export function useEnergyRecharge(): void {
  const recharge = useAppStore((state) => state.recharge);
  useEffect(() => {
    let lastRechargeAt = Date.now();
    const tick = () => {
      const now = Date.now();
      const { energy, maxEnergy } = useAppStore.getState();
      if (energy >= maxEnergy) { lastRechargeAt = now; return; }
      const elapsedSeconds = Math.floor((now - lastRechargeAt) / 1_000);
      if (elapsedSeconds < 1) return;
      lastRechargeAt += elapsedSeconds * 1_000;
      recharge(elapsedSeconds);
    };
    const timer = window.setInterval(tick, 1_000);
    document.addEventListener('visibilitychange', tick);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', tick); };
  }, [recharge]);
}
