<script setup lang="ts">
import { useWorkLabels } from '@/composables/useWorkLabels'
import { ref, computed, watch, onScopeDispose, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useResource } from '@/composables/useResource'
import { recoveryReviewSupported } from '@/api/recoveryPayloads'
import { recoveryApi } from '@/api/recovery'
import type { RecoverySuggestion } from '@/types/recovery'
import { usePlanningAttentionStore } from '@/stores/planningAttention'
import { useAuthStore } from '@/stores/auth'
import { dateTime } from '@/utils/dates'
import RecoveryReview from '@/components/planning/RecoveryReview.vue'
import StudyProposal from '@/components/planning/StudyProposal.vue'
import { isPublicObject } from '@/utils/ai'
import AppCard from '@/components/ui/AppCard.vue'
import PlanningNav from '@/components/planning/PlanningNav.vue'
import ErrorState from '@/components/ui/ErrorState.vue'
import LoadingState from '@/components/ui/LoadingState.vue'
import { recoveryGroups, planningCheckLabel } from '@/utils/recoveryPresentation'
const auth = useAuthStore()
const attention = usePlanningAttentionStore()
const route = useRoute(),
  router = useRouter()
const reviewHeading = ref<HTMLElement>()
let detailVersion = 0
onScopeDispose(() => {
  detailVersion++
})
function queryPage(value: unknown) {
  return typeof value === 'string' &&
    /^[1-9]\d*$/.test(value) &&
    Number.isSafeInteger(Number(value))
    ? Number(value)
    : 1
}
const status = ref(route.query.status === 'all' ? 'all' : 'pending'),
  page = ref(queryPage(route.query.page))
const listQuery = computed(() => ({
  ...(status.value === 'all' ? { status: 'all' } : {}),
  ...(page.value > 1 ? { page: String(page.value) } : {}),
}))
const expandedId = computed(() =>
  typeof route.params.uuid === 'string' ? route.params.uuid : null,
)
const toggleId = (id: string) => `suggestion-toggle-${encodeURIComponent(id)}`
const detailId = (id: string) => `suggestion-detail-${encodeURIComponent(id)}`
function choose(id: string) {
  if (expandedId.value === id) {
    void router.push({
      path: '/planning/suggestions',
      query: listQuery.value,
      state: { recoveryCollapsedId: id },
    })
  } else
    void router.push({
      path: `/planning/suggestions/${encodeURIComponent(id)}`,
      query: listQuery.value,
    })
}
function changeFilter() {
  page.value = 1
  void router.push({ path: '/planning/suggestions', query: listQuery.value })
}
function changePage(next: number) {
  page.value = next
  void router.push({ path: '/planning/suggestions', query: listQuery.value })
}
watch(
  () => [route.query.status, route.query.page],
  () => {
    status.value = route.query.status === 'all' ? 'all' : 'pending'
    page.value = queryPage(route.query.page)
  },
)
const feed = useResource(
  (signal) => recoveryApi.list(status.value, page.value, signal),
  [status, page],
)
const selected = ref<RecoverySuggestion | null>(null),
  busy = ref(false),
  error = ref<unknown>(null),
  notice = ref(''),
  uncertain = ref(false)
const partial = ref(false),
  cancellation = ref(false),
  split = ref(false)
const kinds = {
  create_plan: 'Запланувати невиконану роботу',
  replan: 'Перенести навчальні сесії',
  decision_required: 'Вкажіть результат навчання',
  warning: 'Перевірте навчальний план',
}
const states = {
  pending: 'Очікує рішення',
  applied: 'Застосовано',
  rejected: 'Відхилено',
  expired: 'Термін минув',
  invalidated: 'Дані змінилися',
}
const reviewUnverified = computed(
  () =>
    !!attention.error ||
    attention.status?.check_failed ||
    attention.status?.review_refresh_required ||
    attention.display === 'checking',
)
const groupedFeed = computed(() => {
  // Deep links and saved results can be outside the current server page/filter.
  const items = (feed.data.value?.data ?? []).map((item) =>
    selected.value?.id === item.id ? selected.value : item,
  )
  if (selected.value && !items.some((item) => item.id === selected.value?.id))
    items.unshift(selected.value)
  return recoveryGroups
    .map((group) => ({ ...group, items: items.filter((item) => item.kind === group.kind) }))
    .filter((group) => group.items.length)
})
let collapseFocusId: unknown = window.history.state?.recoveryCollapsedId
watch(feed.data, async (value) => {
  if (!value || expandedId.value || typeof collapseFocusId !== 'string') return
  const id = collapseFocusId
  collapseFocusId = null
  await nextTick()
  requestAnimationFrame(() => document.getElementById(toggleId(id))?.focus())
})
const canConfirm = computed(
  () =>
    selected.value?.status === 'pending' &&
    selected.value.actionable &&
    recoveryReviewSupported(selected.value) &&
    selected.value.confirmation_required &&
    !selected.value.requires_lifecycle_decision &&
    ['create_plan', 'replan'].includes(selected.value.kind) &&
    selected.value.required_confirmation_fields.every((field) =>
      field === 'accept_partial'
        ? partial.value
        : field === 'accept_split_replacements'
          ? split.value
          : field === 'accept_unplaced_cancellation'
            ? cancellation.value
            : false,
    ) &&
    !uncertain.value &&
    !reviewUnverified.value,
)
async function open(id: string) {
  const version = ++detailVersion
  busy.value = true
  error.value = null
  partial.value = false
  cancellation.value = false
  split.value = false
  selected.value = null
  try {
    const current = (await recoveryApi.get(id)).data
    if (version !== detailVersion) return
    selected.value = current
    uncertain.value = false
    await nextTick()
    if (version === detailVersion) reviewHeading.value?.focus()
  } catch (e) {
    if (version === detailVersion) error.value = e
  } finally {
    if (version === detailVersion) busy.value = false
  }
}
watch(
  () => route.params.uuid,
  (id) => {
    if (typeof id === 'string' && selected.value?.id !== id) void open(id)
    else if (typeof id !== 'string') {
      detailVersion++
      selected.value = null
      error.value = null
      notice.value = ''
      busy.value = false
    }
  },
  { immediate: true },
)
async function decide(operation: 'confirm' | 'reject' | 'refresh') {
  if (!selected.value || busy.value || (operation === 'confirm' && !canConfirm.value)) return
  busy.value = true
  error.value = null
  notice.value = ''
  const version = detailVersion
  try {
    const result =
      operation === 'confirm'
        ? await recoveryApi.confirm(selected.value.id, {
            accept_partial: partial.value,
            accept_unplaced_cancellation: cancellation.value,
            ...(split.value ? { accept_split_replacements: true } : {}),
          })
        : await recoveryApi[operation](selected.value.id)
    if (version !== detailVersion) return
    selected.value = result.data
    if (operation === 'refresh')
      await router.replace({
        path: `/planning/suggestions/${encodeURIComponent(result.data.id)}`,
        query: listQuery.value,
      })
    partial.value = false
    cancellation.value = false
    split.value = false
    notice.value =
      operation === 'confirm'
        ? 'replayed' in result && result.replayed
          ? 'Показано збережений результат попереднього підтвердження.'
          : 'Зміни застосовано. Результат збережено нижче.'
        : operation === 'refresh'
          ? 'Отримано новий огляд. Перевірте його перед підтвердженням.'
          : 'Пропозицію відхилено.'
    await feed.reload()
  } catch (e) {
    if (version === detailVersion) {
      error.value = e
      uncertain.value = true
    }
  } finally {
    if (version === detailVersion) busy.value = false
  }
}
useWorkLabels(() => selected.value)
</script>
<template>
  <div class="page-workspace page-planning">
    <header class="page-heading">
      <div>
        <h1>Потребує уваги</h1>
        <p class="muted">Пропозиції відновлення навчання. Ви вирішуєте, які зміни застосувати.</p>
      </div>
    </header>
    <PlanningNav />
    <p class="scope-notice" role="status">
      {{
        planningCheckLabel(
          attention.status,
          !!attention.error || !!feed.error.value,
          attention.display === 'checking',
        )
      }}
    </p>
    <p v-if="attention.status?.review_refresh_required" class="helper">
      Попередній огляд застарів. Відкрийте його в історії та отримайте новий огляд перед рішенням.
    </p>
    <label for="recovery-status">Показати</label>
    <select id="recovery-status" v-model="status" @change="changeFilter">
      <option value="pending">Очікують рішення</option>
      <option value="all">Уся історія</option>
    </select>
    <LoadingState v-if="feed.loading.value" />
    <ErrorState v-else-if="feed.error.value" :error="feed.error.value" retry @retry="feed.reload" />
    <template v-else-if="feed.data.value">
      <p class="helper">
        Остання перевірка:
        {{
          feed.data.value.automation.last_scanned_at
            ? dateTime(feed.data.value.automation.last_scanned_at, auth.user?.timezone ?? 'UTC')
            : 'Ще не виконувалась'
        }}. Пропозиції не є доставленими сповіщеннями.
      </p>
      <p v-if="!feed.data.value.data.length && !selected" class="helper">
        У цьому списку пропозицій немає. Перегляньте історію за допомогою фільтра.
      </p>
    </template>
    <section v-for="group in groupedFeed" :key="group.kind" class="suggestion-group">
      <h2>{{ group.title }}</h2>
      <div class="suggestion-list">
        <AppCard v-for="item in group.items" :key="item.id" class="suggestion-card">
          <div class="suggestion-summary">
            <div>
              <p>{{ states[item.status] }}</p>
              <p class="helper">
                Період огляду: {{ item.period.start_date }} — {{ item.period.end_date }} ({{
                  item.period.timezone
                }})
              </p>
              <p v-if="item.kind === 'create_plan'" class="helper">
                Рекомендація: ви вирішуєте, чи створювати нові сесії.
              </p>
            </div>
            <button
              :id="toggleId(item.id)"
              class="button primary"
              :disabled="busy"
              :aria-expanded="expandedId === item.id"
              :aria-controls="expandedId === item.id ? detailId(item.id) : undefined"
              @click="choose(item.id)"
            >
              {{ expandedId === item.id ? 'Згорнути' : 'Переглянути' }}
            </button>
          </div>
          <section
            v-if="selected && selected.id === item.id"
            :id="detailId(item.id)"
            class="suggestion-details"
            aria-label="Огляд пропозиції"
          >
            <h2 ref="reviewHeading" tabindex="-1">{{ kinds[selected.kind] }}</h2>
            <p>
              {{ states[selected.status] }} ·
              {{ dateTime(selected.expires_at, selected.period.timezone) }}
            </p>
            <p v-if="selected.kind !== 'replan'">
              Період огляду: {{ selected.period.start_date }} — {{ selected.period.end_date }} ({{
                selected.period.timezone
              }})
            </p>
            <p
              v-if="selected.status === 'pending' && reviewUnverified"
              role="status"
              class="scope-notice"
            >
              Актуальність цієї пропозиції не підтверджено. Перевірте поточний стан або отримайте
              новий огляд.
            </p>
            <p v-else-if="selected.status === 'pending'" class="helper">
              Пропозицію ще не збережено.
            </p>
            <template v-if="selected.kind === 'replan'">
              <p>
                Період перепланування: {{ selected.period.start_date }} —
                {{ selected.period.end_date }} ({{ selected.period.timezone }})
              </p>
              <RouterLink
                :to="{
                  path: '/planning/replanning',
                  query: {
                    start_date: selected.period.start_date,
                    end_date: selected.period.end_date,
                  },
                }"
              >
                Перепланувати за інший період
              </RouterLink>
            </template>
            <p v-if="['expired', 'invalidated'].includes(selected.status)" class="scope-notice">
              Цей огляд застарів. Отримайте новий огляд перед підтвердженням.
            </p>
            <p v-if="selected.requires_lifecycle_decision">
              Вкажіть результат сесій. Час, що минув, сам по собі не означає пропуск.
            </p>

            <h3>
              {{
                selected.status === 'pending'
                  ? 'Що зміниться після підтвердження'
                  : 'Переглянута пропозиція'
              }}
            </h3>
            <RecoveryReview
              v-if="!selected.receipt"
              :review="selected.review"
              :kind="selected.kind"
              :timezone="selected.period.timezone"
            />
            <template v-if="selected.receipt">
              <h3>Збережений результат</h3>
              <p v-if="selected.kind === 'replan'">
                Період перепланування: {{ selected.period.start_date }} —
                {{ selected.period.end_date }} ({{ selected.period.timezone }})
              </p>
              <p class="success-notice">Зміни збережено. Нижче — результат підтвердження.</p>
              <StudyProposal
                :replanning="selected.kind === 'replan'"
                :review="
                  isPublicObject(selected.receipt.result)
                    ? selected.receipt.result
                    : selected.receipt
                "
                :timezone="selected.period.timezone"
              />
            </template>
            <p
              v-if="selected.actionable && !recoveryReviewSupported(selected)"
              class="report-warning"
              role="status"
            >
              Цей формат пропозиції не підтримується для підтвердження. Перегляньте повні дані або
              отримайте новий огляд.
            </p>
            <fieldset :disabled="busy || uncertain || selected.status !== 'pending'">
              <label
                v-if="selected.required_confirmation_fields.includes('accept_split_replacements')"
                class="checkbox-field"
              >
                <input v-model="split" type="checkbox" />
                Перевірив усі нові сесії та погоджуюся на поділ початкової сесії.
              </label>
              <label
                v-if="selected.required_confirmation_fields.includes('accept_partial')"
                class="checkbox-field"
              >
                <input v-model="partial" type="checkbox" />
                Погоджуюся на показане часткове розміщення роботи.
              </label>
              <label
                v-if="
                  selected.required_confirmation_fields.includes('accept_unplaced_cancellation')
                "
                class="checkbox-field"
              >
                <input v-model="cancellation" type="checkbox" />
                Окремо погоджуюся скасувати нерозміщені початкові сесії та їхні заплановані
                нагадування.
              </label>
            </fieldset>
            <p v-if="selected.actionable" class="helper">
              Підтвердження застосує весь огляд, включно з усіма сторінками карток.
            </p>
            <div class="actions">
              <button
                v-if="selected.actionable"
                class="button"
                :class="reviewUnverified ? 'secondary' : 'primary'"
                :disabled="busy || !canConfirm"
                @click="decide('confirm')"
              >
                Підтвердити зміни
              </button>
              <button
                class="button secondary"
                :disabled="busy || uncertain || selected.status !== 'pending'"
                @click="decide('reject')"
              >
                Відхилити
              </button>
              <button
                class="button secondary"
                :disabled="busy || uncertain"
                @click="decide('refresh')"
              >
                Новий огляд
              </button>
              <button class="button secondary" :disabled="busy" @click="open(selected.id)">
                Перевірити поточний стан
              </button>
            </div>
            <p v-if="uncertain" role="status">
              Результат запиту невідомий або огляд застарів. Перевірте поточний стан перед наступною
              дією.
            </p>
          </section>
        </AppCard>
      </div>
    </section>
    <div
      v-if="feed.data.value && feed.data.value.meta.last_page > 1"
      class="actions suggestion-pagination"
    >
      <button class="button secondary" :disabled="page <= 1" @click="changePage(page - 1)">
        Попередні
      </button>
      <span>{{ page }} / {{ feed.data.value.meta.last_page }}</span>
      <button
        class="button secondary"
        :disabled="page >= feed.data.value.meta.last_page"
        @click="changePage(page + 1)"
      >
        Наступні
      </button>
    </div>
    <p v-if="notice" role="status" class="success-notice">{{ notice }}</p>
    <ErrorState v-if="error" :error="error" />
  </div>
</template>

<style scoped>
.suggestion-group {
  margin-block: 20px;
}
.suggestion-group h2 {
  margin-bottom: 12px;
}
.suggestion-list {
  display: grid;
  gap: 12px;
}
.suggestion-card {
  padding: 16px;
}
.suggestion-details {
  min-width: 0;
  margin-top: 16px;
  overflow-wrap: anywhere;
}
.suggestion-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.suggestion-summary > div {
  min-width: 0;
  overflow-wrap: anywhere;
}
.suggestion-summary p {
  margin: 0;
}
.suggestion-summary p + p {
  margin-top: 6px;
}
.suggestion-summary .button {
  flex-shrink: 0;
  max-width: 100%;
  white-space: normal;
}
@media (max-width: 640px) {
  .suggestion-summary {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }
}
</style>
