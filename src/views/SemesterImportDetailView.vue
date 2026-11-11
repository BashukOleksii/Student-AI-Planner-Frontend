<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ApiError } from '@/api/client'
import { semesterScheduleImportsApi } from '@/api/semesterScheduleImports'
import { semesterSchedulesApi } from '@/api/semesterSchedules'
import { parseSemesterImport } from '@/api/semesterPayloads'
import { academicApi } from '@/api/academic'
import { useResource } from '@/composables/useResource'
import { useSemesterMutation } from '@/composables/useSemesterMutation'
import { useAuthStore } from '@/stores/auth'
import { patterns, weekdays } from '@/utils/semesterSchedule'
import { importErrorMessages, importOperations, importTeacherNames } from '@/utils/semesterImport'
import type {
  SemesterScheduleImport,
  SemesterSettings,
  ImportRuleValues,
} from '@/types/semesterSchedule'
import AppButton from '@/components/ui/AppButton.vue'
import AppCard from '@/components/ui/AppCard.vue'
import AppModal from '@/components/ui/AppModal.vue'
import ErrorState from '@/components/ui/ErrorState.vue'
import FormNotice from '@/components/ui/FormNotice.vue'
import LoadingState from '@/components/ui/LoadingState.vue'
import SemesterImportCatalog from '@/components/schedule/SemesterImportCatalog.vue'
import SemesterImportCounts from '@/components/schedule/SemesterImportCounts.vue'
import SemesterImportReceipt from '@/components/schedule/SemesterImportReceipt.vue'
import SemesterImportRow from '@/components/schedule/SemesterImportRow.vue'

const id = Number(useRoute().params.id)
const auth = useAuthStore()
const router = useRouter()
const resource = useResource((signal) => semesterScheduleImportsApi.get(id, signal))
const { busy, blocked, error, run } = useSemesterMutation()
const batch = shallowRef<SemesterScheduleImport | null>(null)
const notice = ref('')
const reviewed = ref(false)
const confirmationToken = ref<string | null>(null)
const scheduleId = computed(() => batch.value?.preview.impact?.schedule.id)
const impact = computed(() => batch.value?.preview.impact)
const counts = computed(() => ({
  suppressed: batch.value?.preview.rows.filter((row) => row.operation === 'suppressed').length ?? 0,
  blocked: batch.value?.preview.rows.filter((row) => Object.keys(row.errors).length).length ?? 0,
}))
const eligible = computed(
  () => batch.value?.status === 'ready' || batch.value?.status === 'invalid',
)
const disabled = computed(
  () => busy.value || !!blocked.value || resource.loading.value || !!resource.error.value,
)
const periodId = computed(() => batch.value?.academic_period_id)
const period = useResource(
  (signal) =>
    periodId.value ? academicApi.periods.get(periodId.value, signal) : Promise.resolve(null),
  [periodId],
)
const snapshots = useResource(
  (signal) =>
    scheduleId.value && impact.value?.preserved_exception_dates.length
      ? semesterSchedulesApi.exceptions(scheduleId.value, signal)
      : Promise.resolve(null),
  [scheduleId, () => batch.value?.preview_token],
)
const subjects = useResource(academicApi.subjects.list)
const teachers = useResource(academicApi.teachers.list)
const snapshotKinds = computed(
  () => new Map(snapshots.data.value?.data.map((item) => [item.occurs_on, item.kind])),
)
const statusLabels = {
  ready: 'Готовий до підтвердження',
  invalid: 'Потребує виправлень',
  failed: 'Файл не вдалося опрацювати',
  committed: 'Застосовано',
}
function settingsText(settings: SemesterSettings) {
  return `${settings.group_name} · ${settings.parity_anchor_on} · ${patterns[settings.first_week_parity]}`
}
function ruleText(rule: ImportRuleValues, importKey?: string) {
  const row = importKey
    ? batch.value?.preview.rows.find((item) => item.import_key === importKey)
    : undefined
  const subject =
    row?.subject?.name ??
    row?.subject_name ??
    subjects.data.value?.data.find((item) => item.id === rule.subject_id)?.name ??
    (rule.subject_id ? `Предмет №${rule.subject_id}` : 'Новий предмет')
  const teacherIds = rule.teacher_ids ?? (rule.teacher_id ? [rule.teacher_id] : [])
  const teacher = row
    ? importTeacherNames(row)
    : teacherIds
        .map(
          (id) =>
            teachers.data.value?.data.find((item) => item.id === id)?.name ??
            (id ? `Викладач №${id}` : 'Новий викладач'),
        )
        .join(', ') || 'Без викладача'
  return `${weekdays[rule.weekday]} · пара ${rule.pair_number}${rule.pair_label ? ` (${rule.pair_label})` : ''} · ${patterns[rule.week_pattern]} · ${subject} · Викладач: ${teacher} · ${rule.starts_at_local}–${rule.ends_at_local} · Аудиторія: ${rule.room ?? 'Не вказано'}`
}
function close() {
  confirmationToken.value = null
  reviewed.value = false
}
watch(resource.data, (value) => {
  if (!value) return
  batch.value = value
  if (blocked.value) {
    blocked.value = null
    error.value = null
    notice.value = value.receipt
      ? 'Сервер підтвердив застосування пакета.'
      : 'Сервер повернув поточний огляд. Перегляньте його перед новим рішенням.'
  }
})
async function recover() {
  if (busy.value || resource.loading.value) return
  close()
  await resource.reload()
}
async function revalidate() {
  if (disabled.value || !eligible.value) return
  close()
  notice.value = ''
  const result = await run(() => semesterScheduleImportsApi.revalidate(id))
  if (result) {
    batch.value = result
    notice.value = 'Повторну перевірку завершено. Перегляньте актуальні операції.'
  }
}
function open() {
  if (disabled.value || !batch.value?.can_commit) return
  reviewed.value = false
  confirmationToken.value = batch.value.preview_token
}
function timetable(value: SemesterScheduleImport) {
  return {
    path: '/schedule',
    query: {
      semester: String(value.receipt!.semester_schedule_id),
      date: period.data.value?.data.starts_on ?? value.parity_anchor_on,
      view: 'week',
      receipt: String(value.id),
    },
  }
}
async function commit() {
  const token = confirmationToken.value
  if (
    disabled.value ||
    !reviewed.value ||
    !token ||
    !batch.value?.can_commit ||
    token !== batch.value.preview_token
  )
    return
  notice.value = ''
  const result = await run(async () => {
    const value = await semesterScheduleImportsApi.commit(id, token, true)
    if (!value.receipt) throw new ApiError(502)
    return value
  })
  close()
  if (result) {
    batch.value = result
    await router.replace(timetable(result))
    return
  }
  if (error.value instanceof ApiError && error.value.status === 409) {
    const refreshed = parseSemesterImport(error.value.conflictData, id)
    if (refreshed && refreshed.academic_period_id === batch.value?.academic_period_id) {
      batch.value = refreshed
      blocked.value = null
      error.value = null
      notice.value = refreshed.receipt
        ? 'Пакет уже застосовано. Нижче його збережена квитанція.'
        : 'Огляд змінився. Перегляньте поточні операції та підтвердьте їх окремо.'
    }
  }
}
</script>

<template>
  <header class="page-heading">
    <div>
      <RouterLink to="/schedule/semester-import" class="text-link">
        ← Завантажити інший файл
      </RouterLink>
      <h1>Огляд семестрового імпорту №{{ id }}</h1>
    </div>
    <AppButton :busy="resource.loading.value" :disabled="busy" @click="recover">
      Перевірити стан пакета
    </AppButton>
  </header>
  <LoadingState v-if="resource.loading.value" />
  <ErrorState v-if="resource.error.value" :error="resource.error.value" retry @retry="recover" />
  <p v-if="notice" role="status" class="schedule-warning">{{ notice }}</p>
  <FormNotice :error="error" />
  <p v-if="blocked" role="alert" class="schedule-warning">
    {{
      blocked === 'uncertain' ? 'Результат запиту невідомий.' : 'Отримано конфлікт стану пакета.'
    }}
    Натисніть «Перевірити стан пакета», щоб отримати збережений результат перед наступною дією.
  </p>
  <template v-if="batch">
    <SemesterImportReceipt
      v-if="batch.receipt"
      :receipt="batch.receipt"
      :import-id="id"
      :timezone="auth.user?.timezone ?? 'UTC'"
    >
      <RouterLink :to="timetable(batch)" class="button primary">
        До імпортованого семестру
      </RouterLink>
    </SemesterImportReceipt>
    <AppCard :title="batch.original_filename" class="import-summary">
      <p>{{ statusLabels[batch.status] }}</p>
      <p v-if="period.data.value">
        {{ period.data.value.data.name }} · {{ period.data.value.data.starts_on }} —
        {{ period.data.value.data.ends_on }}
      </p>
      <p v-else>Навчальний період №{{ batch.academic_period_id }}</p>
      <ErrorState
        v-if="period.error.value"
        :error="period.error.value"
        retry
        @retry="period.reload"
      />
      <p v-if="impact">Група · {{ impact.schedule.after.group_name }}</p>
      <p>
        Тиждень відліку · {{ batch.parity_anchor_on }} · {{ patterns[batch.first_week_parity] }}
      </p>
      <SemesterImportCounts
        :counts="batch.preview.counts"
        :suppressed="counts.suppressed"
        :blocked="counts.blocked"
      />
      <ul v-if="Object.keys(batch.preview.errors).length" class="field-error">
        <li v-for="(message, index) in importErrorMessages(batch.preview.errors)" :key="index">
          {{ message }}
        </li>
      </ul>
    </AppCard>
    <SemesterImportCatalog v-if="batch.preview.catalog" :catalog="batch.preview.catalog" />
    <AppCard v-if="impact" title="Наслідки для семестру">
      <dl class="import-row-fields">
        <div>
          <dt>Поточні налаштування</dt>
          <dd>
            {{ impact.schedule.before ? settingsText(impact.schedule.before) : 'Новий семестр' }}
          </dd>
        </div>
        <div>
          <dt>Після імпорту</dt>
          <dd>{{ settingsText(impact.schedule.after) }}</dd>
        </div>
      </dl>
      <p class="helper">
        Група та парність застосовуються до семестру. Зміна відліку може змінити дати появи
        захищених щотижневих правил.
      </p>
      <h3>Захищені правила, що збережуться</h3>
      <ul v-if="impact.preserved_rule_ids.length">
        <li v-for="rule in impact.preserved_rule_ids" :key="rule">
          <RouterLink :to="`/schedule/semesters/${scheduleId}/rules/${rule}`" class="text-link">
            Правило №{{ rule }}
          </RouterLink>
        </li>
      </ul>
      <p v-else class="helper">Немає.</p>
      <h3>Збережені заміни та робочі суботи</h3>
      <p class="helper">Збережені списки пар і скасування на окремі дати залишаються чинними.</p>
      <LoadingState v-if="snapshots.loading.value" />
      <ErrorState
        v-if="snapshots.error.value"
        :error="snapshots.error.value"
        retry
        @retry="snapshots.reload"
      />
      <ul v-if="impact.preserved_exception_dates.length">
        <li v-for="date in impact.preserved_exception_dates" :key="date">
          <RouterLink :to="`/schedule/semesters/${scheduleId}/dates/${date}`" class="text-link">
            {{ date }}
          </RouterLink>
          <template v-if="snapshotKinds.has(date)">
            ·
            {{
              snapshotKinds.get(date) === 'working_saturday' ? 'Робоча субота' : 'Заміна на дату'
            }}
          </template>
        </li>
      </ul>
      <p v-else class="helper">Немає.</p>
      <h3>Пари, що втратять посилання на джерело</h3>
      <p class="helper">
        Видаляється посилання на щотижневе правило. Пара у збереженій даті залишається.
      </p>
      <ul v-if="impact.detached_snapshot_references.length">
        <li v-for="item in impact.detached_snapshot_references" :key="item.snapshot_lesson_id">
          {{ item.occurs_on }} · збережена пара №{{ item.snapshot_lesson_id }} · правило №{{
            item.source_weekly_rule_id
          }}
        </li>
      </ul>
      <p v-else class="helper">Немає.</p>
      <template v-if="impact.suppressed_slots?.length">
        <h3>Захищені видалені слоти</h3>
        <ul>
          <li v-for="item in impact.suppressed_slots" :key="item.id">
            {{ weekdays[item.weekday] }} · пара {{ item.pair_number }} ·
            {{ patterns[item.week_pattern] }} · №{{ item.id }}
          </li>
        </ul>
        <RouterLink :to="`/schedule/semesters/${scheduleId}`" class="text-link">
          Переглянути захищені слоти в семестрі
        </RouterLink>
        <p class="helper">
          Якщо слот потрібно відновити, явно зніміть захист у семестрі та повторно перевірте огляд.
        </p>
      </template>
    </AppCard>
    <AppCard v-if="batch.preview.operations.length" title="Повний список операцій">
      <article
        v-for="operation in batch.preview.operations"
        :key="`${operation.operation}-${operation.import_key}`"
        class="semester-item"
      >
        <h3>
          {{ importOperations[operation.operation] }}
          <template v-if="operation.rule_id">· правило №{{ operation.rule_id }}</template>
        </h3>
        <p v-if="operation.before">Було · {{ ruleText(operation.before) }}</p>
        <p v-if="operation.after">
          Після імпорту · {{ ruleText(operation.after, operation.import_key) }}
        </p>
        <p v-else class="field-error">Це щотижневе правило буде видалено.</p>
      </article>
    </AppCard>
    <AppCard title="Щотижневі пари з Excel">
      <p v-if="!batch.preview.rows.length" class="helper">Розібраних пар немає.</p>
      <SemesterImportRow
        v-for="row in batch.preview.rows"
        :key="row.row_number"
        :row="row"
        :schedule-id="scheduleId"
      />
    </AppCard>
    <AppCard v-if="eligible" title="Перевірка та підтвердження">
      <p>
        Назви з файлу зіставляються з вашими каталогами. Відсутні коректні предмети й викладачі
        створюються автоматично під час підтвердження. Кожна пара повинна мати рівно одного
        викладача. Відсутні, множинні або некоректні дані викладача виправте у XLSX та завантажте
        файл знову. Після виправлення неоднозначних записів у каталогах повторно перевірте пакет.
      </p>
      <div class="actions">
        <RouterLink
          v-for="(label, section) in {
            subjects: 'Виправити предмети',
            teachers: 'Виправити викладачів',
            periods: 'Навчальні періоди',
          }"
          :key="section"
          :to="{ path: `/academic/${section}`, query: { semester_import: String(id) } }"
          class="text-link"
        >
          {{ label }}
        </RouterLink>
      </div>
      <div class="actions">
        <AppButton :busy="busy && !confirmationToken" :disabled="disabled" @click="revalidate">
          Повторно перевірити
        </AppButton>
        <AppButton v-if="batch.can_commit" variant="primary" :disabled="disabled" @click="open">
          Переглянути підтвердження імпорту
        </AppButton>
      </div>
    </AppCard>
  </template>
  <AppModal
    v-if="confirmationToken && batch"
    title="Підтвердити семестровий імпорт?"
    :busy="busy"
    @close="close"
  >
    <SemesterImportCounts :counts="batch.preview.counts" />
    <p>
      Сервер створить запропоновані предмети й викладачів та застосує зміни налаштувань і щотижневих
      правил із цього огляду. Збережені заміни й робочі суботи залишаться чинними.
    </p>
    <label class="schedule-consent">
      <input v-model="reviewed" type="checkbox" :disabled="busy" />
      Я переглянув усі операції та їхні наслідки для семестру
    </label>
    <div class="actions">
      <AppButton :disabled="busy" @click="close">Повернутися до огляду</AppButton>
      <AppButton variant="primary" :busy="busy" :disabled="!reviewed || disabled" @click="commit">
        Підтвердити імпорт
      </AppButton>
    </div>
  </AppModal>
</template>
