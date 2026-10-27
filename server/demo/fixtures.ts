/**
 * Synthetic training for the demo account. Nothing in here comes from a real
 * athlete: the person, the thresholds and every session are made up, and the
 * numbers follow from the workout library through a small simulation rather
 * than being typed in. That keeps them consistent with each other — the load
 * of a session, its time in zone, its intervals and its streams all describe
 * the same ride — which is what lets the planner treat them like real data.
 *
 * Deterministic: the same `today` always yields the same data, so tests stay
 * stable. Everything is laid out relative to `today`, so the demo never looks
 * stale.
 */
import { addDays, startOfWeek } from '../../src/coach/dates.ts'
import { isRest, percentages } from '../../src/coach/format.ts'
import { findTemplate } from '../../src/coach/library.ts'
import { estimateSeconds } from '../../src/coach/variant.ts'
import type { ActualInterval } from '../../src/coach/execution.ts'
import type { ActivityStreams } from '../../src/coach/trace.ts'
import type {
  Activity,
  Block,
  CoachConfig,
  DestinationState,
  PlannedEvent,
  Sport,
  SportThreshold,
  Step,
  Stimulus,
  Wellness,
  WorkoutTemplate,
} from '../../src/coach/types.ts'
import type { SportSettings } from '../intervals.ts'

export const DEMO_ATHLETE_ID = 'demo'

/** The invented athlete. Deliberately unlike the operator's own profile. */
const FTP = 250
const RUN_THRESHOLD_SEC_PER_KM = 270
const CSS_SEC_PER_100M = 110
const LTHR = 168
const MAX_HR = 186
const RESTING_HR = 48
const HRV_BASELINE = 64

/**
 * Twelve structured weeks before this one — the part worth looking at — and a
 * year of quiet base training before that, so fitness does not start from zero
 * on the left edge of the six-month view.
 */
const STRUCTURED_WEEKS = 12
const FIRST_WEEK = -52
const WELLNESS_DAYS = 75

// ------------------------------------------------------------------ randomness

/** A small seeded generator (mulberry32): the same seed, the same numbers, everywhere. */
const rng = (seed: number): (() => number) => {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const hash = (text: string): number => {
  let value = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    value = Math.imul(value ^ text.charCodeAt(index), 16777619)
  }
  return value >>> 0
}

/** Roughly normal, from the sum of uniforms: plenty for training noise. */
const gauss = (random: () => number): number => random() + random() + random() + random() - 2

const round = (value: number, digits = 0): number => {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

// ----------------------------------------------------------------- the athlete

const THRESHOLDS: Readonly<Record<Sport, SportThreshold>> = {
  Ride: { metric: 'power', ftp: FTP },
  Run: { metric: 'pace', thresholdSecPerKm: RUN_THRESHOLD_SEC_PER_KM },
  Swim: { metric: 'swimPace', cssSecPer100m: CSS_SEC_PER_100M },
}

/** Calendar weeks from `today`'s week, Monday first. Week 0 is the current one. */
const weekStart = (today: string, week: number): string => addDays(startOfWeek(today), week * 7)

/**
 * Every fourth week is a recovery week in the app's own count from `planStart`.
 * Placed so that the week before last was one, and this week is the second of a
 * new block — so the history shows a dip and the plan is in the middle of work.
 */
const planStartFor = (today: string): string => weekStart(today, -13)

const isRecovery = (week: number): boolean => (((week + 13) % 4) + 4) % 4 === 3

/** Which week of its block a week is, 0 to 2 for the loaded ones. */
const blockWeek = (week: number): number => (((week + 13) % 4) + 4) % 4

export const demoConfig = (today: string): CoachConfig => ({
  profile: {
    equipment: 'bodyweight',
    sports: [
      { sport: 'Ride', threshold: THRESHOLDS.Ride },
      { sport: 'Run', threshold: THRESHOLDS.Run },
      { sport: 'Swim', threshold: THRESHOLDS.Swim },
    ],
    weightKg: 64,
    maxHr: MAX_HR,
    lthr: LTHR,
    weeklySessions: { min: 4, max: 5 },
    sessionMinutes: { min: 45, normal: 60, max: 120 },
  },
  goals: [
    {
      id: 'demo-ftp',
      sport: 'Ride',
      kind: 'ftp',
      label: 'FTP 265 W',
      targetValue: 265,
      currentValue: FTP,
      targetDate: addDays(weekStart(today, 9), 6),
      priority: 'A',
    },
    {
      id: 'demo-halbmarathon',
      sport: 'Run',
      kind: 'raceTime',
      // Ambitious against the 4:30 threshold pace, so the goal check has something to weigh.
      label: 'Halbmarathon unter 1:35',
      targetValue: 5700,
      currentValue: 6240,
      distanceKm: 21.1,
      targetDate: addDays(weekStart(today, 26), 6),
      priority: 'B',
    },
  ],
  strengthLog: [],
  breaks: [illness(today)],
  proposals: [],
  zrlRaces: [],
  zrl: { enabled: false, taper: true },
  destinations: {},
  planStart: planStartFor(today),
})

/** A cold five weeks ago: three days off, entered as a break, visible in HRV and resting pulse. */
const ILLNESS_WEEK = -5
const ILLNESS_DAYS = [2, 3, 4] as const

const illness = (today: string) => {
  const from = addDays(weekStart(today, ILLNESS_WEEK), ILLNESS_DAYS[0])
  return { id: `illness-${from}`, kind: 'illness' as const, from, until: addDays(from, ILLNESS_DAYS.length - 1) }
}

// ------------------------------------------------------------- the week plan

type Slot = {
  /** Monday is 0. */
  readonly day: number
  readonly templateId: string
  /** Sent to the calendar from the app, as an athlete would with the sessions that matter. */
  readonly pushed: boolean
}

const BIKE_KEYS = ['bike-sst-3x12', 'bike-thr-3x12', 'bike-vo2-5x4'] as const
const RUN_KEYS = ['run-tempo-25', 'run-thr-5x1k', 'run-cv-4x2k'] as const
const BIKE_LONG = ['bike-endurance-75', 'bike-long-90', 'bike-long-120'] as const
const RUN_LONG = ['run-easy-strides', 'run-long-80', 'run-long-80'] as const

/** The reference session every eight weeks, in place of that week's bike key. */
const BENCHMARK_WEEK = -7
/**
 * The threshold tests, eight weeks back: inside the app's ten week interval, so
 * today is a training day and not a test day, and recent enough to anchor the
 * thresholds the plan works with.
 */
const TEST_WEEK = -8
const TESTS: Readonly<Record<number, string>> = { 1: 'test-bike-ftp20', 2: 'test-swim-css', 3: 'test-run-thr20' }

const loadedWeek = (week: number): readonly Slot[] => {
  const index = blockWeek(week)
  const slots: readonly Slot[] = [
    { day: 1, templateId: week === BENCHMARK_WEEK ? 'bench-bike-4x4' : BIKE_KEYS[index]!, pushed: true },
    // Two quality sessions in five, as the plan itself would lay them out: the swim stays technique.
    {
      day: 2,
      templateId: week === BENCHMARK_WEEK ? 'bench-swim-400' : 'swim-technique',
      pushed: week === BENCHMARK_WEEK,
    },
    { day: 3, templateId: week === BENCHMARK_WEEK ? 'bench-run-4x4' : RUN_KEYS[index]!, pushed: true },
    { day: 5, templateId: BIKE_LONG[index]!, pushed: true },
    { day: 6, templateId: RUN_LONG[index]!, pushed: false },
  ]
  return week === TEST_WEEK
    ? slots.map((slot) => (TESTS[slot.day] ? { ...slot, templateId: TESTS[slot.day]!, pushed: true } : slot))
    : slots
}

/** A year ago only three sessions a week; by spring five, all easy — the base the structured weeks stand on. */
const baseWeek = (week: number): readonly Slot[] => {
  if (isRecovery(week)) {
    return [
      { day: 1, templateId: 'bike-recovery-40', pushed: false },
      { day: 5, templateId: 'bike-endurance-75', pushed: false },
      { day: 6, templateId: 'run-easy-strides', pushed: false },
    ]
  }
  const early = week < -32
  return [
    { day: 1, templateId: 'bike-endurance-75', pushed: false },
    ...(early ? [] : [{ day: 2, templateId: 'swim-technique', pushed: false }]),
    { day: 3, templateId: 'run-easy-strides', pushed: false },
    { day: 5, templateId: week % 2 === 0 ? 'bike-long-90' : 'bike-endurance-75', pushed: false },
    ...(early ? [] : [{ day: 6, templateId: 'run-long-80', pushed: false }]),
  ]
}

const recoveryWeek: readonly Slot[] = [
  { day: 1, templateId: 'bike-endurance-75', pushed: false },
  { day: 3, templateId: 'run-easy-strides', pushed: false },
  { day: 5, templateId: 'bike-endurance-75', pushed: true },
  { day: 6, templateId: 'swim-technique', pushed: false },
]

/** Life, not physiology: an easy run that did not happen, three weeks back. */
const SKIPPED_EASY = { week: -3, day: 6 }
/** A key session that was planned and not done, four weeks back — before the visible week. */
const MISSED_EARLIER = { week: -4, day: 3 }

const slotsFor = (week: number): readonly Slot[] => {
  const slots = week < -STRUCTURED_WEEKS ? baseWeek(week) : isRecovery(week) ? recoveryWeek : loadedWeek(week)
  return slots
    .filter((slot) => !(week === ILLNESS_WEEK && (ILLNESS_DAYS as readonly number[]).includes(slot.day)))
    .filter((slot) => !(week === SKIPPED_EASY.week && slot.day === SKIPPED_EASY.day))
    .map((slot) =>
      // Back from the cold: the long ride that weekend becomes an easy one.
      week === ILLNESS_WEEK && slot.day === 5 ? { ...slot, templateId: 'bike-endurance-75', pushed: false } : slot,
    )
}

// ------------------------------------------------------------ the simulation

type Piece = {
  readonly seconds: number
  /** Share of threshold the athlete actually held. */
  readonly percent: number
  readonly work: boolean
}

const WARM_OR_COOL = /^(ein|aus)/i

const flatten = (blocks: readonly Block[]): readonly Step[] =>
  blocks.flatMap((block) =>
    block.kind === 'repeat' ? Array.from({ length: block.times }, () => block.steps).flat() : [block],
  )

const targetPercent = (step: Step): number => {
  if (isRest(step)) return 0
  const values = percentages(step.target)
  return values.length === 0 ? 55 : values.reduce((sum, value) => sum + value, 0) / values.length
}

/** What the athlete did with each step: close to the target, a little eager on the work. */
const execute = (template: WorkoutTemplate, random: () => number): readonly Piece[] =>
  flatten(template.blocks)
    .map((step) => {
      const seconds = estimateSeconds(step.duration, THRESHOLDS[template.sport])
      const target = targetPercent(step)
      const work = target >= 80 && seconds >= 60 && !WARM_OR_COOL.test(step.label ?? '')
      const percent = target === 0 ? 0 : target * (1 + (work ? 0.008 : 0) + gauss(random) * 0.008)
      return { seconds: Math.round(seconds), percent: round(percent, 1), work }
    })
    .filter((piece) => piece.seconds > 0)

/** Coggan's zones as shares of threshold; sweet spot is counted on top, as intervals.icu does. */
const ZONES: readonly (readonly [string, number])[] = [
  ['Z1', 56],
  ['Z2', 76],
  ['Z3', 91],
  ['Z4', 106],
  ['Z5', 121],
  ['Z6', 151],
  ['Z7', Number.POSITIVE_INFINITY],
]

const zoneSecondsOf = (pieces: readonly Piece[]): Record<string, number> => {
  const totals: Record<string, number> = {}
  for (const piece of pieces) {
    const zone = ZONES.find(([, below]) => piece.percent < below)?.[0] ?? 'Z1'
    totals[zone] = (totals[zone] ?? 0) + piece.seconds
    if (piece.percent >= 84 && piece.percent < 98) totals['SS'] = (totals['SS'] ?? 0) + piece.seconds
  }
  return totals
}

/** Training load the way TSS is defined: hours times intensity factor squared, times a hundred. */
const loadOf = (pieces: readonly Piece[]): { readonly load: number; readonly intensity: number } => {
  const seconds = pieces.reduce((sum, piece) => sum + piece.seconds, 0)
  const squared = pieces.reduce((sum, piece) => sum + piece.seconds * (piece.percent / 100) ** 2, 0)
  const factor = Math.sqrt(squared / seconds)
  return { load: Math.round((seconds / 3600) * factor ** 2 * 100), intensity: Math.round(factor * 100) }
}

const speedAt = (sport: Sport, percent: number): number => {
  if (sport === 'Run') return (1000 / RUN_THRESHOLD_SEC_PER_KM) * (percent / 100)
  if (sport === 'Swim') return (100 / CSS_SEC_PER_100M) * (percent / 100)
  // On the road speed follows power only loosely; enough for a distance.
  return 5.5 + 4.5 * (percent / 100)
}

/** Steady-state pulse for a share of threshold. */
const heartFor = (percent: number): number =>
  Math.min(MAX_HR - 2, RESTING_HR + 22 + (LTHR - RESTING_HR - 22) * (percent / 100))

/** One second of the session after another, with the pulse lagging the work and drifting up. */
const simulateSeconds = (sport: Sport, pieces: readonly Piece[], random: () => number) => {
  const time: number[] = []
  const watts: (number | null)[] = []
  const speed: (number | null)[] = []
  const heart: number[] = []
  const distance: number[] = []
  const altitude: number[] = []
  let pulse = RESTING_HR + 30
  let travelled = 0
  let second = 0
  for (const piece of pieces) {
    for (let index = 0; index < piece.seconds; index += 1) {
      const effort = piece.percent * (1 + gauss(random) * (sport === 'Ride' ? 0.03 : 0.012))
      const target = heartFor(piece.percent) + second / 600
      pulse += (target - pulse) / (target > pulse ? 35 : 55)
      const metres = piece.percent === 0 ? 0 : speedAt(sport, effort)
      travelled += metres
      time.push(second)
      watts.push(sport === 'Ride' ? (piece.percent === 0 ? 0 : Math.round((FTP * effort) / 100)) : null)
      speed.push(sport === 'Ride' ? null : round(metres, 2))
      heart.push(Math.round(pulse + gauss(random) * 0.8))
      distance.push(round(travelled, 1))
      altitude.push(round(52 + 6 * Math.sin(travelled / 700), 1))
      second += 1
    }
  }
  return { time, watts, speed, heart, distance, altitude }
}

const mean = (values: readonly number[]): number =>
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length

// --------------------------------------------------------------- the dataset

export type DemoSession = {
  readonly activity: Activity
  readonly template: WorkoutTemplate
  readonly pieces: readonly Piece[]
  /** A stretch where the watch counted cadence instead of heartbeats — the heart check should catch it. */
  readonly heartFault: { readonly from: number; readonly to: number } | null
}

export type DemoData = {
  readonly today: string
  readonly config: CoachConfig
  readonly activities: readonly Activity[]
  readonly wellness: readonly Wellness[]
  readonly events: readonly PlannedEvent[]
  readonly sessions: ReadonlyMap<string, DemoSession>
  readonly sportSettings: SportSettings
  readonly destinations: readonly DestinationState[]
}

const startTime = (sport: Sport, day: number): string =>
  day >= 5 ? '07:30:00' : sport === 'Swim' ? '06:15:00' : '17:45:00'

/** Berlin local time for an evening session, as an instant. Close enough across the clock change for a demo. */
const instant = (date: string, local: string): string => {
  const [hours, minutes] = local.split(':').map(Number)
  return `${date}T${String((hours! + 22) % 24).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00Z`
}

/** What counts as a key session for the one left undone: a quality stimulus, not a long easy ride. */
const QUALITY: readonly Stimulus[] = ['VO2', 'THRESHOLD', 'SWEETSPOT', 'TEMPO']

export const generateDemo = (today: string): DemoData => {
  const activities: Activity[] = []
  const events: PlannedEvent[] = []
  const sessions = new Map<string, DemoSession>()

  // The newest key session before today is left undone: the gap the plan has to work around.
  const keyDays = Array.from({ length: STRUCTURED_WEEKS + 1 }, (_unused, offset) => offset - STRUCTURED_WEEKS)
    .flatMap((week) => slotsFor(week).map((slot) => ({ week, slot, date: addDays(weekStart(today, week), slot.day) })))
    .filter(({ date, slot }) => date < today && slot.pushed && QUALITY.includes(findTemplate(slot.templateId)?.stimulus ?? 'ENDURANCE'))
  const missedRecently = keyDays[keyDays.length - 1]?.date ?? null

  for (let week = FIRST_WEEK; week <= 0; week += 1) {
    for (const slot of slotsFor(week)) {
      const date = addDays(weekStart(today, week), slot.day)
      if (date >= today) continue
      const template = findTemplate(slot.templateId)
      if (!template) throw new Error(`Demo: unbekannte Vorlage ${slot.templateId}`)

      const id = `demo-${date}-${template.sport.toLowerCase()}`
      const eventId = `demo-event-${date}-${template.sport.toLowerCase()}`
      const missed =
        date === missedRecently || (week === MISSED_EARLIER.week && slot.day === MISSED_EARLIER.day)

      if (slot.pushed) {
        events.push({
          id: eventId,
          date,
          name: template.name,
          sport: template.sport,
          externalId: `coach:${date}:${template.id}:${template.minutes}`,
          pairedActivityId: missed ? null : id,
        })
      }
      if (missed) continue

      const random = rng(hash(id))
      const pieces = execute(template, random)
      const { load, intensity } = loadOf(pieces)
      const movingTimeSec = pieces.reduce((sum, piece) => sum + piece.seconds, 0)
      const moved = pieces.reduce((sum, piece) => sum + piece.seconds * speedAt(template.sport, piece.percent), 0)
      const averageHr =
        template.sport === 'Swim'
          ? null
          : Math.round(mean(pieces.flatMap((piece) => Array(Math.ceil(piece.seconds / 60)).fill(heartFor(piece.percent)))))
      const local = startTime(template.sport, slot.day)

      const activity: Activity = {
        id,
        source: 'DEMO',
        date,
        startedAt: instant(date, local),
        sport: template.sport,
        name: template.name,
        load,
        intensity,
        movingTimeSec,
        distanceM: Math.round(moved),
        elevationM: template.sport === 'Ride' ? Math.round(moved / 100) : template.sport === 'Run' ? Math.round(moved / 150) : 0,
        isStrength: false,
        pairedEventId: slot.pushed ? eventId : null,
        compliance: slot.pushed ? Math.round(88 + random() * 10) : null,
        averageHr,
        zoneSeconds: zoneSecondsOf(pieces),
        device: null,
      }
      activities.push(activity)
      sessions.set(id, { activity, template, pieces, heartFault: null })
    }
  }

  // The latest completed bike key session carries a recording fault, so the heart check has something to find.
  const faulty = [...sessions.values()]
    .filter((session) => session.template.sport === 'Ride' && session.activity.pairedEventId !== null)
    .filter((session) => session.template.stimulus !== 'LONG' && session.template.stimulus !== 'ENDURANCE')
    .at(-1)
  if (faulty) sessions.set(faulty.activity.id, { ...faulty, heartFault: { from: 1680, to: 1890 } })

  return {
    today,
    config: demoConfig(today),
    activities,
    wellness: wellnessFor(today, activities),
    events,
    sessions,
    sportSettings: {
      ftp: FTP,
      thresholdPaceSecPerKm: RUN_THRESHOLD_SEC_PER_KM,
      cssSecPer100m: CSS_SEC_PER_100M,
      lthr: LTHR,
      maxHr: MAX_HR,
    },
    destinations: [
      // Nothing linked: a linked Garmin would make the app credit Garmin for data it never sent.
      { destination: 'garmin', label: 'Garmin Connect', enabled: false, connected: false },
      { destination: 'wahoo', label: 'Wahoo', enabled: false, connected: false },
      { destination: 'zwift', label: 'Zwift', enabled: false, connected: false },
      { destination: 'coros', label: 'Coros', enabled: false, connected: false },
      { destination: 'suunto', label: 'Suunto', enabled: false, connected: false },
    ],
  }
}

/**
 * Mornings: HRV around its baseline with a slow wave and day-to-day noise,
 * dipping the morning after a hard day and through the cold; resting pulse the
 * mirror image. The estimated FTP creeps up over the weeks — enough that the app
 * suggests adopting it.
 */
const wellnessFor = (today: string, activities: readonly Activity[]): readonly Wellness[] => {
  const random = rng(hash(`wellness-${today}`))
  const sick = illness(today)
  const loadOn = new Map<string, number>()
  for (const activity of activities) loadOn.set(activity.date, (loadOn.get(activity.date) ?? 0) + activity.load)

  return Array.from({ length: WELLNESS_DAYS + 1 }, (_unused, index) => {
    const date = addDays(today, index - WELLNESS_DAYS)
    const yesterday = loadOn.get(addDays(date, -1)) ?? 0
    const ill = date >= addDays(sick.from, -1) && date <= addDays(sick.until, 1)
    const strain = yesterday >= 85 ? 1 : 0
    const hrv = HRV_BASELINE + 3 * Math.sin(index / 9) + gauss(random) * 2.4 - strain * 3.5 - (ill ? 13 : 0)
    const restingHr = RESTING_HR + gauss(random) * 1.2 + strain * 1.5 + (ill ? 5 : 0)
    const progress = index / WELLNESS_DAYS
    return {
      date,
      eftpBySport: { Ride: Math.round(244 + 14 * progress) },
      hrv: Math.round(hrv),
      restingHr: Math.round(restingHr),
      sleepSecs: Math.round((7.3 + gauss(random) * 0.45 - (ill ? 0.6 : 0)) * 3600),
      fatigue: ill ? 3 : yesterday >= 120 ? 3 : 2,
      soreness: yesterday >= 120 ? 2 : 1,
    }
  })
}

// ----------------------------------------------------------------- per session

export const intervalsOf = (session: DemoSession): readonly ActualInterval[] => {
  const random = rng(hash(`${session.activity.id}-intervals`))
  let start = 0
  return session.pieces.map((piece) => {
    const interval: ActualInterval = {
      kind: piece.work ? 'work' : 'recovery',
      seconds: piece.seconds,
      averageWatts: session.template.sport === 'Ride' ? Math.round((FTP * piece.percent) / 100) : null,
      averageSpeedMps: session.template.sport === 'Ride' ? null : round(speedAt(session.template.sport, piece.percent), 3),
      averageHeartrate:
        session.template.sport === 'Swim' ? null : Math.round(heartFor(piece.percent) - 3 + random() * 2),
      startSeconds: start,
      endSeconds: start + piece.seconds,
    }
    start += piece.seconds
    return interval
  })
}

/** Pool swims have no streams, as from a real watch; rides and runs come at one sample per second. */
export const streamsOf = (session: DemoSession): ActivityStreams => {
  const { sport } = session.template
  if (sport === 'Swim') return { time: [], watts: null, speed: null, heartRate: null }
  const seconds = simulateSeconds(sport, session.pieces, rng(hash(`${session.activity.id}-streams`)))
  const fault = session.heartFault
  const heartRate = fault
    ? seconds.heart.map((value, second) =>
        second >= fault.from && second < fault.to ? Math.round(value * 0.62) : value,
      )
    : seconds.heart
  return {
    time: seconds.time,
    watts: sport === 'Ride' ? seconds.watts : null,
    speed: sport === 'Ride' ? null : seconds.speed,
    heartRate,
    ...(sport === 'Run' ? { altitude: seconds.altitude, distance: seconds.distance } : {}),
  }
}
