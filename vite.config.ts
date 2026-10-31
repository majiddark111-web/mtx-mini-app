import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/',
  publicDir: 'public',
  build: { target: 'es2020', cssCodeSplit: true, rollupOptions: { output: { manualChunks: {
    // Let the lazy Wallet route own its SDK so shared helpers stay on the startup path.
    react: ['react', 'react-dom', 'react-router-dom'],
    state: ['zustand'], network: ['axios'],
  } } } },
});
