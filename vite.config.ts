import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
    // The browser tests under e2e/ are Playwright's (`pnpm e2e`), the examples are apps, and .claude/ holds other
    // checkouts of this repository (worktrees), whose tests are theirs.
    exclude: [...configDefaults.exclude, 'e2e/**', 'examples/**', '.claude/**'],
  },
  build: {
    lib: {
      entry: {
        index: resolve(import.meta.dirname, 'src/index.ts'),
        'pro/history': resolve(import.meta.dirname, 'src/pro/history.ts'),
        'pro/clipboard': resolve(import.meta.dirname, 'src/pro/clipboard.ts'),
        'pro/snaplines': resolve(import.meta.dirname, 'src/pro/snaplines.tsx'),
        'pro/export': resolve(import.meta.dirname, 'src/pro/export.ts'),
        'pro/smartEdges': resolve(import.meta.dirname, 'src/pro/smartEdges.tsx'),
        'pro/editableEdge': resolve(import.meta.dirname, 'src/pro/editableEdge.tsx'),
        'pro/shapes': resolve(import.meta.dirname, 'src/pro/shapes.tsx'),
        'pro/tree': resolve(import.meta.dirname, 'src/pro/tree.ts'),
        'pro/index': resolve(import.meta.dirname, 'src/pro/index.ts'),
      },
      name: 'Flowinger',
      // ES modules only, as React Flow 13 ships: Node's `require` loads them (20.19+, 22.12+).
      fileName: (_format, entryName) => `${entryName}.js`,
      formats: ['es'],
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
