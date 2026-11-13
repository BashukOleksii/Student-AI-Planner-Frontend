import type { PublicValue } from '@/types/ai'

// Exact public messages from the backend action presenters. Unknown messages remain
// intact: a presentation translation must never omit or guess a material effect.
const effects: Record<string, string> = {
  'Complete the task and cancel dependent scheduled reminders. Subtask and study-session statuses are preserved.':
    'Завдання буде завершено, а залежні заплановані нагадування — скасовано. Стани підзавдань і навчальних сесій залишаться без змін.',
  'Reopen the task. Previously cancelled reminders and retired study sessions are not recreated.':
    'Завдання повернеться до виконання. Раніше скасовані нагадування й завершені, скасовані або перенесені сесії не створюватимуться знову.',
  'Update the supplied fields. Deadline changes reconcile relative reminders using current lifecycle rules.':
    'Зміняться лише вказані поля. При зміні дедлайну відносні нагадування буде узгоджено з новою датою з урахуванням їхнього поточного стану.',
  'Create one pending task. No subtasks, study sessions or reminders are created.':
    'Буде створено одне завдання до виконання. Підзавдання, навчальні сесії та нагадування не створюються.',
  'Append one pending subtask. The service assigns its position at confirmation.':
    'Буде додано один навчальний крок до виконання. Його місце у списку визначиться під час підтвердження.',
  'Complete only this subtask and cancel its dependent scheduled reminders. Parent and study-session statuses are preserved.':
    'Буде завершено лише цей навчальний крок і скасовано його залежні заплановані нагадування. Стани основного завдання та навчальних сесій залишаться без змін.',
  'Reopen only this subtask. Cancelled reminders and retired study sessions are not recreated.':
    'Лише цей навчальний крок повернеться до виконання. Скасовані нагадування й минулі завершені, скасовані або перенесені сесії не створюватимуться знову.',
  'Update the supplied fields. Deadline changes reconcile existing relative reminders.':
    'Зміняться лише вказані поля. При зміні дедлайну наявні відносні нагадування буде узгоджено з новою датою.',
  'Cancel this scheduled reminder. Preserve its trigger, mode, work, sessions and delivered inbox history.':
    'Це заплановане нагадування буде скасовано. Його час і спосіб відліку, пов’язана робота, сесії та історія доставлених повідомлень збережуться.',
  'Schedule the reviewed reminder change. Delivery is a separate subsystem; no inbox notification is sent now.':
    'Буде збережено переглянуті зміни нагадування. Повідомлення надійде окремо у свій час; зараз сповіщення у вхідні не надсилається.',
  'Create only the reviewed planned sessions. A partial allocation needs explicit accept_partial consent.':
    'Буде створено лише переглянуті заплановані сесії. Якщо часу вистачає не на всю роботу, потрібна ваша окрема згода на частковий план.',
  'Preserve valid and cannot-replan sessions. Replace affected sources with one or more successors; splitting needs explicit split consent; shorter replacements need partial consent and unplaced cancellation needs separate cancellation consent. Cancel source scheduled reminders without cloning them.':
    'Сесії, що підходять до плану або не допускають перенесення, залишаться без змін. Для змінюваної сесії може бути створено кілька замін; поділ потребує окремої згоди. Коротші заміни потребують згоди на частковий результат; скасування сесій без нового часу — окремої згоди. Заплановані нагадування початкових сесій буде скасовано без копіювання.',
  'Preliminary lifecycle and duration review only. Confirmation revalidates remaining effort and all planning constraints; the interval is not guaranteed feasible. Retire the source, create one successor, cancel scheduled source reminders, preserve history and do not clone reminders.':
    'Це попередня перевірка стану й тривалості. Підтвердження повторно перевірить залишок роботи та всі обмеження планування; новий час поки не гарантовано. Початкову сесію буде позначено перенесеною та створено одну заміну. Її заплановані нагадування буде скасовано без копіювання; історія збережеться.',
  'Mark the existing session missed only after authenticated confirmation. Cancel its scheduled dependent reminders; preserve the session identity and history. No replacement is created.':
    'Лише після підтвердження наявну сесію буде позначено пропущеною. Залежні заплановані нагадування буде скасовано. Сама сесія та її історія збережуться; заміна не створюється.',
  'Mark the existing session completed only after authenticated confirmation, using only stated actual minutes. Cancel its scheduled dependent reminders; preserve the session identity and history. No replacement is created.':
    'Лише після підтвердження наявну сесію буде завершено з указаними вами фактичними хвилинами. Залежні заплановані нагадування буде скасовано. Сама сесія та її історія збережуться; заміна не створюється.',
  'Server-reviewed effects: cancel source scheduled reminders without cloning them.':
    'Заплановані нагадування початкових сесій буде скасовано без копіювання.',
}
export function localizedEffects(value: PublicValue): PublicValue {
  if (typeof value === 'string') return effects[value] ?? value
  if (Array.isArray(value)) return value.map(localizedEffects)
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, localizedEffects(item)]),
    )
  return value
}
