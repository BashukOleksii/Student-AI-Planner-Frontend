import { fileURLToPath } from 'node:url'
import { defineConfig } from '@playwright/test'
import offline from './playwright.config'

export default defineConfig({
  ...offline,
  testDir: fileURLToPath(new URL('../../e2e/media', import.meta.url)),
  testMatch: '**/help-media.capture.ts',
  workers: 1,
  outputDir: fileURLToPath(new URL('../../test-results/help-media', import.meta.url)),
  reporter: 'list',
  projects: [offline.projects![0]!],
})
