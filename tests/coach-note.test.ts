import { describe, expect, it } from 'vitest'
import { buildSession, personalNote } from '../src/coach/session.ts'
import { findTemplate } from '../src/coach/library.ts'
import type { WorkoutTemplate } from '../src/coach/types.ts'
import { config, TODAY } from './fixtures.ts'

const threshold3x12 = findTemplate('bike-thr-3x12') as WorkoutTemplate

describe('the coach note in the athlete’s terms', () => {
  it('names the athlete’s own FTP goal', () => {
    const session = buildSession(threshold3x12, config, 'Grund', TODAY)
    expect(session.template.coachNote).toBe('Brot-und-Butter für FTP 300. Zielbereich exakt halten, nicht überziehen.')
    expect(session.description).toContain('Brot-und-Butter für FTP 300.')
  })

  it('names someone else’s goal for someone else', () => {
    const other = { ...config, goals: config.goals.map((goal) => (goal.kind === 'ftp' ? { ...goal, targetValue: 220 } : goal)) }
    expect(personalNote(threshold3x12.coachNote, other, TODAY)).toContain('für FTP 220.')
  })

  it('speaks of the threshold where no watt goal is set, or it has passed', () => {
    const none = { ...config, goals: config.goals.filter((goal) => goal.kind !== 'ftp') }
    expect(personalNote(threshold3x12.coachNote, none, TODAY)).toContain('für die Schwelle.')
    expect(personalNote(threshold3x12.coachNote, config, '2027-01-15')).toContain('für die Schwelle.')
  })

  it('leaves the library untouched', () => {
    buildSession(threshold3x12, config, 'Grund', TODAY)
    expect(findTemplate('bike-thr-3x12')?.coachNote).toContain('{ftp-ziel}')
  })
})
