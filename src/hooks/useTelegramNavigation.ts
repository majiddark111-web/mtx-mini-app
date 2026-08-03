import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getTelegramApp } from '../services/telegramService';

export function useTelegramNavigation(): void {
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    const backButton = getTelegramApp()?.BackButton;
    const goBack = () => navigate(-1);
    if (location.pathname === '/') backButton?.hide(); else { backButton?.show(); backButton?.onClick(goBack); }
    return () => backButton?.offClick(goBack);
  }, [location.pathname, navigate]);
  useEffect(() => {
    const mainButton = getTelegramApp()?.MainButton;
    const play = () => navigate('/game');
    if (location.pathname === '/') { mainButton?.setText('Play Lumos'); mainButton?.show(); mainButton?.onClick(play); } else mainButton?.hide();
    return () => mainButton?.offClick(play);
  }, [location.pathname, navigate]);
}
