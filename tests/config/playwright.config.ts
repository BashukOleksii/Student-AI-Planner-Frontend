import { defineConfig, devices } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
export default defineConfig({
  testDir: fileURLToPath(new URL('../../e2e/offline', import.meta.url)),
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  workers: 2,
  retries: 0,
  outputDir: fileURLToPath(new URL('../../test-results/offline', import.meta.url)),
  reporter: [['list'], ['json', { outputFile: `${root}test-results/offline/results.json` }]],
  use: { baseURL: 'http://localhost:4173', trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run preview -- --host localhost --port 4173 --strictPort',
    cwd: root,
    url: 'http://localhost:4173',
    reuseExistingServer: false,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
})
