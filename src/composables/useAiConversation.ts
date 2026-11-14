import { onScopeDispose, ref, shallowRef } from 'vue'
import { aiApi } from '@/api/ai'
import { ApiError } from '@/api/client'
import { isLessonAction, samePublicValue } from '@/utils/aiLesson'
import { isAvailabilityAction } from '@/utils/aiAvailability'
import type { AvailabilityWindow } from '@/types/planning'
import { refreshAiDomains } from '@/api/aiRefresh'
import { useResource } from './useResource'
import { readIntent, saveIntent, removeIntent } from '@/utils/aiIntent'
import { consentFields, reviewSupported, validMessage } from '@/utils/ai'
import type {
  AiAction,
  AiMessage,
  AiPage,
  ConsentField,
  PendingIntent,
  SentAiTurn,
} from '@/types/ai'

export function useAiConversation(
  conversationId: number,
  ownerId: number,
  timezone: () => string,
  committed: () => void,
  csrfBlocked: () => boolean,
) {
  const conversation = useResource((signal) => aiApi.conversation(conversationId, signal))
  const messages = shallowRef<AiMessage[]>([])
  const sentTurns = shallowRef<SentAiTurn[]>([])
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
  const currentAvailability = shallowRef<AvailabilityWindow[] | null>(null)
  const domainError = shallowRef<unknown>(null),
    domainBusy = ref(false)
  const draft = ref(''),
    intent = shallowRef<PendingIntent | null>(readIntent(ownerId, conversationId))
  const sending = ref(false),
    sendError = shallowRef<unknown>(null),
    sentNotice = ref('')
  const storageAvailable = ref(true)
  let selectionRevision = 0
  let active = true,
    historyController: AbortController | undefined,
    actionsController: AbortController | undefined,
    reviewController: AbortController | undefined,
    domainController: AbortController | undefined
  const writes = new AbortController()
  const obsoleteActions = new Set<string>()
  onScopeDispose(() => {
    active = false
    historyController?.abort()
    actionsController?.abort()
    reviewController?.abort()
    domainController?.abort()
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
      messages.value = ordered([...messages.value, ...result.data])
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
    const revision = ++selectionRevision
    reviewController?.abort()
    domainController?.abort()
    domainBusy.value = false
    const current = (reviewController = new AbortController())
    const sameSelection = selectedId.value === actionId
    selectedId.value = actionId
    if (!sameSelection) {
      selected.value = null
      consent.value = {}
      decisionError.value = null
      decisionNotice.value = ''
      uncertainDecision.value = false
      domainError.value = null
      currentAvailability.value = null
    }
    needsProposal.value = obsoleteActions.has(actionId)
    reviewError.value = null
    reviewLoading.value = true
    try {
      const result = await aiApi.action(conversationId, actionId, current.signal)
      if (
        !active ||
        current.signal.aborted ||
        revision !== selectionRevision ||
        selectedId.value !== actionId
      )
        return
      updateAction(result.data)
      uncertainDecision.value = false
      needsProposal.value = obsoleteActions.has(actionId)
      return true
    } catch (error) {
      if (active && !current.signal.aborted && revision === selectionRevision)
        reviewError.value = error
    } finally {
      if (active && !current.signal.aborted && revision === selectionRevision)
        reviewLoading.value = false
    }
  }
  async function loadActions(more = false, prefer?: string, expectedSelection = selectionRevision) {
    actionsController?.abort()
    const current = (actionsController = new AbortController())
    const selectionAtStart = expectedSelection
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
      // A list response must never replace a review selected after this read began.
      if (
        candidate &&
        (!selected.value || candidate !== selectedId.value) &&
        !decisionBusy.value &&
        selectionAtStart === selectionRevision
      )
        void selectAction(candidate)
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
    const selectionAtSend = selectionRevision
    sending.value = true
    sendError.value = null
    sentNotice.value = ''
    try {
      const result = await aiApi.send(conversationId, pending.content, pending.key, writes.signal)
      if (!active) return
      removeIntent(ownerId, conversationId)
      intent.value = null
      draft.value = ''
      sentTurns.value = [
        ...sentTurns.value.filter(
          (turn) => turn.result.user_message_id !== result.data.user_message_id,
        ),
        { result: result.data, userContent: pending.content },
      ]
      sentNotice.value = 'Відповідь збережено сервером.'
      // The write is acknowledged. Independent GETs must not hold the composer lock.
      sending.value = false
      void history()
      void loadActions(false, result.data.action?.id, selectionAtSend)
      committed()
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
    const revision = selectionRevision
    domainController?.abort()
    const controller = (domainController = new AbortController())
    domainBusy.value = true
    domainError.value = null
    try {
      const result = await refreshAiDomains(
        current,
        timezone(),
        controller.signal,
        needsProposal.value && (isLessonAction(current.type) || isAvailabilityAction(current.type)),
      )
      if (
        active &&
        !controller.signal.aborted &&
        revision === selectionRevision &&
        selectedId.value === current.id &&
        isAvailabilityAction(current.type)
      )
        currentAvailability.value = result?.data ?? null
    } catch (error) {
      if (
        active &&
        !controller.signal.aborted &&
        revision === selectionRevision &&
        selectedId.value === current.id
      ) {
        domainError.value = error
        currentAvailability.value = null
      }
    } finally {
      if (active && !controller.signal.aborted && revision === selectionRevision)
        domainBusy.value = false
    }
  }
  function updateAction(current: AiAction) {
    if (selectedId.value === current.id) {
      const previous = selected.value
      if (
        !previous ||
        previous.id !== current.id ||
        previous.type !== current.type ||
        previous.status !== current.status ||
        !samePublicValue(previous.preview, current.preview)
      )
        consent.value = {}
      selected.value = current
    }
    actions.value = actions.value.map((row) => (row.id === current.id ? current : row))
  }
  async function recoverDecision() {
    if (!selectedId.value || decisionBusy.value) return
    const actionId = selectedId.value
    const loaded = await selectAction(actionId)
    if (!loaded || !active || selectedId.value !== actionId || reviewError.value) return
    if (selected.value?.status === 'executed') {
      decisionError.value = null
      decisionNotice.value = ''
      committed()
      void refreshDomains()
    } else if (
      needsProposal.value &&
      (isLessonAction(selected.value?.type ?? '') ||
        isAvailabilityAction(selected.value?.type ?? ''))
    ) {
      void refreshDomains()
    }
    void history()
  }
  async function decide(operation: 'confirm' | 'reject') {
    const reviewed = selected.value
    if (
      !reviewed ||
      decisionBusy.value ||
      sending.value ||
      reviewLoading.value ||
      reviewError.value ||
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
    let writeStarted = false
    try {
      const current = (await aiApi.action(conversationId, reviewed.id, writes.signal)).data
      if (!active) return
      updateAction(current)
      if (current.type !== reviewed.type) {
        decisionNotice.value = 'Тип дії змінився. Перегляньте новий огляд.'
        return
      }
      if (current.status !== 'pending') {
        decisionNotice.value = 'Стан дії змінився. Показано актуальний стан сервера.'
        decisionBusy.value = false
        if (current.status === 'executed') void refreshDomains()
        void history()
        return
      }
      if (!samePublicValue(current.preview, reviewed.preview)) {
        consent.value = {}
        decisionNotice.value = 'Огляд змінився. Перечитайте його та надайте згоду заново.'
        return
      }
      if (operation === 'confirm' && !reviewSupported(current)) return
      const fields = operation === 'confirm' ? consentFields(current) : []
      const body = Object.fromEntries(
        fields.filter((field) => consent.value[field] === true).map((field) => [field, true]),
      )
      writeStarted = true
      const result = await aiApi.decide(conversationId, current.id, operation, body, writes.signal)
      if (!active) return
      updateAction(result.data)
      uncertainDecision.value = false
      consent.value = {}
      decisionNotice.value = result.replayed
        ? 'Це раніше збережене виконання. Повторних змін немає.'
        : ''
      decisionBusy.value = false
      if (result.data.status === 'executed') void refreshDomains()
      void history()
      void loadActions()
      committed()
    } catch (error) {
      if (!active) return
      if (!writeStarted) {
        reviewError.value = error
        return
      }
      decisionError.value = error
      needsProposal.value =
        error instanceof ApiError &&
        [
          'action_stale',
          'action_conflict',
          'action_token_invalid',
          'action_validation_failed',
        ].includes(error.code ?? '')
      if (needsProposal.value) {
        obsoleteActions.add(reviewed.id)
        // Nonplanning stale failures remain pending: refresh current data, never retry the write.
        if (isLessonAction(reviewed.type) || isAvailabilityAction(reviewed.type))
          void refreshDomains()
      }
      // A failed/lost response is not evidence of rollback. Recover by GET, never repeat the POST.
      uncertainDecision.value = true
      decisionBusy.value = false
      void recoverDecision()
    } finally {
      if (active) decisionBusy.value = false
    }
  }
  void history()
  void loadActions()
  return {
    conversation,
    messages,
    sentTurns,
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
    currentAvailability,
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
