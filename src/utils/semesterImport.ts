import type {
  ImportErrors,
  ImportPreviewRow,
  ImportRowOperation,
  ImportTeacher,
} from '@/types/semesterSchedule'
export const importOperations: Record<ImportRowOperation, string> = {
  create: 'Створення',
  update: 'Оновлення',
  delete: 'Видалення',
  noop: 'Без змін',
  preserve: 'Збереження захищеного правила',
  duplicate: 'Дублікати у файлі',
  suppressed: 'Захищений видалений слот',
}

export function importErrorMessages(errors: ImportErrors): string[] {
  return Object.values(errors).flatMap((messages) =>
    messages.flatMap((message) =>
      typeof message === 'string'
        ? [message]
        : message.errors.map((error) => `${message.name}: ${error}`),
    ),
  )
}
export function catalogResolution(item: ImportTeacher | null): string {
  if (item?.resolution === 'create') return 'Буде створено'
  if (item?.resolution === 'invalid') return 'Потребує виправлення'
  return item?.id ? 'Знайдено у ваших предметах і викладачах' : 'Потрібне зіставлення'
}
export function importTeacherNames(row: ImportPreviewRow): string {
  return (
    (
      row.teachers?.map((item) => item.name) ??
      row.teacher_names ??
      (row.teacher ? [row.teacher.name] : row.teacher_name ? [row.teacher_name] : [])
    ).join(', ') || 'Без викладача'
  )
}
