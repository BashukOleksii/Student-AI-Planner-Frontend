import AcademicForm from '@/components/domain/AcademicForm.vue'
import type { AcademicKind } from '@/types/api'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { f2Backend } from '../helpers/f2Backend'
import { renderApp } from '../helpers/renderApp'
const emptyTitles = {
  institutions: 'Додайте свій навчальний заклад',
  periods: 'Вкажіть дати першого семестру',
  subjects: 'Додайте перший предмет',
  teachers: 'Додайте першого викладача',
}
const cases: [AcademicKind, string][] = [
  ['institutions', 'education-institutions'],
  ['periods', 'academic-periods'],
  ['subjects', 'subjects'],
  ['teachers', 'teachers'],
]
describe('Academic workspace', () => {
  it.each(cases)('lists, creates, loads detail, edits and deletes %s', async (kind, endpoint) => {
    const backend = f2Backend()
    if (kind !== 'institutions')
      backend.academic.institutions.push({ id: 1, name: 'Навчальний заклад' })
    const { wrapper } = await renderApp(`/academic/${kind}`, backend)
    expect(wrapper.text()).toContain(emptyTitles[kind])
    expect(wrapper.get('.sidebar a[href="/academic"]').attributes('aria-current')).toBe('page')
    await wrapper
      .findAll('button')
      .find((b) => b.text().startsWith('Додати '))!
      .trigger('click')
    await flushPromises()
    await wrapper.get('#academic-name').setValue('Перший запис')
    if (kind === 'periods') {
      await wrapper.get('#period-start').setValue('2026-09-01')
      await wrapper.get('#period-end').setValue('2026-12-31')
    }
    if (kind === 'subjects')
      await wrapper.get('input[name="subject-color"][value="#2563EB"]').setValue(true)
    await wrapper.get('dialog form').trigger('submit')
    await flushPromises()
    expect(wrapper.find('dialog').exists()).toBe(false)
    expect(wrapper.text()).toContain('Перший запис')
    expect(backend.requests.find((r) => r.method === 'POST')?.path).toBe(`/api/${endpoint}`)
    await wrapper.get('[aria-label="Редагувати: Перший запис"]').trigger('click')
    await flushPromises()
    expect(
      backend.requests.some((r) => r.method === 'GET' && r.path === `/api/${endpoint}/10`),
    ).toBe(true)
    await wrapper.get('#academic-name').setValue('Оновлений запис')
    await wrapper.get('dialog form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('Оновлений запис')
    expect(backend.requests.find((r) => r.method === 'PATCH')?.body).not.toHaveProperty('user_id')
    await wrapper.get('[aria-label="Видалити: Оновлений запис"]').trigger('click')
    await wrapper.get('dialog button.secondary').trigger('click')
    expect(backend.requests.some((r) => r.method === 'DELETE')).toBe(false)
    await wrapper.get('[aria-label="Видалити: Оновлений запис"]').trigger('click')
    await wrapper.get('dialog button.danger').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain(emptyTitles[kind])
    expect(backend.requests.filter((r) => r.method === 'DELETE')).toHaveLength(1)
  })
  it('shows owner-scoped unavailable details and does not leak the missing record', async () => {
    const backend = f2Backend()
    backend.academic.teachers.push({
      id: 7,
      name: 'Видимий викладач',
      education_institution_id: null,
    })
    backend.failure = { method: 'GET', path: /teachers\/7$/, status: 404 }
    const { wrapper } = await renderApp('/academic/teachers', backend)
    await wrapper.get('[aria-label="Редагувати: Видимий викладач"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('dialog').text()).toContain('Запис недоступний')
    expect(wrapper.find('#academic-name').exists()).toBe(false)
  })
})
describe('Academic form contracts', () => {
  it('checks calendar validity and date order; equal period dates are allowed without UTC conversion', async () => {
    const wrapper = mount(AcademicForm, {
      props: { kind: 'periods', institutions: [], errors: {}, busy: false },
    })
    await wrapper.get('#academic-name').setValue('Семестр')
    await wrapper.get('#period-start').setValue('2026-10-30')
    await wrapper.get('#period-end').setValue('2026-10-29')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.text()).toContain('Кінець періоду має бути не раніше початку')
    expect(wrapper.emitted('submit')).toBeUndefined()
    await wrapper.get('#period-start').setValue('')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.text()).toContain('дійсну календарну дату')
    await wrapper.get('#period-start').setValue('2026-10-29')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('submit')?.[0]).toEqual([
      {
        kind: 'periods',
        value: {
          name: 'Семестр',
          education_institution_id: null,
          starts_on: '2026-10-29',
          ends_on: '2026-10-29',
        },
      },
    ])
  })
})
