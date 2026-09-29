import { describe, expect, it } from 'vitest'
import { formNote, signed, todaySummary } from '../src/coach/wording.ts'
import { planDays } from '../src/coach/engine.ts'
import { buildState } from '../src/coach/state.ts'
import { activity, baselineWellness, config, TODAY, wellness } from './fixtures.ts'

const STIMULUS_ENUMS = ['VO2', 'THRESHOLD', 'SWEETSPOT', 'TEMPO', 'NEURO', 'ENDURANCE', 'LONG', 'RECOVERY']

describe('signed', () => {
  it('writes a real minus, a plus above zero and a bare zero', () => {
    expect(signed(-12)).toBe('−12')
    expect(signed(8)).toBe('+8')
    expect(signed(0)).toBe('0')
  })
})

describe('formNote', () => {
  it('leads with a sentence and keeps the numbers in brackets', () => {
    expect(formNote({ tsb: -12, ctl: 45, atl: 57 })).toBe(
      'Du trägst etwas Ermüdung mit, das gehört zum Training (Form −12, Fitness 45, Ermüdung 57).',
    )
  })

  it('rounds the projected decimals of a later day', () => {
    expect(formNote({ tsb: -1.9, ctl: 2.1, atl: 3.5 })).toContain('(Form \u22122, Fitness 2, Ermüdung 4)')
  })

  it.each([
    [15, 'Du bist ausgeruht'],
    [0, 'Belastung und Erholung halten sich die Waage'],
    [-10, 'Belastung und Erholung halten sich die Waage'],
    [-20, 'Du bist deutlich ermüdet'],
    [-31, 'Du bist überlastet'],
  ])('describes form %i as "%s"', (tsb, words) => {
    expect(formNote({ tsb, ctl: 40, atl: 40 }).startsWith(words)).toBe(true)
  })
})

describe('todaySummary', () => {
  const base = { readiness: 'green', tsb: 8, dayType: 'KEY', trained: false } as const

  it('lets a rested athlete go hard', () => {
    expect(todaySummary(base)).toBe('Du bist erholt – heute darf es hart sein.')
  })

  it('does not call a slightly tired athlete rested on a quality day', () => {
    expect(todaySummary({ ...base, tsb: -5 })).toBe('Du bist bereit – heute darf es hart sein.')
  })

  it('warns on a hard day chosen against amber or red readiness', () => {
    expect(todaySummary({ ...base, readiness: 'amber' })).toContain('Warnsignale')
    expect(todaySummary({ ...base, readiness: 'red' })).toContain('schwach')
  })

  it('names tiredness on an easy day only when the form says so', () => {
    expect(todaySummary({ ...base, dayType: 'EASY', tsb: -20 })).toBe('Du bist müde vom Training – heute locker.')
    expect(todaySummary({ ...base, dayType: 'EASY', tsb: 0 })).toContain('Heute locker')
    expect(todaySummary({ ...base, dayType: 'EASY', readiness: 'amber' })).toContain('Erholungswerte')
  })

  it('explains recovery and rest days', () => {
    expect(todaySummary({ ...base, dayType: 'RECOVERY', tsb: -35 })).toContain('stark ermüdet')
    expect(todaySummary({ ...base, dayType: 'RECOVERY' })).toContain('Regeneration hat Vorrang')
    expect(todaySummary({ ...base, dayType: 'REST' })).toBe('Heute ist Pause – Erholung gehört zum Training.')
    expect(todaySummary({ ...base, dayType: 'REST', readiness: 'red' })).toContain('braucht Erholung')
  })

  it('says a trained day is done whatever the plan was', () => {
    expect(todaySummary({ ...base, trained: true })).toContain('schon trainiert')
  })

  it('is one sentence for every combination', () => {
    for (const readiness of ['green', 'amber', 'red'] as const) {
      for (const dayType of ['KEY', 'EASY', 'RECOVERY', 'REST'] as const) {
        for (const tsb of [20, 0, -20, -40]) {
          const sentence = todaySummary({ readiness, tsb, dayType, trained: false })
          expect(sentence.endsWith('.')).toBe(true)
          expect(sentence.split('. ')).toHaveLength(1)
        }
      }
    }
  })
})

describe('engine texts', () => {
  const rested = [
    activity(9, 'Ride', { load: 60, intensity: 70 }),
    activity(11, 'Run', { load: 50, intensity: 70 }),
  ]
  const days = planDays(buildState(rested, [wellness(0), ...baselineWellness()], TODAY), config, 3)

  it('names stimuli in German, never by their code names', () => {
    const reasons = days.flatMap((day) => day.options.map((option) => option.reason))
    expect(reasons.length).toBeGreaterThan(0)
    for (const reason of reasons) {
      for (const code of STIMULUS_ENUMS) expect(reason).not.toContain(`${code}-Reiz`)
      expect(reason).not.toMatch(/\b[A-Z]{3,}\b(?!max)/)
    }
  })

  it('writes the form note as a sentence with the numbers in brackets', () => {
    const note = days[0]?.notes.find((entry) => entry.includes('Fitness'))
    expect(note).toMatch(/^[A-ZÄÖÜ][^(]+ \(Form [−+]?\d+, Fitness \d+, Ermüdung \d+\)\.$/)
  })
})
