import { defineConfig } from '@playwright/test'
import base from './playwright.live-base'
export default defineConfig(base, {
  testMatch: '**/read.live.spec.ts',
  timeout: 60000,
  outputDir: './test-results/read-live',
})
