import { describe, expect, it } from 'vitest'
import { estimateSeconds, shorten, totalSeconds, SHORT_TARGET_MINUTES } from '../src/coach/variant.ts'
import { LIBRARY, findTemplate, thresholdTestFor } from '../src/coach/library.ts'
import { defaultThreshold } from '../src/coach/thresholds.ts'
import { toIntervalsText } from '../src/coach/format.ts'
import { planDays } from '../src/coach/engine.ts'
import { buildState } from '../src/coach/state.ts'
import { levelFor, completionsFrom } from '../src/coach/progression.ts'
import { benchmarkTemplateFor } from '../src/coach/benchmark.ts'
import type { Block, Repeat, Step, WorkoutTemplate } from '../src/coach/types.ts'
import { activity, baselineWellness, config, plannedEvent, wellness } from './fixtures.ts'

const BIKE = defaultThreshold('Ride')
const RUN = defaultThreshold('Run')

const shortenTo45 = (template: WorkoutTemplate) =>
  shorten(
    template.blocks,
    defaultThreshold(template.sport),
    SHORT_TARGET_MINUTES / template.minutes,
  )

const repeats = (blocks: readonly Block[]): readonly Repeat[] =>
  blocks.filter((block): block is Repeat => block.kind === 'repeat')

const steps = (blocks: readonly Block[]): readonly Step[] =>
  blocks.flatMap((block) => (block.kind === 'step' ? [block] : block.steps))

describe('estimating how long a step takes', () => {
  it('reads times directly', () => {
    expect(estimateSeconds('15m', BIKE)).toBe(900)
    expect(estimateSeconds('40s', BIKE)).toBe(40)
    expect(estimateSeconds('1h30m', BIKE)).toBe(5400)
  })

  it('turns distances into time using the athlete threshold pace', () => {
    // 4:30/km threshold pace, so 800 m is a little over three and a half minutes.
    expect(estimateSeconds('800mtr', RUN)).toBe(216)
    expect(estimateSeconds('2km', RUN)).toBe(540)
  })

  it('prices swim distances off the CSS pace per 100 m', () => {
    expect(estimateSeconds('200mtr', defaultThreshold('Swim'))).toBe(220)
  })
})

describe('the short version of a session', () => {
  it('keeps every interval at full length and full intensity', () => {
    const template = findTemplate('bike-thr-3x12')
    if (!template) throw new Error('fixture template missing')
    const { blocks } = shortenTo45(template)

    const before = repeats(template.blocks)[0]
    const after = repeats(blocks)[0]
    expect(after?.steps).toEqual(before?.steps)
    expect(after?.times).toBeLessThan(before?.times ?? 0)
  })

  it('never drops below half the intervals', () => {
    for (const template of LIBRARY) {
      // An impossible target: even then the session has to stay recognisable.
      const { blocks } = shorten(template.blocks, defaultThreshold(template.sport), 0.05)
      repeats(template.blocks).forEach((before, index) => {
        const after = repeats(blocks)[index]
        expect(after?.times, `${template.id} block ${index}`).toBeGreaterThanOrEqual(
          before.times / 2,
        )
      })
    }
  })

  it('shortens continuous work instead, where the duration is the stimulus', () => {
    const template = findTemplate('bike-endurance-75')
    if (!template) throw new Error('fixture template missing')
    const { blocks, cuts } = shortenTo45(template)

    expect(cuts.join(' ')).toContain('Hauptteil')
    expect(totalSeconds(blocks, BIKE)).toBeLessThan(totalSeconds(template.blocks, BIKE))
  })

  it('leaves the main body of an interval session untouched', () => {
    for (const template of LIBRARY.filter((entry) => repeats(entry.blocks).length > 0)) {
      const { cuts } = shortenTo45(template)
      expect(cuts.join(' '), template.id).not.toContain('Hauptteil')
    }
  })

  it('trims warm-up and cool-down before it touches the work', () => {
    const template = findTemplate('bike-vo2-5x4')
    if (!template) throw new Error('fixture template missing')
    const { cuts } = shortenTo45(template)
    expect(cuts[0]).toContain('Einfahren')
  })

  it('cuts nothing that was not there and keeps the block count', () => {
    for (const template of LIBRARY) {
      const { blocks } = shortenTo45(template)
      expect(blocks, template.id).toHaveLength(template.blocks.length)
      expect(steps(blocks).map((step) => step.target)).toEqual(
        steps(template.blocks).map((step) => step.target),
      )
    }
  })

  it('still renders as valid intervals.icu text', () => {
    const template = findTemplate('bike-thr-3x12')
    if (!template) throw new Error('fixture template missing')
    const text = toIntervalsText(shortenTo45(template).blocks)
    expect(text).toContain('2x')
    expect(text).not.toMatch(/\n{3}/)
  })
})

const state = () =>
  buildState(
    [activity(9, 'Ride', { load: 60, intensity: 70 }), activity(11, 'Run', { load: 50, intensity: 70 })],
    [wellness(0), ...baselineWellness()],
    '2026-09-02',
  )

describe('short variants in the plan', () => {
  it('offers a shorter version that costs less than the full one', () => {
    const sessions = planDays(state(), config, 3).flatMap((day) => day.options)
    const withShort = sessions.filter((session) => session.short !== null)
    expect(withShort.length).toBeGreaterThan(0)

    for (const session of withShort) {
      const short = session.short
      if (!short) continue
      expect(short.minutes).toBeLessThan(session.template.minutes)
      expect(short.load).toBeLessThan(session.template.load)
      expect(short.minutes).toBeLessThanOrEqual(SHORT_TARGET_MINUTES + 10)
      expect(short.cuts.length).toBeGreaterThan(0)
    }
  })

  it('offers no second version for a session that is already short', () => {
    const sessions = planDays(state(), config, 3).flatMap((day) => day.options)
    for (const session of sessions) {
      if (session.template.minutes <= SHORT_TARGET_MINUTES) expect(session.short).toBeNull()
    }
  })
})

describe('progression after a short session', () => {
  const completions = (externalId: string) =>
    completionsFrom(
      [plannedEvent(5, 'egal', { externalId, id: 'e-short' })],
      [activity(5, 'Ride', { load: 80, pairedEventId: 'e-short', compliance: 95 })],
    )

  it('does not unlock the next level', () => {
    const done = completions('coach:2026-08-20:bike-thr-3x12:short')
    expect(done[0]?.variant).toBe('short')
    expect(levelFor('bike-threshold', done)).toBe(1)
  })

  it('unlocks it when the full session was done', () => {
    const done = completions('coach:2026-08-20:bike-thr-3x12')
    expect(done[0]?.variant).toBe('full')
    expect(levelFor('bike-threshold', done)).toBe(3)
  })
})

describe('the threshold test', () => {
  it('is a sustained maximal effort, not intervals', () => {
    const test = findTemplate('test-bike-ftp20')
    if (!test) throw new Error('threshold test missing')
    const main = test.blocks.find(
      (block) => block.kind === 'step' && block.duration === '20m',
    )
    expect(main, 'no twenty minute block').toBeDefined()
    expect(test.measures).toBe('threshold')
  })

  it('stays out of the eight week rotation, which tracks something else', () => {
    // benchmarkFor picks per sport, so a second Ride benchmark must not shadow it.
    expect(benchmarkTemplateFor('Ride')?.id).toBe('bench-bike-4x4')
    expect(thresholdTestFor('Ride')?.id).toBe('test-bike-ftp20')
  })

  it('is prescribed by the plan, not left to the athlete to volunteer', () => {
    const days = planDays(state(), config, 3)
    const measuring = days.filter((day) =>
      day.options.some((option) => option.template.id === 'test-bike-ftp20'),
    )
    expect(measuring).toHaveLength(1)
    expect(measuring[0]?.dayType).toBe('KEY')
  })

  it('never lands on an easy or rest day', () => {
    for (const day of planDays(state(), config, 7)) {
      if (day.dayType === 'KEY') continue
      expect(day.options.map((option) => option.template.measures)).not.toContain('threshold')
    }
  })
})
