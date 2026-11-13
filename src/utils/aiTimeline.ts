import type { AiMessage, SentAiTurn, ToolResult, ActionEvent, AiAction } from '@/types/ai'

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
const readySummary = 'Пропозицію підготовлено до підтвердження. Зміни ще не виконано.'
const failedSummary = 'Пропозицію не створено. Зміни не виконано.'
// Exact legacy catalog, never substring matching or a classifier for model prose.
const legacySummaries = new Map<string, string>([
  ['Task action proposed. Confirmation is required; no task has changed.', readySummary],
  ['No task action was prepared. No task has changed.', failedSummary],
  ['Task action executed.', 'Підтверджені зміни виконано.'],
  ['Task action rejected. No task was changed.', 'Пропозицію відхилено. Зміни не виконано.'],
  ['Task action expired. No task was changed.', 'Строк пропозиції минув. Зміни не виконано.'],
  [
    'Planning action confirmation failed. No business data was changed.',
    'Не вдалося підтвердити зміни плану. Зміни не виконано.',
  ],
])
for (const domain of ['Subtask', 'Reminder', 'Planning', 'Lesson', 'Availability', 'Semester']) {
  legacySummaries.set(
    `${domain} action proposed. Confirmation is required; no business data has changed.`,
    readySummary,
  )
  legacySummaries.set(
    `No ${domain.toLowerCase()} action was prepared. No business data has changed.`,
    failedSummary,
  )
  for (const [status, label] of [
    ['executed', 'Підтверджені зміни виконано.'],
    ['rejected', 'Пропозицію відхилено. Зміни не виконано.'],
    ['expired', 'Строк пропозиції минув. Зміни не виконано.'],
  ])
    legacySummaries.set(
      `${domain} action ${status}.${status === 'executed' ? '' : ' No business data was changed.'}`,
      label!,
    )
}
export function aiTimeline(
  messages: AiMessage[],
  turns: SentAiTurn[] = [],
  visibleAction?: Pick<AiAction, 'id' | 'conversation_id' | 'status'> | null,
  needsProposal = false,
): AiTimelineEntry[] {
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
          ...(role === 'assistant' && result.server_message
            ? { server_message: result.server_message }
            : {}),
        })
    }
  }
  for (const { result } of turns) {
    const row = byId.get(result.assistant_message_id)
    if (row && result.server_message && !row.server_message)
      byId.set(row.id, { ...row, server_message: result.server_message })
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
    const cardMatches = (id: string) =>
      visibleAction?.id === id &&
      (!posted || posted.result.conversation_id === visibleAction.conversation_id)
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
        (row.role === 'assistant' && (!!row.content?.trim() || !!row.server_message)),
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
      .flatMap((message): AiTimelineEntry[] => {
        const event = message.action_event
        if (
          event &&
          cardMatches(event.action_id) &&
          (event.status === visibleAction?.status ||
            (needsProposal &&
              event.status === 'failed' &&
              [
                'action_stale',
                'action_conflict',
                'action_token_invalid',
                'action_validation_failed',
              ].includes(event.error_code)))
        )
          return []
        if (message.role !== 'assistant' || event) return [{ message, failure: null }]
        const provenance = message.server_message
        const legacy = message.content ? legacySummaries.get(message.content) : undefined
        const linkedPost = posted?.result.assistant_message_id === message.id ? posted.result : null
        const readyId =
          provenance?.kind === 'proposal_ready'
            ? provenance.action_id
            : legacy === readySummary
              ? linkedPost?.action?.id
              : undefined
        if (readyId && cardMatches(readyId)) return []
        const reason = failure && message.id === anchorId ? failure : null
        const notCreated = provenance?.kind === 'proposal_not_created' || legacy === failedSummary
        const content =
          provenance?.kind === 'proposal_ready'
            ? readySummary
            : notCreated
              ? reason
                ? null
                : failedSummary
              : (legacy ?? message.content)
        return [{ message: { ...message, content }, failure: reason }]
      })
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
