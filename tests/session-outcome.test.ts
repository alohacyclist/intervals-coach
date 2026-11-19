import { describe, expect, it } from 'vitest'
import { compareExecution } from '../src/coach/execution.ts'
import type { ActualInterval } from '../src/coach/execution.ts'
import { findTemplate } from '../src/coach/library.ts'
import { sessionFeedback } from '../src/coach/session-outcome.ts'
import { buildTrace } from '../src/coach/trace.ts'
import type { SportThreshold, WorkoutTemplate } from '../src/coach/types.ts'

const FTP: SportThreshold = { metric: 'power', ftp: 280 }

const interval = (kind: 'work' | 'recovery', seconds: number, watts: number, heart: number | null = null): ActualInterval => ({
  kind,
  seconds,
  averageWatts: watts,
  averageSpeedMps: null,
  averageHeartrate: heart,
  startSeconds: null,
  endSeconds: null,
})

/** The 3 × 12 min at threshold, ridden as given: each entry is one interval's watts, seconds and heart rate. */
const threeByTwelve = (
  work: readonly (readonly [watts: number, seconds?: number, heart?: number])[],
  options: { readonly maxHr?: number | null; readonly shortened?: boolean } = {},
) => {
  const template = findTemplate('bike-thr-3x12') as WorkoutTemplate
  const intervals = work.flatMap(([watts, seconds = 720, heart]) => [
    interval('work', seconds, watts, heart ?? null),
    interval('recovery', 300, 140),
  ])
  const execution = compareExecution({
    activityId: 'a1',
    sport: 'Ride',
    template,
    blocks: template.blocks,
    threshold: FTP,
    intervals,
    load: 80,
    movingSeconds: template.minutes * 60,
    compliance: null,
    trace: null,
  })
  return sessionFeedback({
    execution,
    template,
    threshold: FTP,
    maxHr: options.maxHr ?? null,
    shortened: options.shortened ?? false,
  }).join(' ')
}

/** The 75 min endurance ride, recorded second by second with the given watts and heart rate. */
const endurance = (
  watts: (second: number) => number,
  heart: (second: number) => number | null = () => null,
  seconds = 4500,
  load = 55,
) => {
  const template = findTemplate('bike-endurance-75') as WorkoutTemplate
  const time = Array.from({ length: seconds }, (_, second) => second)
  const trace = buildTrace(
    { time, watts: time.map(watts), speed: null, heartRate: time.map(heart) },
    FTP,
  )
  const execution = compareExecution({
    activityId: 'a2',
    sport: 'Ride',
    template,
    blocks: template.blocks,
    threshold: FTP,
    intervals: [],
    load,
    movingSeconds: seconds,
    compliance: null,
    trace,
  })
  return sessionFeedback({ execution, template, threshold: FTP, maxHr: null, shortened: false })
}

describe('an interval session', () => {
  it('names the next rung once every interval held', () => {
    const said = threeByTwelve([[280], [282], [279]])
    expect(said).toContain('Alle Intervalle im Korridor.')
    expect(said).toContain('Als Nächstes in dieser Reihe: Schwelle 2x20min.')
  })

  it('does not promise the next rung for a shortened version', () => {
    const said = threeByTwelve([[280], [282], [279]], { shortened: true })
    expect(said).toContain('Für die nächste Stufe zählt nur die volle Fassung')
    expect(said).not.toContain('Als Nächstes')
  })

  it('says a session well above its bands points to a higher threshold', () => {
    const said = threeByTwelve([[300], [302], [300]])
    expect(said).toMatch(/im Schnitt \d\.\d Punkte über dem Korridor/)
    expect(said).toContain('höhere Schwelle')
    expect(said).toContain('Als Nächstes in dieser Reihe')
  })

  it('lets a single interval just above its band pass', () => {
    const said = threeByTwelve([[280], [300], [280]])
    expect(said).toContain('Intervall 2 etwas über dem Korridor, das passt.')
  })

  it('says where it broke, what the heart did before, and that the level stays', () => {
    const said = threeByTwelve([[280, 720, 170], [280, 720, 180], [280, 540, 182]], { maxHr: 190 })
    expect(said).toContain('Intervall 3 nach 9:00 von 12:00 min beendet.')
    expect(said).toContain('Der Puls lag schon in Intervall 2 bei 95 % deiner HFmax.')
    expect(said).toContain('Die Stufe bleibt')
    expect(said).not.toContain('Als Nächstes')
  })

  it('names an interval not ridden and one below its band', () => {
    const said = threeByTwelve([[280], [250]])
    expect(said).toContain('Intervall 3 nicht gefahren.')
    expect(said).toContain('Intervall 2 unter dem Korridor.')
  })
})

describe('an easy session', () => {
  it('says so when it stayed easy', () => {
    expect(endurance(() => 190)).toContain('Locker geblieben, wie geplant.')
  })

  it('says how long it ran too hard, and where easy ends', () => {
    const said = endurance(() => 230).join(' ')
    expect(said).toContain('Locker geplant, aber 75 min über 213 W.')
    expect(said).toContain('nächstes Mal unter 213 W bleiben')
  })

  it('lets a hill or two pass', () => {
    // Five minutes above easy in seventy-five are a climb, not a session ridden too hard.
    expect(endurance((second) => (second < 300 ? 260 : 190))).toContain('Locker geblieben, wie geplant.')
  })
})

describe('a long aerobic session', () => {
  it('reads a heart rate that drifts away from the power as decoupling', () => {
    const said = endurance(
      () => 190,
      (second) => (second < 2550 ? 130 : 140),
    ).join(' ')
    expect(said).toMatch(/Entkopplung [67]\.\d %: In der zweiten Hälfte kostete dieselbe Leistung mehr Puls/)
  })

  it('says the base carries the duration when they stay together', () => {
    const said = endurance(
      () => 190,
      () => 135,
    ).join(' ')
    expect(said).toContain('Entkopplung 0.0 %: Puls und Leistung blieben beieinander.')
  })

  it('says nothing about decoupling without a heart rate', () => {
    expect(endurance(() => 190).join(' ')).not.toContain('Entkopplung')
  })
})

describe('a shortened session', () => {
  it('says what was done and that the plan does not chase the rest', () => {
    const said = endurance(() => 190, () => null, 2400, 30).join(' ')
    expect(said).toContain('40 statt 75 min, 30 statt 55 TSS.')
    expect(said).toContain('Die fehlende Zeit holt der Plan nicht nach')
  })

  it('says nothing of the kind for a full session', () => {
    expect(endurance(() => 190).join(' ')).not.toContain('statt')
  })
})
