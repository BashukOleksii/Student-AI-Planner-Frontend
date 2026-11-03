import { defineConfig } from '@playwright/test'
import offline from './playwright.config'

// Deliberate authoring command, excluded from normal *.spec.ts regression runs.
export default defineConfig({
  ...offline,
  testMatch: '**/help-media.capture.ts',
  workers: 1,
  projects: [offline.projects![0]!],
})
