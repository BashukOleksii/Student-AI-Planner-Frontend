<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import PageNavigation from '@/components/ui/PageNavigation.vue'
const props = defineProps<{ items: Record<string, unknown>[]; title: string }>()
const page = ref(1)
const last = computed(() => Math.max(1, Math.ceil(props.items.length / 3)))
const visible = computed(() => props.items.slice((page.value - 1) * 3, page.value * 3))
watch(
  () => props.items,
  () => {
    page.value = 1
  },
)
</script>
<template>
  <section v-if="items.length" class="review-block">
    <h3>{{ title }}</h3>
    <template v-for="(item, index) in visible" :key="index"><slot :item="item" /></template>
    <PageNavigation
      v-if="last > 1"
      compact
      :current="page"
      :last="last"
      :total="items.length"
      :aria-label="title"
      @page="page = $event"
    />
  </section>
</template>
