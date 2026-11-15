import { describe, expect, it } from 'vitest'
import { figuresOf } from '../src/ui/share-image.ts'
import { compareExecution } from '../src/coach/execution.ts'
import { findTemplate } from '../src/coach/library.ts'
import { inLang } from '../src/coach/lang.ts'
import type { ActualInterval } from '../src/coach/execution.ts'
import type { Execution, WorkoutTemplate } from '../src/coach/types.ts'

const template = findTemplate('bike-thr-3x12') as WorkoutTemplate
const interval = (from: number): ActualInterval => ({
  kind: 'work',
  seconds: 720,
  averageWatts: 280,
  averageSpeedMps: null,
  averageHeartrate: 160,
  startSeconds: from,
  endSeconds: from + 720,
})
const ridden: Execution = compareExecution({
  activityId: 'i1',
  sport: 'Ride',
  template,
  blocks: template.blocks,
  threshold: { metric: 'power', ftp: 280 },
  intervals: [interval(900), interval(1920), interval(2940)],
  load: 83,
  movingSeconds: 4000,
  compliance: null,
  trace: null,
})
const labels = (execution: Execution, language: 'de' | 'en') =>
  inLang(language, () => figuresOf(execution).map(([label]) => label))

describe('the figures on a shared picture', () => {
  it('names them in English for an athlete who reads English', () => {
    expect(labels(ridden, 'en')).toEqual(['RIDDEN', 'ON TARGET', 'LOAD'])
    expect(labels({ ...ridden, steps: [] }, 'en')).toEqual(['DURATION', 'LOAD'])
  })

  it('keeps the German labels in German', () => {
    expect(labels(ridden, 'de')).toEqual(['GEFAHREN', 'IM ZIEL', 'BELASTUNG'])
  })
})
