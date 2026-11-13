import { aiBackend } from './aiBackend'
import type { TurnResult } from '../../src/types/ai'
import { occurrenceType } from './aiSemesterFixtures'
export interface OccurrenceFailure {
  reason?: string | null
  historyReason?: string | null
  content?: string
}
export function aiSemesterBackend() {
  const ai = aiBackend()
  let failure: OccurrenceFailure | null = null
  return {
    ai,
    failNext(value: OccurrenceFailure) {
      failure = value
      ai.nextType = 'failed-tool'
    },
    handle: ((url, method, body, headers) => {
      const response = ai.handle(url, method, body, headers)
      if (
        failure &&
        method === 'POST' &&
        new URL(url).pathname.endsWith('/messages') &&
        response.status === 200
      ) {
        const options = failure
        failure = null
        const data = (response.body as { data: TurnResult }).data
        const conversation = ai.messages.get(data.conversation_id)!
        const tool = conversation.find(
          (message) =>
            message.id > data.user_message_id &&
            message.id < data.assistant_message_id &&
            message.role === 'tool',
        )!
        const call = conversation.find(
          (message) =>
            message.id > data.user_message_id &&
            message.id < data.assistant_message_id &&
            message.tool_calls.length,
        )!
        call.tool_calls[0]!.name = occurrenceType
        const outcome = {
          call_id: call.tool_calls[0]!.call_id,
          name: occurrenceType,
          ok: false,
          error_code: 'invalid_arguments',
          ...(options.reason !== undefined ? { error_reason: options.reason } : {}),
        }
        data.tools = [outcome]
        tool.tool_result = {
          ...outcome,
          ...(Object.hasOwn(options, 'historyReason')
            ? { error_reason: options.historyReason }
            : {}),
        }
        data.content = options.content ?? 'Уточни, будь ласка, яку дату ти маєш на увазі.'
        conversation.find((message) => message.id === data.assistant_message_id)!.content =
          data.content
      }
      return response
    }) satisfies ReturnType<typeof aiBackend>['handle'],
  }
}
