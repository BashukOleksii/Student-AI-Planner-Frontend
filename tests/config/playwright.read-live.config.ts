import { fileURLToPath } from 'node:url'
import { defineConfig } from '@playwright/test'
import base from './playwright.live-base'
export default defineConfig(base, {
  testMatch: '**/read.live.spec.ts',
  timeout: 60000,
  outputDir: fileURLToPath(new URL('../../test-results/read-live', import.meta.url)),
})
