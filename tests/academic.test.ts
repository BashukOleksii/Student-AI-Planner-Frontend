import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { renderApp } from './helpers/renderApp'
import { f2Backend } from './helpers/f2Backend'
import AcademicForm from '@/components/domain/AcademicForm.vue'
import type { AcademicKind } from '@/types/api'
const cases: [AcademicKind, string][] = [
  ['institutions', 'education-institutions'],
  ['periods', 'academic-periods'],
  ['subjects', 'subjects'],
  ['teachers', 'teachers'],
]
describe('Academic workspace', () => {
  it.each(cases)('lists, creates, loads detail, edits and deletes %s', async (kind, endpoint) => {
    const { wrapper, backend } = await renderApp(`/academic/${kind}`)
    expect(wrapper.text()).toContain('Записів поки немає')
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
    if (kind === 'subjects') await wrapper.get('#subject-color').setValue('#a1B2c3')
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
    expect(wrapper.text()).toContain('Записів поки немає')
    expect(backend.requests.filter((r) => r.method === 'DELETE')).toHaveLength(1)
  })
  it('shows a recoverable collection error without substituting fabricated records', async () => {
    const backend = f2Backend()
    backend.failure = { method: 'GET', path: /subjects$/, status: 503 }
    const { wrapper } = await renderApp('/academic/subjects', backend)
    expect(wrapper.text()).toContain('Сервіс тимчасово недоступний')
    expect(wrapper.find('.academic-row').exists()).toBe(false)
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Спробувати ще раз')!
      .trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Записів поки немає')
  })
  it('selects owned institutions and clears nullable associations on PATCH', async () => {
    const backend = f2Backend()
    backend.academic.institutions.push({ id: 2, name: 'Університет' })
    const { wrapper } = await renderApp('/academic/teachers', backend)
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Додати викладача')!
      .trigger('click')
    await flushPromises()
    await wrapper.get('#academic-name').setValue('Ірина')
    await wrapper.get('#academic-institution').setValue('2')
    await wrapper.get('dialog form').trigger('submit')
    await flushPromises()
    expect(backend.requests.find((r) => r.method === 'POST')?.body.education_institution_id).toBe(2)
    await wrapper.get('[aria-label="Редагувати: Ірина"]').trigger('click')
    await flushPromises()
    await wrapper.get('#academic-institution').setValue('')
    await wrapper.get('dialog form').trigger('submit')
    await flushPromises()
    expect(
      backend.requests.find((r) => r.method === 'PATCH')?.body.education_institution_id,
    ).toBeNull()
  })
  it('retains dependent subjects after institution deletion and refreshes selectors', async () => {
    const backend = f2Backend()
    backend.academic.institutions.push({ id: 2, name: 'Заклад' })
    backend.academic.subjects.push({
      id: 4,
      name: 'Фізика',
      education_institution_id: 2,
      code: null,
      color: null,
    })
    const { wrapper, router } = await renderApp('/academic/institutions', backend)
    await wrapper.get('[aria-label="Видалити: Заклад"]').trigger('click')
    await wrapper.get('dialog button.danger').trigger('click')
    await flushPromises()
    await router.push('/academic/subjects')
    await flushPromises()
    expect(wrapper.text()).toContain('Фізика')
    expect(wrapper.text()).toContain('Без закладу')
    await wrapper.get('[aria-label="Редагувати: Фізика"]').trigger('click')
    await flushPromises()
    expect(wrapper.findAll('#academic-institution option')).toHaveLength(1)
  })
  it.each([422, 409, 419])(
    'preserves data and reports %s on refused deletion without retrying',
    async (status) => {
      const backend = f2Backend()
      backend.academic.subjects.push({
        id: 3,
        name: 'Предмет',
        education_institution_id: null,
        code: null,
        color: null,
      })
      backend.failure = {
        method: 'DELETE',
        path: /subjects\/3$/,
        status,
        fields: { subject: ['Є пов’язані заняття.'] },
      }
      const { wrapper } = await renderApp('/academic/subjects', backend)
      await wrapper.get('[aria-label="Видалити: Предмет"]').trigger('click')
      await wrapper.get('dialog button.danger').trigger('click')
      await flushPromises()
      expect(wrapper.get('dialog').text()).toContain('Є пов’язані заняття.')
      expect(backend.academic.subjects).toHaveLength(1)
      expect(backend.requests.filter((r) => r.method === 'DELETE')).toHaveLength(1)
    },
  )
  it('shows duplicate-name validation and does not invent teacher uniqueness', async () => {
    const backend = f2Backend()
    backend.failure = {
      method: 'POST',
      path: /education-institutions$/,
      status: 422,
      fields: { name: ['Назва вже використана.'] },
    }
    const { wrapper, router } = await renderApp('/academic/institutions', backend)
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Додати заклад')!
      .trigger('click')
    await flushPromises()
    await wrapper.get('#academic-name').setValue('Заклад')
    await wrapper.get('dialog form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('#academic-name').attributes('aria-invalid')).toBe('true')
    expect(wrapper.text()).toContain('Назва вже використана.')
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await router.push('/academic/teachers')
    await flushPromises()
    for (let i = 0; i < 2; i++) {
      await wrapper
        .findAll('button')
        .find((b) => b.text() === 'Додати викладача')!
        .trigger('click')
      await flushPromises()
      await wrapper.get('#academic-name').setValue('Те саме ім’я')
      await wrapper.get('dialog form').trigger('submit')
      await flushPromises()
    }
    expect(backend.academic.teachers).toHaveLength(2)
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
  it('makes a newly created subject available to the existing Task form', async () => {
    const { wrapper, router } = await renderApp('/academic/subjects')
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Додати предмет')!
      .trigger('click')
    await flushPromises()
    await wrapper.get('#academic-name').setValue('Новий предмет')
    await wrapper.get('dialog form').trigger('submit')
    await flushPromises()
    await router.push('/tasks/new')
    await flushPromises()
    expect(wrapper.get('#task-subject').text()).toContain('Новий предмет')
  })
  it('prevents duplicate writes during an active create request', async () => {
    const { wrapper, fetch } = await renderApp('/academic/institutions')
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Додати заклад')!
      .trigger('click')
    await flushPromises()
    await wrapper.get('#academic-name').setValue('Заклад')
    let resolve: ((response: Response) => void) | undefined
    const delayed = vi.fn((url: string, init?: RequestInit) =>
      init?.method === 'POST'
        ? new Promise<Response>((r) => {
            resolve = r
          })
        : fetch(url, init),
    )
    vi.stubGlobal('fetch', delayed)
    await wrapper.get('dialog form').trigger('submit')
    await wrapper.get('dialog form').trigger('submit')
    expect(delayed.mock.calls.filter((c) => c[1]?.method === 'POST')).toHaveLength(1)
    expect(wrapper.get('dialog fieldset').attributes('disabled')).toBeDefined()
    resolve?.(new Response(JSON.stringify({ data: { id: 99, name: 'Заклад' } }), { status: 201 }))
    await flushPromises()
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
  it('preserves empty code versus null, mixed-case color, and clearing nullable color', async () => {
    const wrapper = mount(AcademicForm, {
      props: { kind: 'subjects', institutions: [], errors: {}, busy: false },
    })
    await wrapper.get('#academic-name').setValue('Алгебра')
    await wrapper.get('input[type="checkbox"]').setValue(false)
    await wrapper.get('#subject-color').setValue('#a1B2c3')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('submit')?.[0]).toEqual([
      {
        kind: 'subjects',
        value: { name: 'Алгебра', education_institution_id: null, code: '', color: '#a1B2c3' },
      },
    ])
    await wrapper.get('input[type="checkbox"]').setValue(true)
    await wrapper.get('#subject-color').setValue('')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('submit')?.[1]?.[0]).toMatchObject({
      value: { code: null, color: null },
    })
    await wrapper.get('#subject-color').setValue('#bad')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.text()).toContain('Використайте формат #RRGGBB')
  })
})
