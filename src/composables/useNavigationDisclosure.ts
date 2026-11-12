import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'

/** Native disclosure semantics, with dismissal shared by both navigation menus. */
export function useNavigationDisclosure() {
  const route = useRoute()
  const disclosure = ref<HTMLDetailsElement>()
  function close(restoreFocus = false) {
    if (!disclosure.value?.open) return
    disclosure.value.open = false
    if (restoreFocus) disclosure.value.querySelector('summary')?.focus()
  }
  function dismiss(event: PointerEvent) {
    if (event.target instanceof Node && !disclosure.value?.contains(event.target)) close()
  }
  watch(
    () => route.fullPath,
    () => close(),
  )
  onMounted(() => document.addEventListener('pointerdown', dismiss))
  onBeforeUnmount(() => document.removeEventListener('pointerdown', dismiss))
  return { disclosure, close }
}
