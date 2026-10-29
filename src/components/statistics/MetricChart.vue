<script setup lang="ts">
defineProps<{ title: string; unit: string; values: { label: string; value: number }[] }>()
</script>
<template>
  <figure class="metric-chart">
    <figcaption>{{ title }}</figcaption>
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
  </figure>
</template>
