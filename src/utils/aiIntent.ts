import { validMessage } from './aiInput'
import type { PendingIntent } from '@/types/ai'
const prefix = 'planner-ai-intent:'
const keyFor = (owner: number, conversation: number) => `${prefix}${owner}:${conversation}`
export function saveIntent(intent: PendingIntent) {
  try {
    sessionStorage.setItem(keyFor(intent.ownerId, intent.conversationId), JSON.stringify(intent))
    return true
  } catch {
    return false
  }
}
export function readIntent(ownerId: number, conversationId: number): PendingIntent | null {
  try {
    const value: unknown = JSON.parse(
      sessionStorage.getItem(keyFor(ownerId, conversationId)) ?? 'null',
    )
    if (
      value &&
      typeof value === 'object' &&
      'ownerId' in value &&
      value.ownerId === ownerId &&
      'conversationId' in value &&
      value.conversationId === conversationId &&
      'key' in value &&
      typeof value.key === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.key) &&
      'content' in value &&
      typeof value.content === 'string' &&
      validMessage(value.content) &&
      'createdAt' in value &&
      typeof value.createdAt === 'number' &&
      Number.isFinite(value.createdAt)
    ) {
      return {
        ownerId,
        conversationId,
        key: value.key,
        content: value.content,
        createdAt: value.createdAt,
      }
    }
    sessionStorage.removeItem(keyFor(ownerId, conversationId))
  } catch {
    /* The current in-memory intent still works if storage is unavailable. */
  }
  return null
}
export function removeIntent(ownerId: number, conversationId: number) {
  try {
    sessionStorage.removeItem(keyFor(ownerId, conversationId))
  } catch {
    /* Optional persistence. */
  }
}
export function clearAiIntents() {
  try {
    Object.keys(sessionStorage)
      .filter((key) => key.startsWith(prefix))
      .forEach((key) => sessionStorage.removeItem(key))
  } catch {
    /* Optional persistence. */
  }
}
