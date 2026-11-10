import type { ImportRowOperation } from '@/types/semesterSchedule'
export const importOperations: Record<ImportRowOperation, string> = {
  create: 'Створення',
  update: 'Оновлення',
  delete: 'Видалення',
  noop: 'Без змін',
  preserve: 'Збереження захищеного правила',
  duplicate: 'Дублікати у файлі',
  suppressed: 'Захищений видалений слот',
}
