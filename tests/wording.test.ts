import { describe, expect, it } from 'vitest'
import { formNote, signed } from '../src/coach/wording.ts'
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
