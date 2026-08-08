import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'dist-phase3', 'dist-phase4', 'dist-phase5', 'dist-phase6', 'dist-phase6-complete', 'dist-phase6-final', 'dist-phase7', 'dist-phase8', 'dist-phase9', 'dist-phase10', '.build-verification', 'node_modules', 'vendor'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['server/localServer.mjs'],
    languageOptions: { globals: { process: 'readonly', Buffer: 'readonly', Headers: 'readonly', Request: 'readonly' } },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { globals: { window: 'readonly', document: 'readonly', navigator: 'readonly', localStorage: 'readonly', crypto: 'readonly', TextEncoder: 'readonly', TextDecoder: 'readonly', URL: 'readonly', URLSearchParams: 'readonly', Request: 'readonly', Response: 'readonly', btoa: 'readonly', atob: 'readonly' } },
    rules: { '@typescript-eslint/no-explicit-any': 'error' },
  },
);
