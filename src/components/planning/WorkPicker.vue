<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
const model = defineModel<number | null>({ required: true })
const search = defineModel<string>('search', { required: true })
const props = defineProps<{
  id?: string
  label: string
  options: { id: number; title: string }[]
  selectedLabel?: string
  allLabel: string
  loading?: boolean
  disabled?: boolean
}>()
const generatedId = useId()
const id = computed(() => props.id ?? generatedId),
  opened = ref(false),
  active = ref(0)
const choices = computed(() => {
  const term = search.value.trim().toLocaleLowerCase('uk')
  return term
    ? props.options.filter((option) => option.title.toLocaleLowerCase('uk').includes(term))
    : [{ id: null, title: props.allLabel }, ...props.options]
})
watch(
  () => props.options,
  () => {
    active.value = 0
  },
)
function choose(index: number) {
  const option = choices.value[index]
  if (!option || props.loading) return
  model.value = option.id
  opened.value = false
}
function key(event: KeyboardEvent) {
  if (['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(event.key)) {
    if (event.key === 'Enter' && !opened.value) return
    event.preventDefault()
    if (event.key === 'Escape') {
      opened.value = false
      return
    }
    if (event.key === 'Enter') {
      choose(active.value)
      return
    }
    opened.value = true
    active.value = Math.max(
      0,
      Math.min(choices.value.length - 1, active.value + (event.key === 'ArrowDown' ? 1 : -1)),
    )
  }
}
function input(event: Event) {
  search.value = (event.target as HTMLInputElement).value
  opened.value = true
}
function blur(event: FocusEvent) {
  if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node))
    opened.value = false
}
</script>
<template>
  <div class="field work-picker" @focusout="blur">
    <label :for="id">{{ label }}</label>
    <input
      :id="id"
      role="combobox"
      autocomplete="off"
      maxlength="150"
      :value="opened ? search : selectedLabel || allLabel"
      :disabled="disabled"
      :aria-expanded="opened"
      :aria-controls="`${id}-options`"
      aria-autocomplete="list"
      :aria-activedescendant="opened && choices.length ? `${id}-option-${active}` : undefined"
      placeholder="Пошук за назвою"
      @focus="opened = true"
      @input="input"
      @keydown="key"
    />
    <ul
      v-if="opened"
      :id="`${id}-options`"
      role="listbox"
      :aria-label="label"
      :aria-busy="loading"
      class="work-picker-options"
    >
      <li
        v-for="(option, index) in choices"
        :id="`${id}-option-${index}`"
        :key="option.id ?? 'all'"
        role="option"
        :aria-selected="model === option.id"
        :class="{ 'work-picker-active': active === index }"
      >
        <button type="button" @mousedown.prevent @click="choose(index)">{{ option.title }}</button>
      </li>
      <li v-if="loading" role="presentation">Шукаємо…</li>
      <li v-else-if="!choices.length" role="presentation">Нічого не знайдено</li>
    </ul>
  </div>
</template>
<style scoped>
.work-picker {
  position: relative;
}
.work-picker-options {
  position: absolute;
  top: 100%;
  inset-inline: 0;
  z-index: 10;
  max-height: 18rem;
  overflow-y: auto;
  margin: 0;
  padding: 0.35rem;
  list-style: none;
  background: var(--surface, white);
  border: 1px solid var(--border);
  border-radius: 0.6rem;
  box-shadow: 0 8px 24px #0002;
}
.work-picker-options button {
  width: 100%;
  text-align: start;
  padding: 0.65rem;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
}
.work-picker-active,
.work-picker-options button:hover {
  background: var(--subtle);
}
</style>
