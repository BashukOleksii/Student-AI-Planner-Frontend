import { onScopeDispose, ref, shallowRef } from 'vue'
import { aiApi } from '@/api/ai'
import { ApiError } from '@/api/client'
import { refreshAiDomains } from '@/api/aiRefresh'
import { useResource } from './useResource'
import { readIntent, saveIntent, removeIntent } from '@/utils/aiIntent'
import { consentFields, reviewSupported, validMessage } from '@/utils/ai'
import type { AiAction, AiMessage, AiPage, ConsentField, PendingIntent } from '@/types/ai'

export function useAiConversation(
  conversationId: number,
  ownerId: number,
  timezone: () => string,
  committed: () => void,
  csrfBlocked: () => boolean,
) {
  const conversation = useResource((signal) => aiApi.conversation(conversationId, signal))
  const messages = shallowRef<AiMessage[]>([])
  const messagePage = shallowRef<AiPage<AiMessage> | null>(null)
  const historyLoading = ref(false),
    historyError = shallowRef<unknown>(null)
  const actions = shallowRef<AiAction[]>([]),
    actionsNext = ref<string | null>(null)
  const actionsLoading = ref(false),
    actionsError = shallowRef<unknown>(null)
  const selectedId = ref<string | null>(null),
    selected = shallowRef<AiAction | null>(null)
  const reviewLoading = ref(false),
    reviewError = shallowRef<unknown>(null)
  const decisionBusy = ref(false),
    decisionError = shallowRef<unknown>(null)
  const decisionNotice = ref(''),
    needsProposal = ref(false),
    uncertainDecision = ref(false)
  const consent = ref<Partial<Record<ConsentField, boolean>>>({})
  const domainError = shallowRef<unknown>(null),
    domainBusy = ref(false)
  const draft = ref(''),
    intent = shallowRef<PendingIntent | null>(readIntent(ownerId, conversationId))
  const sending = ref(false),
    sendError = shallowRef<unknown>(null),
    sentNotice = ref('')
  const storageAvailable = ref(true)
  let active = true,
    historyController: AbortController | undefined,
    actionsController: AbortController | undefined,
    reviewController: AbortController | undefined
  const writes = new AbortController()
  const obsoleteActions = new Set<string>()
  onScopeDispose(() => {
    active = false
    historyController?.abort()
    actionsController?.abort()
    reviewController?.abort()
    writes.abort()
  })
  const ordered = (rows: AiMessage[]) =>
    [...new Map(rows.map((row) => [row.id, row])).values()].sort((a, b) => a.id - b.id)
  async function history(older = false) {
    if (older && (!messagePage.value?.links.prev || historyLoading.value)) return
    historyController?.abort()
    const current = (historyController = new AbortController())
    historyLoading.value = true
    historyError.value = null
    try {
      let result = await aiApi.messages(
        conversationId,
        older ? messagePage.value?.links.prev : undefined,
        current.signal,
      )
      // Backend pages ascend by ID: obtain the newest page of the captured snapshot.
      if (!older && result.meta.last_page > 1)
        result = await aiApi.messages(conversationId, result.links.last, current.signal)
      if (current.signal.aborted || !active) return
      messages.value = ordered(older ? [...result.data, ...messages.value] : result.data)
      for (const row of result.data) {
        const event = row.action_event
        if (
          event?.status === 'failed' &&
          [
            'action_stale',
            'action_conflict',
            'action_token_invalid',
            'action_validation_failed',
          ].includes(event.error_code ?? '')
        )
          obsoleteActions.add(event.action_id)
      }
      if (selectedId.value && obsoleteActions.has(selectedId.value)) needsProposal.value = true
      messagePage.value = result
    } catch (error) {
      if (active && !current.signal.aborted) historyError.value = error
    } finally {
      if (active && !current.signal.aborted) historyLoading.value = false
    }
  }
  async function selectAction(actionId: string) {
    if (decisionBusy.value) return
    reviewController?.abort()
    const current = (reviewController = new AbortController())
    selectedId.value = actionId
    selected.value = null
    consent.value = {}
    decisionError.value = null
    decisionNotice.value = ''
    uncertainDecision.value = false
    needsProposal.value = obsoleteActions.has(actionId)
    domainError.value = null
    reviewError.value = null
    reviewLoading.value = true
    try {
      const result = await aiApi.action(conversationId, actionId, current.signal)
      if (active && !current.signal.aborted) {
        selected.value = result.data
        needsProposal.value = obsoleteActions.has(actionId)
      }
    } catch (error) {
      if (active && !current.signal.aborted) reviewError.value = error
    } finally {
      if (active && !current.signal.aborted) reviewLoading.value = false
    }
  }
  async function loadActions(more = false, prefer?: string) {
    actionsController?.abort()
    const current = (actionsController = new AbortController())
    actionsLoading.value = true
    actionsError.value = null
    try {
      const result = await aiApi.actions(
        conversationId,
        more ? actionsNext.value : undefined,
        current.signal,
      )
      if (current.signal.aborted || !active) return
      actions.value = more
        ? [...new Map([...actions.value, ...result.data].map((row) => [row.id, row])).values()]
        : result.data
      actionsNext.value = result.links.next
      const candidate =
        prefer ?? selectedId.value ?? result.data.find((row) => row.status === 'pending')?.id
      if (candidate && !decisionBusy.value) await selectAction(candidate)
    } catch (error) {
      if (active && !current.signal.aborted) actionsError.value = error
    } finally {
      if (active && !current.signal.aborted) actionsLoading.value = false
    }
  }
  async function send(retry = false) {
    if (
      sending.value ||
      decisionBusy.value ||
      csrfBlocked() ||
      conversation.error.value ||
      !conversation.data.value
    )
      return
    if (!retry) {
      if (intent.value || !validMessage(draft.value)) return
      intent.value = {
        ownerId,
        conversationId,
        key: crypto.randomUUID(),
        content: draft.value,
        createdAt: Date.now(),
      }
      storageAvailable.value = saveIntent(intent.value)
    }
    const pending = intent.value
    if (
      !pending ||
      (retry &&
        sendError.value instanceof ApiError &&
        sendError.value.code === 'idempotency_conflict')
    )
      return
    sending.value = true
    sendError.value = null
    sentNotice.value = ''
    try {
      const result = await aiApi.send(conversationId, pending.content, pending.key, writes.signal)
      if (!active) return
      removeIntent(ownerId, conversationId)
      intent.value = null
      draft.value = ''
      sentNotice.value = 'Відповідь збережено сервером.'
      // Persisted history is authoritative: never mix optimistic and confirmed bubbles.
      await Promise.all([history(), loadActions(false, result.data.action?.id)])
      if (active) committed()
    } catch (error) {
      if (active) sendError.value = error
    } finally {
      if (active) sending.value = false
    }
  }
  function editAsNew() {
    if (!intent.value || sending.value) return
    if (
      !window.confirm(
        'Попередній запит міг бути збережений. Перевірте історію. Редагування створить новий намір і може спричинити новий AI-запит. Продовжити?',
      )
    )
      return
    draft.value = intent.value.content
    removeIntent(ownerId, conversationId)
    intent.value = null
    sendError.value = null
  }
  function forgetIntent() {
    if (
      sending.value ||
      !window.confirm(
        'Видалити локальну копію незавершеного запиту? Це не скасовує обробку на сервері.',
      )
    )
      return
    removeIntent(ownerId, conversationId)
    intent.value = null
    sendError.value = null
  }
  async function refreshDomains() {
    if (!selected.value || domainBusy.value) return
    const current = selected.value
    domainBusy.value = true
    domainError.value = null
    try {
      await refreshAiDomains(current, timezone(), writes.signal)
    } catch (error) {
      if (active && selectedId.value === current.id) domainError.value = error
    } finally {
      if (active) domainBusy.value = false
    }
  }
  function updateAction(current: AiAction) {
    selected.value = current
    actions.value = actions.value.map((row) => (row.id === current.id ? current : row))
  }
  async function recoverDecision() {
    if (!selectedId.value || decisionBusy.value) return
    const actionId = selectedId.value
    reviewController?.abort()
    const current = (reviewController = new AbortController())
    reviewLoading.value = true
    reviewError.value = null
    try {
      const result = await aiApi.action(conversationId, actionId, current.signal)
      if (!active || current.signal.aborted) return
      if (
        selected.value &&
        JSON.stringify(selected.value.preview) !== JSON.stringify(result.data.preview)
      )
        consent.value = {}
      updateAction(result.data)
      uncertainDecision.value = false
      if (result.data.status === 'executed') {
        decisionNotice.value = 'Сервер підтвердив виконання. Показано збережений результат.'
        await refreshDomains()
        await history()
        committed()
      }
    } catch (error) {
      if (active && !current.signal.aborted) reviewError.value = error
    } finally {
      if (active && !current.signal.aborted) reviewLoading.value = false
    }
  }
  async function decide(operation: 'confirm' | 'reject') {
    const reviewed = selected.value
    if (
      !reviewed ||
      decisionBusy.value ||
      sending.value ||
      reviewLoading.value ||
      csrfBlocked() ||
      reviewed.status !== 'pending' ||
      uncertainDecision.value
    )
      return
    if (
      operation === 'confirm' &&
      (needsProposal.value ||
        uncertainDecision.value ||
        !reviewSupported(reviewed) ||
        consentFields(reviewed).some((field) => consent.value[field] !== true))
    )
      return
    decisionBusy.value = true
    decisionError.value = null
    decisionNotice.value = ''
    try {
      const current = (await aiApi.action(conversationId, reviewed.id, writes.signal)).data
      if (!active) return
      updateAction(current)
      if (current.status !== 'pending') {
        decisionNotice.value = 'Стан дії змінився. Показано актуальний стан сервера.'
        if (current.status === 'executed') await refreshDomains()
        await history()
        return
      }
      if (JSON.stringify(current.preview) !== JSON.stringify(reviewed.preview)) {
        consent.value = {}
        decisionNotice.value = 'Огляд змінився. Перечитайте його та надайте згоду заново.'
        return
      }
      const fields = operation === 'confirm' ? consentFields(current) : []
      const body = Object.fromEntries(
        fields.filter((field) => consent.value[field] === true).map((field) => [field, true]),
      )
      const result = await aiApi.decide(conversationId, current.id, operation, body, writes.signal)
      if (!active) return
      updateAction(result.data)
      uncertainDecision.value = false
      consent.value = {}
      decisionNotice.value = result.replayed
        ? 'Це раніше збережене виконання. Повторних змін немає.'
        : result.data.status === 'executed'
          ? 'Сервер виконав підтверджену дію.'
          : 'Пропозицію відхилено. Зміни не виконано.'
      if (result.data.status === 'executed') await refreshDomains()
      await history()
      committed()
    } catch (error) {
      if (!active) return
      decisionError.value = error
      needsProposal.value =
        error instanceof ApiError &&
        [
          'action_stale',
          'action_conflict',
          'action_token_invalid',
          'action_validation_failed',
        ].includes(error.code ?? '')
      if (needsProposal.value) obsoleteActions.add(reviewed.id)
      // A failed/lost response is not evidence of rollback. Only a safe GET is automatic.
      uncertainDecision.value = true
      try {
        const current = (await aiApi.action(conversationId, reviewed.id, writes.signal)).data
        if (!active) return
        updateAction(current)
        uncertainDecision.value = false
        if (current.status === 'executed') {
          decisionError.value = null
          decisionNotice.value =
            'Після перерваної відповіді сервер підтвердив виконання. Повторна дія не потрібна.'
          await refreshDomains()
          committed()
        }
        await history()
      } catch (recoveryError) {
        if (active) reviewError.value = recoveryError
      }
    } finally {
      if (active) decisionBusy.value = false
    }
  }
  void history()
  void loadActions()
  return {
    conversation,
    messages,
    messagePage,
    historyLoading,
    historyError,
    history,
    actions,
    actionsNext,
    actionsLoading,
    actionsError,
    loadActions,
    selectedId,
    selected,
    reviewLoading,
    reviewError,
    selectAction,
    consent,
    decisionBusy,
    decisionError,
    decisionNotice,
    needsProposal,
    uncertainDecision,
    decide,
    recoverDecision,
    domainError,
    domainBusy,
    refreshDomains,
    draft,
    intent,
    sending,
    sendError,
    sentNotice,
    storageAvailable,
    send,
    editAsNew,
    forgetIntent,
  }
}
