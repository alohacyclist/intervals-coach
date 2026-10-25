import { describe, expect, it } from 'vitest'
import { buildHistory } from '../src/coach/adherence.ts'
import { completedFrom, sessionName } from '../src/coach/done.ts'
import type { Completion } from '../src/coach/progression.ts'
import { activity, plannedEvent, TODAY } from './fixtures.ts'

const recognisedAs = (activityId: string, templateId: string): Completion => ({
  templateId,
  date: TODAY,
  compliance: null,
  activityId,
  variant: 'full',
  evidence: 'exact',
})

describe('the name a done session shows', () => {
  it('names the session recognised, not the one intervals.icu paired and named it after', () => {
    expect(sessionName('Locker 40min + Steigerungen', 'run-thr-short-3x1k')).toBe('Schwelle kompakt 3x1km')
  })

  it('keeps a name the athlete gave', () => {
    expect(sessionName('Morgenlauf an der Alster', 'run-thr-short-3x1k')).toBe('Morgenlauf an der Alster')
  })

  it('keeps the name of a shortened push of the session recognised', () => {
    expect(sessionName('Schwelle kompakt 3x1km (30 min)', 'run-thr-short-3x1k')).toBe('Schwelle kompakt 3x1km (30 min)')
  })

  it('keeps the name when nothing was recognised', () => {
    expect(sessionName('Locker 40min + Steigerungen', null)).toBe('Locker 40min + Steigerungen')
  })

  it('shows on the done card and in the history strip alike', () => {
    const run = activity(0, 'Run', { load: 43, name: 'Locker 40min + Steigerungen' })
    const completions = [recognisedAs(run.id, 'run-thr-short-3x1k')]
    expect(completedFrom([run], completions)[0]?.name).toBe('Schwelle kompakt 3x1km')
    const event = plannedEvent(0, 'Locker 40min + Steigerungen')
    const today = buildHistory([event], [{ ...run, pairedEventId: event.id }], TODAY, 1, [], completions)[0]
    expect(today?.completed).toBe('Schwelle kompakt 3x1km')
  })
})
