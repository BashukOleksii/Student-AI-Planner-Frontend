import { defineConfig, devices } from '@playwright/test'
import { loadEnv } from 'vite'
// Fail before opening a browser if the bundle would contact a non-local API.
const backend = new URL(
  loadEnv('production', process.cwd(), 'VITE_').VITE_API_BASE_URL || 'http://localhost:8000',
)
if (backend.origin !== 'http://localhost:8000' || backend.pathname !== '/')
  throw new Error(
    'Live smoke tests require the confirmed local development API at http://localhost:8000',
  )
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/live.spec.ts',
  workers: 1,
  retries: 0,
  timeout: 120000,
  outputDir: './test-results/live',
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://localhost:5173',
    timezoneId: 'UTC',
    viewport: { width: 1440, height: 900 },
    trace: 'off',
  },
})
