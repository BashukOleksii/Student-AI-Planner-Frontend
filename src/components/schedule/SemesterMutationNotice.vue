<script setup lang="ts">
import AppButton from '@/components/ui/AppButton.vue'
import FormNotice from '@/components/ui/FormNotice.vue'

defineProps<{
  blocked: 'stale' | 'uncertain' | null
  review: boolean
  busy: boolean
  error: unknown
}>()
defineEmits<{ reload: []; reviewed: [] }>()
</script>
<template>
  <FormNotice :error="error" />
  <div v-if="blocked || review" class="schedule-warning">
    <p role="status" v-if="blocked === 'stale'">
      Сервер виявив конфлікт зі станом семестру. Завантажте актуальні дані й звірте їх зі своєю
      чернеткою.
    </p>
    <p role="status" v-else-if="blocked === 'uncertain'">
      Результат запиту невідомий. Перевірте поточний стан семестру перед наступною дією.
    </p>
    <p role="status" v-else>
      Поточний стан завантажено. Перевірте, які зміни ще потрібні. Ваша чернетка збережена.
    </p>
    <AppButton v-if="blocked" :busy="busy" @click="$emit('reload')">
      Завантажити актуальний стан
    </AppButton>
    <AppButton v-else :disabled="busy" @click="$emit('reviewed')">Я звірив поточний стан</AppButton>
  </div>
</template>
