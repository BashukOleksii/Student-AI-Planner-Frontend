import { defineConfig, devices } from '@playwright/test'
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/live.spec.ts',
  workers: 1,
  retries: 0,
  timeout: 60000,
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
})
