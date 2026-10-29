import { ref } from 'vue'
import { defineStore } from 'pinia'
export const useThemeStore = defineStore('theme', () => {
  const theme = ref<'light' | 'dark'>('light')
  function setTheme(value: 'light' | 'dark') {
    theme.value = value
    document.documentElement.dataset.theme = value
    try {
      localStorage.setItem('planner-theme', value)
    } catch {
      /* Preference persistence is optional. */
    }
  }
  function initialize() {
    let saved: string | null = null
    try {
      saved = localStorage.getItem('planner-theme')
    } catch {
      /* Restricted storage. */
    }
    setTheme(
      saved === 'dark' ||
        (saved !== 'light' && window.matchMedia?.('(prefers-color-scheme: dark)').matches)
        ? 'dark'
        : 'light',
    )
  }
  function toggle() {
    setTheme(theme.value === 'dark' ? 'light' : 'dark')
  }
  return { theme, initialize, setTheme, toggle }
})
