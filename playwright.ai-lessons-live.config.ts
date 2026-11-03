import { defineConfig } from '@playwright/test'
import local from './playwright.live-base'
import { authorizeAiLessonLive } from './e2e/support/aiLessonLiveSafety'
const authorization = authorizeAiLessonLive()
export default defineConfig(local, {
  testMatch: '**/ai-lessons.live.spec.ts',
  timeout: 180000,
  outputDir: './test-results/ai-lessons-live',
  use: { storageState: authorization.storageState, trace: 'off', screenshot: 'off', video: 'off' },
})
