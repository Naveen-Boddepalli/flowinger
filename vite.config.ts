import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
    // The browser tests under e2e/ are Playwright's (`pnpm e2e`), and the examples are apps.
    exclude: [...configDefaults.exclude, 'e2e/**', 'examples/**'],
  },
  build: {
    lib: {
      entry: {
        index: resolve(import.meta.dirname, 'src/index.ts'),
        'pro/history': resolve(import.meta.dirname, 'src/pro/history.ts'),
        'pro/clipboard': resolve(import.meta.dirname, 'src/pro/clipboard.ts'),
        'pro/snaplines': resolve(import.meta.dirname, 'src/pro/snaplines.tsx'),
        'pro/export': resolve(import.meta.dirname, 'src/pro/export.ts'),
        'pro/index': resolve(import.meta.dirname, 'src/pro/index.ts'),
      },
      name: 'Flowinger',
      fileName: (format, entryName) => `${entryName}.${format === 'es' ? 'js' : 'cjs'}`,
      formats: ['es', 'cjs'],
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'react/jsx-runtime'],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
          'react/jsx-runtime': 'jsxRuntime',
        },
      },
    },
  },
});
