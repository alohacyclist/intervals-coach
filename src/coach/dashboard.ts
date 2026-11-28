import type { Activity, GarminAttribution } from './types.ts'
import { garminAttribution, garminDevice } from './attribution.ts'
import { addDays, startOfWeek } from './dates.ts'
import type { MinuteBucket, RideMetrics, SteadyBlock, SteadyFinding } from './steady-block.ts'
import { detectHrDrift, detectElevatedHr, STEADY_THRESHOLDS } from './steady-block.ts'

/** Below this the ride cannot hold a warm-up plus a steady block of the minimum length. */
export const MIN_CANDIDATE_SECONDS = STEADY_THRESHOLDS.warmupS + STEADY_THRESHOLDS.minDurationS
/**
 * intervals.icu's whole-ride numbers only mean something on an even effort:
 * on intervals a longer warm-up alone moves them (see efficiency.ts).
 */
export const EVEN_RIDE_VI = 1.05
export const DASHBOARD_WEEKS = [8, 12, 26] as const
export type DashboardWeeks = (typeof DASHBOARD_WEEKS)[number]
export const DEFAULT_DASHBOARD_WEEKS: DashboardWeeks = 12
/** Rides per block request: each costs a cache read, a fetch and a cache write in the Worker. */
export const BLOCK_BATCH = 4
const CHRONIC_WEEKS = 4

export const isDashboardWeeks = (value: number): value is DashboardWeeks =>
  (DASHBOARD_WEEKS as readonly number[]).includes(value)

export type PlaceValues = { readonly indoor: number | null; readonly outdoor: number | null }

export type DashboardWeek = {
  readonly weekStart: string
  readonly rides: number
  readonly seconds: number
  readonly distanceM: number
  readonly load: number
  /** Mechanical work from average power, kJ; rides without power add nothing. */
  readonly workKj: number
  /** Mean load of the four weeks before; null while there are none. */
  readonly loadChronic: number | null
  /** Mean efficiency factor of the even rides of the week, W/bpm, per place: indoors the heart runs warmer. */
  readonly efficiency: PlaceValues
  /** The running week is not over, so it must not read as a drop. */
  readonly partial: boolean
}

export type DashboardRide = {
  readonly id: string
  readonly date: string
  readonly name: string
  readonly indoor: boolean
  readonly seconds: number
  readonly averageWatts: number | null
  readonly normalizedWatts: number | null
  readonly variabilityIndex: number | null
  /** Only for even rides, see EVEN_RIDE_VI. */
  readonly efficiencyFactor: number | null
  /** Only for even rides, see EVEN_RIDE_VI. */
  readonly decouplingPct: number | null
  /** Long enough and with power: its streams are worth reading. */
  readonly candidate: boolean
  /** "Garmin Edge 530" when Garmin recorded it: its brand rules want the name beside the ride. */
  readonly garminDevice: string | null
}

/** A ride whose block the browser asks for, shown or only part of the baseline window. */
export type SteadyCandidate = {
  readonly id: string
  readonly start: string
  readonly indoor: boolean
  readonly shown: boolean
}

export type DashboardSummary = {
  readonly weeks: readonly DashboardWeek[]
  readonly rides: readonly DashboardRide[]
  /** Newest first, shown rides before baseline-only ones. */
  readonly candidates: readonly SteadyCandidate[]
  /** Strava-sourced rides intervals.icu may not pass on: counted, never guessed at. */
  readonly stravaStubs: number
  readonly thresholds: typeof STEADY_THRESHOLDS
  readonly garmin: GarminAttribution | null
}

const isRide = (a: Activity): boolean => a.sport === 'Ride' && !a.isStrength
const isStravaStub = (a: Activity): boolean => a.source === 'STRAVA' && a.load <= 0

/** Whether a ride may hold a steady block, judged from its summary alone. */
export const isSteadyCandidate = (a: Activity): boolean =>
  isRide(a) && !isStravaStub(a) && !!a.rideStats && a.startedAt !== null && a.movingTimeSec >= MIN_CANDIDATE_SECONDS

const mean = (values: readonly number[]): number | null =>
  values.length === 0 ? null : values.reduce((sum, v) => sum + v, 0) / values.length

const isEven = (a: Activity): boolean =>
  a.rideStats?.variabilityIndex != null && a.rideStats.variabilityIndex <= EVEN_RIDE_VI

const evenOnly = (a: Activity, value: number | null | undefined): number | null =>
  isEven(a) && value != null ? value : null

const meanEfficiency = (rides: readonly Activity[], indoor: boolean): number | null =>
  mean(
    rides
      .filter((a) => (a.rideStats?.indoor ?? false) === indoor)
      .flatMap((a) => {
        const value = evenOnly(a, a.rideStats?.efficiencyFactor)
        return value === null ? [] : [value]
      }),
  )

export const buildWeeks = (activities: readonly Activity[], today: string, count: number): readonly DashboardWeek[] => {
  const lastWeek = startOfWeek(today)
  const starts = Array.from({ length: count + CHRONIC_WEEKS }, (_unused, i) =>
    addDays(lastWeek, -7 * (count + CHRONIC_WEEKS - 1 - i)),
  )
  const rides = activities.filter((a) => isRide(a) && !isStravaStub(a))
  const totals = starts.map((weekStart) => {
    const inWeek = rides.filter((a) => startOfWeek(a.date) === weekStart)
    return {
      weekStart,
      rides: inWeek.length,
      seconds: inWeek.reduce((sum, a) => sum + a.movingTimeSec, 0),
      distanceM: inWeek.reduce((sum, a) => sum + a.distanceM, 0),
      load: Math.round(inWeek.reduce((sum, a) => sum + a.load, 0)),
      workKj: Math.round(inWeek.reduce((sum, a) => sum + (a.rideStats?.averageWatts ?? 0) * a.movingTimeSec, 0) / 1000),
      efficiency: { indoor: meanEfficiency(inWeek, true), outdoor: meanEfficiency(inWeek, false) },
      partial: addDays(weekStart, 6) >= today,
    }
  })
  return totals.slice(CHRONIC_WEEKS).map((week, i) => ({
    ...week,
    loadChronic: mean(totals.slice(i, i + CHRONIC_WEEKS).map((w) => w.load)),
  }))
}

/** First shown day: Monday of the oldest shown week. */
export const dashboardSince = (today: string, weeks: number): string => addDays(startOfWeek(today), -7 * (weeks - 1))

/** Oldest day to read: the elevated heart rate rule compares with the 42 days before. */
export const dashboardOldest = (today: string, weeks: number): string =>
  addDays(dashboardSince(today, weeks), -STEADY_THRESHOLDS.baselineDays)

const newestFirst = (a: Activity, b: Activity): number => (b.startedAt ?? b.date).localeCompare(a.startedAt ?? a.date)

/** Everything the summaries of intervals.icu tell, without a single stream. */
export const buildDashboardSummary = (activities: readonly Activity[], today: string, weeks: number): DashboardSummary => {
  const since = dashboardSince(today, weeks)
  const rides = activities.filter(isRide).sort(newestFirst)
  const shownRides = rides.filter((a) => a.date >= since)
  const candidates = rides.filter(isSteadyCandidate).map((a) => ({
    id: a.id,
    start: a.startedAt as string,
    indoor: a.rideStats?.indoor ?? false,
    shown: a.date >= since,
  }))
  return {
    weeks: buildWeeks(activities, today, weeks),
    rides: shownRides.filter((a) => !isStravaStub(a)).map((a) => ({
      id: a.id,
      date: a.date,
      name: a.name,
      indoor: a.rideStats?.indoor ?? false,
      seconds: a.movingTimeSec,
      averageWatts: a.rideStats?.averageWatts ?? null,
      normalizedWatts: a.rideStats?.normalizedWatts ?? null,
      variabilityIndex: a.rideStats?.variabilityIndex ?? null,
      efficiencyFactor: evenOnly(a, a.rideStats?.efficiencyFactor),
      decouplingPct: evenOnly(a, a.rideStats?.decouplingPct),
      candidate: isSteadyCandidate(a),
      garminDevice: garminDevice(a),
    })),
    candidates: [...candidates.filter((c) => c.shown), ...candidates.filter((c) => !c.shown)],
    stravaStubs: shownRides.filter(isStravaStub).length,
    thresholds: STEADY_THRESHOLDS,
    garmin: garminAttribution(shownRides.filter((a) => !isStravaStub(a))),
  }
}

/** One ride per minute for its chart, loaded when the athlete opens it. */
export type RideTrace = {
  /** Per-minute averages of the samples with both power and heart rate. */
  readonly minutes: readonly MinuteBucket[]
  readonly block: SteadyBlock | null
  readonly warmupS: number
}

/** Answer for one ride of a block request. `unreadable`: its streams could not be read. */
export type BlockReading = {
  readonly id: string
  readonly status: 'block' | 'noBlock' | 'unreadable'
  readonly block: SteadyBlock | null
}

/**
 * Why a shown ride got the verdict it got. `checked`: rules applied.
 * `noBlock`: read, no steady block, so no verdict. `noBaseline`: drift judged,
 * but fewer comparable earlier rides than the elevated rule needs.
 * `skipped`: too short or without power. `pending` / `unreadable`: not (yet) read.
 */
export type SteadyStatus = 'checked' | 'noBaseline' | 'noBlock' | 'skipped' | 'pending' | 'unreadable'

export type SteadyAnalysis = {
  readonly findings: readonly SteadyFinding[]
  readonly status: Readonly<Record<string, SteadyStatus>>
  readonly coverage: Readonly<Record<SteadyStatus, number>>
}

const EMPTY_COVERAGE: Record<SteadyStatus, number> = {
  checked: 0,
  noBaseline: 0,
  noBlock: 0,
  skipped: 0,
  pending: 0,
  unreadable: 0,
}

/**
 * The rules over whatever blocks have arrived so far. Runs in the browser as the
 * batches come in, so a partly read baseline shows as `pending`, not as calm.
 */
export const analyzeSteady = (summary: DashboardSummary, readings: ReadonlyMap<string, BlockReading>): SteadyAnalysis => {
  const metrics: RideMetrics[] = summary.candidates.flatMap((c) => {
    const reading = readings.get(c.id)
    return reading ? [{ activityId: c.id, start: c.start, indoor: c.indoor, block: reading.block }] : []
  })
  const shown = new Set(summary.candidates.filter((c) => c.shown).map((c) => c.id))
  const t = summary.thresholds
  const drift = detectHrDrift(metrics, t)
  const elevated = detectElevatedHr(metrics, t)
  // The elevated rule's own reference count, repeated here only to tell "calm" from "no baseline".
  const withBaseline = new Set(
    detectElevatedHr(metrics, { ...t, elevatedHr: Number.NEGATIVE_INFINITY }).map((f) => f.activityId),
  )
  const allRead = summary.candidates.every((c) => readings.has(c.id))
  const status = Object.fromEntries(
    summary.rides.map((ride): [string, SteadyStatus] => {
      const reading = readings.get(ride.id)
      if (!ride.candidate) return [ride.id, 'skipped']
      if (!reading) return [ride.id, 'pending']
      if (reading.status === 'unreadable') return [ride.id, 'unreadable']
      if (reading.status === 'noBlock') return [ride.id, 'noBlock']
      if (withBaseline.has(ride.id)) return [ride.id, 'checked']
      return [ride.id, allRead ? 'noBaseline' : 'pending']
    }),
  )
  const coverage = Object.values(status).reduce(
    (counts, s) => ({ ...counts, [s]: counts[s] + 1 }),
    EMPTY_COVERAGE,
  )
  const findings = [...drift, ...elevated]
    .filter((f) => shown.has(f.activityId))
    .sort((a, b) => b.start.localeCompare(a.start) || a.rule.localeCompare(b.rule))
  return { findings, status, coverage }
}
