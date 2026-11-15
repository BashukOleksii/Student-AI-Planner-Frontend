import { fileURLToPath } from 'node:url'
import { defineConfig, devices } from '@playwright/test'
import { existsSync } from 'node:fs'

if (
  process.env.PLANNER_SYSTEM_TEST !== '1' ||
  !process.env.PLANNER_SYSTEM_RUN ||
  !existsSync(`${process.env.PLANNER_SYSTEM_RUN}/isolation.json`) ||
  process.env.VITE_API_BASE_URL !== 'http://localhost:18000'
)
  throw new Error('Run scripts/testing/fullstack-disposable-mysql.sh from the backend repository.')
export default defineConfig({
  testDir: fileURLToPath(new URL('../../e2e/fullstack', import.meta.url)),
  testMatch: '**/student-workflows.spec.ts',
  workers: 1,
  retries: 0,
  timeout: 120000,
  reporter: [
    ['list'],
    [
      'json',
      {
        outputFile: fileURLToPath(new URL('../../fullstack-results/results.json', import.meta.url)),
      },
    ],
  ],
  outputDir: fileURLToPath(new URL('../../fullstack-results/browser', import.meta.url)),
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://localhost:15173',
    timezoneId: 'Europe/Kyiv',
    actionTimeout: 15000,
    navigationTimeout: 15000,
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
})
