import { defineConfig, devices } from '@playwright/test';

const useProductionBuild = process.env.PLAYWRIGHT_USE_BUILD === '1';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
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
    command: useProductionBuild ? 'npm start' : 'npm run dev',
    // Use a static asset for readiness; page compilation happens lazily in development.
    url: 'http://127.0.0.1:3000/favicon.ico',
    reuseExistingServer: !process.env.CI,
  },
});
