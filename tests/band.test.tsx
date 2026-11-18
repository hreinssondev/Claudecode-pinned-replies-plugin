import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

const BAND = {
  plugin: 'pinned-replies',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: true,
    maxRows: 30,
    bodyColumns: 60,
    scroll: { offset: 0, bodyRows: 29 },
    view: {},
  },
} as const

const reply = ($: Parameters<TestBody>[0], text: string, agentId?: string) =>
  $.session.append({
    message: { type: 'assistant', role: 'assistant', content: [{ type: 'text', text }] },
    door: 'response',
    origin: { kind: 'model', model: 'claude-opus-5-5' },
    uuid: crypto.randomUUID(),
    ...(agentId ? { agentId } : {}),
  })

test('the band keeps the last 4 replies of the main conversation', async $ => {
  for (const n of [1, 2, 3, 4, 5]) await reply($, `reply ${n}`)
  await reply($, 'from a subagent', 'a1')

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ type: 'Button', text: /reply 1/ })).toBeFalsy()
    expect(await ui.find({ text: /subagent/ })).toBeFalsy()
    // The oldest row's bullet is the toggle.
    expect((await ui.find({ type: 'Button', text: /reply 2/ }))?.text).toBe('● reply 2')
    for (const n of [3, 4, 5]) {
      expect((await ui.find({ type: 'Button', text: new RegExp(`reply ${n}`) }))?.text).toBe(`● reply ${n}`)
    }
    await ui.unmount()
  }
})

test('a long reply is cut to its rows with an ellipsis', async $ => {
  await reply($, 'word '.repeat(200))
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Button', text: /…$/ })).toBeTruthy()
  await ui.unmount()
})

test('the toggle collapses every reply into the header, and expands them again', async ($, on) => {
  mock.store(on)
  for (const n of [1, 2]) await reply($, `reply ${n}`)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    await ui.press({ key: 'toggle' })
    expect(await ui.find({ type: 'Button', text: /reply/ })).toBeFalsy()
    expect((await ui.find({ type: 'Text', text: /collapsed/ }))?.text).toBe('2 replies collapsed')
    await ui.press({ key: 'toggle' })
    expect((await ui.find({ type: 'Button', text: /reply 2/ }))?.text).toBe('● reply 2')
    await ui.unmount()
  }
})

test('the second toggle hides the older replies and shows them again', async ($, on) => {
  mock.store(on)
  for (const n of [1, 2, 3]) await reply($, `reply ${n}`)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    await ui.press({ key: 'older' })
    expect(await ui.find({ type: 'Button', text: /reply [12]/ })).toBeFalsy()
    // The newest now holds the band's first row, beside the toggles.
    expect((await ui.find({ type: 'Button', text: /reply 3/ }))?.text).toBe('● reply 3')
    await ui.press({ key: 'older' })
    expect((await ui.find({ type: 'Button', text: /reply 1/ }))?.text).toBe('● reply 1')
    expect((await ui.find({ type: 'Button', text: /reply 3/ }))?.text).toBe('● reply 3')
    await ui.unmount()
  }
})

test('a lone reply has no toggle for older ones', async $ => {
  await reply($, 'only reply')
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Button', key: 'older' })).toBeFalsy()
  expect(await ui.find({ type: 'Button', key: 'toggle' })).toBeTruthy()
  await ui.unmount()
})

test('a typed prompt makes every reply old until Claude replies again', async ($, on) => {
  mock.store(on)
  on('prompt.submit', (_, e) => ({ text: e.text }))
  await reply($, 'reply 1')
  await reply($, 'reply 2')
  await $.prompt.submit({ text: 'next', origin: { kind: 'composer' }, wait: false })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    await ui.press({ key: 'older' })
    expect((await ui.find({ type: 'Text', text: /hidden/ }))?.text).toBe('2 older replies hidden')
    expect(await ui.find({ type: 'Button', text: /reply/ })).toBeFalsy()
    await ui.press({ key: 'older' })
    expect((await ui.find({ type: 'Button', text: /reply 2/ }))?.text).toBe('● reply 2')
    await ui.unmount()
  }

  await reply($, 'reply 3')
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await ui.press({ key: 'older' })
  expect((await ui.find({ type: 'Button', text: /reply/ }))?.text).toBe('● reply 3')
  await ui.unmount()
})

test('a slash command leaves the newest reply current', async ($, on) => {
  mock.store(on)
  on('prompt.submit', (_, e) => ({ text: e.text }))
  await reply($, 'reply 1')
  await reply($, 'reply 2')
  await $.prompt.submit({
    text: '/pinned',
    command: { name: 'pinned', args: '' },
    origin: { kind: 'composer' },
    wait: false,
  })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await ui.press({ key: 'older' })
  expect((await ui.find({ type: 'Button', text: /reply/ }))?.text).toBe('● reply 2')
  await ui.unmount()
})

test('pressing a message shows it whole, and pressing again caps it again', async $ => {
  await reply($, 'first')
  await reply($, Array.from({ length: 12 }, (_, n) => `line ${n + 1}`).join('\n'))

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ type: 'Button', text: /line 12/ })).toBeFalsy()
    expect((await ui.find({ type: 'Button', text: /line 6/ }))?.text).toBe('  line 6…')
    // Any row of the message toggles it: here its last shown one.
    await ui.press({ key: 'm1-5' })
    expect((await ui.find({ type: 'Button', text: /line 12/ }))?.text).toBe('  line 12')
    expect((await ui.find({ type: 'Button', text: /line 6/ }))?.text).toBe('  line 6')
    await ui.press({ key: 'm1-0' })
    expect(await ui.find({ type: 'Button', text: /line 12/ })).toBeFalsy()
    await ui.unmount()
  }
})

const message = (requestId: string, text: string, onScreen: { first: number; last: number; of: number } | null) => ({
  plugin: 'pinned-replies',
  surface: 'terminal',
  component: 'AssistantMessage',
  requestId,
  props: { text, isFirstOfReply: true, onScreen },
}) as const

test('a reply drawn whole on screen is left out of the band, and back once it is not', async ($, on) => {
  // Nothing draws beneath the plugin: this hook stands for the engine's own message rows.
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })
  await reply($, 'reply 1')
  await reply($, 'reply 2')

  const whole = await $.ui.mount(message('r2', 'reply 2', { first: 0, last: 3, of: 4 }))
  let band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await band.find({ type: 'Button', text: /reply 2/ })).toBeFalsy()
  // Still dimmed: it is not the newest.
  expect((await band.find({ type: 'Button', text: /reply 1/ }))?.props.dimColor).toBe(true)
  await band.unmount()
  await whole.unmount()

  // Its top row scrolled away: no longer whole on screen.
  const cut = await $.ui.mount(message('r2', 'reply 2', { first: 2, last: 3, of: 4 }))
  band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await band.find({ type: 'Button', text: /reply 2/ }))?.text).toBe('● reply 2')
  await band.unmount()
  await cut.unmount()
})

test('the band draws nothing while every reply it would show is on screen', async ($, on) => {
  // Nothing draws beneath the plugin: this hook stands for the engine's own message rows.
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })
  await reply($, 'only reply')
  const whole = await $.ui.mount(message('r1', 'only reply', { first: 1, last: 2, of: 3 }))
  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await band.find({ type: 'Button', key: 'toggle' })).toBeFalsy()
  await band.unmount()
  await whole.unmount()
})

// The engine beneath session.start, with the plugin's store kept in `saved`.
const startWith = async (
  $: Parameters<TestBody>[0],
  on: Parameters<TestBody>[1],
  saved: Record<string, unknown>,
) => {
  on('store.get', (_, e) => ({ value: saved[e.key] }))
  on('store.set', (_, e) => {
    saved[e.key] = e.value

    return { value: undefined }
  })
  on('ui.status', () => ({ value: undefined }))
  on('command.register', () => ({ value: { command: 'pinned' } }))
  on('session.messages', () => ({ value: [] }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
}

test('a chat starts with the stored setup, and a press stores the new one', async ($, on) => {
  const saved: Record<string, unknown> = {
    setup: { isHidden: false, isCollapsed: false, isOlderHidden: true },
  }
  await startWith($, on, saved)
  await reply($, 'reply 1')
  await reply($, 'reply 2')

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Button', text: /reply 1/ })).toBeFalsy()
  expect(await ui.find({ type: 'Button', text: /reply 2/ })).toBeTruthy()
  await ui.press({ key: 'older' })
  expect(await ui.find({ type: 'Button', text: /reply 1/ })).toBeTruthy()
  expect(saved.setup).toEqual({ isHidden: false, isCollapsed: false, isOlderHidden: false })
  await ui.press({ key: 'toggle' })
  expect(saved.setup).toEqual({ isHidden: false, isCollapsed: true, isOlderHidden: false })
  await ui.unmount()
})

test('with nothing stored yet, the first chat to start stores its own setup', async ($, on) => {
  const saved: Record<string, unknown> = {}
  await startWith($, on, saved)
  expect(saved.setup).toEqual({ isHidden: false, isCollapsed: false, isOlderHidden: false })
})

test('every message is drawn dimmed, the newest too', async $ => {
  await reply($, 'reply 1')
  await reply($, 'reply 2')
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  for (const n of [1, 2]) {
    expect((await ui.find({ type: 'Button', text: new RegExp(`reply ${n}`) }))?.props.dimColor).toBe(true)
  }
  await ui.unmount()
})
