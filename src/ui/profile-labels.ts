import type { ProfileSegment } from '../coach/types.ts'

/**
 * What is written on the drawn workout: the watts or pace of the work, and minutes
 * along the bottom. Both are placed in percent of the width, because the drawing is
 * stretched to whatever room the card has and text inside it would stretch along.
 */

export type BlockLabel = {
  /** Centre of the label, in percent of the width. */
  readonly at: number
  readonly text: string
  /** How high the block under it reaches, in percent of threshold: the label sits on top of it. */
  readonly percent: number
}

export type AxisTick = { readonly at: number; readonly minutes: number }

/** The narrowest the drawing gets: a phone, less the card's padding. Labels have to fit there. */
const NARROWEST_PX = 300
/** One character of the readout type, tabular figures. */
const CHAR_PX = 6.4
const PADDING_PX = 6

const fits = (text: string, fraction: number): boolean => text.length * CHAR_PX + PADDING_PX <= fraction * NARROWEST_PX

type Placed = { readonly from: number; readonly to: number; readonly segment: ProfileSegment }

const place = (profile: readonly ProfileSegment[]): readonly Placed[] => {
  const total = profile.reduce((sum, segment) => sum + segment.seconds, 0)
  if (total === 0) return []
  return profile.reduce<readonly Placed[]>((placed, segment) => {
    const from = placed[placed.length - 1]?.to ?? 0
    return [...placed, { from, to: from + segment.seconds / total, segment }]
  }, [])
}

/**
 * The work is what gets a number: every hard or moderate block, or — in a session
 * that has none — its longest block. Easy blocks between intervals stay bare, or
 * the drawing turns back into the table it replaces.
 */
const workOf = (placed: readonly Placed[]): readonly Placed[] => {
  const withTarget = placed.filter((entry) => entry.segment.target !== null)
  const work = withTarget.filter((entry) => entry.segment.intensity !== 'easy')
  if (work.length > 0) return work
  const longest = [...withTarget].sort((left, right) => right.to - right.from - (left.to - left.from))[0]
  return longest ? [longest] : []
}

export const blockLabels = (profile: readonly ProfileSegment[]): readonly BlockLabel[] => {
  const work = workOf(place(profile))
  const text = (entry: Placed): string => entry.segment.target ?? ''
  const own = work.filter((entry) => fits(text(entry), entry.to - entry.from))
  const crowded = work.filter((entry) => !own.includes(entry))

  // Blocks too narrow for a number share one, written once over all of them: "5 × 275–288 W".
  const shared = [...new Set(crowded.map(text))].flatMap((target) => {
    const group = crowded.filter((entry) => text(entry) === target)
    const from = Math.min(...group.map((entry) => entry.from))
    const to = Math.max(...group.map((entry) => entry.to))
    const label = `${group.length} × ${target}`
    const free = !own.some((entry) => entry.from < to && entry.to > from)
    const percent = Math.max(...group.map((entry) => entry.segment.percent))
    return free && fits(label, to - from) ? [{ from, to, label, percent }] : []
  })
  // Two shared numbers over the same stretch would be printed on top of each other.
  const apart = shared.filter(
    (span, index) => !shared.slice(0, index).some((earlier) => earlier.from < span.to && earlier.to > span.from),
  )

  return [
    ...own.map((entry) => ({ at: ((entry.from + entry.to) / 2) * 100, text: text(entry), percent: entry.segment.percent })),
    ...apart.map((span) => ({ at: ((span.from + span.to) / 2) * 100, text: span.label, percent: span.percent })),
  ].sort((left, right) => left.at - right.at)
}

const STEPS_MIN = [5, 10, 15, 20, 30, 60, 120] as const
const MOST_TICKS = 6
/** Past this a number would run into the total at the right end of the axis. */
const LAST_AT = 80

/** Round minutes along the bottom, few enough to read on a phone. */
export const axisTicks = (totalSeconds: number): readonly AxisTick[] => {
  const totalMinutes = totalSeconds / 60
  if (totalMinutes <= 0) return []
  const step = STEPS_MIN.find((candidate) => totalMinutes / candidate <= MOST_TICKS) ?? 120
  return Array.from({ length: Math.floor(totalMinutes / step) + 1 }, (_unused, index) => ({
    minutes: index * step,
    at: ((index * step) / totalMinutes) * 100,
  })).filter((tick) => tick.at <= LAST_AT)
}
