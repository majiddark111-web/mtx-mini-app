import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  publicDir: 'public',
  build: { target: 'es2020', cssCodeSplit: true, rollupOptions: { output: { manualChunks: { react: ['react', 'react-dom', 'react-router-dom'], state: ['zustand'], network: ['axios'], tonconnect: ['@tonconnect/ui-react'] } } } },
});
