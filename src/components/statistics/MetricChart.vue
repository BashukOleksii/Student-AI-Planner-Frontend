<script setup lang="ts">
import { computed } from 'vue'
const props = defineProps<{
  title: string
  unit: string
  values: { label: string; value: number }[]
}>()
const maximum = computed(() => Math.max(1, ...props.values.map((item) => Math.abs(item.value))))
</script>
<template>
  <figure class="metric-chart">
    <figcaption>{{ title }}</figcaption>
    <p class="helper" aria-hidden="true">{{ unit }}</p>
    <div class="chart-bars" aria-hidden="true">
      <div v-for="(item, index) in values" :key="index" class="chart-bar-row">
        <span>{{ item.label }}</span>
        <strong>
          {{ item.value }}
        </strong>
        <span class="chart-track">
          <span
            :class="{ negative: item.value < 0 }"
            :style="{ width: `${(Math.abs(item.value) / maximum) * 100}%` }"
          ></span>
        </span>
      </div>
    </div>
    <details class="chart-data">
      <summary>Точні значення · {{ unit }}</summary>
      <table>
        <caption class="sr-only">{{ title }} — точні значення, {{ unit }}</caption>
        <thead>
          <tr>
            <th scope="col">Показник / дата</th>
            <th scope="col">{{ unit }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(item, index) in values" :key="index">
            <th scope="row">{{ item.label }}</th>
            <td>
              <span class="chart-number">{{ item.value }}</span>
              <span class="chart-track" aria-hidden="true">
                <span
                  :style="{
                    width: `${(Math.abs(item.value) / Math.max(1, ...values.map((v) => Math.abs(v.value)))) * 100}%`,
                  }"
                ></span>
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </details>
  </figure>
</template>
