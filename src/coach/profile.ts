import type { Block, IntensityClass, ProfileSegment, SportThreshold } from './types.ts'
import { flattenBlocks } from './library.ts'
import { percentages } from './format.ts'
import { estimateSeconds } from './variant.ts'

/**
 * A workout as a shape instead of a table. "5 x 1km @ 98-102 % Pace" has to be
 * read; a profile is recognised. Built here rather than in the browser because
 * only the server knows the athlete's threshold, which is what turns a distance
 * step into a width.
 */

/** At or above threshold is hard; clearly below it is recovery. */
const HARD_FROM = 95
const MODERATE_FROM = 80

/** A step without a percentage — a drill, a free swim — sits at recovery level. */
const UNSPECIFIED_PERCENT = 60

export const intensityOfPercent = (percent: number): IntensityClass =>
  percent >= HARD_FROM ? 'hard' : percent >= MODERATE_FROM ? 'moderate' : 'easy'

/** A ramp spans two values; the middle is the one height it can be drawn at. */
const percentOf = (target: string): number => {
  const values = percentages(target)
  if (values.length === 0) return UNSPECIFIED_PERCENT
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
}

export const profileOf = (
  blocks: readonly Block[],
  threshold: SportThreshold,
): readonly ProfileSegment[] =>
  flattenBlocks(blocks)
    .map((step) => {
      const percent = percentOf(step.target)
      return {
        seconds: estimateSeconds(step.duration, threshold),
        percent,
        intensity: intensityOfPercent(percent),
        label: step.label ?? null,
      }
    })
    // A step of zero length cannot be drawn and would only add a seam.
    .filter((segment) => segment.seconds > 0)
