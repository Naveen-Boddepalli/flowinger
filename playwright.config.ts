import { defineConfig, devices } from '@playwright/test';

// A real browser against the demo, built and served the way GitHub Pages serves it. These cover what jsdom
// cannot: layout, pointer capture, the wheel. `E2E_CHANNEL=chrome pnpm e2e` uses an installed Chrome
// instead of Playwright's own Chromium (`pnpm exec playwright install chromium`).
// An unusual port, and a server is never reused: 4173 is every other Vite project's preview port, and a
// stray process there would be mistaken for the demo (it was, once — by QueryLens's).
const port = Number(process.env.E2E_PORT ?? 4179);

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: `http://localhost:${String(port)}/flowinger/`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        ...(process.env.E2E_CHANNEL ? { channel: process.env.E2E_CHANNEL } : {}),
      },
    },
  ],
  webServer: {
    command: `pnpm demo:build && pnpm exec vite preview --config vite.demo.config.ts --port ${String(port)} --strictPort`,
    url: `http://localhost:${String(port)}/flowinger/`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
