import { ApiError, apiBaseUrl, request } from './client'
import type {
  ActionEvent,
  AiAction,
  AiMessage,
  AiPage,
  Conversation,
  DecisionResult,
  PublicObject,
  PublicValue,
  ToolCall,
  ToolResult,
  TurnResult,
} from '@/types/ai'
import { isObject, positiveId } from '@/utils/ai'

const invalid = (): never => {
  throw new ApiError(502)
}
const string = (v: unknown) => (typeof v === 'string' ? v : invalid())
const nullableString = (v: unknown) => (v === null ? null : string(v))
const bool = (v: unknown) => (typeof v === 'boolean' ? v : invalid())
const id = (v: unknown) => (positiveId(v) ? v : invalid())
const object = (v: unknown) => (isObject(v) ? v : invalid())
const array = (v: unknown) => (Array.isArray(v) ? (v as unknown[]) : invalid())
const privateKeys = new Set([
  'arguments',
  'protected_payload',
  'preview_token',
  'target_hash',
  'provider_state',
  'encrypted_content',
  'reasoning',
  'api_key',
  'user_id',
  '__proto__',
  'constructor',
  'prototype',
])
function publicValue(value: unknown, depth = 0): PublicValue {
  if (depth > 50) return invalid()
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (Array.isArray(value)) return value.map((item) => publicValue(item, depth + 1))
  return Object.fromEntries(
    Object.entries(object(value))
      .filter(([key]) => !privateKeys.has(key))
      .map(([key, item]) => [key, publicValue(item, depth + 1)]),
  )
}
function publicObject(value: unknown): PublicObject {
  object(value)
  return publicValue(value) as PublicObject
}
function conversation(value: unknown): Conversation {
  const v = object(value)
  return {
    id: id(v.id),
    created_at: nullableString(v.created_at),
    updated_at: nullableString(v.updated_at),
  }
}
function toolCall(value: unknown): ToolCall {
  const v = object(value)
  return { call_id: string(v.call_id), name: string(v.name) }
}
function toolResult(value: unknown): ToolResult {
  const v = object(value)
  return {
    call_id: nullableString(v.call_id),
    name: string(v.name),
    ok: bool(v.ok),
    error_code: nullableString(v.error_code),
  }
}
function actionEvent(value: unknown): ActionEvent {
  const v = object(value),
    action_id = string(v.action_id)
  if (v.status === 'executed')
    return { action_id, status: 'executed', receipt: publicObject(v.receipt) }
  if (v.receipt !== null) return invalid()
  if (v.status === 'failed')
    return { action_id, status: 'failed', receipt: null, error_code: string(v.error_code) }
  if (v.status === 'rejected' || v.status === 'expired')
    return { action_id, status: v.status, receipt: null }
  return invalid()
}
function message(value: unknown): AiMessage {
  const v = object(value)
  if (v.role !== 'user' && v.role !== 'assistant' && v.role !== 'tool') return invalid()
  const event = v.action_event === undefined ? undefined : actionEvent(v.action_event)
  return {
    id: id(v.id),
    role: v.role,
    content: v.role === 'tool' ? null : nullableString(v.content),
    content_truncated: bool(v.content_truncated),
    tool_calls: array(v.tool_calls).map(toolCall),
    tool_calls_truncated: bool(v.tool_calls_truncated),
    tool_result: v.tool_result === null ? null : toolResult(v.tool_result),
    created_at: nullableString(v.created_at),
    ...(event ? { action_event: event } : {}),
  }
}
function action(value: unknown, conversationId: number): AiAction {
  const v = object(value)
  if (
    id(v.conversation_id) !== conversationId ||
    !['pending', 'executed', 'rejected', 'expired'].includes(string(v.status))
  )
    return invalid()
  const status = v.status as AiAction['status']
  if ((status === 'executed') !== (v.receipt !== null)) return invalid()
  if (
    v.state !== (status === 'pending' ? 'confirmation_required' : status) ||
    v.confirmation_required !== (status === 'pending')
  )
    return invalid()
  return {
    id: string(v.id),
    conversation_id: conversationId,
    call_id: string(v.call_id),
    type: string(v.type),
    status,
    state: status === 'pending' ? 'confirmation_required' : status,
    confirmation_required: bool(v.confirmation_required),
    preview: publicObject(v.preview),
    receipt: v.receipt === null ? null : publicObject(v.receipt),
    expires_at: nullableString(v.expires_at),
    created_at: nullableString(v.created_at),
    resolved_at: nullableString(v.resolved_at),
  }
}
function page<T>(raw: unknown, parse: (v: unknown) => T): AiPage<T> {
  const v = object(raw),
    links = object(v.links),
    meta = object(v.meta)
  for (const key of ['current_page', 'last_page', 'per_page', 'total'])
    if (!Number.isSafeInteger(meta[key]) || Number(meta[key]) < 0) invalid()
  for (const key of ['from', 'to'])
    if (meta[key] !== null && !Number.isSafeInteger(meta[key])) invalid()
  const metaLinks = array(meta.links).map((item) => {
    const link = object(item)
    return { url: nullableString(link.url), label: string(link.label), active: bool(link.active) }
  })
  return {
    data: array(v.data).map(parse),
    links: {
      first: string(links.first),
      last: string(links.last),
      prev: nullableString(links.prev),
      next: nullableString(links.next),
    },
    meta: {
      current_page: Number(meta.current_page),
      last_page: Number(meta.last_page),
      per_page: Number(meta.per_page),
      total: Number(meta.total),
      from: meta.from as number | null,
      to: meta.to as number | null,
      path: string(meta.path),
      links: metaLinks,
    },
  }
}
// Follow server snapshot links, but never send cookies to another origin/path.
function pagePath(path: string, link?: string | null) {
  if (!link) return `${path}?per_page=20`
  const url = new URL(link, `${apiBaseUrl}${path}`)
  if (
    url.origin !== new URL(apiBaseUrl).origin ||
    url.pathname !== `${new URL(apiBaseUrl).pathname.replace(/\/$/, '')}${path}` ||
    [...url.searchParams.keys()].some((key) => !['page', 'per_page', 'through_id'].includes(key))
  )
    return invalid()
  return `${path}${url.search}`
}
const base = '/api/ai/conversations'
const conversationPath = (conversationId: number) => `${base}/${id(conversationId)}`
const actionPath = (conversationId: number, actionId: string) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(actionId))
    return invalid()
  return `${conversationPath(conversationId)}/actions/${actionId}`
}
export const aiApi = {
  async create(signal?: AbortSignal) {
    return {
      data: conversation(
        object(await request<unknown>(base, { method: 'POST', body: {}, signal })).data,
      ),
    }
  },
  async conversations(link?: string | null, signal?: AbortSignal) {
    return page(await request<unknown>(pagePath(base, link), { signal }), conversation)
  },
  async conversation(conversationId: number, signal?: AbortSignal) {
    const data = conversation(
      object(await request<unknown>(conversationPath(conversationId), { signal })).data,
    )
    if (data.id !== conversationId) return invalid()
    return { data }
  },
  async messages(conversationId: number, link?: string | null, signal?: AbortSignal) {
    return page(
      await request<unknown>(pagePath(`${conversationPath(conversationId)}/messages`, link), {
        signal,
      }),
      message,
    )
  },
  async send(conversationId: number, content: string, key: string, signal?: AbortSignal) {
    const v = object(
      object(
        await request<unknown>(`${conversationPath(conversationId)}/messages`, {
          method: 'POST',
          body: { content },
          idempotencyKey: key,
          signal,
        }),
      ).data,
    )
    if (id(v.conversation_id) !== conversationId) return invalid()
    const proposal = v.action === undefined || v.action === null ? undefined : object(v.action)
    const result: TurnResult = {
      conversation_id: conversationId,
      user_message_id: id(v.user_message_id),
      assistant_message_id: id(v.assistant_message_id),
      content: string(v.content),
      tools: array(v.tools).map(toolResult),
      ...(proposal
        ? {
            action: {
              id: string(proposal.id),
              state: 'confirmation_required',
              call_id: string(proposal.call_id),
              preview: publicObject(proposal.preview),
              expires_at: nullableString(proposal.expires_at),
            },
          }
        : {}),
    }
    return { data: result }
  },
  async actions(conversationId: number, link?: string | null, signal?: AbortSignal) {
    return page(
      await request<unknown>(pagePath(`${conversationPath(conversationId)}/actions`, link), {
        signal,
      }),
      (value) => action(value, conversationId),
    )
  },
  async action(conversationId: number, actionId: string, signal?: AbortSignal) {
    const result = action(
      object(await request<unknown>(actionPath(conversationId, actionId), { signal })).data,
      conversationId,
    )
    if (result.id !== actionId) return invalid()
    return { data: result }
  },
  async decide(
    conversationId: number,
    actionId: string,
    operation: 'confirm' | 'reject',
    consent: Partial<Record<'accept_partial' | 'accept_unplaced_cancellation', boolean>> = {},
    signal?: AbortSignal,
  ): Promise<DecisionResult> {
    const v = object(
      await request<unknown>(`${actionPath(conversationId, actionId)}/${operation}`, {
        method: 'POST',
        body: operation === 'reject' ? {} : consent,
        signal,
      }),
    )
    const data = action(v.data, conversationId)
    if (data.id !== actionId) return invalid()
    return { data, replayed: bool(v.replayed) }
  },
}
