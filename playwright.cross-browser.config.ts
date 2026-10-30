import { defineConfig, devices } from '@playwright/test'
import offline from './playwright.config'
// Same deterministic contracts and assertions; no live Laravel/provider dependency.
export default defineConfig({
  ...offline,
  workers: 4,
  outputDir: './test-results/cross-browser',
  projects: [
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'webkit-mobile',
      use: {
        browserName: 'webkit',
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
})
