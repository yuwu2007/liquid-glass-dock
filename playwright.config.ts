import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:7421', viewport: { width: 390, height: 844 }, screenshot: 'only-on-failure' },
  projects: [
    { name: 'webkit', use: { browserName: 'webkit', isMobile: true, hasTouch: true, deviceScaleFactor: 2 } },
    { name: 'chromium', use: { browserName: 'chromium', channel: process.env.PLAYWRIGHT_CHROMIUM_CHANNEL, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } },
  ],
  webServer: { command: 'npm run dev -- --host 127.0.0.1 --port 7421 --strictPort', url: 'http://127.0.0.1:7421', reuseExistingServer: false },
})
