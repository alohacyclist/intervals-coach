import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ExecutionView } from '../src/ui/components/ExecutionCard.tsx'
import { compareExecution } from '../src/coach/execution.ts'
import type { ActualInterval } from '../src/coach/execution.ts'
import { findTemplate } from '../src/coach/library.ts'
import type { SportThreshold, WorkoutTemplate } from '../src/coach/types.ts'

const workAt = (seconds: number, speed: number | null, watts: number | null): ActualInterval => ({
  kind: 'work',
  seconds,
  averageWatts: watts,
  averageSpeedMps: speed,
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
