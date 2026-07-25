import { defineConfig, devices } from '@playwright/test';

// Defaults to the production build: `next dev` (Turbopack) keeps a persistent
// compiler/watch cache alive per route and is significantly heavier on memory
// than `next start`, which matters most on this machine's zero-swap setup.
const useProductionBuild = process.env.PLAYWRIGHT_USE_BUILD !== '0';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Capped locally: unlimited workers (defaults to nproc/2) each launch their own
  // Chromium alongside the dev server's webServer process with no memory ceiling,
  // which can exhaust RAM fast enough to hang a machine with no swap configured.
  workers: process.env.CI ? 1 : 4,
  reporter: 'html',
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: useProductionBuild ? 'npm run build && npm start' : 'npm run dev',
    // Use a static asset for readiness; page compilation happens lazily in development.
    url: 'http://127.0.0.1:3000/favicon.ico',
    reuseExistingServer: !process.env.CI,
    timeout: useProductionBuild ? 180_000 : 120_000,
  },
});
