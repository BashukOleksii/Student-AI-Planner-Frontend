// Native modal dialogs make the background inert, but browsers may move Tab focus
// into browser chrome at the boundary. Keep the application keyboard cycle explicit.
export function trapDialogTab(event: KeyboardEvent, dialog: HTMLDialogElement | undefined) {
  if (event.key !== 'Tab' || !dialog) return
  const controls = [
    ...dialog.querySelectorAll<HTMLElement>(
      'a[href], button, input:not([type="hidden"]), select, textarea, [tabindex]',
    ),
  ].filter(
    (element) =>
      !element.matches(':disabled, [tabindex="-1"]') &&
      !element.closest('[hidden], [inert]') &&
      getComputedStyle(element).display !== 'none' &&
      getComputedStyle(element).visibility !== 'hidden',
  )
  const first = controls[0],
    last = controls.at(-1),
    active = document.activeElement
  if (!first) {
    event.preventDefault()
    dialog.focus()
    return
  }
  if (event.shiftKey && (active === first || !dialog.contains(active))) {
    event.preventDefault()
    last?.focus()
  } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
    event.preventDefault()
    first.focus()
  }
}
