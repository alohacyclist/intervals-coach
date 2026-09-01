import { describe, expect, it } from 'vitest'
import { buildState, stimulusRecency } from '../src/coach/state.ts'
import { activity, baselineWellness, TODAY, wellness } from './fixtures.ts'

describe('training state', () => {
  it('tracks days since the last hard session per sport', () => {
    const state = buildState(
      [activity(2, 'Ride', { intensity: 98 }), activity(6, 'Run', { intensity: 97 })],
      [],
      TODAY,
    )
    expect(state.daysSinceHard.Ride).toBe(2)
    expect(state.daysSinceHard.Run).toBe(6)
  })

  it('reports 99 when a sport has never been trained hard', () => {
    expect(buildState([activity(2, 'Ride', { intensity: 60, load: 30 })], [], TODAY).daysSinceHard.Ride).toBe(99)
  })

  it('counts hard sessions inside the current calendar week only', () => {
    const state = buildState(
      [activity(0, 'Ride', { intensity: 98 }), activity(8, 'Ride', { intensity: 98 })],
      [],
      TODAY,
    )
    expect(state.hardSessionsThisWeek).toBe(1)
    expect(state.hardThisWeekBySport.Ride).toBe(1)
  })

  it('keeps only the freshest occurrence of each stimulus', () => {
    const recency = stimulusRecency(
      [activity(2, 'Ride', { intensity: 98 }), activity(9, 'Ride', { intensity: 98 })],
      TODAY,
    )
    expect(recency).toEqual([{ sport: 'Ride', stimulus: 'THRESHOLD', daysAgo: 2 }])
  })

  it('ignores future dated activities', () => {
    expect(stimulusRecency([activity(-3, 'Run', { intensity: 98 })], TODAY)).toEqual([])
  })

  it('reports the newest past activity so stale data is visible', () => {
    const state = buildState([activity(5, 'Ride'), activity(1, 'Run'), activity(9, 'Ride')], [], TODAY)
    expect(state.lastActivity?.daysAgo).toBe(1)
    expect(state.lastActivity?.sport).toBe('Run')
    expect(state.activityCount).toBe(3)
  })

  it('ignores future activities when picking the newest', () => {
    const state = buildState([activity(-2, 'Ride'), activity(3, 'Run')], [], TODAY)
    expect(state.lastActivity?.daysAgo).toBe(3)
  })

  it('reports no activity when the history is empty', () => {
    expect(buildState([], [], TODAY).lastActivity).toBeNull()
  })

  it('includes readiness derived from wellness', () => {
    const state = buildState([], [wellness(0), ...baselineWellness()], TODAY)
    expect(state.readiness.score).toBe('green')
  })
})

describe('noise from auto-detected activities', () => {
  it('prefers the session with load over a zero load entry on the same day', () => {
    const state = buildState(
      [
        activity(1, 'Run', { name: '', load: 0, intensity: 0 }),
        activity(1, 'Ride', { name: 'Schwelle 3x12min', load: 88, intensity: 95 }),
      ],
      [],
      TODAY,
    )
    expect(state.lastActivity?.name).toBe('Schwelle 3x12min')
    expect(state.lastActivity?.load).toBe(88)
  })

  it('counts loaded entries separately from everything returned', () => {
    const state = buildState(
      [activity(1, 'Ride', { load: 80 }), activity(2, 'Other' as 'Ride', { load: 0 }), activity(3, 'Run', { load: 0 })],
      [],
      TODAY,
    )
    expect(state.activityCount).toBe(3)
    expect(state.loadedActivityCount).toBe(1)
  })

  it('still reports something when nothing carries load', () => {
    const state = buildState([activity(2, 'Run', { load: 0 })], [], TODAY)
    expect(state.lastActivity?.daysAgo).toBe(2)
    expect(state.loadedActivityCount).toBe(0)
  })

  it('keeps zero load entries out of the stimulus rotation', () => {
    expect(stimulusRecency([activity(1, 'Ride', { load: 0, intensity: 0 })], TODAY)).toEqual([])
  })
})
