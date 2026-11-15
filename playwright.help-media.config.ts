import { defineConfig } from '@playwright/test'
import offline from './playwright.config'

export default defineConfig({
  ...offline,
  testMatch: '**/help-media.capture.ts',
  workers: 1,
  projects: [offline.projects![0]!],
})
