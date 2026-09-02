import type { Block, Step, SportThreshold, WorkoutTemplate } from './types.ts'
import { formatSeconds } from './dates.ts'

const stepLine = (step: Step): string =>
  ['-', step.duration, step.target, step.cadence, step.label].filter(Boolean).join(' ')

/**
 * Renders a workout into the intervals.icu description syntax. Repeat headers
 * need a blank line above and below to be parsed as a block.
 */
export const toIntervalsText = (blocks: readonly Block[]): string => {
  const lines = blocks.flatMap((block) =>
    block.kind === 'step'
      ? [stepLine(block)]
      : ['', `${block.times}x`, ...block.steps.map(stepLine), ''],
  )
  return lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// Matches a single percentage or a range such as "97-102%".
const PERCENT_PATTERN = /(\d+(?:\.\d+)?)(?:\s*-\s*(\d+(?:\.\d+)?))?\s*%/g

const percentages = (target: string): readonly number[] =>
  [...target.matchAll(PERCENT_PATTERN)].flatMap((match) =>
    [match[1], match[2]].filter((value): value is string => value !== undefined).map(Number),
  )

const watts = (percent: number, ftp: number): number => Math.round((percent / 100) * ftp)

/** Pace percentages in intervals.icu scale speed, so a higher percentage is a faster pace. */
const paceFromPercent = (percent: number, thresholdPace: number): number =>
  thresholdPace / (percent / 100)

const renderPace = (
  values: readonly number[],
  thresholdPace: number,
  unit: string,
): string => {
  const paces = values.map((value) => paceFromPercent(value, thresholdPace))
  const sorted = [...paces].sort((left, right) => left - right)
  return `${[...new Set(sorted.map(formatSeconds))].join('–')}${unit}`
}

const humanTarget = (target: string, threshold: SportThreshold): string => {
  const values = percentages(target)
  if (values.length === 0) return target
  const isRamp = /ramp/i.test(target)

  if (threshold.metric === 'pace') return renderPace(values, threshold.thresholdSecPerKm, '/km')
  if (threshold.metric === 'swimPace') return renderPace(values, threshold.cssSecPer100m, '/100m')

  const powers = [...new Set(values.map((value) => watts(value, threshold.ftp)))]
  return `${powers.join(isRamp ? '→' : '–')} W${isRamp ? ' (Rampe)' : ''}`
}

const humanDuration = (duration: string): string => {
  const metres = /^(\d+(?:\.\d+)?)mtr$/i.exec(duration)
  if (metres) return `${metres[1]} m`
  const kilometres = /^(\d+(?:\.\d+)?)km$/i.exec(duration)
  if (kilometres) return `${kilometres[1]} km`
  const time = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i.exec(duration)
  if (!time || duration.length === 0) return duration
  const [, hours, minutes, seconds] = time
  return [hours && `${hours}h`, minutes && `${minutes}min`, seconds && `${seconds}s`]
    .filter(Boolean)
    .join(' ')
}

const humanStep = (step: Step, threshold: SportThreshold): string =>
  [
    `${humanDuration(step.duration)} @ ${humanTarget(step.target, threshold)}`,
    step.cadence,
    step.label && `(${step.label})`,
  ]
    .filter(Boolean)
    .join(' ')

/** Human readable steps with absolute watt and pace targets for the UI. */
export const toHumanSteps = (
  blocks: readonly Block[],
  threshold: SportThreshold,
): readonly string[] =>
  blocks.map((block) =>
    block.kind === 'step'
      ? humanStep(block, threshold)
      : `${block.times}× [ ${block.steps.map((step) => humanStep(step, threshold)).join(' | ')} ]`,
  )

export const describeWorkout = (template: WorkoutTemplate, reason: string): string =>
  `${toIntervalsText(template.blocks)}\n\n${template.coachNote}\n\nWarum heute: ${reason}\n\n(automatisch erstellt von intervals-coach)`

/** Race pace per km for a target time over a distance. */
export const racePaceSecPerKm = (targetTimeSec: number, distanceKm: number): number =>
  targetTimeSec / distanceKm

/** Swimmers read pace per 100 m, not per km. */
export const racePaceSecPer100m = (targetTimeSec: number, distanceKm: number): number =>
  targetTimeSec / (distanceKm * 10)
