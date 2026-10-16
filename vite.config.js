import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './', // 👈 FUNDAMENTAL para não dar tela branca no celular!
  build: {
    outDir: 'www',
    emptyOutDir: true
  }
});