<script setup lang="ts">
import { ref } from 'vue'

defineOptions({ inheritAttrs: false })
defineProps<{ id: string }>()
const model = defineModel<string>({ required: true })
const visible = ref(false)
</script>

<template>
  <div class="password-input">
    <input :id="id" v-model="model" v-bind="$attrs" :type="visible ? 'text' : 'password'" />
    <button type="button" class="button secondary" :aria-controls="id" @click="visible = !visible">
      {{ visible ? 'Приховати пароль' : 'Показати пароль' }}
    </button>
  </div>
</template>

<style scoped>
.password-input {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.password-input input {
  flex: 1 1 160px;
  width: auto;
}
.password-input button {
  flex-shrink: 0;
}
</style>
