import type {
  Block,
  Execution,
  ExecutedStep,
  ExecutionSegment,
  ExecutionTrace,
  Sport,
  SportThreshold,
  Stimulus,
  WorkoutTemplate,
} from './types.ts'
import { flattenBlocks } from './library.ts'
import { percentages } from './format.ts'
import { estimateSeconds, shorten, totalSeconds } from './variant.ts'
import { intensityOfPercent } from './profile.ts'

/**
 * Planned against done, interval by interval. The comparison is made by order,
 * not by clock: a warm-up three minutes longer than planned would otherwise put
 * every interval three minutes beside its block, and the whole session would
 * read as missed.
 */

export type ActualInterval = {
  readonly kind: 'work' | 'recovery'
  readonly seconds: number
  readonly averageWatts: number | null
  readonly averageSpeedMps: number | null
  readonly averageHeartrate: number | null
  /** Elapsed seconds into the activity, on the same clock as its streams. */
  readonly startSeconds: number | null
  readonly endSeconds: number | null
}

/** A step at or above this share of threshold is work; below it, the ground between. */
const WORK_FROM = 80
/** Strides and sprints are seasoning, and no interval detection finds them reliably. */
const MIN_WORK_SECONDS = 30
/** Detected surges shorter than this are traffic lights, not intervals. */
const MIN_DETECTED_SECONDS = 20
/** A single-value target still gets a band, or 101 % of "100 %" would read as a miss. */
const SINGLE_TARGET_TOLERANCE = 2
/** Less than this share of the planned duration is an interval cut short. */
const CUT_SHORT_BELOW = 0.85

const WARM_OR_COOL = /^(ein|aus)(fahren|laufen|schwimmen)$/i

/** Sessions whose point is duration, not the blocks inside it. */
const NO_BLOCKS_TO_COMPARE: readonly Stimulus[] = ['ENDURANCE', 'RECOVERY', 'LONG', 'NEURO']

/** Whether a session has work intervals with targets to hold, rather than only a length. */
export const comparesBlocks = (template: WorkoutTemplate): boolean =>
  !NO_BLOCKS_TO_COMPARE.includes(template.stimulus)

const rangeOf = (target: string): { readonly low: number; readonly high: number } | null => {
  const values = percentages(target)
  if (values.length === 0) return null
  const low = Math.min(...values)
  const high = Math.max(...values)
  return low === high
    ? { low: low - SINGLE_TARGET_TOLERANCE, high: high + SINGLE_TARGET_TOLERANCE }
    : { low, high }
}

/**
 * The blocks the athlete was actually sent. A pushed shortened version carries
 * its minutes in the calendar id; the same trim is applied again rather than
 * comparing a 45 minute session against the 74 minute one it was cut from.
 */
export const plannedBlocks = (
  template: WorkoutTemplate,
  threshold: SportThreshold,
  pushedMinutes: number | null,
): readonly Block[] =>
  pushedMinutes !== null && pushedMinutes < template.minutes
    ? shorten(template.blocks, threshold, pushedMinutes / template.minutes).blocks
    : template.blocks

/** Share of threshold the interval was held at; faster is higher for pace, as for watts. */
const percentOfThreshold = (interval: ActualInterval, threshold: SportThreshold): number | null => {
  if (threshold.metric === 'power') {
    return interval.averageWatts !== null && interval.averageWatts > 0
      ? (interval.averageWatts / threshold.ftp) * 100
      : null
  }
  if (interval.averageSpeedMps === null || interval.averageSpeedMps <= 0) return null
  return threshold.metric === 'pace'
    ? (threshold.thresholdSecPerKm / (1000 / interval.averageSpeedMps)) * 100
    : (threshold.cssSecPer100m / (100 / interval.averageSpeedMps)) * 100
}

const valueText = (interval: ActualInterval, threshold: SportThreshold): string | null => {
  if (threshold.metric === 'power') {
    return interval.averageWatts === null ? null : `${Math.round(interval.averageWatts)} W`
  }
  if (interval.averageSpeedMps === null || interval.averageSpeedMps <= 0) return null
  const perUnit = threshold.metric === 'pace' ? 1000 : 100
  const seconds = Math.round(perUnit / interval.averageSpeedMps)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} ${threshold.metric === 'pace' ? '/km' : '/100m'}`
}

type Plan = {
  readonly seconds: number
  readonly percent: number
  readonly label: string | null
  readonly range: { readonly low: number; readonly high: number } | null
  readonly work: boolean
}

const planOf = (blocks: readonly Block[], threshold: SportThreshold, compareBlocks: boolean): readonly Plan[] =>
  flattenBlocks(blocks)
    .map((step) => {
      const range = rangeOf(step.target)
      const seconds = estimateSeconds(step.duration, threshold)
      const percent = range ? Math.round((range.low + range.high) / 2) : 60
      const label = step.label ?? null
      const work =
        compareBlocks &&
        range !== null &&
        percent >= WORK_FROM &&
        seconds >= MIN_WORK_SECONDS &&
        !(label !== null && WARM_OR_COOL.test(label))
      return { seconds, percent, label, range, work }
    })
    .filter((step) => step.seconds > 0)

export type ExecutionInput = {
  readonly activityId: string
  readonly sport: Sport
  readonly template: WorkoutTemplate
  readonly blocks: readonly Block[]
  readonly threshold: SportThreshold
  readonly intervals: readonly ActualInterval[]
  readonly load: number
  readonly movingSeconds: number
  readonly compliance: number | null
  readonly trace: ExecutionTrace | null
}

/** A planned work interval as the alignment sees it: how long, and in which band. */
export type PlannedWork = { readonly seconds: number; readonly low: number; readonly high: number }

/** A detected work interval: how long, how hard, and how long the pause before it was. */
export type DetectedWork = {
  readonly seconds: number
  readonly percent: number | null
  readonly gapBefore: number
}

/** Leaving a planned interval unpaired costs this much — it has to be the better story. */
const MISSED = 2
/** Leaving a detected interval out costs almost nothing: surges and strides happen. */
const LEFT_OUT = 0.05
/** Ten percentage points outside the target band weigh as much as double the duration. */
const POINTS_PER_UNIT = 10
/** A stop at a crossing or a pressed pause button splits an interval, rarely more than twice. */
const MAX_PIECES = 3
const MAX_PAUSE_SECONDS = 120
/** Two pieces are slightly worse evidence than one; on a tie, the single piece wins. */
const PER_EXTRA_PIECE = 0.1

const weightedPercent = (pieces: readonly DetectedWork[]): number | null => {
  const known = pieces.filter((piece) => piece.percent !== null)
  const seconds = known.reduce((sum, piece) => sum + piece.seconds, 0)
  return seconds === 0 ? null : known.reduce((sum, piece) => sum + piece.percent! * piece.seconds, 0) / seconds
}

const pairingCost = (plan: PlannedWork, pieces: readonly DetectedWork[]): number => {
  const seconds = pieces.reduce((sum, piece) => sum + piece.seconds, 0)
  const duration = plan.seconds > 0 && seconds > 0 ? Math.abs(Math.log(seconds / plan.seconds)) : 10
  const percent = weightedPercent(pieces)
  const intensity =
    percent === null ? 0 : Math.max(0, plan.low - percent, percent - plan.high) / POINTS_PER_UNIT
  return duration + intensity + (pieces.length - 1) * PER_EXTRA_PIECE
}

/**
 * Which detected intervals make up which planned one.
 *
 * Order is kept, so a long warm-up cannot slide anything. Within that order the
 * pairing weighs duration *and* intensity: judged by duration alone, a session
 * whose last interval was split by a pressed stop button had its fourth interval
 * paired with the cool-down, because four minutes of jogging matched four
 * minutes better than either half of the real interval did. Now the two halves
 * may count as one interval, and the cool-down, thirty points below the band,
 * never passes for it.
 *
 * Returns, per planned interval, the indices of its detected pieces — empty when
 * it was not done.
 */
export const alignIntervals = (
  planned: readonly PlannedWork[],
  detected: readonly DetectedWork[],
): readonly (readonly number[])[] => {
  type Choice =
    | { readonly kind: 'miss' }
    | { readonly kind: 'skip' }
    | { readonly kind: 'pair'; readonly pieces: number }
  const rows = planned.length + 1
  const columns = detected.length + 1
  const cost = Array.from({ length: rows }, () => Array.from({ length: columns }, () => 0))
  const choice: Choice[][] = Array.from({ length: rows }, () =>
    Array.from({ length: columns }, (): Choice => ({ kind: 'skip' })),
  )

  for (let i = 0; i < rows; i += 1) {
    for (let j = 0; j < columns; j += 1) {
      if (i === 0 && j === 0) continue
      // Evaluated in this order and replaced only on a strict improvement, so a tie
      // leaves the *later* element out: a session stopped early misses its last
      // interval, and an extra one at the end is the one left over.
      let best = Number.POSITIVE_INFINITY
      let picked: Choice = { kind: 'skip' }
      if (i > 0) {
        best = cost[i - 1]![j]! + MISSED
        picked = { kind: 'miss' }
      }
      if (j > 0 && cost[i]![j - 1]! + LEFT_OUT < best) {
        best = cost[i]![j - 1]! + LEFT_OUT
        picked = { kind: 'skip' }
      }
      if (i > 0) {
        for (let pieces = 1; pieces <= Math.min(MAX_PIECES, j); pieces += 1) {
          const group = detected.slice(j - pieces, j)
          // Only pieces separated by a short pause belong to one interval.
          if (group.slice(1).some((piece) => piece.gapBefore > MAX_PAUSE_SECONDS)) break
          const total = cost[i - 1]![j - pieces]! + pairingCost(planned[i - 1]!, group)
          if (total < best) {
            best = total
            picked = { kind: 'pair', pieces }
          }
        }
      }
      cost[i]![j] = best
      choice[i]![j] = picked
    }
  }

  const result: number[][] = planned.map(() => [])
  let i = planned.length
  let j = detected.length
  while (i > 0 || j > 0) {
    const step = choice[i]![j]!
    if (step.kind === 'miss') {
      i -= 1
    } else if (step.kind === 'skip') {
      j -= 1
    } else {
      result[i - 1] = Array.from({ length: step.pieces }, (_piece, offset) => j - step.pieces + offset)
      i -= 1
      j -= step.pieces
    }
  }
  return result
}

/** Several pieces read as one interval: time adds up, intensity is averaged over time. */
const combine = (pieces: readonly ActualInterval[]): ActualInterval => {
  const seconds = pieces.reduce((sum, piece) => sum + piece.seconds, 0)
  const weighted = (pick: (piece: ActualInterval) => number | null): number | null =>
    seconds > 0 && pieces.every((piece) => pick(piece) !== null)
      ? pieces.reduce((sum, piece) => sum + pick(piece)! * piece.seconds, 0) / seconds
      : null
  return {
    kind: 'work',
    seconds,
    averageWatts: weighted((piece) => piece.averageWatts),
    averageSpeedMps: weighted((piece) => piece.averageSpeedMps),
    averageHeartrate: weighted((piece) => piece.averageHeartrate),
    // The pause between two pieces belongs to the interval: it is where it was broken.
    startSeconds: pieces[0]?.startSeconds ?? null,
    endSeconds: pieces[pieces.length - 1]?.endSeconds ?? null,
  }
}

/**
 * Short intervals — 40/20, 30/30 — come back from intervals.icu as one block per
 * set. Matched one by one, every forty seconds would read as missed, which is
 * the opposite of what happened. Below this length, and with far fewer detected
 * than planned, the comparison declines instead.
 */
const SHORT_INTERVAL_SECONDS = 90

export const compareExecution = (input: ExecutionInput): Execution => {
  const { template, blocks, threshold } = input
  const compareBlocks = comparesBlocks(template)
  const plan = planOf(blocks, threshold, compareBlocks)
  const planned = plan.filter((step) => step.work)
  // Work intervals in order, each with the pause before it: a short pause is what
  // tells two pieces of one interval apart from two intervals.
  const detected: { readonly interval: ActualInterval; readonly gapBefore: number }[] = []
  let pause = 0
  for (const interval of input.intervals) {
    if (interval.kind === 'work' && interval.seconds >= MIN_DETECTED_SECONDS) {
      detected.push({ interval, gapBefore: pause })
      pause = 0
    } else {
      pause += interval.seconds
    }
  }

  const measurable = detected.some(({ interval }) => percentOfThreshold(interval, threshold) !== null)
  const shortIntervals =
    planned.length > 0 &&
    planned.every((step) => step.seconds <= SHORT_INTERVAL_SECONDS) &&
    detected.length < planned.length / 2
  const unavailable =
    planned.length === 0
      ? null
      : detected.length === 0
        ? 'intervals.icu hat in dieser Aktivität keine Intervalle erkannt.'
        : !measurable
          ? threshold.metric === 'power'
            ? 'Keine Leistungsdaten — die Einheit lief ohne Wattmessung.'
            : 'Keine Tempodaten für die Intervalle.'
          : shortIntervals
            ? 'Kurze Intervalle fasst intervals.icu zu Blöcken zusammen — einzeln lassen sie sich nicht vergleichen.'
            : null

  const alignment = alignIntervals(
    planned.map((step) => {
      const range = step.range ?? { low: step.percent, high: step.percent }
      return { seconds: step.seconds, low: range.low, high: range.high }
    }),
    detected.map(({ interval, gapBefore }) => ({
      seconds: interval.seconds,
      percent: percentOfThreshold(interval, threshold),
      gapBefore,
    })),
  )

  const steps: readonly ExecutedStep[] = planned.map((step, index) => {
    const pieces = unavailable === null ? (alignment[index] ?? []) : []
    const actual =
      pieces.length === 0 ? undefined : combine(pieces.map((piece) => detected[piece]!.interval))
    const percent = actual ? percentOfThreshold(actual, threshold) : null
    const rounded = percent === null ? null : Math.round(percent)
    const range = step.range ?? { low: step.percent, high: step.percent }
    return {
      index: index + 1,
      plannedSeconds: step.seconds,
      low: range.low,
      high: range.high,
      actualSeconds: actual ? Math.round(actual.seconds) : null,
      actualPercent: rounded,
      actualValue: actual ? valueText(actual, threshold) : null,
      verdict:
        rounded === null ? null : rounded > range.high ? 'over' : rounded < range.low ? 'under' : 'on',
      cutShort: actual !== undefined && actual.seconds < step.seconds * CUT_SHORT_BELOW,
      pieces: pieces.length,
      span:
        actual?.startSeconds != null && actual.endSeconds != null
          ? { from: actual.startSeconds, to: actual.endSeconds }
          : null,
      heartRate: actual?.averageHeartrate == null ? null : Math.round(actual.averageHeartrate),
    }
  })

  let workIndex = 0
  const segments: readonly ExecutionSegment[] = plan.map((step) => {
    const base = {
      seconds: step.seconds,
      percent: step.percent,
      intensity: intensityOfPercent(step.percent),
      label: step.label,
    }
    // Only the work carries a verdict: which recovery was skipped cannot be read
    // from the detected intervals, and the strip does not pretend otherwise. Nor
    // does it call unmeasured work missed — it was ridden, just not with a meter.
    if (!step.work || unavailable !== null) return { ...base, state: 'rest' as const, done: 1 }
    const executed = steps[workIndex]
    workIndex += 1
    if (!executed || executed.actualSeconds === null || executed.verdict === null) {
      return { ...base, state: 'missing' as const, done: 0 }
    }
    return {
      ...base,
      state: executed.verdict === 'on' ? ('on' as const) : ('off' as const),
      done: Math.min(1, executed.actualSeconds / executed.plannedSeconds),
    }
  })

  const plannedSeconds = totalSeconds(blocks, threshold)
  const templateSeconds = totalSeconds(template.blocks, threshold)

  return {
    activityId: input.activityId,
    templateName: template.name,
    sport: input.sport,
    metric: threshold.metric,
    steps,
    segments,
    workPlannedSeconds: planned.reduce((sum, step) => sum + step.seconds, 0),
    workDoneSeconds: steps.reduce((sum, step) => sum + (step.actualSeconds ?? 0), 0),
    inTargetSeconds: steps
      .filter((step) => step.verdict === 'on')
      .reduce((sum, step) => sum + (step.actualSeconds ?? 0), 0),
    duration: { planned: plannedSeconds, actual: Math.round(input.movingSeconds) },
    load: {
      planned:
        templateSeconds === 0 ? template.load : Math.round((template.load * plannedSeconds) / templateSeconds),
      actual: Math.round(input.load),
    },
    compliance: input.compliance === null ? null : Math.round(input.compliance),
    // No count of detected against planned: intervals.icu marks warm-up, jogs and
    // cool-down as work often enough that the number misleads, and what matters —
    // an interval not run — already shows as missing.
    unavailable,
    trace: input.trace,
  }
}
