import { useSyncExternalStore } from 'react';
import { getPreferences, subscribePreferences } from '../services/preferencesService';

export function usePreferences() { return useSyncExternalStore(subscribePreferences, getPreferences, getPreferences); }
