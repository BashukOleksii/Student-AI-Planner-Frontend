import { computed } from 'vue'
import { useAcademicContext } from './useAcademicContext'
import { semesterWeekParity } from '@/utils/semesterSchedule'
import type { SemesterSchedule } from '@/types/semesterSchedule'

// Reuse the academic context's live student-local date and current-period bounds.
export function useCurrentSemester(schedules: () => SemesterSchedule[]) {
  const context = useAcademicContext(
    () => [
      ...new Map(
        schedules().map((item) => [
          item.academic_period.id,
          {
            ...item.academic_period,
            education_institution_id: item.education_institution.id,
          },
        ]),
      ).values(),
    ],
    () => [
      ...new Map(
        schedules().map((item) => [item.education_institution.id, item.education_institution]),
      ).values(),
    ],
  )
  const candidates = computed(() =>
    schedules().filter((item) =>
      context.currentPeriods.value.some((period) => period.id === item.academic_period.id),
    ),
  )
  const schedule = computed(() => (candidates.value.length === 1 ? candidates.value[0] : undefined))
  const parity = computed(() =>
    schedule.value ? semesterWeekParity(schedule.value, context.date.value) : null,
  )
  const status = computed(() => {
    if (candidates.value.length > 1)
      return 'Кілька семестрових розкладів одночасно актуальні. Уточніть межі навчальних періодів або налаштування розкладів.'
    if (schedule.value)
      return parity.value
        ? `Цього тижня — ${parity.value === 'numerator' ? 'чисельник' : 'знаменник'}`
        : 'Не вдалося визначити парність тижня. Перевірте налаштування семестру.'
    if (
      schedules().length &&
      schedules().every((item) => item.academic_period.ends_on < context.date.value)
    )
      return 'Семестр завершився'
    if (
      schedules().length &&
      schedules().every((item) => item.academic_period.starts_on > context.date.value)
    )
      return 'Семестр ще не почався'
    return 'Поточний семестровий розклад не визначено'
  })
  return { schedule, parity, status, candidates, date: context.date }
}
