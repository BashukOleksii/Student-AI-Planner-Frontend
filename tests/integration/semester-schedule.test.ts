import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { renderApp } from '../helpers/renderApp'
import { importPath, revision, semesterBackend, semesterPath } from '../helpers/semesterBackend'
const ruleRoute = '/schedule/semesters/1/rules/11'
const rulePath = `${semesterPath}/1/weekly-rules/11`
const importRoute = '/schedule/semester-imports/41'
const commitPath = `${importPath}/41/commit`
const mounted: VueWrapper[] = []
async function open(path: string, backend = semesterBackend()) {
  const result = await renderApp<ReturnType<typeof semesterBackend>>(path, backend)
  mounted.push(result.wrapper)
  return { ...result, backend }
}
async function click(wrapper: VueWrapper, label: string) {
  const target = wrapper.findAll('button').find((item) => item.text() === label)
  expect(target, label).toBeDefined()
  await target!.trigger('click')
  await flushPromises()
}
async function commit(wrapper: VueWrapper) {
  await click(wrapper, 'Переглянути підтвердження імпорту')
  await wrapper.get('dialog input[type="checkbox"]').setValue(true)
  await click(wrapper, 'Підтвердити імпорт')
}
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount()
})
describe('Semester schedule integration', () => {
  it('keeps the weekly draft across a stale write and requires explicit reconciliation', async () => {
    const { wrapper, backend } = await open(ruleRoute)
    await wrapper.get('input[maxlength="100"]').setValue('Новий кабінет')
    backend.data.weekly_rules[0]!.room = 'Поточний кабінет'
    backend.data.weekly_rules[0]!.pair_label = 'Виправлена позначка'
    backend.change()
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('Сервер виявив конфлікт')
    expect(backend.requests.filter((item) => item.method === 'PATCH')).toHaveLength(1)
    await click(wrapper, 'Завантажити актуальний стан')
    expect(wrapper.text()).toContain('Поточний кабінет')
    expect((wrapper.get('input[maxlength="100"]').element as HTMLInputElement).value).toBe(
      'Новий кабінет',
    )
    expect(wrapper.get('button[type="submit"]').attributes()).toHaveProperty('disabled')
    await click(wrapper, 'Я звірив поточний стан')
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined()
    await click(wrapper, 'Замінити чернетку актуальними парами')
    await click(wrapper, 'Завантажити актуальні пари')
    await wrapper.get('input[maxlength="100"]').setValue('Новий кабінет')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    const writes = backend.requests.filter((item) => item.method === 'PATCH')
    expect(writes.map((item) => item.body)).toEqual([
      { room: 'Новий кабінет', schedule_token: revision(1) },
      { room: 'Новий кабінет', schedule_token: revision(2) },
    ])
    expect(backend.data.weekly_rules[0]?.pair_label).toBe('Виправлена позначка')
  })
  it('holds mutations after an uncertain failure and displays the new state after a GET', async () => {
    const { wrapper, backend } = await open(ruleRoute)
    await wrapper.get('input[maxlength="100"]').setValue('401')
    backend.fail(rulePath, 'PATCH', { status: 503, body: { message: 'SQL trace never shown' } })
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('Результат запиту невідомий')
    expect(wrapper.text()).not.toContain('SQL trace')
    expect(backend.requests.filter((item) => item.method === 'PATCH')).toHaveLength(1)
    await click(wrapper, 'Завантажити актуальний стан')
    expect(wrapper.text()).toContain('Ваша чернетка збережена')
    expect(backend.requests.filter((item) => item.method === 'PATCH')).toHaveLength(1)
  })
  it('rejects malformed 409 data and recovers the saved preview with a GET', async () => {
    const { wrapper, backend } = await open(importRoute, semesterBackend({ readyImport: true }))
    backend.malformedConflict = true
    await commit(wrapper)
    expect(wrapper.text()).toContain('Отримано конфлікт стану пакета')
    expect(wrapper.text()).not.toContain('ПІ-231 оновлений огляд')
    await click(wrapper, 'Перевірити стан пакета')
    expect(wrapper.text()).toContain('ПІ-231 оновлений огляд')
    expect(backend.requests.filter((item) => item.path === commitPath)).toHaveLength(1)
    await click(wrapper, 'Переглянути підтвердження імпорту')
    expect((wrapper.get('dialog input[type="checkbox"]').element as HTMLInputElement).checked).toBe(
      false,
    )
  })
})
