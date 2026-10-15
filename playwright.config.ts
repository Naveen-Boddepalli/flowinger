import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

// A real browser against the demo, built and served the way GitHub Pages serves it. These cover what jsdom
// cannot: layout, pointer capture, the wheel. Chromium, Firefox and WebKit — `pnpm exec playwright install
// chromium firefox webkit`, and `--project=firefox` for one. `E2E_CHANNEL=chrome pnpm e2e` uses an installed
// Chrome instead of Playwright's own Chromium.
// An unusual port, and a server is never reused: 4173 is every other Vite project's preview port, and a
// stray process there would be mistaken for the demo (it was, once — by QueryLens's).
const port = Number(process.env.E2E_PORT ?? 4179);

// On macOS 27, Playwright's Firefox (157, in Playwright 1.64) exits at launch — "Could not find profile folder" —
// on a Mac with Firefox installed: it shares ~/Library/Application Support/Firefox, which macOS now guards
// (microsoft/playwright#42768; fixed in Firefox 158). A home of its own lets it start. Drop this with 1.65.
const firefoxHome = process.platform === 'darwin' ? join(tmpdir(), 'flowinger-e2e-firefox-home') : undefined;
if (firefoxHome) mkdirSync(firefoxHome, { recursive: true });

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
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        ...(firefoxHome ? { launchOptions: { env: { ...process.env, CFFIXED_USER_HOME: firefoxHome } } } : {}),
      },
    },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: `pnpm demo:build && pnpm exec vite preview --config vite.demo.config.ts --port ${String(port)} --strictPort`,
    url: `http://localhost:${String(port)}/flowinger/`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
