import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// The benchmark page (bench/): both libraries, built the way a consumer's production build would be.
export default defineConfig({
  root: resolve(import.meta.dirname, 'bench'),
  base: './',
  plugins: [react()],
  build: { outDir: resolve(import.meta.dirname, 'bench-dist'), emptyOutDir: true },
});
