import { remindersApi } from './reminders'
import { studySessionsApi } from './studySessions'

export const activityApi = {
  reminder: remindersApi.get,
  sessions: (start_date: string, end_date: string, signal?: AbortSignal) =>
    studySessionsApi.list({ start_date, end_date }, signal),
}
