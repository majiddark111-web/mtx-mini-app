import { usePreferences } from './usePreferences';
import { useCallback } from 'react';

export function useI18n() {
  const { language } = usePreferences();
  const fa = language === 'fa';
  const text = useCallback((english: string, persian: string) => fa ? persian : english, [fa]);
  const number = useCallback((value: number) => value.toLocaleString(fa ? 'fa-IR' : 'en-US'), [fa]);
  const date = useCallback((value: number) => new Date(value).toLocaleString(fa ? 'fa-IR' : 'en-US'), [fa]);
  return {
    fa,
    language,
    text, number, date,
  };
}
