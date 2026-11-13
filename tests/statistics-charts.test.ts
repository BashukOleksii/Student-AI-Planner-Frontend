import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import MetricChart from '@/components/statistics/MetricChart.vue'
import ProgressOverview from '@/components/statistics/ProgressOverview.vue'
import PeriodComparison from '@/components/statistics/PeriodComparison.vue'
import { progressFixture, comparisonFixture, zeroActivity } from './helpers/activityBackend'

describe('compact statistics charts', () => {
  it.each([{ values: [] }, { values: [{ label: 'Без прив’язки до предмета', value: 0 }] }])(
    'keeps a zero/empty donut finite without inventing a segment: %j',
    ({ values }) => {
      const wrapper = mount(MetricChart, {
        props: { title: 'Час', unit: 'хв', variant: 'donut', values },
      })
      expect(wrapper.get('.donut-total strong').text()).toBe('0')
      expect(wrapper.html()).not.toMatch(/NaN|Infinity/)
      expect(
        wrapper
          .findAll('circle[stroke-dasharray]')
          .every((circle) => circle.attributes('stroke-dasharray') === '0 100'),
      ).toBe(true)
    },
  )
  it('draws one full segment for one subject and exposes fractional minutes accessibly', () => {
    const wrapper = mount(MetricChart, {
      props: {
        title: 'Час',
        unit: 'хв',
        variant: 'donut',
        values: [{ label: 'Алгоритми', value: 1.5 }],
      },
    })
    expect(wrapper.get('circle[stroke-dasharray]').attributes('stroke-dasharray')).toBe('100 0')
    expect(wrapper.get('[role="img"]').attributes('aria-label')).toContain('Алгоритми — 1,5 хв')
    expect(wrapper.get('.donut-total strong').text()).toBe('1,5')
  })
  it('preserves 31 dates and true zero bars without adding daily tables', () => {
    const values = Array.from({ length: 31 }, (_, i) => ({
      label: `${i + 1}.10`,
      value: i === 0 ? 25 : 0,
    }))
    const wrapper = mount(MetricChart, {
      props: { title: 'Час за днями', unit: 'хв', variant: 'columns', values },
    })
    expect(wrapper.findAll('.daily-point')).toHaveLength(31)
    expect(wrapper.findAll('.daily-label').map((label) => label.text())).toEqual(
      values.map((item) => item.label),
    )
    expect(wrapper.findAll('.daily-track span')[1]!.attributes('style')).toContain('height: 0%')
    expect(wrapper.get('[role="region"]').attributes('tabindex')).toBe('0')
    expect(wrapper.find('table').exists()).toBe(false)
  })
  it('uses signed deltas supplied by the API and shows A and B separately', () => {
    const report = comparisonFixture()
    report.delta.tasks_completed.total = 123
    const wrapper = mount(PeriodComparison, { props: { report } })
    expect(wrapper.findAll('.comparison-card')[0]!.get('.comparison-delta').text()).toContain(
      '+123',
    )
    expect(
      wrapper
        .findAll('.comparison-card')[0]!
        .findAll('dd')
        .map((value) => value.text()),
    ).toEqual(['7', '5'])
    expect(wrapper.get('.comparison-periods').text()).toContain(report.baseline.period.start_date)
  })
  it('keeps missing actual duration distinct from recorded zero minutes', async () => {
    const report = progressFixture()
    report.study_sessions.started_in_period = zeroActivity().study_sessions
    report.study_sessions.started_in_period.completed = { count: 1, scheduled_seconds: 7200 }
    report.study_sessions.started_in_period.completed_without_actual_minutes = 1
    const wrapper = mount(ProgressOverview, { props: { report } })
    expect(wrapper.findAll('.progress-metric')[1]!.get('dd').text()).toBe('— хв')
    expect(wrapper.get('.unknown-time').text()).toContain('без записаного часу: 1')
    const recorded = structuredClone(report)
    recorded.study_sessions.started_in_period.completed_with_actual_minutes = 1
    recorded.study_sessions.started_in_period.completed_without_actual_minutes = 0
    await wrapper.setProps({ report: recorded })
    expect(wrapper.findAll('.progress-metric')[1]!.get('dd').text()).toBe('0 хв')
    expect(wrapper.find('.unknown-time').exists()).toBe(false)
  })
})
