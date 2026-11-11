import { defineConfig } from '@playwright/test'

/**
 * End-to-end tests against the demo Worker: the real Worker entry, the real routes and
 * the built app, fed by the synthetic athlete — so no intervals.icu account is needed.
 * `npm run e2e` builds, starts the Worker locally and drives it with a browser.
 */
const PORT = 8799
export const DEMO_PASSWORD = 'e2e-password'

export default defineConfig({
  testDir: 'e2e',
  // One visitor after the other: the sign-in counts failed attempts per address.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 390, height: 844 },
    // Where a browser is already installed, PW_CHROMIUM names it.
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
  },
  webServer: {
    command: `npm run build && npx wrangler dev --env demo --port ${PORT} --var DEMO_PASSWORD:${DEMO_PASSWORD}`,
    url: `http://localhost:${PORT}/api/me`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
