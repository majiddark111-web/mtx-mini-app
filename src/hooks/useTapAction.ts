import { hapticTap } from '../services/telegramService';
import { useAppStore } from '../store/useAppStore';
export function useTapAction(): () => void { const tap = useAppStore((state) => state.tap); return () => { hapticTap(); tap(); }; }
