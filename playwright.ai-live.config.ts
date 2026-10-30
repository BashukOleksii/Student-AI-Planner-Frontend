import { defineConfig } from '@playwright/test'
import local from './playwright.live-base'
// Never launch a browser/provider call without a deliberate paid-test opt-in.
if (
  process.env.AI_LIVE_ALLOW_PAID !== '1' ||
  !process.env.AI_LIVE_STORAGE_STATE ||
  !/^[1-9]\d*$/.test(process.env.AI_LIVE_CONVERSATION_ID ?? '')
)
  throw new Error(
    'AI live smoke requires AI_LIVE_ALLOW_PAID=1, AI_LIVE_STORAGE_STATE and an owned AI_LIVE_CONVERSATION_ID. No account is created.',
  )
export default defineConfig(local, {
  testMatch: '**/ai-provider.live.spec.ts',
  timeout: 240000,
  outputDir: './test-results/ai-provider-live',
  use: { storageState: process.env.AI_LIVE_STORAGE_STATE, trace: 'off' },
})
