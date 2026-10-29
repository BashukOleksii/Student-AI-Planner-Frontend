import { expect, it } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, ref } from 'vue'
import { useResource } from '@/composables/useResource'
it('aborts stale reads and prevents late responses from replacing new data', async () => {
  const key = ref(0)
  const requests: { signal: AbortSignal; resolve: (value: string) => void }[] = []
  const wrapper = mount(
    defineComponent({
      setup() {
        const state = useResource(
          (signal) => new Promise<string>((resolve) => requests.push({ signal, resolve })),
          [key],
        )
        return { state }
      },
      template: '<p>{{ state.data.value }}</p>',
    }),
  )
  key.value++
  await flushPromises()
  expect(requests[0]?.signal.aborted).toBe(true)
  requests[1]?.resolve('new')
  await flushPromises()
  requests[0]?.resolve('old')
  await flushPromises()
  expect(wrapper.text()).toBe('new')
  wrapper.unmount()
  expect(requests[1]?.signal.aborted).toBe(true)
})
