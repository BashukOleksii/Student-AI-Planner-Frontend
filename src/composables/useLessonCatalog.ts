import { academicApi } from '@/api/academic'
import { useResource } from './useResource'
export function useLessonCatalog() {
  return {
    subjects: useResource(academicApi.subjects.list),
    teachers: useResource(academicApi.teachers.list),
    periods: useResource(academicApi.periods.list),
  }
}
