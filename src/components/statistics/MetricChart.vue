<script setup lang="ts">
import { computed } from 'vue'
import { chartColors } from '@/utils/statistics'
const props = withDefaults(
  defineProps<{
    title: string
    unit: string
    values: { label: string; value: number }[]
    variant?: 'bars' | 'columns' | 'donut'
  }>(),
  { variant: 'bars' },
)
const maximum = computed(() => Math.max(1, ...props.values.map((item) => Math.abs(item.value))))
const total = computed(() => props.values.reduce((sum, item) => sum + Math.max(0, item.value), 0))
const segments = computed(() => {
  let offset = 0
  return props.values.map((item, index) => {
    const length = total.value ? (Math.max(0, item.value) / total.value) * 100 : 0
    const segment = { ...item, length, offset, color: chartColors[index % chartColors.length] }
    offset += length
    return segment
  })
})
const number = (value: number) =>
  new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 1 }).format(value)
</script>
<template>
  <figure class="metric-chart" :class="`metric-chart-${variant}`">
    <figcaption>
      {{ title }}
      <span class="chart-unit">{{ unit }}</span>
    </figcaption>
    <template v-if="variant === 'donut'">
      <div
        class="donut-chart"
        role="img"
        :aria-label="`${title}: ${values.map((item) => `${item.label} — ${number(item.value)} ${unit}`).join('; ')}`"
      >
        <svg viewBox="0 0 120 120" aria-hidden="true">
          <circle class="donut-track" cx="60" cy="60" r="48" fill="none" stroke-width="14" />
          <circle
            v-for="(segment, index) in segments"
            :key="index"
            cx="60"
            cy="60"
            r="48"
            fill="none"
            stroke-width="14"
            pathLength="100"
            :stroke="segment.color"
            :stroke-dasharray="`${segment.length} ${100 - segment.length}`"
            :stroke-dashoffset="-segment.offset"
            transform="rotate(-90 60 60)"
          >
            <title>{{ segment.label }}: {{ number(segment.value) }} {{ unit }}</title>
          </circle>
        </svg>
        <div class="donut-total" aria-hidden="true">
          <strong>{{ number(total) }}</strong>
          <span>{{ unit }}</span>
        </div>
      </div>
    </template>
    <div
      v-else-if="variant === 'columns'"
      class="daily-scroll"
      role="region"
      :aria-label="title"
      tabindex="0"
    >
      <ol class="daily-series" :style="{ minWidth: `${values.length * 35}px` }">
        <li
          v-for="(item, index) in values"
          :key="index"
          class="daily-point"
          tabindex="0"
          :aria-label="`${item.label}: ${number(item.value)} ${unit}`"
        >
          <span class="daily-value" aria-hidden="true">{{ number(item.value) }}</span>
          <div class="daily-track" aria-hidden="true">
            <span :style="{ height: `${(Math.abs(item.value) / maximum) * 100}%` }"></span>
          </div>
          <span class="daily-label" aria-hidden="true">{{ item.label }}</span>
        </li>
      </ol>
    </div>
    <ul v-else class="chart-bars">
      <li v-for="(item, index) in values" :key="index" class="chart-bar-row">
        <span>{{ item.label }}</span>
        <strong class="chart-number">{{ number(item.value) }}</strong>
        <span class="chart-track" aria-hidden="true">
          <span
            :class="{ negative: item.value < 0 }"
            :style="{ width: `${(Math.abs(item.value) / maximum) * 100}%` }"
          ></span>
        </span>
      </li>
    </ul>
  </figure>
</template>
<style scoped>
.metric-chart {
  margin: 0;
  min-width: 0;
}
figcaption {
  font-size: 13px;
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-weight: 700;
}
.chart-unit {
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 400;
}
.chart-bars {
  list-style: none;
  padding: 0;
}
.donut-chart {
  position: relative;
  width: min(220px, 100%);
  margin: 12px auto;
}
.donut-chart svg {
  display: block;
  width: 100%;
}
.donut-track {
  stroke: var(--subtle);
}
.donut-total {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.donut-total strong {
  font-size: 30px;
  font-variant-numeric: tabular-nums;
}
.donut-total span {
  color: var(--text-secondary);
}
.daily-scroll {
  overflow-x: auto;
  padding: 10px 2px 4px;
}
.daily-series {
  display: flex;
  list-style: none;
  gap: 6px;
  padding: 0;
  margin: 0;
}
.daily-point {
  flex: 1;
  min-width: 29px;
  display: grid;
  gap: 6px;
  text-align: center;
  border-radius: 4px;
}
.daily-track {
  height: 105px;
  display: flex;
  align-items: flex-end;
  background: var(--subtle);
  border-radius: 5px;
  overflow: hidden;
}
.daily-track span {
  background: var(--accent);
  width: 100%;
  border-radius: 5px 5px 0 0;
}
.daily-value,
.daily-label {
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  color: var(--text-secondary);
}
.daily-point:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
</style>
