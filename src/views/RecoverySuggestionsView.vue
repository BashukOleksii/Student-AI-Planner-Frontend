<script setup lang="ts">
import { useWorkLabels } from '@/composables/useWorkLabels'
import { ref, computed, watch, onScopeDispose, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useResource } from '@/composables/useResource'
import { recoveryReviewSupported } from '@/api/recoveryPayloads'
import { recoveryApi } from '@/api/recovery'
import type { RecoverySuggestion } from '@/types/recovery'
import { useAuthStore } from '@/stores/auth'
import { today, addDays } from '@/utils/dates'
import { dateTime } from '@/utils/dates'
import RecoveryReview from '@/components/planning/RecoveryReview.vue'
import StudyProposal from '@/components/planning/StudyProposal.vue'
import DetailSection from '@/components/ui/DetailSection.vue'
import { isPublicObject } from '@/utils/ai'
import RecoveryEvidence from '@/components/planning/RecoveryEvidence.vue'
import PlanningNav from '@/components/planning/PlanningNav.vue'
import ErrorState from '@/components/ui/ErrorState.vue'
import LoadingState from '@/components/ui/LoadingState.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
const auth = useAuthStore()
const route = useRoute(),
  router = useRouter()
const reviewHeading = ref<HTMLElement>()
let detailVersion = 0
onScopeDispose(() => {
  detailVersion++
})
function choose(id: string) {
  void router.push(`/planning/suggestions/${encodeURIComponent(id)}`)
}
const diagnosticStart = ref(today(auth.user?.timezone ?? 'UTC'))
const diagnosticEnd = ref(addDays(diagnosticStart.value, 6))
const diagnostics = ref<import('@/types/ai').PublicObject | null>(null)
async function diagnose() {
  if (busy.value) return
  busy.value = true
  error.value = null
  diagnostics.value = null
  try {
    diagnostics.value = (
      await recoveryApi.diagnostics(diagnosticStart.value, diagnosticEnd.value)
    ).data
  } catch (e) {
    error.value = e
  } finally {
    busy.value = false
  }
}
const status = ref('pending'),
  page = ref(1)
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
  cancellation = ref(false)
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
        : field === 'accept_unplaced_cancellation'
          ? cancellation.value
          : false,
    ) &&
    !uncertain.value,
)
async function open(id: string) {
  const version = ++detailVersion
  busy.value = true
  error.value = null
  partial.value = false
  cancellation.value = false
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
          })
        : await recoveryApi[operation](selected.value.id)
    if (version !== detailVersion) return
    selected.value = result.data
    if (operation === 'refresh')
      await router.replace(`/planning/suggestions/${encodeURIComponent(result.data.id)}`)
    partial.value = false
    cancellation.value = false
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
useWorkLabels(() => [selected.value, diagnostics.value])
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
    <label for="recovery-status">Показати</label>
    <select id="recovery-status" v-model="status" @change="page = 1">
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
      <EmptyState
        v-if="!feed.data.value.data.length"
        title="Нових пропозицій немає"
        description="За потреби створіть план вручну або перегляньте навчальні сесії."
      />
      <article v-for="item in feed.data.value.data" :key="item.id" class="list-row">
        <div>
          <h2>{{ kinds[item.kind] }}</h2>
          <p class="helper">
            {{ states[item.status] }} · {{ item.period.start_date }} — {{ item.period.end_date }}
          </p>
        </div>
        <button class="button secondary" :disabled="busy" @click="choose(item.id)">
          Переглянути
        </button>
      </article>
      <div class="actions">
        <button class="button secondary" :disabled="page <= 1" @click="page--">Попередні</button>
        <span>{{ page }} / {{ feed.data.value.meta.last_page }}</span>
        <button
          class="button secondary"
          :disabled="page >= feed.data.value.meta.last_page"
          @click="page++"
        >
          Наступні
        </button>
      </div>
    </template>
    <p v-if="notice" role="status" class="success-notice">{{ notice }}</p>
    <ErrorState v-if="error" :error="error" />
    <section v-if="selected" class="recovery-review" aria-label="Огляд пропозиції">
      <h2 ref="reviewHeading" tabindex="-1">{{ kinds[selected.kind] }}</h2>
      <p>
        {{ states[selected.status] }} ·
        {{ dateTime(selected.expires_at, selected.period.timezone) }}
      </p>
      <p v-if="selected.requires_lifecycle_decision">
        Вкажіть результат сесій. Час, що минув, сам по собі не означає пропуск.
      </p>
      <RouterLink to="/planning/sessions">Переглянути результати сесій</RouterLink>
      <h3>
        {{
          selected.status === 'pending'
            ? 'Що зміниться після підтвердження'
            : 'Переглянута пропозиція'
        }}
      </h3>
      <RecoveryReview
        :review="selected.review"
        :kind="selected.kind"
        :timezone="selected.period.timezone"
      />
      <template v-if="selected.receipt">
        <h3>Збережений результат</h3>
        <p class="success-notice">Зміни збережено. Нижче — результат підтвердження.</p>
        <StudyProposal
          :review="
            isPublicObject(selected.receipt.result) ? selected.receipt.result : selected.receipt
          "
          :timezone="selected.period.timezone"
        />
        <DetailSection title="Повний збережений результат">
          <RecoveryEvidence :value="selected.receipt" :timezone="selected.period.timezone" />
        </DetailSection>
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
          v-if="selected.required_confirmation_fields.includes('accept_partial')"
          class="checkbox-field"
        >
          <input v-model="partial" type="checkbox" />
          Погоджуюся на показане часткове розміщення роботи.
        </label>
        <label
          v-if="selected.required_confirmation_fields.includes('accept_unplaced_cancellation')"
          class="checkbox-field"
        >
          <input v-model="cancellation" type="checkbox" />
          Окремо погоджуюся скасувати нерозміщені початкові сесії та їхні заплановані нагадування.
        </label>
      </fieldset>
      <div class="actions">
        <button class="button primary" :disabled="busy || !canConfirm" @click="decide('confirm')">
          Підтвердити зміни
        </button>
        <button
          class="button secondary"
          :disabled="busy || uncertain || selected.status !== 'pending'"
          @click="decide('reject')"
        >
          Відхилити
        </button>
        <button class="button secondary" :disabled="busy || uncertain" @click="decide('refresh')">
          Новий огляд
        </button>
        <button class="button secondary" :disabled="busy" @click="open(selected.id)">
          Перевірити поточний стан
        </button>
      </div>
      <p v-if="uncertain" role="status">
        Результат запиту невідомий або огляд застарів. Перевірте поточний стан перед наступною дією.
      </p>
    </section>
    <details class="secondary-disclosure">
      <summary>Діагностика за період</summary>
      <form @submit.prevent="diagnose">
        <div class="form-grid">
          <label>
            Початкова дата
            <input v-model="diagnosticStart" type="date" required />
          </label>
          <label>
            Кінцева дата
            <input v-model="diagnosticEnd" type="date" required />
          </label>
        </div>
        <button class="button secondary" :disabled="busy">Перевірити план</button>
      </form>
      <RecoveryEvidence v-if="diagnostics" :value="diagnostics" />
    </details>
    <div class="actions">
      <RouterLink to="/planning/preview">Створити план вручну</RouterLink>
      <RouterLink to="/planning/recovery">Відновлення окремої роботи</RouterLink>
    </div>
  </div>
</template>
