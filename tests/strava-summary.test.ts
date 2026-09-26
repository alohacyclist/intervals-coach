import { describe, expect, it } from 'vitest'
import { SIGNATURE, findStravaMatch, sparkline, summaryOf, withSummary } from '../src/coach/strava-summary.ts'
import { compareExecution } from '../src/coach/execution.ts'
import type { ActualInterval } from '../src/coach/execution.ts'
import { findTemplate } from '../src/coach/library.ts'
import { buildTrace } from '../src/coach/trace.ts'
import type { Execution, SportThreshold, WorkoutTemplate } from '../src/coach/types.ts'

const FTP: SportThreshold = { metric: 'power', ftp: 280 }
const template = findTemplate('bike-thr-3x12') as WorkoutTemplate

const placed = (from: number, watts: number, heart: number): ActualInterval => ({
  kind: 'work',
  seconds: 720,
  averageWatts: watts,
  averageSpeedMps: null,
  averageHeartrate: heart,
  startSeconds: from,
  endSeconds: from + 720,
})

const session = (intervals: readonly ActualInterval[], withTrace = true): Execution =>
  compareExecution({
    activityId: 'i1',
    sport: 'Ride',
    template,
    blocks: template.blocks,
    threshold: FTP,
    intervals,
    load: 83,
    movingSeconds: 4000,
    compliance: null,
    trace: withTrace
      ? buildTrace(
          {
            time: Array.from({ length: 4000 }, (_, second) => second),
            watts: Array.from({ length: 4000 }, (_, second) => (second >= 900 && second % 1020 < 720 ? 280 : 150)),
            speed: null,
            heartRate: null,
          },
          FTP,
        )
      : null,
  })

const threeDone = session([placed(900, 280, 152), placed(1920, 280, 160), placed(2940, 250, 167)])

describe('the text under a session on Strava', () => {
  it('leads with the verdicts, draws the session and signs it', () => {
    const lines = summaryOf(threeDone, 'https://coach.example').split('\n')
    expect(lines[0]).toBe(`${template.name} · 2 von 3 im Ziel ✓✓↓`)
    expect(lines[1]).toMatch(/^[▁▂▃▄▅▆▇█ ]{24}$/)
    expect(lines[2]).toBe('Im Ziel 24:00 von 36:00 · 83 TSS')
    expect(lines[3]).toBe(`— ${SIGNATURE} · https://coach.example`)
  })

  it('never names the heart rate, which Strava lets the athlete hide', () => {
    expect(summaryOf(threeDone, null)).not.toMatch(/Puls|♥|152|167/)
  })

  it('leaves the drawing out when there was no stream, and the link when none is known', () => {
    const text = summaryOf(session([placed(900, 280, 150)], false), null)
    expect(text).not.toMatch(/[▁▂▃▄▅▆▇█]/)
    expect(text.endsWith(SIGNATURE)).toBe(true)
  })

  it('draws the intervals higher than the recoveries between them', () => {
    const line = sparkline(threeDone) as string
    const levels = [...line].map((char) => '▁▂▃▄▅▆▇█'.indexOf(char))
    expect(Math.max(...levels)).toBeGreaterThan(levels[0]!)
  })
})

describe('writing it into the description', () => {
  const summary = `Schwelle · 3 von 3 im Ziel ✓✓✓\n— ${SIGNATURE}`

  it('keeps what the athlete wrote and adds the summary below', () => {
    expect(withSummary('Beine schwer, Wind von vorn.', summary)).toBe(`Beine schwer, Wind von vorn.\n\n${summary}`)
    expect(withSummary(null, summary)).toBe(summary)
  })

  it('replaces its own earlier paragraph instead of adding a second one', () => {
    const before = withSummary('Gut gelaufen.', `Alt · 1 von 3 im Ziel\n— ${SIGNATURE}`)
    expect(withSummary(before, summary)).toBe(`Gut gelaufen.\n\n${summary}`)
  })

  it('also replaces a paragraph written under the earlier name', () => {
    const before = 'Gut gelaufen.\n\nAlt · 1 von 3 im Ziel\n— geplant und ausgewertet mit intervals-coach'
    expect(withSummary(before, summary)).toBe(`Gut gelaufen.\n\n${summary}`)
  })
})

describe('finding the same session on Strava', () => {
  const candidates = [
    { id: '1', sportType: 'Run', startDate: '2026-09-24T17:00:05Z' },
    { id: '2', sportType: 'VirtualRide', startDate: '2026-09-24T17:00:40Z' },
    { id: '3', sportType: 'Ride', startDate: '2026-09-24T17:08:00Z' },
  ]

  it('takes the closest start of the same sport', () => {
    expect(findStravaMatch(candidates, '2026-09-24T17:00:00Z', 'Ride')?.id).toBe('2')
    expect(findStravaMatch(candidates, '2026-09-24T17:00:00Z', 'Run')?.id).toBe('1')
  })

  it('finds nothing when no start lies within ten minutes', () => {
    expect(findStravaMatch(candidates, '2026-09-24T18:00:00Z', 'Ride')).toBeNull()
    expect(findStravaMatch(candidates, 'kein Datum', 'Ride')).toBeNull()
  })
})
