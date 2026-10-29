import type {
  AiAction,
  AiMessage,
  ActionType,
  Conversation,
  PublicObject,
  TurnResult,
} from '../../src/types/ai'
import type { Page as ApiPage } from '../../src/types/api'
import { f2Backend, type MockReply } from './f2Backend'
import { task, user, progress } from '../fixtures'

export const stamp = '2026-10-29T12:00:00.000000Z'
export const actionUuid = (index = 1) =>
  `10000000-0000-4000-8000-${String(index).padStart(12, '0')}`
const session = {
  id: 90,
  task_id: 1,
  subtask_id: null,
  starts_at: '2026-11-12T10:00:00Z',
  ends_at: '2026-11-12T10:30:00Z',
  duration_seconds: 1800,
  status: 'planned',
  completed_at: null,
  actual_minutes: null,
}
const interval = { starts_at: session.starts_at, ends_at: session.ends_at, duration_seconds: 1800 }
export function actionFixture(
  type: ActionType = 'propose_task_create',
  index = 1,
  conversationId = 1,
): AiAction {
  const common = {
    action: type,
    confirmation_required: true,
    effects: ['Server-reviewed effects: cancel source scheduled reminders without cloning them.'],
  }
  let preview: PublicObject
  if (type === 'propose_study_plan_create' || type === 'propose_adaptive_replanning') {
    const review: PublicObject = {
      as_of_utc: stamp,
      start_date: '2026-11-12',
      end_date: '2026-11-12',
      timezone: 'Europe/Kyiv',
      work_results: [
        {
          task_id: 1,
          subtask_id: null,
          requested_seconds: 3600,
          allocated_seconds: 1800,
          unscheduled_seconds: 1800,
          reason_codes: ['deadline_capacity_exhausted', 'planning_horizon_exhausted'],
        },
      ],
      excluded_items: [
        {
          task_id: 9,
          subtask_id: null,
          work_type: 'task',
          effective_deadline_utc: null,
          priority: 2,
          position: null,
          effort: null,
          reason_codes: ['completed_task'],
        },
      ],
      warnings: [
        {
          code: 'reservation_deadline_exceeded',
          task_id: 1,
          subtask_id: null,
          study_session_id: 90,
          seconds: 1800,
        },
      ],
      summary: {
        requested_seconds: 3600,
        allocated_seconds: 1800,
        unscheduled_seconds: 1800,
        fully_allocated: false,
      },
    }
    if (type === 'propose_study_plan_create')
      review.sessions = [{ task_id: 1, subtask_id: null, ...interval }]
    else {
      review.work_results = [
        {
          task_id: 1,
          subtask_id: null,
          remaining_work_seconds: 3600,
          unallocated_before_replacements: 3600,
          proposed_replacement_seconds: 0,
          unallocated_after_replacements: 3600,
        },
      ]
      review.summary = {
        inspected_sessions: 2,
        valid_sessions: 1,
        cannot_replan_sessions: 0,
        affected_sessions: 1,
        proposed_replacements: 0,
        unplaced_sessions: 1,
        partial_replacements: 0,
        original_affected_seconds: 1800,
        replacement_seconds: 0,
        untransferred_seconds: 1800,
        no_changes_needed: false,
      }
      review.session_results = [
        {
          study_session_id: 90,
          task_id: 1,
          subtask_id: null,
          classification: 'requires_replanning',
          original: interval,
          replacement: null,
          untransferred_seconds: 1800,
          reason_codes: ['future_reservation_exceeds_remaining_work'],
          replacement_reason_codes: ['no_replacement_capacity'],
        },
        {
          study_session_id: 91,
          task_id: 1,
          subtask_id: null,
          classification: 'valid',
          original: interval,
          replacement: null,
          untransferred_seconds: 0,
          reason_codes: [],
          replacement_reason_codes: [],
        },
      ]
      review.released_session_ids = [90]
    }
    preview = {
      ...common,
      review,
      required_consent:
        type === 'propose_study_plan_create'
          ? ['accept_partial']
          : ['accept_partial', 'accept_unplaced_cancellation'],
    }
  } else if (type === 'propose_session_reschedule') {
    preview = {
      ...common,
      required_consent: [],
      review: {
        original: session,
        replacement: {
          task_id: 1,
          subtask_id: null,
          starts_at: '2026-11-12T12:00:00Z',
          ends_at: '2026-11-12T12:15:00Z',
        },
        summary: {
          original_duration_seconds: 1800,
          replacement_duration_seconds: 900,
          not_transferred_seconds: 900,
        },
        validation: 'preliminary',
        feasibility_confirmed: false,
      },
    }
  } else if (type.startsWith('propose_reminder_')) {
    const reminder = {
      id: 80,
      task_id: 1,
      subtask_id: null,
      study_session_id: null,
      message: 'Prepare notes',
      trigger_at: '2026-11-12T09:30:00Z',
      anchor: 'task_deadline',
      offset_minutes: -30,
      status: 'scheduled',
      sent_at: null,
    }
    preview = {
      ...common,
      mode: 'relative',
      before: type === 'propose_reminder_create' ? null : reminder,
      changes: {
        task_id: 1,
        subtask_id: null,
        study_session_id: null,
        message: 'Prepare notes',
        trigger_at: '2026-11-12T09:30:00Z',
        anchor: 'task_deadline',
        offset_minutes: -30,
        status: 'scheduled',
        sent_at: null,
      },
    }
    if (type === 'propose_reminder_update')
      preview.changes = {
        message: 'Updated reminder',
        offset_minutes: -15,
        trigger_at: '2026-11-12T09:45:00Z',
      }
    if (type === 'propose_reminder_cancel') preview.changes = { status: 'cancelled' }
  } else if (type.startsWith('propose_subtask_')) {
    const child = {
      id: 71,
      task_id: 1,
      title: 'AI child',
      position: 1,
      description: null,
      estimated_minutes: 15,
      deadline_at: null,
      status: type === 'propose_subtask_reopen' ? 'completed' : 'pending',
      completed_at: type === 'propose_subtask_reopen' ? '2026-10-29T12:00:00Z' : null,
    }
    preview = {
      ...common,
      parent: { id: 1, title: task.title, status: task.status, deadline_at: task.deadline_at },
      before: type === 'propose_subtask_create' ? null : child,
      changes: {
        title: 'AI child',
        description: null,
        estimated_minutes: 15,
        deadline_at: null,
        status: 'pending',
        completed_at: null,
      },
    }
    if (type === 'propose_subtask_update') preview.changes = { title: 'Updated AI child' }
    if (type === 'propose_subtask_complete') preview.changes = { status: 'completed' }
    if (type === 'propose_subtask_reopen')
      preview.changes = { status: 'pending', completed_at: null }
  } else
    preview = {
      ...common,
      before:
        type === 'propose_task_create'
          ? null
          : {
              ...task,
              status: type === 'propose_task_reopen' ? 'completed' : 'pending',
              completed_at: type === 'propose_task_reopen' ? '2026-10-29T12:00:00Z' : null,
            },
      changes: {},
    }
  // Explicit Task create fields mirror TaskActionPresenter (no speculative ID).
  if (type === 'propose_task_create') {
    preview.changes = {
      title: 'AI-created task',
      description: null,
      subject_id: null,
      priority: 2,
      estimated_minutes: 30,
      deadline_at: null,
      status: 'pending',
      completed_at: null,
    }
  }
  if (type === 'propose_task_update') preview.changes = { title: 'AI-updated task' }
  if (type === 'propose_task_complete') preview.changes = { status: 'completed' }
  if (type === 'propose_task_reopen') preview.changes = { status: 'pending', completed_at: null }
  return {
    id: actionUuid(index),
    conversation_id: conversationId,
    call_id: `call_${index}`,
    type,
    status: 'pending',
    state: 'confirmation_required',
    confirmation_required: true,
    preview,
    expires_at: '2099-11-12T12:00:00.000000Z',
    created_at: stamp,
    resolved_at: null,
    receipt: null,
  }
}
export function messageFixture(
  id: number,
  content: string,
  role: AiMessage['role'] = 'assistant',
): AiMessage {
  return {
    id,
    role,
    content: role === 'tool' ? null : content,
    content_truncated: false,
    tool_calls: [],
    tool_calls_truncated: false,
    tool_result: null,
    created_at: stamp,
  }
}
export function aiPage<T>(
  data: T[],
  path: string,
  current = 1,
  size = 20,
  through?: number,
): ApiPage<T> {
  const last = Math.max(1, Math.ceil(data.length / size))
  const link = (page: number) =>
    `http://localhost:8000${path}?page=${page}&per_page=${size}${through === undefined ? '' : `&through_id=${through}`}`
  const slice = data.slice((current - 1) * size, current * size)
  return {
    data: slice,
    links: {
      first: link(1),
      last: link(last),
      prev: current > 1 ? link(current - 1) : null,
      next: current < last ? link(current + 1) : null,
    },
    meta: {
      current_page: current,
      last_page: last,
      per_page: size,
      total: data.length,
      from: slice.length ? (current - 1) * size + 1 : null,
      to: slice.length ? Math.min(current * size, data.length) : null,
      path: `http://localhost:8000${path}`,
      links: [],
    },
  }
}
export function aiBackend() {
  const base = f2Backend()
  const conversations: Conversation[] = []
  const messages = new Map<number, AiMessage[]>()
  const actions: AiAction[] = []
  const aiRequests: {
    path: string
    url: string
    method: string
    body: Record<string, unknown>
    key: string | null
  }[] = []
  const replays = new Map<string, { content: string; result: TurnResult }>()
  let nextType: ActionType | 'read' | 'failed-tool' = 'read'
  let nextId = 1,
    nextMessage = 100,
    executions = 0,
    signedIn = true
  const failures: {
    method: string
    path: RegExp
    status: number
    code?: string
    fields?: Record<string, string[]>
  }[] = []
  const reply = (data: unknown, status = 200): MockReply => ({ status, body: { data } })
  function addConversation() {
    const row = { id: nextId++, created_at: stamp, updated_at: stamp }
    conversations.unshift(row)
    messages.set(row.id, [])
    return row
  }
  function handle(
    urlString: string,
    method = 'GET',
    body: Record<string, unknown> = {},
    headers: HeadersInit = {},
  ): MockReply {
    const url = new URL(urlString),
      path = url.pathname,
      key = new Headers(headers).get('Idempotency-Key')
    aiRequests.push({ path, url: urlString, method, body, key })
    const failed = failures.findIndex(
      (failure) => failure.method === method && failure.path.test(path),
    )
    if (failed >= 0) {
      const failure = failures.splice(failed, 1)[0]!
      return { status: failure.status, body: { code: failure.code, errors: failure.fields ?? {} } }
    }
    if (path === '/api/auth/logout') {
      signedIn = false
      return { status: 204 }
    }
    if (path === '/api/auth/login') {
      signedIn = true
      return reply(user)
    }
    if (path === '/api/profile') return signedIn ? reply(user) : { status: 401 }
    if (path === '/api/statistics/progress') return reply(progress)
    if (path.startsWith('/api/schedule/'))
      return {
        status: 200,
        body: {
          data: [],
          meta: { start_date: '2026-10-29', end_date: '2026-10-29', timezone: user.timezone },
        },
      }
    if (path.startsWith('/api/study-sessions'))
      return {
        status: 200,
        body: {
          data: [session],
          meta: {
            start_date: url.searchParams.get('start_date'),
            end_date: url.searchParams.get('end_date'),
            timezone: user.timezone,
          },
        },
      }
    if (path === '/api/reminders/80')
      return reply({
        id: 80,
        ...(actionFixture('propose_reminder_create').preview.changes as PublicObject),
      })
    if (path === '/api/tasks/70') return reply({ ...task, id: 70, title: 'AI-created task' })
    if (path.startsWith('/api/ai/') && !signedIn) return { status: 401 }
    if (path === '/api/ai/conversations') {
      if (method === 'POST') return reply(addConversation(), 201)
      return {
        status: 200,
        body: aiPage(conversations, path, Number(url.searchParams.get('page') ?? 1)),
      }
    }
    const matched = path.match(
      /^\/api\/ai\/conversations\/(\d+)(?:\/(messages|actions)(?:\/([^/]+)(?:\/(confirm|reject))?)?)?$/,
    )
    if (!matched) return base.handle(urlString, method, body)
    const conversationId = Number(matched[1]),
      owned = conversations.find((row) => row.id === conversationId)
    if (!owned) return { status: 404 }
    if (!matched[2]) return reply(owned)
    const transcript = messages.get(conversationId)!
    if (matched[2] === 'messages') {
      if (method === 'GET') {
        const through = Number(
          url.searchParams.get('through_id') ?? Math.max(0, ...transcript.map((row) => row.id)),
        )
        return {
          status: 200,
          body: aiPage(
            transcript.filter((row) => row.id <= through),
            path,
            Number(url.searchParams.get('page') ?? 1),
            20,
            through,
          ),
        }
      }
      if (!key) return { status: 422, body: { errors: { idempotency_key: ['UUID required.'] } } }
      const previous = replays.get(`${conversationId}:${key}`)
      if (previous)
        return previous.content === body.content
          ? reply(previous.result)
          : { status: 409, body: { code: 'idempotency_conflict' } }
      const type = nextType
      nextType = 'read'
      const proposal =
        type === 'read' || type === 'failed-tool'
          ? undefined
          : actionFixture(type, actions.length + 1, conversationId)
      if (proposal) actions.unshift(proposal)
      const tool = proposal?.type ?? 'list_tasks'
      const userMessage = messageFixture(nextMessage++, String(body.content), 'user')
      const call = messageFixture(nextMessage++, '')
      call.content = null
      call.tool_calls = [{ call_id: proposal?.call_id ?? 'read_call', name: tool }]
      const toolMessage = messageFixture(nextMessage++, '', 'tool')
      toolMessage.tool_result = {
        call_id: call.tool_calls[0]!.call_id,
        name: tool,
        ok: type !== 'failed-tool',
        error_code: type === 'failed-tool' ? 'not_found' : null,
      }
      const assistant = messageFixture(
        nextMessage++,
        proposal
          ? 'Action proposed. Confirmation is required; no business data has changed.'
          : type === 'failed-tool'
            ? 'The requested resource could not be read.'
            : 'Here is your saved academic answer.',
      )
      transcript.push(userMessage, call, toolMessage, assistant)
      const result: TurnResult = {
        conversation_id: conversationId,
        user_message_id: userMessage.id,
        assistant_message_id: assistant.id,
        content: assistant.content!,
        tools: [toolMessage.tool_result],
        ...(proposal
          ? {
              action: {
                id: proposal.id,
                state: 'confirmation_required',
                call_id: proposal.call_id,
                preview: proposal.preview,
                expires_at: proposal.expires_at,
              },
            }
          : {}),
      }
      replays.set(`${conversationId}:${key}`, {
        content: String(body.content),
        result: structuredClone(result),
      })
      return reply(result)
    }
    if (!matched[3])
      return {
        status: 200,
        body: aiPage(
          actions.filter((action) => action.conversation_id === conversationId),
          path,
          Number(url.searchParams.get('page') ?? 1),
        ),
      }
    const action = actions.find(
      (row) => row.id === matched[3] && row.conversation_id === conversationId,
    )
    if (!action) return { status: 404 }
    if (method === 'GET') return reply(action)
    if (action.status === 'expired') return { status: 410, body: { data: action, replayed: false } }
    if (matched[4] === 'reject' && action.status === 'executed')
      return { status: 409, body: { code: 'action_executed' } }
    if (matched[4] === 'confirm' && action.status === 'rejected')
      return { status: 409, body: { data: action, replayed: false } }
    const replayed = action.status === 'executed'
    if (!replayed && matched[4] === 'confirm') {
      const required = action.preview.required_consent
      if (Array.isArray(required))
        for (const field of required)
          if (typeof field === 'string' && body[field] !== true)
            return { status: 422, body: { errors: { [field]: ['Explicit consent is required.'] } } }
      executions++
      const result: PublicObject = { action_id: action.id, type: action.type }
      if (action.type.startsWith('propose_task_'))
        result.task = {
          ...task,
          ...(action.preview.before as PublicObject | null),
          ...(action.preview.changes as PublicObject),
          id: action.type === 'propose_task_create' ? 70 : 1,
          completed_at: action.type === 'propose_task_complete' ? '2026-10-29T12:00:00Z' : null,
        }
      else if (action.type.startsWith('propose_subtask_'))
        result.subtask = {
          id: 71,
          task_id: 1,
          position: 1,
          title: 'AI child',
          description: null,
          estimated_minutes: 15,
          deadline_at: null,
          status: 'pending',
          completed_at: null,
          ...(action.preview.before as PublicObject | null),
          ...(action.preview.changes as PublicObject),
        }
      else if (action.type.startsWith('propose_reminder_'))
        result.reminder = {
          id: 80,
          task_id: 1,
          subtask_id: null,
          study_session_id: null,
          message: 'Prepare notes',
          trigger_at: '2026-11-12T09:30:00Z',
          anchor: 'task_deadline',
          offset_minutes: -30,
          status: 'scheduled',
          sent_at: null,
          ...(action.preview.before as PublicObject | null),
          ...(action.preview.changes as PublicObject),
        }
      else if (action.type === 'propose_study_plan_create') {
        result.applied = true
        result.sessions = [session]
        result.summary = {
          requested_seconds: 3600,
          allocated_seconds: 1800,
          unscheduled_seconds: 1800,
          fully_allocated: false,
        }
      } else if (action.type === 'propose_adaptive_replanning') {
        result.applied = true
        result.original_sessions = [{ id: 90, status: 'cancelled' }]
        result.replacement_sessions = []
        result.summary = { untransferred_seconds: 1800, cancelled_unplaced_sessions: 1 }
      } else {
        result.applied = true
        result.original = { ...session, status: 'rescheduled' }
        result.replacement = { ...session, id: 92 }
        result.summary = {
          original_duration_seconds: 1800,
          replacement_duration_seconds: 900,
          not_transferred_seconds: 900,
          unallocated_work_seconds: 900,
        }
      }
      action.receipt = result
      action.status = 'executed'
      action.state = 'executed'
      action.confirmation_required = false
      action.resolved_at = stamp
    } else if (matched[4] === 'reject' && action.status === 'pending') {
      action.status = 'rejected'
      action.state = 'rejected'
      action.confirmation_required = false
      action.resolved_at = stamp
    }
    if (!replayed) {
      const event = messageFixture(
        nextMessage++,
        action.status === 'executed' ? 'Action executed.' : 'Action rejected.',
      )
      if (action.status === 'executed' && action.receipt)
        event.action_event = { action_id: action.id, status: 'executed', receipt: action.receipt }
      else event.action_event = { action_id: action.id, status: 'rejected', receipt: null }
      transcript.push(event)
    }
    return { status: 200, body: { data: action, replayed } }
  }
  return {
    ...base,
    handle,
    conversations,
    messages,
    actions,
    aiRequests,
    failures,
    addConversation,
    get executions() {
      return executions
    },
    get nextType() {
      return nextType
    },
    set nextType(value: ActionType | 'read' | 'failed-tool') {
      nextType = value
    },
  }
}
