import { afterEach, vi } from 'vitest'
import { enableAutoUnmount } from '@vue/test-utils'
enableAutoUnmount(afterEach)
Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
  configurable: true,
  value() {
    this.open = true
  },
})
Object.defineProperty(HTMLDialogElement.prototype, 'close', {
  configurable: true,
  value() {
    this.open = false
  },
})
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn(() => ({ matches: false })),
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  document.cookie = 'XSRF-TOKEN=; Max-Age=0'
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})
