import { defineConfig, devices } from '@playwright/test';

/** Dedicated port so `pnpm dev` on :3000 (any project) is never mistaken for the app under test. */
const E2E_PORT = Number(process.env.PLAYWRIGHT_PORT ?? 3333);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${E2E_PORT}`;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  /** Fewer workers avoids many simultaneous `/register` loads competing on Turbopack (timeouts on `page.goto`). */
  workers: 2,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 120_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 7'] },
    },
  ],
  webServer: {
    command: `pnpm exec next dev --hostname 127.0.0.1 --port ${E2E_PORT}`,
    url: baseURL,
    reuseExistingServer: !!process.env.PLAYWRIGHT_REUSE_SERVER,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      ...process.env,
      E2E_FIXTURE_COUNTRIES: '1',
    },
  },
});
