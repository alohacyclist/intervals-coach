import type {
  Block,
  Execution,
  ExecutedStep,
  ExecutionSegment,
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
}

/**
 * Which detected interval belongs to which planned one. Order alone is not
 * enough: one surge between the third and fourth interval would pair the plan's
 * fourth with the surge and shift every interval after it by one. So the pairing
 * keeps the order and, where the counts differ, leaves out whichever intervals
 * fit the planned durations worst — a 90 second surge among four-minute
 * intervals is the one left over, not the last interval ridden.
 *
 * Returns, for each planned interval, the index of its detected partner or -1.
 */
export const pairIntervals = (
  planned: readonly number[],
  detected: readonly number[],
): readonly number[] => {
  const cost = (plan: number, actual: number): number =>
    plan > 0 && actual > 0 ? Math.abs(Math.log(actual / plan)) : 10
  // Match the shorter list completely into the longer one, keeping both in order.
  const plannedShorter = planned.length <= detected.length
  const short = plannedShorter ? planned : detected
  const long = plannedShorter ? detected : planned
  const costOf = (i: number, j: number) =>
    plannedShorter ? cost(short[i]!, long[j]!) : cost(long[j]!, short[i]!)

  const rows = short.length + 1
  const columns = long.length + 1
  const table = Array.from({ length: rows }, (_row, i) =>
    Array.from({ length: columns }, () => (i === 0 ? 0 : Number.POSITIVE_INFINITY)),
  )
  for (let i = 1; i < rows; i += 1) {
    for (let j = i; j < columns; j += 1) {
      table[i]![j] = Math.min(table[i]![j - 1]!, table[i - 1]![j - 1]! + costOf(i - 1, j - 1))
    }
  }

  // Walk back from the end. On a tie the later element is the one left out, so a
  // session stopped early reads as missing its last interval, not its first.
  const partner = new Map<number, number>()
  let i = short.length
  let j = long.length
  while (i > 0 && j > 0) {
    if (table[i]![j - 1]! <= table[i - 1]![j - 1]! + costOf(i - 1, j - 1) && j - 1 >= i) {
      j -= 1
    } else {
      partner.set(i - 1, j - 1)
      i -= 1
      j -= 1
    }
  }

  return planned.map((_plan, index) => {
    if (plannedShorter) return partner.get(index) ?? -1
    const match = [...partner.entries()].find(([, plannedIndex]) => plannedIndex === index)
    return match ? match[0] : -1
  })
}

export const compareExecution = (input: ExecutionInput): Execution => {
  const { template, blocks, threshold } = input
  const compareBlocks = !NO_BLOCKS_TO_COMPARE.includes(template.stimulus)
  const plan = planOf(blocks, threshold, compareBlocks)
  const planned = plan.filter((step) => step.work)
  const detected = input.intervals.filter(
    (interval) => interval.kind === 'work' && interval.seconds >= MIN_DETECTED_SECONDS,
  )

  const measurable = detected.some((interval) => percentOfThreshold(interval, threshold) !== null)
  const unavailable =
    planned.length === 0
      ? null
      : detected.length === 0
        ? 'intervals.icu hat in dieser Aktivität keine Intervalle erkannt.'
        : !measurable
          ? threshold.metric === 'power'
            ? 'Keine Leistungsdaten — die Einheit lief ohne Wattmessung.'
            : 'Keine Tempodaten für die Intervalle.'
          : null

  const partners = pairIntervals(
    planned.map((step) => step.seconds),
    detected.map((interval) => interval.seconds),
  )

  const steps: readonly ExecutedStep[] = planned.map((step, index) => {
    const partner = partners[index] ?? -1
    const actual = unavailable === null && partner >= 0 ? detected[partner] : undefined
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
    mismatch:
      unavailable === null && planned.length > 0 && detected.length !== planned.length
        ? { planned: planned.length, detected: detected.length }
        : null,
    unavailable,
  }
}
