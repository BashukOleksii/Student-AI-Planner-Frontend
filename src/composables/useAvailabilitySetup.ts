import { computed, onScopeDispose, ref } from 'vue'
import { planningApi } from '@/api/planning'
import { canonicalWallTime, weekdays } from '@/utils/planning'
import type { AvailabilityInput, AvailabilityWindow } from '@/types/planning'

/** One explicitly confirmed draft; retries reconcile the server before any further write. */
export function useAvailabilitySetup(onRead: (windows: AvailabilityWindow[]) => void) {
  const days = ref(
    weekdays.map((label, index) => ({
      label,
      day_of_week: index + 1,
      enabled: true,
      starts_at: '08:00',
      ends_at: '22:00',
    })),
  )
  const selection = ref<AvailabilityInput[] | null>(null)
  const windows = ref<AvailabilityWindow[]>([])
  const busy = ref(false)
  const error = ref<unknown>(null)
  const localError = ref('')
  const failedDay = ref('')
  const verified = ref(false)
  const paused = ref(false)
  let active = true
  onScopeDispose(() => {
    active = false
  })

  const matches = (input: AvailabilityInput) =>
    windows.value.some(
      (window) =>
        window.day_of_week === input.day_of_week &&
        window.starts_at === input.starts_at &&
        window.ends_at === input.ends_at,
    )
  const saved = computed(() => selection.value?.filter(matches).length ?? 0)
  const complete = computed(
    () => verified.value && selection.value !== null && saved.value === selection.value.length,
  )
  const summary = computed(() =>
    days.value
      .filter((day) => day.enabled)
      .map((day) => `${day.label}: ${day.starts_at}–${day.ends_at}`)
      .join('; '),
  )

  async function read() {
    verified.value = false
    const response = await planningApi.availability()
    if (!active) return
    windows.value = response.data
    onRead(response.data)
    verified.value = true
  }

  async function save() {
    if (busy.value || !active) return
    error.value = null
    localError.value = ''
    failedDay.value = ''
    if (selection.value === null) {
      const chosen: AvailabilityInput[] = []
      for (const day of days.value.filter((day) => day.enabled)) {
        try {
          const starts_at = canonicalWallTime(day.starts_at)
          const ends_at = canonicalWallTime(day.ends_at, true)
          if (starts_at >= ends_at)
            throw new Error(
              'Кінець має бути пізніше початку. Нічний час розділіть на два окремі інтервали.',
            )
          chosen.push({ day_of_week: day.day_of_week, starts_at, ends_at })
        } catch (reason) {
          localError.value = `${day.label}: ${reason instanceof Error ? reason.message : 'Перевірте час.'}`
          return
        }
      }
      if (!chosen.length) {
        localError.value = 'Виберіть хоча б один день або залиште доступність без змін.'
        return
      }
      selection.value = chosen
    }
    busy.value = true
    paused.value = false
    try {
      // Includes a fresh check on EVERY explicit retry, including a lost POST response.
      await read()
      for (const input of selection.value) {
        if (!active) return
        if (matches(input)) continue
        failedDay.value = weekdays[input.day_of_week - 1] ?? ''
        if (
          windows.value.some(
            (window) =>
              window.day_of_week === input.day_of_week &&
              window.starts_at < input.ends_at &&
              window.ends_at > input.starts_at,
          )
        ) {
          localError.value = `${failedDay.value}: уже є інший інтервал, що перетинається з вибраним. Перевірте його у списку нижче. Наявний час не змінено.`
          paused.value = true
          return
        }
        try {
          const created = await planningApi.createWindow(input)
          if (!active) return
          // A successful response is evidence even if the following GET fails.
          windows.value = [
            ...windows.value.filter((window) => window.id !== created.data.id),
            created.data,
          ]
          onRead(windows.value)
        } catch (reason) {
          error.value = reason
          paused.value = true
          // Read only. Never continue the POST loop after an uncertain or rejected write.
          try {
            await read()
          } catch {
            verified.value = false
          }
          return
        }
        await read()
      }
      if (active) {
        // Also reconcile a retry consisting entirely of already persisted windows.
        await read()
        failedDay.value = ''
        paused.value = !complete.value
      }
    } catch (reason) {
      if (active) {
        error.value = reason
        paused.value = true
      }
    } finally {
      busy.value = false
    }
  }

  function finish() {
    if (busy.value) return
    selection.value = null
    error.value = null
    localError.value = ''
    failedDay.value = ''
    paused.value = false
  }

  return {
    days,
    selection,
    busy,
    error,
    localError,
    failedDay,
    verified,
    paused,
    saved,
    complete,
    summary,
    save,
    finish,
  }
}
