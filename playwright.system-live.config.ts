import { defineConfig } from '@playwright/test'
import base from './playwright.live-base'
import { authorizeLive } from './e2e/support/liveSafety'
const authorization = authorizeLive('system')
export default defineConfig(base, {
  testMatch: '**/system.live.spec.ts',
  timeout: 180000,
  outputDir: './test-results/system-live',
  use: { storageState: authorization.storageState, trace: 'off' },
})
