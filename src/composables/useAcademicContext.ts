import { computed, onMounted, onScopeDispose, ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { today } from '@/utils/dates'
import type { AcademicPeriod, EducationInstitution } from '@/types/api'

// The API has no active-institution flag. Keep an explicit, user-scoped UI preference.
const institutionChoices = ref<Record<number, number | null>>({})

// A current period contains today's date in the student's persisted timezone.
// Past and future records remain available to their existing schedules and history.
export function useAcademicContext(
  periods: () => AcademicPeriod[],
  institutions: () => EducationInstitution[],
) {
  const auth = useAuthStore()
  const preferenceKey = () => `student-planner:institution:${auth.user?.id}`
  watch(
    () => auth.user?.id,
    (userId) => {
      if (!userId || institutionChoices.value[userId] !== undefined) return
      try {
        const value = Number(localStorage.getItem(preferenceKey()))
        institutionChoices.value[userId] = Number.isSafeInteger(value) && value > 0 ? value : null
      } catch {
        institutionChoices.value[userId] = null
      }
    },
    { immediate: true },
  )
  function chooseInstitution(id: number) {
    const userId = auth.user?.id
    if (!userId || !institutions().some((item) => item.id === id)) return
    institutionChoices.value[userId] = id
    try {
      localStorage.setItem(preferenceKey(), String(id))
    } catch {
      /* Selection remains valid for this session. */
    }
  }
  const clock = ref(Date.now())
  let timer: ReturnType<typeof setInterval> | undefined
  onMounted(() => {
    timer = setInterval(() => {
      clock.value = Date.now()
    }, 1000)
  })
  onScopeDispose(() => clearInterval(timer))
  const date = computed(() => {
    void clock.value
    return today(auth.user?.timezone ?? 'UTC')
  })
  const institution = computed(() => {
    const items = institutions()
    if (items.length === 1) return items[0]
    const selected = auth.user ? institutionChoices.value[auth.user.id] : null
    return items.find((item) => item.id === selected)
  })
  const currentPeriods = computed(() =>
    periods().filter((p) => p.starts_on <= date.value && p.ends_on >= date.value),
  )
  const period = computed(() => {
    const items = currentPeriods.value
    return institution.value &&
      items.length === 1 &&
      items[0]?.education_institution_id === institution.value.id
      ? items[0]
      : undefined
  })
  const issue = computed(() => {
    if (!institutions().length) return 'Додайте навчальний заклад в академічному просторі.'
    if (!institution.value)
      return 'Збережено кілька навчальних закладів. Виберіть поточний в академічному просторі. Усі інші записи залишаться збереженими.'
    if (currentPeriods.value.length > 1)
      return 'Дати кількох навчальних періодів охоплюють сьогодні. Уточніть їхні межі в академічному просторі; період не вибрано.'
    if (!currentPeriods.value.length)
      return 'Немає актуального навчального періоду. Створіть період, дати якого охоплюють сьогодні. Завершені періоди збережено в історії.'
    if (!period.value)
      return 'Актуальний навчальний період не пов’язаний із вашим навчальним закладом. Уточніть його налаштування.'
    return ''
  })
  return { date, institution, chooseInstitution, currentPeriods, period, issue }
}
