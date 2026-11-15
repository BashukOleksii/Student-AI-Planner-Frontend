import LessonForm from '@/components/schedule/LessonForm.vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { renderApp } from '../helpers/renderApp'
import { lessonDetailFixture, scheduleBackend } from '../helpers/scheduleBackend'
import { semesterBackend, importPath } from '../helpers/semesterBackend'

async function click(wrapper: VueWrapper, label: string) {
  const container = wrapper.find('dialog').exists() ? wrapper.get('dialog') : wrapper
  const button = container.findAll('button').find((b) => b.text() === label)
  expect(button, label).toBeDefined()
  await button!.trigger('click')
  await flushPromises()
}
function form(lesson = lessonDetailFixture(), timezone = 'Europe/Kyiv') {
  return mount(LessonForm, {
    props: {
      lesson,
      timezone,
      subjects: [],
      teachers: [],
      errors: {},
      busy: false,
      submitLabel: 'Зберегти',
    },
  })
}
async function readyImport() {
  const backend = semesterBackend({ readyImport: true })
  return { ...(await renderApp('/schedule/semester-imports/41', backend)), backend }
}
async function decide(wrapper: VueWrapper) {
  await click(wrapper, 'Переглянути підтвердження імпорту')
  await wrapper.get('dialog input[type="checkbox"]').setValue(true)
  await click(wrapper, 'Підтвердити імпорт')
}

describe('Dated Lesson form', () => {
  it('preserves stored UTC seconds through an unrelated edit during the repeated DST hour', async () => {
    const lesson = {
      ...lessonDetailFixture(),
      starts_at: '2026-10-25T00:30:12Z',
      ends_at: '2026-10-25T02:20:12Z',
    }
    const wrapper = form(lesson)
    await wrapper.get('#lesson-room').setValue('402')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('submit')?.[0]?.[0]).toEqual({
      subject_id: 7,
      teacher_id: 8,
      academic_period_id: 4,
      type: 'lecture',
      room: '402',
      starts_at: lesson.starts_at,
      ends_at: lesson.ends_at,
    })
  })
  it.each([
    ['Europe/Kyiv', '2026-11-02T07:00:00Z'],
    ['America/New_York', '2026-11-02T14:00:00Z'],
  ])('converts minute input in %s using the displayed lesson date', async (zone, utc) => {
    const wrapper = form(lessonDetailFixture(), zone)
    await wrapper.get('#lesson-start').setValue('09:00')
    await wrapper.get('#lesson-end').setValue('10:00')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('submit')?.[0]?.[0]).toMatchObject({ starts_at: utc })
  })
  it.each(['2026-03-29', '2026-10-25'])(
    'rejects a changed gap/fold time on %s before emitting a write',
    async (date) => {
      const wrapper = form({
        ...lessonDetailFixture(),
        starts_at: `${date}T00:00:00Z`,
        ends_at: `${date}T03:00:00Z`,
      })
      await wrapper.get('#lesson-start').setValue('03:30')
      await wrapper.get('#lesson-end').setValue('05:00')
      await wrapper.get('form').trigger('submit')
      expect(wrapper.emitted('submit')).toBeUndefined()
      expect(wrapper.text()).toContain('не існує або повторюється')
    },
  )
  it('PATCH clears editable associations while retaining the existing academic period', async () => {
    const backend = scheduleBackend()
    const { wrapper } = await renderApp('/schedule/lessons/9/edit', backend)
    await wrapper.get('#lesson-room').setValue('')
    await wrapper.get('#lesson-teacher').setValue('')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(backend.requests.find((r) => r.method === 'PATCH')?.body).toEqual({
      room: null,
      teacher_id: null,
    })
    expect(backend.lessons[0]?.academic_period_id).toBe(4)
  })
})
describe('Current import boundaries', () => {
  it('opens the old dated-import deep link as read-only persisted history', async () => {
    const backend = scheduleBackend()
    const { wrapper, router } = await renderApp('/schedule/imports/40', backend)
    expect(router.currentRoute.value.path).toBe('/schedule/import-history/40')
    expect(wrapper.text()).toContain('Історія імпорту занять')
    expect(wrapper.text()).toContain(backend.batches[0]!.original_filename)
    expect(wrapper.find('form').exists()).toBe(false)
    expect(wrapper.findAll('button').some((b) => b.text().includes('Підтвердити імпорт'))).toBe(
      false,
    )
    expect(backend.requests.every((r) => r.method === 'GET')).toBe(true)
  })
  it('redirects the retired dated-upload URL without starting a new upload', async () => {
    const backend = scheduleBackend()
    const { wrapper, router } = await renderApp('/schedule/import', backend)
    expect(router.currentRoute.value.path).toBe('/schedule/legacy')
    expect(wrapper.find('input[type="file"]').exists()).toBe(false)
    expect(backend.requests.every((r) => r.method === 'GET')).toBe(true)
  })
  it('requires an independent unchecked review and an exact confirmed semester commit', async () => {
    const { wrapper, backend } = await readyImport()
    await click(wrapper, 'Переглянути підтвердження імпорту')
    expect((wrapper.get('dialog input').element as HTMLInputElement).checked).toBe(false)
    expect(wrapper.get('dialog button.primary').attributes('disabled')).toBeDefined()
    await click(wrapper, 'Повернутися до огляду')
    expect(backend.requests.some((r) => r.path.endsWith('/commit'))).toBe(false)
    const token = backend.batch.preview_token
    await decide(wrapper)
    expect(backend.requests.filter((r) => r.path.endsWith('/commit'))).toEqual([
      {
        path: `${importPath}/41/commit`,
        method: 'POST',
        body: { preview_token: token, confirmed: true },
      },
    ])
    expect(wrapper.text()).toContain('Розклад успішно імпортовано')
  })
  it('requires renewed consent after the server changes a semester preview', async () => {
    const { wrapper, backend } = await readyImport()
    backend.staleCommit = true
    await decide(wrapper)
    expect(wrapper.text()).toContain('ПІ-231 оновлений огляд')
    expect(wrapper.find('dialog').exists()).toBe(false)
    expect(backend.requests.filter((r) => r.path.endsWith('/commit'))).toHaveLength(1)
    await click(wrapper, 'Переглянути підтвердження імпорту')
    expect((wrapper.get('dialog input').element as HTMLInputElement).checked).toBe(false)
    await wrapper.get('dialog input').setValue(true)
    await click(wrapper, 'Підтвердити імпорт')
    expect(backend.requests.filter((r) => r.path.endsWith('/commit'))).toHaveLength(2)
    expect(backend.batch.status).toBe('committed')
  })
  it('recovers a lost commit through GET without replaying the mutation', async () => {
    const { wrapper, backend } = await readyImport()
    backend.loseCommit = true
    await decide(wrapper)
    expect(backend.requests.filter((r) => r.path.endsWith('/commit'))).toHaveLength(1)
    await click(wrapper, 'Перевірити стан пакета')
    expect(backend.batch.status).toBe('committed')
    expect(backend.requests.at(-1)).toMatchObject({ method: 'GET', path: `${importPath}/41` })
    expect(wrapper.text()).toContain('Розклад успішно імпортовано')
    expect(backend.requests.filter((r) => r.path.endsWith('/commit'))).toHaveLength(1)
  })
  it('blocks duplicate semester commits while confirmation is pending', async () => {
    const { wrapper, backend } = await readyImport()
    const original = globalThis.fetch
    let release!: () => void
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    let writes = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.endsWith('/commit')) {
          writes++
          await pending
        }
        return original(url, init)
      }),
    )
    await click(wrapper, 'Переглянути підтвердження імпорту')
    await wrapper.get('dialog input').setValue(true)
    const button = wrapper.findAll('dialog button').find((b) => b.text() === 'Підтвердити імпорт')!
    await button.trigger('click')
    await button.trigger('click')
    expect(writes).toBe(1)
    expect(button.attributes('disabled')).toBeDefined()
    release()
    await flushPromises()
    expect(backend.requests.filter((r) => r.path.endsWith('/commit'))).toHaveLength(1)
  })
})
