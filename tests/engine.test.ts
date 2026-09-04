import { describe, expect, it } from 'vitest'
import { planDays } from '../src/coach/engine.ts'
import { buildState } from '../src/coach/state.ts'
import { intensityClass } from '../src/coach/library.ts'
import {
  BIKE_THRESHOLD,
  RUN_THRESHOLD,
  SWIM_THRESHOLD,
  activity,
  baselineWellness,
  config,
  triConfig,
  TODAY,
  wellness,
} from './fixtures.ts'

const stateFrom = (
  activities: Parameters<typeof buildState>[0],
  wellnessEntries: Parameters<typeof buildState>[1] = [wellness(0), ...baselineWellness()],
) => buildState(activities, wellnessEntries, TODAY)

const rested = [activity(9, 'Ride', { load: 60, intensity: 70 }), activity(11, 'Run', { load: 50, intensity: 70 })]

describe('plan engine', () => {
  it('always offers exactly one bike and one run option per day', () => {
    const days = planDays(stateFrom(rested), config, 3)
    expect(days).toHaveLength(3)
    for (const day of days) {
      expect(day.options.map((option) => option.sport).sort()).toEqual(['Ride', 'Run'])
    }
  })

  it('schedules quality when rested and the week is still empty', () => {
    const [today] = planDays(stateFrom(rested), config)
    expect(today?.dayType).toBe('KEY')
    expect(today?.options.every((option) => intensityClass(option.template.stimulus) === 'hard')).toBe(true)
  })

  it('never follows a hard day with another hard day', () => {
    const yesterdayHard = [activity(1, 'Ride', { load: 90, intensity: 98 })]
    const [today] = planDays(stateFrom(yesterdayHard), config)
    expect(today?.dayType).not.toBe('KEY')
    expect(today?.options.every((option) => intensityClass(option.template.stimulus) !== 'hard')).toBe(true)
  })

  it('never plans two hard days back to back inside the three day view', () => {
    const days = planDays(stateFrom(rested), config, 3)
    const hardDays = days.map((day) => day.dayType === 'KEY')
    expect(hardDays.filter(Boolean).length).toBeGreaterThan(0)
    for (let index = 1; index < hardDays.length; index += 1) {
      expect(hardDays[index] && hardDays[index - 1]).toBeFalsy()
    }
  })

  it('drops to recovery when readiness is red', () => {
    const sick = [wellness(0, { hrv: 30, restingHr: 62, fatigue: 4 }), ...baselineWellness()]
    const [today] = planDays(stateFrom(rested, sick), config)
    expect(['RECOVERY', 'REST']).toContain(today?.dayType)
    expect(today?.options.every((option) => intensityClass(option.template.stimulus) === 'easy')).toBe(true)
  })

  it('respects the weekly hard budget', () => {
    // Both on the same day, so the 48h spacing rule stays satisfied.
    const roomy = { ...config, profile: { ...config.profile, weeklySessions: { min: 2, max: 5 } } }
    const busyWeek = [
      activity(2, 'Ride', { load: 90, intensity: 98 }),
      activity(2, 'Run', { load: 80, intensity: 96 }),
    ]
    const [today] = planDays(stateFrom(busyWeek), roomy)
    expect(today?.dayType).toBe('EASY')
    expect(today?.notes.join(' ')).toContain('Wochenbudget')
  })

  it('plans a rest day once the weekly session ceiling is reached', () => {
    const fullWeek = [
      activity(0, 'Ride', { load: 60, intensity: 70 }),
      activity(1, 'Run', { load: 55, intensity: 70 }),
      activity(2, 'Ride', { load: 70, intensity: 75 }),
    ]
    const [today] = planDays(stateFrom(fullWeek), config)
    expect(today?.dayType).toBe('REST')
    expect(today?.recommended).toBe('REST')
    expect(today?.notes.join(' ')).toContain('Wochenpensum erfüllt (3 von 3)')
  })

  it('rests rather than adding volume after a hard day once the minimum is met', () => {
    const minimumMet = [
      activity(1, 'Ride', { load: 90, intensity: 98 }),
      activity(2, 'Run', { load: 50, intensity: 70 }),
    ]
    const [today] = planDays(stateFrom(minimumMet), config)
    expect(today?.dayType).toBe('REST')
    expect(today?.notes.join(' ')).toContain('Mindestpensum erfüllt')
  })

  it('rests after a hard day while the week still has room for the minimum', () => {
    const [today] = planDays(stateFrom([activity(1, 'Ride', { load: 90, intensity: 98 })]), config)
    expect(today?.dayType).toBe('REST')
    expect(today?.notes.join(' ')).toContain('Pause nach harter Einheit')
  })

  it('falls back to an easy session on the last day of an unfinished week', () => {
    const sunday = '2026-09-06'
    const saturdayHard = { ...activity(0, 'Ride', { load: 90, intensity: 98 }), date: '2026-09-05' }
    const [today] = planDays(buildState([saturdayHard], [], sunday), config)
    expect(today?.dayType).toBe('EASY')
    expect(today?.notes.join(' ')).toContain('Woche läuft aus')
  })

  it('still shows two easy options on a rest day', () => {
    const fullWeek = [
      activity(0, 'Ride', { load: 60, intensity: 70 }),
      activity(1, 'Run', { load: 55, intensity: 70 }),
      activity(2, 'Ride', { load: 70, intensity: 75 }),
    ]
    const [today] = planDays(stateFrom(fullWeek), config)
    expect(today?.options).toHaveLength(2)
    expect(today?.options.every((option) => intensityClass(option.template.stimulus) === 'easy')).toBe(true)
  })

  it('recommends the sport that has had no quality session this week', () => {
    const bikeOnly = [activity(2, 'Ride', { load: 90, intensity: 98 })]
    const [today] = planDays(stateFrom(bikeOnly), config)
    expect(today?.recommended).toBe('Run')
  })

  it('never proposes a session longer than the time budget', () => {
    const short = { ...config, profile: { ...config.profile, maxSessionMinutes: 50 } }
    const days = planDays(stateFrom(rested), short, 3)
    for (const day of days) {
      for (const option of day.options) {
        expect(option.template.minutes).toBeLessThanOrEqual(50)
      }
    }
  })

  it('does not repeat the same workout inside the three day view', () => {
    const days = planDays(stateFrom(rested), config, 3)
    const ids = days.flatMap((day) => day.options.map((option) => option.template.id))
    const recommendedIds = days
      .map((day) => day.options.find((option) => option.sport === day.recommended)?.template.id)
      .filter(Boolean)
    expect(new Set(recommendedIds).size).toBe(recommendedIds.length)
    expect(ids.length).toBeGreaterThan(0)
  })

  it('warns while the week is below the athletes minimum session count', () => {
    const [today] = planDays(stateFrom(rested), config)
    expect(today?.notes.join(' ')).toContain('von mindestens 2 Einheiten')
  })

  it('drops the warning once the minimum is met', () => {
    const met = [activity(0, 'Ride', { load: 55, intensity: 70 }), activity(1, 'Run', { load: 50, intensity: 70 })]
    const [today] = planDays(stateFrom(met), config)
    expect(today?.notes.join(' ')).not.toContain('von mindestens')
  })

  it('carries a workout description in intervals.icu syntax', () => {
    const [today] = planDays(stateFrom(rested), config)
    expect(today?.options[0]?.description).toMatch(/^- /m)
    expect(today?.options[0]?.description).toContain('Warum heute')
  })
})

describe('sport roles and returning to training', () => {
  // A goal eight weeks out puts both sports into the build phase, where the
  // VO2max and threshold templates actually live.
  const buildPhase = {
    ...config,
    goals: config.goals.map((goal) => ({ ...goal, targetDate: '2026-10-28' })),
  }

  const optionFor = (day: ReturnType<typeof planDays>[number] | undefined, sport: 'Ride' | 'Run') =>
    day?.options.find((option) => option.sport === sport)

  it('gives running the VO2max work and cycling the threshold work', () => {
    const [today] = planDays(stateFrom(rested), buildPhase)
    expect(today?.dayType).toBe('KEY')
    expect(optionFor(today, 'Run')?.template.stimulus).toBe('VO2')
    expect(optionFor(today, 'Ride')?.template.stimulus).toBe('THRESHOLD')
  })

  it('treats the role as a preference, not a rule', () => {
    // VO2max already run two days ago, so the rotation moves running on.
    const recentRunVo2 = [activity(2, 'Run', { load: 75, intensity: 105 })]
    const [today] = planDays(stateFrom(recentRunVo2), buildPhase)
    expect(optionFor(today, 'Run')?.template.stimulus).not.toBe('VO2')
  })

  it('does not open with VO2max after a long break', () => {
    const longGap = [activity(21, 'Ride', { load: 70, intensity: 80 })]
    const [today] = planDays(stateFrom(longGap), buildPhase)
    expect(today?.options.every((option) => option.template.stimulus !== 'VO2')).toBe(true)
    expect(today?.notes.join(' ')).toContain('ohne Training')
  })

  it('puts strength on hard days only', () => {
    const days = planDays(stateFrom(rested), buildPhase, 3)
    for (const day of days) {
      expect(day.strength === null).toBe(day.dayType !== 'KEY')
    }
  })

  it('stops suggesting strength once the week already holds two sessions', () => {
    const withStrength = [
      ...rested,
      { ...activity(1, 'Ride', { load: 30, intensity: 50 }), isStrength: true },
      { ...activity(2, 'Ride', { load: 30, intensity: 50 }), isStrength: true },
    ]
    const [today] = planDays(stateFrom(withStrength), buildPhase)
    expect(today?.strength).toBeNull()
  })
})

describe('sport selection', () => {
  it('offers one option per chosen sport', () => {
    const days = planDays(stateFrom(rested), triConfig, 3)
    for (const day of days) {
      expect(day.options.map((option) => option.sport).sort()).toEqual(['Ride', 'Run', 'Swim'])
    }
  })

  it('plans for a single sport without falling over', () => {
    const runOnly = {
      ...config,
      profile: { ...config.profile, sports: [{ sport: 'Run' as const, threshold: RUN_THRESHOLD }] },
    }
    const days = planDays(stateFrom(rested), runOnly, 3)
    for (const day of days) {
      expect(day.options.map((option) => option.sport)).toEqual(['Run'])
    }
    expect(days.some((day) => day.dayType === 'KEY')).toBe(true)
  })

  it('never recommends a sport the athlete does not train', () => {
    const swimBike = {
      ...config,
      profile: {
        ...config.profile,
        sports: [
          { sport: 'Ride' as const, threshold: BIKE_THRESHOLD },
          { sport: 'Swim' as const, threshold: SWIM_THRESHOLD },
        ],
      },
    }
    const days = planDays(stateFrom(rested), swimBike, 3)
    for (const day of days) {
      expect(['Ride', 'Swim', 'REST']).toContain(day.recommended)
    }
  })

  it('spreads quality across the sports that have had none this week', () => {
    const bikeOnly = [activity(2, 'Ride', { load: 90, intensity: 98 })]
    const [today] = planDays(stateFrom(bikeOnly), triConfig)
    expect(today?.recommended).not.toBe('Ride')
  })

  it('renders swim steps in metres and per 100 m', () => {
    const days = planDays(stateFrom(rested), triConfig, 3)
    const swim = days.flatMap((day) => day.options).find((option) => option.sport === 'Swim')
    expect(swim?.humanSteps.join(' ')).toContain('/100m')
  })
})

describe('runs of rest days', () => {
  const fullWeek = [
    activity(0, 'Ride', { load: 60, intensity: 70 }),
    activity(1, 'Run', { load: 55, intensity: 70 }),
    activity(2, 'Ride', { load: 70, intensity: 75 }),
  ]

  it('never plans three rest days in a row', () => {
    const days = planDays(stateFrom(fullWeek), config, 5)
    const rest = days.map((day) => day.dayType === 'REST')
    for (let index = 2; index < rest.length; index += 1) {
      expect(rest[index] && rest[index - 1] && rest[index - 2]).toBeFalsy()
    }
  })

  it('replaces the third rest day with a light session', () => {
    const days = planDays(stateFrom(fullWeek), config, 5)
    const third = days.find((day) => day.notes.join(' ').includes('Ruhetage in Folge'))
    expect(third?.dayType).toBe('EASY')
    expect(third?.options.every((option) => intensityClass(option.template.stimulus) !== 'hard')).toBe(true)
  })

  it('keeps resting when the athlete is not recovered', () => {
    const drained = [
      activity(0, 'Ride', { load: 140, intensity: 95 }),
      activity(1, 'Ride', { load: 140, intensity: 95 }),
      activity(2, 'Ride', { load: 140, intensity: 95 }),
      activity(3, 'Ride', { load: 140, intensity: 95 }),
    ]
    const days = planDays(stateFrom(drained), config, 4)
    expect(days.every((day) => day.dayType !== 'KEY')).toBe(true)
  })

  it('counts rest days that already happened before today', () => {
    // Last session six days ago, so today is already the sixth rest day.
    const stale = [activity(6, 'Ride', { load: 60, intensity: 70 })]
    const [today] = planDays(stateFrom(stale), config)
    expect(today?.dayType).not.toBe('REST')
  })
})
