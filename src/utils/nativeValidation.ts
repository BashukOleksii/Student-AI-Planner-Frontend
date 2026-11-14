// Keep native constraints and keyboard input; localize the validation bubble only.
export function installUkrainianValidation() {
  const owned = new WeakMap<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, string>()
  document.addEventListener(
    'invalid',
    (event) => {
      const field = event.target
      if (!(
        field instanceof HTMLInputElement ||
        field instanceof HTMLSelectElement ||
        field instanceof HTMLTextAreaElement
      ))
        return
      if (field.validity.customError && !owned.has(field)) return
      const state = field.validity
      const text = state.valueMissing
        ? 'Заповніть це поле.'
        : state.typeMismatch
          ? 'Уведіть значення у правильному форматі.'
          : state.rangeUnderflow
            ? `Мінімальне значення: ${field.getAttribute('min') ?? ''}.`
            : state.rangeOverflow
              ? `Максимальне значення: ${field.getAttribute('max') ?? ''}.`
              : state.tooShort
                ? 'Значення закоротке. Перевірте вимоги до поля.'
                : state.tooLong
                  ? 'Значення задовге. Скоротіть його.'
                  : state.stepMismatch
                    ? 'Уведіть значення з допустимим кроком.'
                    : 'Перевірте формат введеного значення.'
      field.setCustomValidity(text)
      owned.set(field, text)
    },
    true,
  )
  const clear = (event: Event) => {
    const field = event.target
    if (!(
      field instanceof HTMLInputElement ||
      field instanceof HTMLSelectElement ||
      field instanceof HTMLTextAreaElement
    ))
      return
    if (owned.get(field) === field.validationMessage) field.setCustomValidity('')
    owned.delete(field)
  }
  document.addEventListener('input', clear, true)
  document.addEventListener('change', clear, true)
}
