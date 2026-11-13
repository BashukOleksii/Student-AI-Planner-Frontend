import type { AiMessage, SentAiTurn, ToolResult, ActionEvent } from '@/types/ai'

const occurrenceTool = 'propose_semester_occurrence_create'
export const occurrenceFailureFallback =
  'Не вдалося створити пропозицію нової пари. Уточни дату, номер і час або перевір розклад.'
export function occurrenceFailure(result: ToolResult) {
  if (result.ok || result.name !== occurrenceTool) return null
  const reasons: Record<string, string> = {
    pair_number_taken: 'Цей номер пари вже зайнятий',
    time_overlap: 'Обраний час перетинається з іншим заняттям',
    date_cancelled: 'Цей день скасовано. Спочатку віднови або явно заміни його розклад',
  }
  return result.error_code === 'invalid_arguments' && result.error_reason
    ? (reasons[result.error_reason] ?? occurrenceFailureFallback)
    : occurrenceFailureFallback
}
export interface AiTimelineEntry {
  message: AiMessage
  failure: string | null
}
// A POST response is persisted too. Its message IDs let it fill an unavailable history page
// without optimistic bubbles or text matching; raw tool messages remain in conversation state.
export function aiTimeline(messages: AiMessage[], turns: SentAiTurn[] = []): AiTimelineEntry[] {
  const byId = new Map(messages.map((message) => [message.id, message]))
  for (const { result, userContent } of turns) {
    for (const [id, role, content] of [
      [result.user_message_id, 'user', userContent],
      [result.assistant_message_id, 'assistant', result.content],
    ] as const) {
      if (!byId.has(id))
        byId.set(id, {
          id,
          role,
          content,
          content_truncated: false,
          tool_calls: [],
          tool_calls_truncated: false,
          tool_result: null,
          created_at: null,
        })
    }
  }
  const rows = [...byId.values()].sort((a, b) => a.id - b.id)
  const groups: AiMessage[][] = []
  for (const row of rows) {
    if (row.role === 'user' || !groups.length) groups.push([])
    groups.at(-1)!.push(row)
  }
  return groups.flatMap((group) => {
    const first = group[0]!,
      userId = first.role === 'user' ? first.id : null
    const posted = turns.find((turn) => turn.result.user_message_id === userId)
    const tools = new Map<string, ToolResult>()
    for (const row of group)
      if (row.tool_result?.name === occurrenceTool) {
        const result = row.tool_result
        tools.set(result.call_id ?? `message:${row.id}`, result)
      }
    for (const result of posted?.result.tools ?? [])
      if (result.name === occurrenceTool) {
        const key = result.call_id ?? `turn:${posted!.result.assistant_message_id}`
        const history = tools.get(key)
        tools.set(
          key,
          history
            ? { ...history, error_reason: history.error_reason ?? result.error_reason }
            : result,
        )
      }
    const lastResult = [...tools.values()].at(-1)
    const failure = lastResult ? occurrenceFailure(lastResult) : null
    // Keep every real assistant response/clarification even when it also called tools.
    const visible = group.filter(
      (row) =>
        row.role === 'user' ||
        row.action_event ||
        (row.role === 'assistant' && !!row.content?.trim()),
    )
    const anchor = posted
      ? group.find((row) => row.id === posted.result.assistant_message_id)
      : [...group]
          .reverse()
          .find((row) => row.role === 'assistant' && !row.action_event && !row.tool_calls.length)
    if (failure && anchor && !visible.some((row) => row.id === anchor.id)) visible.push(anchor)
    if (failure && !anchor) {
      const source = [...group].reverse().find((row) => row.tool_result?.name === occurrenceTool)!
      visible.push({ ...source, role: 'assistant', content: null, tool_result: null })
    }
    const anchorId = anchor?.id ?? visible.at(-1)?.id
    return visible
      .sort((a, b) => a.id - b.id)
      .map((message) => ({ message, failure: failure && message.id === anchorId ? failure : null }))
  })
}

export function actionEventLabel(event: ActionEvent) {
  if (event.status === 'executed') return 'Зміни успішно застосовано.'
  if (event.status === 'rejected') return 'Пропозицію відхилено.'
  if (event.status === 'expired') return 'Строк пропозиції минув.'
  return [
    'action_stale',
    'action_conflict',
    'action_token_invalid',
    'action_validation_failed',
  ].includes(event.error_code ?? '')
    ? 'Потрібен новий огляд. Поточну пропозицію більше не підтверджуй.'
    : 'Спроба підтвердження не вдалася; це не кінцевий стан пропозиції.'
}
