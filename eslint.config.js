import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'dist-phase3', 'dist-phase4', '.build-verification', 'node_modules', 'vendor'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { globals: { window: 'readonly', document: 'readonly', navigator: 'readonly', localStorage: 'readonly', crypto: 'readonly', TextEncoder: 'readonly', TextDecoder: 'readonly', URL: 'readonly', URLSearchParams: 'readonly', Request: 'readonly', Response: 'readonly', btoa: 'readonly', atob: 'readonly' } },
    rules: { '@typescript-eslint/no-explicit-any': 'error' },
  },
);
