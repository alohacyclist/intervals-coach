import { describe, expect, it } from 'vitest'
import { planDays } from '../src/coach/engine.ts'
import { buildState } from '../src/coach/state.ts'
import { addDays, startOfWeek } from '../src/coach/dates.ts'
import { intensityClass } from '../src/coach/library.ts'
import { completionsFrom } from '../src/coach/progression.ts'
import {
  BIKE_THRESHOLD,
  RUN_THRESHOLD,
  SWIM_THRESHOLD,
  activity,
  baselineWellness,
  plannedEvent,
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

/**
 * Recent thresholds tests for both sports, so the plan prescribes ordinary
 * quality work instead of rightly spending the day measuring.
 */
const measured = ['test-bike-ftp20', 'test-run-thr20'].flatMap((templateId) => {
  const event = plannedEvent(20, templateId, { externalId: `coach:2026-08-01:${templateId}` })
  const act = activity(20, 'Ride', { load: 80, pairedEventId: event.id, compliance: 95 })
  return completionsFrom([event], [act])
})

const withMinutes = (sessionMinutes: { min: number; normal: number; max: number }) => ({
  ...config,
  profile: { ...config.profile, sessionMinutes },
})

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

  it('never proposes a session longer than the athlete has on a good day', () => {
    const tight = withMinutes({ min: 35, normal: 45, max: 50 })
    for (const day of planDays(stateFrom(rested), tight, 3)) {
      for (const option of day.options) {
        expect(option.template.minutes, option.template.id).toBeLessThanOrEqual(50)
        for (const variant of option.variants) {
          expect(variant.minutes, option.template.id).toBeLessThanOrEqual(50)
        }
      }
    }
  })

  it('always has a version for the time that always works', () => {
    const tight = withMinutes({ min: 40, normal: 60, max: 80 })
    for (const day of planDays(stateFrom(rested), tight, 3)) {
      for (const option of day.options) {
        // A reference session is offered whole or not at all, so it is exempt.
        if (option.template.benchmark === true) continue
        const shortest = option.variants[0]?.minutes ?? Infinity
        // Nothing is cut below half of itself, and two versions within twelve
        // minutes of each other collapse into one, so that is the honest floor.
        const floor = Math.max(40, Math.round(option.template.minutes / 2), option.template.minutes - 11)
        expect(shortest, option.template.id).toBeLessThanOrEqual(floor)
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
    const [today] = planDays(stateFrom(rested), buildPhase, 3, measured)
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

  it('breaks the run with whatever the recovery state calls for', () => {
    const days = planDays(stateFrom(fullWeek), config, 5)
    const third = days.find((day) => day.notes.join(' ').includes('Ruhetage in Folge'))
    expect(third?.dayType).not.toBe('REST')
    expect(third?.optional).toBe(true)
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

describe('training beyond the weekly ceiling', () => {
  const fullWeek = [
    activity(0, 'Ride', { load: 60, intensity: 70 }),
    activity(1, 'Run', { load: 55, intensity: 70 }),
    activity(2, 'Ride', { load: 70, intensity: 75 }),
  ]

  it('offers quality once rested, rather than defaulting to easy', () => {
    const days = planDays(stateFrom(fullWeek), config, 5)
    const breaker = days.find((day) => day.optional)
    expect(breaker?.dayType).toBe('KEY')
    expect(breaker?.options.every((option) => intensityClass(option.template.stimulus) === 'hard')).toBe(true)
  })

  it('marks anything past the ceiling as voluntary', () => {
    const days = planDays(stateFrom(fullWeek), config, 5)
    const breaker = days.find((day) => day.optional)
    expect(breaker?.notes.join(' ')).toContain('freiwillig, nicht eingeplant')
  })

  it('keeps days inside the ceiling as plan, not suggestion', () => {
    const days = planDays(stateFrom(rested), config, 3)
    expect(days.every((day) => day.optional === false)).toBe(true)
  })

  it('still respects the hard budget when breaking a rest run', () => {
    // Two genuine quality sessions already done, so the extra day stays easy.
    const spent = [
      activity(2, 'Ride', { load: 90, intensity: 98 }),
      activity(3, 'Run', { load: 85, intensity: 96 }),
      activity(4, 'Ride', { load: 60, intensity: 70 }),
    ]
    const days = planDays(stateFrom(spent), config, 4)
    const breaker = days.find((day) => day.optional)
    if (breaker) expect(breaker.dayType).not.toBe('KEY')
  })
})

describe('levels in the plan', () => {
  const completedOn = (templateId: string, daysAgo: number, id: string) => {
    const event = plannedEvent(daysAgo, id, { externalId: `coach:2026-01-01:${templateId}` })
    const act = activity(daysAgo, 'Ride', { load: 80, pairedEventId: event.id, compliance: 90 })
    return completionsFrom([event], [act])
  }

  // A recent threshold test, so the plan is free to prescribe ordinary quality
  // work rather than spending the day measuring.
  const clearedLevelOne = (templateId: string) => [
    ...completedOn(templateId, 6, 'stufe'),
    ...completedOn('test-bike-ftp20', 20, 'test'),
  ]

  it('offers only the entry level before anything has been completed', () => {
    const days = planDays(stateFrom(rested), config, 3, [])
    const bike = days.flatMap((day) => day.options).filter((option) => option.sport === 'Ride')
    expect(bike.every((option) => (option.template.level ?? 1) === 1)).toBe(true)
  })

  it('unlocks the harder version once the entry level was done properly', () => {
    const days = planDays(stateFrom(rested), config, 3, clearedLevelOne('bike-thr-short-3x8'))
    const bike = days.flatMap((day) => day.options).filter((option) => option.sport === 'Ride')
    expect(bike.some((option) => (option.template.level ?? 1) === 2)).toBe(true)
  })

  it('keeps the short version available for a tight day', () => {
    const tight = {
      ...withMinutes({ min: 35, normal: 45, max: 50 }),
      goals: config.goals,
    }
    const days = planDays(stateFrom(rested), tight, 3, clearedLevelOne('bike-thr-short-3x8'))
    for (const day of days) {
      for (const option of day.options) expect(option.template.minutes).toBeLessThanOrEqual(50)
    }
  })

  it('names the level on a quality day', () => {
    const [today] = planDays(stateFrom(rested), config, 1, measured)
    expect(today?.options.some((option) => option.reason.includes('Stufe'))).toBe(true)
  })
})

describe('strength progression', () => {
  const withLog = (dates: readonly string[]) => ({ ...config, strengthLog: dates })

  it('starts in the intro phase with two exercises', () => {
    const [today] = planDays(stateFrom(rested), config)
    expect(today?.strength?.phase).toBe('intro')
    expect(today?.strength?.exercises).toHaveLength(2)
  })

  it('moves to the full programme once six sessions are logged', () => {
    const log = Array.from({ length: 6 }, (_unused, index) => `2026-06-${String(index + 1).padStart(2, '0')}`)
    const [today] = planDays(stateFrom(rested), withLog(log))
    expect(today?.strength?.phase).toBe('full')
    expect(today?.strength?.exercises.length).toBeGreaterThan(2)
  })

  it('drops to one session a week in the maintenance phase', () => {
    const log = Array.from({ length: 25 }, (_unused, index) => `2026-0${1 + Math.floor(index / 28)}-${String((index % 28) + 1).padStart(2, '0')}`)
    const [today] = planDays(stateFrom(rested), withLog(log))
    expect(today?.strength?.phase).toBe('maintain')
    expect(today?.strength?.perWeek).toBe(1)
  })

  it('counts logged sessions of the current week against the weekly cap', () => {
    // Two entries in the week containing TODAY, so no further strength today.
    const [today] = planDays(stateFrom(rested), withLog(['2026-08-31', '2026-09-01']))
    expect(today?.strength).toBeNull()
  })

  it('progresses on what was logged, not on elapsed weeks', () => {
    const stale = withLog(['2024-01-01', '2024-01-03'])
    const [today] = planDays(stateFrom(rested), stale)
    expect(today?.strength?.phase).toBe('intro')
  })
})

describe('what the athlete wants today', () => {
  // Both on Monday of the current week: the hard budget is spent, but the
  // 48 hour spacing is satisfied, so only the budget stands in the way.
  const spentBudget = [
    activity(2, 'Ride', { load: 90, intensity: 98 }),
    activity(2, 'Run', { load: 88, intensity: 96 }),
  ]

  it('turns a planned easy day into a hard one on request', () => {
    const [planned] = planDays(stateFrom(spentBudget), config, 1, [])
    expect(planned?.dayType).toBe('EASY')
    const [wanted] = planDays(stateFrom(spentBudget), config, 1, [], 'hard')
    expect(wanted?.dayType).toBe('KEY')
    expect(wanted?.options.every((option) => intensityClass(option.template.stimulus) === 'hard')).toBe(true)
  })

  it('says what it overrode', () => {
    const [wanted] = planDays(stateFrom(spentBudget), config, 1, [], 'hard')
    expect(wanted?.notes.join(' ')).toContain('Von dir gewählt')
    expect(wanted?.notes.join(' ')).toContain('Der Plan hätte vorgesehen')
  })

  it('marks a chosen day as voluntary', () => {
    const [wanted] = planDays(stateFrom(spentBudget), config, 1, [], 'hard')
    expect(wanted?.optional).toBe(true)
  })

  it('warns when hard would break the 48 hour rule but still complies', () => {
    const [wanted] = planDays(stateFrom([activity(1, 'Ride', { load: 90, intensity: 98 })]), config, 1, [], 'hard')
    expect(wanted?.dayType).toBe('KEY')
    expect(wanted?.notes.join(' ')).toContain('zwei harte Tage hintereinander')
  })

  it('accepts a wish for rest just as readily', () => {
    const [wanted] = planDays(stateFrom(rested), config, 1, [], 'rest')
    expect(wanted?.dayType).toBe('REST')
  })

  it('leaves the following days to follow from the choice', () => {
    const days = planDays(stateFrom(spentBudget), config, 3, [], 'hard')
    expect(days[0]?.optional).toBe(true)
    expect(days[1]?.optional).toBe(false)
    expect(days[1]?.dayType).not.toBe('KEY')
  })

  it('changes nothing without a wish', () => {
    const withoutWish = planDays(stateFrom(rested), config, 3, [])
    const withUndefined = planDays(stateFrom(rested), config, 3, [], undefined)
    expect(withUndefined.map((day) => day.dayType)).toEqual(withoutWish.map((day) => day.dayType))
  })
})

describe('offering quality once the athlete has recovered', () => {
  // Sunday, both hard sessions of the week already done, Friday and Saturday off.
  const SUNDAY = '2026-09-06'
  // Both were rides, exactly as in the week that surfaced this: quality is
  // spent, but running has had none of it.
  const week = () => [
    { ...activity(0, 'Ride', { load: 90, intensity: 98 }), date: '2026-08-31' },
    { ...activity(0, 'Ride', { load: 85, intensity: 96 }), date: '2026-09-03' },
  ]
  const stateOn = (wellnessEntries: Parameters<typeof buildState>[1] = []) =>
    buildState(week(), wellnessEntries, SUNDAY)

  it('offers a third quality session when the budget is spent but the legs are not', () => {
    const [today] = planDays(stateOn(), config, 1)
    expect(today?.dayType).toBe('KEY')
    expect(today?.optional).toBe(true)
    expect(today?.notes.join(' ')).toContain('Wochenbudget harter Einheiten erreicht')
    expect(today?.notes.join(' ')).toContain('vertretbar')
  })

  it('does so without being asked', () => {
    const withoutWish = planDays(stateOn(), config, 1)
    const asked = planDays(stateOn(), config, 1, [], 'hard')
    expect(withoutWish[0]?.dayType).toBe(asked[0]?.dayType)
  })

  it('keeps it easy while the budget is spent and no rest has happened', () => {
    const backToBack = buildState(
      [
        { ...activity(0, 'Ride', { load: 90, intensity: 98 }), date: '2026-09-04' },
        { ...activity(0, 'Run', { load: 85, intensity: 96 }), date: '2026-09-04' },
      ],
      [],
      SUNDAY,
    )
    const [today] = planDays(backToBack, config, 1)
    expect(today?.dayType).not.toBe('KEY')
  })

  it('does not offer it when the recovery signals say no', () => {
    const tired = [
      { date: SUNDAY, eftpBySport: {}, hrv: 40, restingHr: 62, sleepSecs: 4 * 3600, fatigue: 4, soreness: 4 },
      ...Array.from({ length: 30 }, (_unused, index) => ({
        date: addDays(SUNDAY, -(index + 1)),
        eftpBySport: {},
        hrv: 70,
        restingHr: 45,
        sleepSecs: 7 * 3600,
        fatigue: 1,
        soreness: 1,
      })),
    ]
    const [today] = planDays(stateOn(tired), config, 1)
    expect(today?.dayType).not.toBe('KEY')
  })

  it('recommends the sport that has had no quality work this week', () => {
    const [today] = planDays(stateOn(), config, 1)
    expect(today?.recommended).toBe('Run')
  })
})

describe('strength with the equipment at hand', () => {
  const withEquipment = (equipment: 'gym' | 'dumbbells' | 'bodyweight') => ({
    ...config,
    profile: { ...config.profile, equipment },
  })

  it('never prescribes barbell loads to someone without a barbell', () => {
    for (const equipment of ['dumbbells', 'bodyweight'] as const) {
      const [today] = planDays(stateFrom(rested), withEquipment(equipment))
      const loads = today?.strength?.exercises.map((exercise) => exercise.load).join(' ') ?? ''
      expect(loads).not.toContain('1RM')
    }
  })

  it('loads one leg at a time when the weights are light', () => {
    const [today] = planDays(stateFrom(rested), withEquipment('dumbbells'))
    expect(today?.strength?.exercises.every((exercise) => exercise.sets.includes('je Seite'))).toBe(true)
  })

  it('replaces load with slow eccentrics when there is none', () => {
    const [today] = planDays(stateFrom(rested), withEquipment('bodyweight'))
    const loads = today?.strength?.exercises.map((exercise) => exercise.load).join(' ') ?? ''
    expect(loads).toContain('3s abwärts')
    expect(today?.strength?.note).toContain('Sprünge')
  })

  it('keeps the barbell programme for someone with a gym', () => {
    const [today] = planDays(stateFrom(rested), withEquipment('gym'))
    expect(today?.strength?.exercises[0]?.load).toContain('1RM')
  })

  it('progresses the same way whatever the equipment', () => {
    const log = Array.from({ length: 8 }, (_unused, index) => `2026-06-0${(index % 9) + 1}`)
    const [today] = planDays(stateFrom(rested), { ...withEquipment('bodyweight'), strengthLog: log })
    expect(today?.strength?.phase).toBe('full')
    expect(today?.strength?.exercises.length).toBeGreaterThan(2)
  })
})

describe('recognising a workout that was already done', () => {
  // The watch names it, not the library: "Cologne - Schwelle kompakt 3x1@3:50/km".
  const doneOnSunday = [
    activity(2, 'Run', {
      load: 34,
      intensity: 83,
      name: 'Cologne - Schwelle kompakt 3x1@3:50/km',
      zoneSeconds: { Z1: 787, Z2: 80, Z3: 160, Z4: 293, Z5: 308, Z6: 103 },
    }),
    activity(9, 'Ride', { load: 60, intensity: 70 }),
  ]

  it('does not offer the same session two days later', () => {
    const days = planDays(stateFrom(doneOnSunday), config, 3, measured)
    const runs = days.flatMap((day) => day.options).filter((option) => option.sport === 'Run')
    expect(runs.length).toBeGreaterThan(0)
    expect(runs.map((option) => option.template.name)).not.toContain('Schwelle kompakt 3x1km')
  })

  it('does not let a run rule out the ride that shares its wording', () => {
    // A workout name means one session on a bike and another in running shoes;
    // only the sport that actually did it should be steered away from it.
    const named = (sport: 'Ride' | 'Run') => [
      activity(2, sport, { load: 55, intensity: 88, name: 'Sweetspot 3x12min' }),
      activity(9, sport === 'Ride' ? 'Run' : 'Ride', { load: 50, intensity: 70 }),
    ]
    const ridesAfter = (sport: 'Ride' | 'Run') =>
      planDays(stateFrom(named(sport)), config, 3, measured)
        .flatMap((day) => day.options)
        .filter((option) => option.sport === 'Ride')
        .map((option) => option.template.name)

    expect(ridesAfter('Run')).toContain('Sweetspot 3x12min')
    expect(ridesAfter('Ride')).not.toContain('Sweetspot 3x12min')
  })
})

describe('choosing which threshold to measure', () => {
  it('offers the test for every sport it is due for, not only the recommendation', () => {
    const [today] = planDays(stateFrom(rested), config, 1, [])
    expect(today?.dayType).toBe('KEY')
    const measuring = (today?.options ?? []).filter(
      (option) => option.template.measures === 'threshold',
    )
    expect(measuring.map((option) => option.sport).sort()).toEqual(['Ride', 'Run'])
  })

  it('still allows only one test inside a week', () => {
    const days = planDays(stateFrom(rested), config, 7, [])
    const measuring = days.filter((day) =>
      day.options.some((option) => option.template.measures === 'threshold'),
    )
    // TODAY is a Wednesday, so seven days reach into the next week, which may
    // rightly carry its own test — but never two in the same one.
    const weeks = new Set(measuring.map((day) => startOfWeek(day.date)))
    expect(weeks.size).toBe(measuring.length)
  })
})
