import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { loadPreferences } from './preferencesService.ts';

describe('device preferences', () => {
  it('loads valid persisted controls', () => {
    const preferences = loadPreferences({ getItem: () => JSON.stringify({ theme: 'light', language: 'fa', sound: false, haptics: false, lowPower: true }) });
    assert.deepEqual(preferences, { theme: 'light', language: 'fa', sound: false, haptics: false, lowPower: true });
  });

  it('falls back safely when stored settings are damaged', () => {
    const preferences = loadPreferences({ getItem: () => '{broken' });
    assert.deepEqual(preferences, { theme: 'system', language: 'en', sound: true, haptics: true, lowPower: false });
  });

  it('accepts Arabic as an interface language', () => {
    assert.equal(loadPreferences({ getItem: () => JSON.stringify({ language: 'ar' }) }).language, 'ar');
  });
});
