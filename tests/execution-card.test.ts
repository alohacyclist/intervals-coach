import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ExecutionView } from '../src/ui/components/ExecutionCard.tsx'
import { compareExecution } from '../src/coach/execution.ts'
import type { ActualInterval } from '../src/coach/execution.ts'
import { findTemplate } from '../src/coach/library.ts'
import { buildTrace } from '../src/coach/trace.ts'
import type { SportThreshold, WorkoutTemplate } from '../src/coach/types.ts'

const workAt = (seconds: number, speed: number | null, watts: number | null): ActualInterval => ({
  kind: 'work',
  seconds,
  averageWatts: watts,
  averageSpeedMps: speed,
  averageHeartrate: null,
  startSeconds: null,
  endSeconds: null,
})

/** One interval left undone, so the card has to say in which way it was not done. */
const rendered = (templateId: string, threshold: SportThreshold, done: ActualInterval) => {
  const template = findTemplate(templateId) as WorkoutTemplate
  const execution = compareExecution({
    activityId: 'a1',
    sport: template.sport,
    template,
    blocks: template.blocks,
    threshold,
    intervals: [done],
    load: 40,
    movingSeconds: 2400,
    compliance: null,
    trace: null,
  })
  return renderToStaticMarkup(createElement(ExecutionView, { execution }))
}

describe('the comparison speaks the sport it is about', () => {
  it('says a run was not run, never that it was not ridden', () => {
    const html = rendered('run-thr-5x1k', { metric: 'pace', thresholdSecPerKm: 240 }, workAt(240, 1000 / 238, null))
    expect(html).toContain('nicht gelaufen')
    expect(html).not.toContain('gefahren')
  })

  it('says a ride was not ridden', () => {
    const html = rendered('bike-thr-3x12', { metric: 'power', ftp: 280 }, workAt(720, null, 280))
    expect(html).toContain('nicht gefahren')
    expect(html).not.toContain('gelaufen')
  })

  it('says a swim was not swum', () => {
    const html = rendered('swim-thr-10x100', { metric: 'swimPace', cssSecPer100m: 100 }, workAt(100, 1, null))
    expect(html).toContain('nicht geschwommen')
    expect(html).not.toMatch(/gefahren|gelaufen/)
  })
})

describe('the session drawn over time', () => {
  const template = findTemplate('bike-thr-3x12') as WorkoutTemplate
  const FTP: SportThreshold = { metric: 'power', ftp: 280 }
  const placed = (from: number, watts: number): ActualInterval => ({
    ...workAt(720, null, watts),
    averageHeartrate: 160,
    startSeconds: from,
    endSeconds: from + 720,
  })
  const trace = buildTrace(
    {
      time: Array.from({ length: 4000 }, (_, second) => second),
      watts: Array.from({ length: 4000 }, (_, second) => (second % 1020 < 720 ? 280 : 150)),
      speed: null,
      heartRate: Array(4000).fill(150),
    },
    FTP,
  )
  const view = (intervals: readonly ActualInterval[]) =>
    renderToStaticMarkup(
      createElement(ExecutionView, {
        execution: compareExecution({
          activityId: 'a1',
          sport: 'Ride',
          template,
          blocks: template.blocks,
          threshold: FTP,
          intervals,
          load: 80,
          movingSeconds: 4000,
          compliance: null,
          trace,
        }),
      }),
    )

  it('draws the line over the corridors, each labelled with its verdict', () => {
    const html = view([placed(0, 280), placed(1020, 305), placed(2040, 280)])
    expect(html).toContain('class="trace"')
    expect(html).toContain('100 % ✓')
    expect(html).toContain('109 % ↑')
    expect(html).toContain('Leistung, 10-s-Mittel')
    expect(html).not.toContain('exec__strip')
  })

  it('names an interval that was not done, since it has no place on the clock', () => {
    const html = view([placed(0, 280), placed(1020, 280)])
    expect(html).toContain('Nicht gefahren: Intervall 3.')
  })

  it('keeps the strip when intervals.icu gave no positions for what was done', () => {
    const html = view([workAt(720, null, 280), workAt(720, null, 280), workAt(720, null, 280)])
    expect(html).toContain('exec__strip')
    expect(html).not.toContain('class="trace"')
  })
})
