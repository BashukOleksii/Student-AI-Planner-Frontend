<script setup lang="ts">
import { computed, ref, onScopeDispose } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import { lessonsApi } from '@/api/lessons'
import { ApiError, fieldErrors } from '@/api/client'
import { scheduleApi } from '@/api/endpoints'
import { useAuthStore } from '@/stores/auth'
import { useResource } from '@/composables/useResource'
import { useLessonCatalog } from '@/composables/useLessonCatalog'
import { localDate } from '@/utils/dates'
import type { LessonInput } from '@/types/lessons'
import LessonForm from '@/components/schedule/LessonForm.vue'
import AppCard from '@/components/ui/AppCard.vue'
import LoadingState from '@/components/ui/LoadingState.vue'
import ErrorState from '@/components/ui/ErrorState.vue'
import FormNotice from '@/components/ui/FormNotice.vue'
const route = useRoute(),
  router = useRouter(),
  auth = useAuthStore()
const id = Number(route.params.id) || null,
  replacing = route.path.endsWith('/replacement')
const timezone = computed(() => auth.user?.timezone ?? 'UTC')
const detail = useResource(async (signal) => (id ? (await lessonsApi.get(id, signal)).data : null))
const catalog = useLessonCatalog(),
  busy = ref(false),
  error = ref<unknown>(null),
  dirty = ref(false),
  saved = ref(false),
  uncertain = ref(false)
let active = true
onScopeDispose(() => {
  active = false
})
onBeforeRouteLeave(
  () =>
    !auth.user ||
    saved.value ||
    (!busy.value &&
      (!dirty.value || window.confirm('Залишити сторінку? Незбережені зміни буде втрачено.'))),
)
async function submit(input: LessonInput) {
  if (busy.value || uncertain.value) return
  busy.value = true
  error.value = null
  try {
    let response
    if (id && !replacing && detail.data.value) {
      const original = detail.data.value
      const changes = Object.fromEntries(
        Object.entries(input).filter(
          ([key, value]) => value !== original[key as keyof LessonInput],
        ),
      ) as Partial<LessonInput>
      response = await lessonsApi.update(id, changes)
    } else
      response =
        replacing && id ? await lessonsApi.replacement(id, input) : await lessonsApi.create(input)
    if (!active) return
    saved.value = true
    dirty.value = false
    // Destination views refetch current data; refresh the affected effective day now as well.
    await Promise.allSettled([
      scheduleApi('day', localDate(response.data.starts_at, timezone.value)),
    ])
    if (active) await router.push(`/schedule/lessons/${response.data.id}`)
  } catch (e) {
    if (!active) return
    error.value = e
    if (e instanceof ApiError && [0, 500, 502, 503].includes(e.status)) uncertain.value = true
  } finally {
    if (active) busy.value = false
  }
}
</script>
<template>
  <header class="page-heading">
    <div>
      <RouterLink :to="id ? `/schedule/lessons/${id}` : '/schedule'" class="text-link">
        ← Повернутися
      </RouterLink>
      <h1>{{ replacing ? 'Заміна заняття' : id ? 'Редагування заняття' : 'Нове заняття' }}</h1>
    </div>
  </header>
  <LoadingState v-if="detail.loading.value" />
  <ErrorState
    v-else-if="detail.error.value"
    :error="detail.error.value"
    retry
    @retry="detail.reload"
  />
  <AppCard v-else>
    <p v-if="replacing" class="schedule-warning">
      Після прийняття сервером початкове заняття стане заміненим, а це заняття — активною окремою
      заміною. Ланцюги замін не підтримуються.
    </p>
    <div v-for="(resource, key) in catalog" :key="key">
      <LoadingState v-if="resource.loading.value" />
      <ErrorState
        v-else-if="resource.error.value"
        :error="resource.error.value"
        retry
        @retry="resource.reload"
      />
    </div>
    <p
      v-if="!catalog.subjects.loading.value && !catalog.subjects.data.value?.data.length"
      class="helper"
    >
      Для нового заняття потрібен власний предмет. Додайте його в академічному просторі.
    </p>
    <div class="actions">
      <RouterLink to="/academic/subjects" class="text-link">Предмети</RouterLink>
      <RouterLink to="/academic/teachers" class="text-link">Викладачі</RouterLink>
      <RouterLink to="/academic/periods" class="text-link">Навчальні періоди</RouterLink>
    </div>
    <FormNotice :error="error" />
    <p v-if="uncertain" role="alert" class="schedule-warning">
      Відповідь втрачено або результат не встановлено. Не повторюйте збереження навмання: перевірте
      розклад і деталі заняття. Автоматичного повтору не було.
    </p>
    <LessonForm
      :lesson="detail.data.value ?? undefined"
      :subjects="catalog.subjects.data.value?.data ?? []"
      :teachers="catalog.teachers.data.value?.data ?? []"
      :periods="catalog.periods.data.value?.data ?? []"
      :timezone="timezone"
      :errors="fieldErrors(error)"
      :busy="busy"
      :blocked="uncertain || ((!id || replacing) && !catalog.subjects.data.value?.data.length)"
      :submit-label="replacing ? 'Створити заміну' : id ? 'Зберегти заняття' : 'Створити заняття'"
      @submit="submit"
      @dirty="dirty = $event"
    />
  </AppCard>
</template>
