import type {
  Activity,
  BenchmarkStatus,
  FamilyLevel,
  Feasibility,
  Progress,
  SeasonWeek,
  Sport,
  Stimulus,
  WeekLoad,
} from './types.ts'
import { addDays, diffDays, startOfWeek } from './dates.ts'
import { ATL_DAYS, CTL_DAYS, dailyLoads, ewmaSeries } from './fitness.ts'
import { LIBRARY } from './library.ts'
import type { Completion } from './progression.ts'
import { levelFor } from './progression.ts'

/**
 * What the plan page cannot answer: am I getting anywhere? The daily view asks
 * "what today" and is asked daily; this asks "am I moving" and is asked
 * monthly. Every number here comes out of activities the plan already loaded,
 * so the page costs no extra call to intervals.icu.
 */

/** Only for a caller that asks for the series alone, as the tests do. */
const EMPTY_BENCHMARK: BenchmarkStatus = {
  due: false,
  weeksSinceLast: null,
  intervalWeeks: 0,
  sessions: [],
  results: [],
}

const STIMULUS_LABELS: Readonly<Record<Stimulus, string>> = {
  VO2: 'VO2max',
  THRESHOLD: 'Schwelle',
  SWEETSPOT: 'Sweetspot',
  TEMPO: 'Tempo',
  NEURO: 'Antritte',
  ENDURANCE: 'Grundlage',
  LONG: 'Lange Einheit',
  RECOVERY: 'Regeneration',
}

/** The spans the page can be read over; the middle one is what it opens with. */
export const PROGRESS_SPANS = [30, 90, 180, 365] as const
export type ProgressSpan = (typeof PROGRESS_SPANS)[number]
export const DEFAULT_PROGRESS_SPAN: ProgressSpan = 180

export const isProgressSpan = (days: number): days is ProgressSpan =>
  (PROGRESS_SPANS as readonly number[]).includes(days)

/**
 * Days of training read before the span starts. Fitness is an average over
 * six weeks: started from zero on the first day shown, a thirty-day view would
 * draw a month of "building up" that never happened. Three time constants in,
 * what is left of that zero is five per cent.
 */
export const FITNESS_WARMUP_DAYS = 3 * CTL_DAYS

/** One bar per calendar week of the span, and never fewer than a month's worth. */
export const weeksFor = (historyDays: number): number => Math.max(4, Math.ceil(historyDays / 7))

/** The same curve the plan steers by, kept as a series instead of its last value. */
const fitnessSeries = (activities: readonly Activity[], today: string, historyDays: number) => {
  const from = addDays(today, -historyDays)
  const loads = dailyLoads(activities, addDays(from, -FITNESS_WARMUP_DAYS), today)
  const ctl = ewmaSeries(loads, CTL_DAYS).slice(FITNESS_WARMUP_DAYS)
  const atl = ewmaSeries(loads, ATL_DAYS).slice(FITNESS_WARMUP_DAYS)
  return ctl.map((value, index) => ({
    date: addDays(from, index),
    ctl: Math.round(value * 10) / 10,
    atl: Math.round((atl[index] ?? 0) * 10) / 10,
  }))
}

/**
 * Calendar weeks, not rolling buckets: an athlete plans in weeks, so a
 * recovery week has to line up with the week it was taken in.
 */
const weeklyLoads = (
  activities: readonly Activity[],
  today: string,
  weeks: number,
): readonly WeekLoad[] => {
  const current = startOfWeek(today)
  return Array.from({ length: weeks }, (_, index) => {
    const start = addDays(current, -(weeks - 1 - index) * 7)
    const end = addDays(start, 6)
    const inWeek = activities.filter((entry) => entry.date >= start && entry.date <= end)
    return {
      start,
      end,
      load: Math.round(inWeek.reduce((sum, entry) => sum + entry.load, 0)),
      sessions: inWeek.filter((entry) => entry.load > 0).length,
      // The running week is not over, so it must not read as a drop in volume.
      partial: end >= today,
    }
  })
}

/**
 * The ladder the engine already climbs, made visible. levelFor decides which
 * step the athlete stands on; the library says how many steps there are and
 * what the next one is called.
 */
const familyLevels = (
  completions: readonly Completion[],
  sports: readonly Sport[],
): readonly FamilyLevel[] => {
  const families = [...new Set(LIBRARY.map((template) => template.family).filter(Boolean))]
  return families
    .filter((family): family is string => family !== undefined)
    // A rider has no business being told they sit at level 1 in swimming.
    .filter((family) =>
      sports.length === 0
        ? true
        : LIBRARY.some((template) => template.family === family && sports.includes(template.sport)),
    )
    .map((family) => {
      const members = LIBRARY.filter((template) => template.family === family)
      const levels = [...new Set(members.map((template) => template.level ?? 1))].sort(
        (left, right) => left - right,
      )
      const level = levelFor(family, completions)
      const next = members.find((template) => (template.level ?? 1) === level + 1)
      const here = members.find((template) => (template.level ?? 1) === level)
      return {
        family,
        sport: members[0]?.sport ?? ('Ride' as Sport),
        label: STIMULUS_LABELS[members[0]?.stimulus ?? 'ENDURANCE'],
        level,
        top: levels[levels.length - 1] ?? 1,
        current: here?.name ?? null,
        next: next?.name ?? null,
      }
    })
    .sort((left, right) => left.sport.localeCompare(right.sport) || left.label.localeCompare(right.label))
}

type Achievements = {
  readonly benchmark: BenchmarkStatus
  readonly feasibility: readonly Feasibility[]
  /** The athlete's own sports; empty means every family in the library. */
  readonly sports: readonly Sport[]
  readonly season?: readonly SeasonWeek[]
}

export const buildProgress = (
  activities: readonly Activity[],
  completions: readonly Completion[],
  today: string,
  historyDays = 180,
  weeks = 12,
  achieved: Achievements = { benchmark: EMPTY_BENCHMARK, feasibility: [], sports: [] },
): Progress => {
  const from = addDays(today, -historyDays)
  const inRange = activities.filter((entry) => entry.date >= from && entry.date <= today)
  const trained = inRange.filter((entry) => entry.load > 0)
  const bySport = trained.reduce<Record<string, number>>(
    (tally, entry) => ({ ...tally, [entry.sport]: (tally[entry.sport] ?? 0) + 1 }),
    {},
  )

  return {
    today,
    historyDays,
    fitness: fitnessSeries(activities, today, historyDays),
    weeks: weeklyLoads(activities, today, weeks),
    levels: familyLevels(completions, achieved.sports),
    benchmark: achieved.benchmark,
    feasibility: achieved.feasibility,
    // The band comes from the calendar, not from activities; the route fills it.
    season: achieved.season ?? [],
    totals: {
      sessions: trained.length,
      load: Math.round(trained.reduce((sum, entry) => sum + entry.load, 0)),
      hours: Math.round(trained.reduce((sum, entry) => sum + entry.movingTimeSec, 0) / 3600),
      // Days with training, not days in range — the rest days are the point.
      days: new Set(trained.map((entry) => entry.date)).size,
      sessionsBySport: bySport,
      // A streak of nothing is worth naming; it explains a falling curve.
      longestBreak: longestBreak(trained, today),
    },
  }
}

/**
 * The longest run of days without a session, counted from the first session on.
 * Days before that are not a break — they are an account that did not exist
 * yet, and counting them reported a 150 day pause to a new athlete.
 */
const longestBreak = (trained: readonly Activity[], to: string): number => {
  const days = new Set(trained.map((entry) => entry.date))
  if (days.size === 0) return 0
  const start = [...days].sort()[0]!
  let longest = 0
  let run = 0
  for (let index = 0; index <= diffDays(start, to); index += 1) {
    if (days.has(addDays(start, index))) {
      run = 0
    } else {
      run += 1
      longest = Math.max(longest, run)
    }
  }
  return longest
}
