import { expect, test } from 'claude-code/testing'

const measure = (percent: number) => ({
  context: { window: 200000, tokens: percent * 2000, percent },
  rateLimits: [],
  changed: ['context' as const],
})

test('toasts once per 10% band and re-arms after a drop', async ($, on) => {
  const toasts: string[] = []
  let notified = 0
  on('command.register', () => ({ value: { command: 'context-meter' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('clock.every', () => ({ value: { cancel: () => undefined } }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.notify', () => {
    notified += 1

    return { value: { isSent: true, channel: 'test' } }
  })
  on('ui.toast', (_, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.session.measure(measure(12)) // band 10
  await $.session.measure(measure(15)) // same band: silent
  await $.session.measure(measure(34)) // band 30
  await $.session.measure(measure(36)) // silent
  await $.session.measure(measure(83)) // band 80 + notification
  await $.session.measure(measure(5)) // compacted: re-arm
  await $.session.measure(measure(21)) // band 20 again

  expect(toasts.length).toBe(4)
  expect(toasts[2]).toContain('80%')
  expect(notified).toBe(1)
})

const AT = (p: number) => ({
  plugin: 'context-meter',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: 100, scroll: { offset: 0, bodyRows: 4 }, view: {} },
  p,
})

test('the mascot shows on the band and pushes at 70%', async ($, on) => {
  on('clock.every', () => ({ value: { cancel: () => undefined } }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('command.register', () => ({ value: { command: 'context-meter' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.notify', () => ({ value: { isSent: true, channel: 'test' } }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  for (const [percent, words] of [[20, /\^_\^/], [75, /(back|stay|watch)/], [95, /(MAYDAY|ABORT|COMING)/]] as const) {
    await $.session.measure(measure(percent))
    const ui = await $.ui.mount({ ...AT(percent), surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: words })).toBeTruthy()
    await ui.unmount()
  }
})
