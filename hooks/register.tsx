import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

const percent = atom({ plugin: 'context-meter', key: 'percent' } as const, null)
const band = atom({ plugin: 'context-meter', key: 'band' } as const, 0)
const isHidden = atom({ plugin: 'context-meter', key: 'isHidden' } as const, false)
const tick = atom({ plugin: 'context-meter', key: 'tick' } as const, 0)

const TICK_MS = 250
const BAR = 20

type Level = 'ok' | 'notice' | 'warning' | 'critical'

const levelOf = (p: number): Level =>
  p >= 90 ? 'critical' : p >= 70 ? 'warning' : p >= 50 ? 'notice' : 'ok'

const COLOR = {
  ok: 'success',
  notice: 'suggestion',
  warning: 'warning',
  critical: 'error',
} as const

const bar = (p: number) => {
  const filled = Math.max(0, Math.min(BAR, Math.round((p / 100) * BAR)))
  return '█'.repeat(filled) + '░'.repeat(BAR - filled)
}

const MESSAGES: Record<number, string> = {
  10: 'Context 10% used. Fresh start, plenty of room.',
  20: 'Context 20% used.',
  30: 'Context 30% used.',
  40: 'Context 40% used. Nearly halfway.',
  50: 'Context 50% used. Halfway through the window.',
  60: 'Context 60% used. Consider wrapping up the current thread.',
  70: 'Context 70% used. Claude is trying to push the bar back. It is not working. Plan a /compact soon.',
  80: 'Context 80% used. Run /compact now, or start a fresh session for new work.',
  90: 'Context 90% used. Critical: compact or restart before the next big task.',
  100: 'Context window is full. Compact or start a new session now.',
}


// --- the mascot -------------------------------------------------------------

type Pose = { face: string; armL: string; armR: string }

// Wave the arms on odd frames: up (\ /) then down (/ \).
const flail = (t: number): Pick<Pose, 'armL' | 'armR'> =>
  t % 2 === 0 ? { armL: '\\', armR: '/' } : { armL: '/', armR: '\\' }

// Triangle wave: runs 0..max and back, one step per beat.
const bounce = (beat: number, max: number) => {
  if (max <= 0) return 0
  const m = beat % (2 * max)
  return m <= max ? m : 2 * max - m
}

// How far the bar is shoved back, in cells, over an 8-beat struggle.
const SHOVE = [0, 0.5, 1, 1, 0.5, 0, -0.34, 0]

const caption = (p: number, t: number): string => {
  if (p >= 100) return 'x_x  it won. /compact?'
  if (p >= 90) return ['MAYDAY!!', 'ABORT! /compact NOW', 'IT IS COMING'][Math.floor(t / 6) % 3]
  if (p >= 80) return ["I can't hold it!", 'send help /compact', 'no no no no'][Math.floor(t / 6) % 3]
  if (p >= 70) return ['back! back!', 'stay back!', 'not on my watch'][Math.floor(t / 6) % 3]
  if (p >= 60) return 'this is fine...'
  if (p >= 50) return 'uh oh'
  return ''
}

type Frame = { before: number; gap: number; after: number; pose: Pose; text: string }

// Lays out the track: filled cells, a gap of empty cells, the mascot, the rest.
const frameOf = (p: number, t: number, width: number): Frame => {
  const fill = Math.max(0, Math.min(width, Math.round((p / 100) * width)))

  if (p >= 100) {
    return {
      before: fill,
      gap: 0,
      after: 0,
      pose: { face: 'x_x', armL: ' ', armR: ' ' },
      text: caption(p, t),
    }
  }

  if (p >= 70) {
    // Pushing: stands at the bar's end and shoves it back, losing every time.
    const amp = p >= 90 ? 4 : p >= 80 ? 3 : 2
    const step = SHOVE[Math.floor(t / 2) % SHOVE.length]
    const edge = Math.max(0, Math.min(width, fill - Math.round(step * amp)))
    const recoil = step < 0
    const strain = p >= 90 ? '>O<' : '>_<'
    const pose: Pose = recoil
      ? { face: 'O_O', ...flail(0) }
      : { face: step > 0.5 ? strain : '>o<', armL: '<', armR: p >= 80 ? flail(t).armR : ' ' }

    return { before: edge, gap: 0, after: width - edge, pose, text: caption(p, t) }
  }

  // Running about in the free part of the track.
  const free = width - fill
  const speed = p >= 60 ? 3 : p >= 50 ? 2 : 1
  const beat = p >= 30 ? t * speed : Math.floor(t / 2)
  const jitter = p >= 50 ? ((t * 5 + 3) % 3) - 1 : 0
  const gap = Math.max(0, Math.min(free, bounce(beat, free) + jitter))
  const face = p >= 60 ? (t % 2 === 0 ? 'O_O' : '@_@') : p >= 50 ? 'O_O' : p >= 30 ? 'o_o' : '^_^'
  const arms = p >= 50 ? flail(t) : { armL: ' ', armR: ' ' }

  return { before: fill, gap, after: free - gap, pose: { face, ...arms }, text: caption(p, t) }
}

const bandOf = (p: number) => Math.min(100, Math.floor(p / 10) * 10)

export const register: Register = on => {
  let stopTicking: (() => void) | undefined

  // Seed from the live figure so a reload does not re-announce a band already passed.
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'context-meter',
      description: 'Toggle the context usage band above the prompt',
    })
    const { context } = await $.session.usage()
    const p = context.percent ?? null
    await update($, percent, () => p)
    await update($, band, () => (p === null ? 0 : bandOf(p)))
    $.ui.status(p === null ? undefined : `Context ${p}% ${bar(p)}`)

    // The mascot's heartbeat: redraws the band while it is on show.
    stopTicking?.()
    const timer = $.clock.every(TICK_MS, async () => {
      if ((await read($, percent)) === null || (await read($, isHidden))) return
      await update($, tick, n => (n + 1) % 100000)
    })
    stopTicking = () => timer.cancel()

    return next(e)
  })

  on('session.end', ($, e, next) => {
    stopTicking?.()

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    if (!e.changed.includes('context')) return next(e)

    const p = e.context.percent
    if (p === undefined) return next(e)

    await update($, percent, () => p)
    $.ui.status(`Context ${p}% ${bar(p)}`)

    const reached = bandOf(p)
    const seen = await read($, band)

    if (reached > seen && reached >= 10) {
      // Announce the highest band crossed (a big jump skips the ones between).
      await update($, band, () => reached)
      const text = MESSAGES[reached] ?? `Context ${reached}% used.`
      const level = levelOf(reached)
      const tokens = e.context.tokens
      const detail =
        tokens === undefined ? '' : ` (${tokens.toLocaleString()} / ${e.context.window.toLocaleString()} tokens)`

      $.ui.toast(`${level === 'critical' ? '🚨' : level === 'warning' ? '⚠️' : '📊'} ${text}${detail}`, {
        timeoutMs: level === 'critical' ? 15000 : level === 'warning' ? 10000 : 5000,
      })

      if (reached >= 80) {
        $.ui.notify(text, { title: 'Context window' }).catch(() => undefined)
      }
    } else if (reached < seen) {
      // Compaction or /clear freed room: re-arm the alerts for the climb back up.
      await update($, band, () => reached)
    }

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const p = await read($, percent)
    const isQuiet = e.props.hasSurvey || p === null || (await read($, isHidden))

    if (isQuiet) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)
    const t = await read($, tick)
    const level = levelOf(p)
    const columns = e.props.bodyColumns
    const width = Math.max(10, Math.min(30, columns - 50))
    const f = frameOf(p, t, width)
    const color = COLOR[level]

    return (
      <Box>
        <Text dimColor>Context </Text>
        <Text color={color}>{String(p).padStart(3)}% </Text>
        <Text color={color}>{'█'.repeat(f.before)}</Text>
        <Text dimColor>{'░'.repeat(f.gap)}</Text>
        <Text color="claude">{f.pose.armL}▐</Text>
        <Text color="inverseText" backgroundColor="claude" bold>
          {f.pose.face}
        </Text>
        <Text color="claude">▌{f.pose.armR}</Text>
        <Text dimColor>{'░'.repeat(f.after)}</Text>
        {columns >= 70 && f.text !== '' && <Text color={color}> {f.text}</Text>}
        <Text> </Text>
        <Button key="hide" label="Hide" onPress={() => update($, isHidden, () => true)} />
      </Box>
    )
  })

  on('command.run', { command: 'context-meter' }, async $ => {
    const hidden = await read($, isHidden)
    await update($, isHidden, () => !hidden)

    return { text: hidden ? 'Context meter shown.' : 'Context meter hidden.' }
  })
}
