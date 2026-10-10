import type { Block, Repeat, SportThreshold, Step } from './types.ts'

/**
 * Every session also exists as a short version, so a day with less time than
 * planned still trains the same thing. What gets cut depends on the stimulus:
 * interval work keeps its intervals at full length and full intensity and
 * loses repeats, while continuous work simply gets shorter — there the
 * duration is the stimulus. Warm-up and cool-down go first, because they cost
 * time without carrying adaptation.
 */

/** What "kurz" means: the session still fits into three quarters of an hour. */
export const SHORT_TARGET_MINUTES = 45
/** Below this saving a second version is noise, not a choice. */
export const MIN_SAVING_MINUTES = 12

const WARMUP_FLOOR_SEC = 10 * 60
const COOLDOWN_FLOOR_SEC = 5 * 60
/** Half of anything is the floor — cut more and it stops being that session. */
const MIN_KEEP_FRACTION = 0.5
const MIN_REPEATS = 2

const NOMINAL_SEC_PER_KM = 270

const METRES_PATTERN = /^(\d+(?:\.\d+)?)mtr$/i
const KILOMETRES_PATTERN = /^(\d+(?:\.\d+)?)km$/i
const TIME_PATTERN = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i

const secPerKm = (threshold: SportThreshold): number => {
  if (threshold.metric === 'pace') return threshold.thresholdSecPerKm
  if (threshold.metric === 'swimPace') return threshold.cssSecPer100m * 10
  return NOMINAL_SEC_PER_KM
}

/** Distance steps only have a duration once a pace is known. */
export const estimateSeconds = (duration: string, threshold: SportThreshold): number => {
  const metres = METRES_PATTERN.exec(duration)
  if (metres?.[1]) return Math.round((Number(metres[1]) / 1000) * secPerKm(threshold))
  const kilometres = KILOMETRES_PATTERN.exec(duration)
  if (kilometres?.[1]) return Math.round(Number(kilometres[1]) * secPerKm(threshold))
  if (duration.length === 0) return 0
  const time = TIME_PATTERN.exec(duration)
  if (!time) return 0
  const [, hours, minutes, seconds] = time
  return Number(hours ?? 0) * 3600 + Number(minutes ?? 0) * 60 + Number(seconds ?? 0)
}

const stepSeconds = (step: Step, threshold: SportThreshold): number =>
  estimateSeconds(step.duration, threshold)

const blockSeconds = (block: Block, threshold: SportThreshold): number =>
  block.kind === 'step'
    ? stepSeconds(block, threshold)
    : block.times * block.steps.reduce((sum, step) => sum + stepSeconds(step, threshold), 0)

export const totalSeconds = (blocks: readonly Block[], threshold: SportThreshold): number =>
  blocks.reduce((sum, block) => sum + blockSeconds(block, threshold), 0)

const isTimed = (duration: string): boolean =>
  !METRES_PATTERN.test(duration) && !KILOMETRES_PATTERN.test(duration)

const withMinutes = (step: Step, seconds: number): Step => ({
  ...step,
  duration: `${Math.max(1, Math.round(seconds / 60))}m`,
})

const replaceAt = (blocks: readonly Block[], index: number, block: Block): readonly Block[] =>
  blocks.map((current, position) => (position === index ? block : current))

/** A workout plus the plain-language list of what was taken out of it. */
export type Trim = { readonly blocks: readonly Block[]; readonly cuts: readonly string[] }

/** Warm-up and cool-down are the cheapest minutes to give up. */
const trimEdge = (
  trim: Trim,
  index: number,
  floorSec: number,
  threshold: SportThreshold,
): Trim => {
  const block = trim.blocks[index]
  if (!block || block.kind !== 'step' || !block.label || !isTimed(block.duration)) return trim
  const seconds = stepSeconds(block, threshold)
  if (seconds <= floorSec) return trim
  return {
    blocks: replaceAt(trim.blocks, index, withMinutes(block, floorSec)),
    cuts: [...trim.cuts, `${block.label} auf ${Math.round(floorSec / 60)} min`],
  }
}

const trimEdges = (blocks: readonly Block[], threshold: SportThreshold): Trim => {
  const warmed = trimEdge({ blocks, cuts: [] }, 0, WARMUP_FLOOR_SEC, threshold)
  return trimEdge(warmed, warmed.blocks.length - 1, COOLDOWN_FLOOR_SEC, threshold)
}

const repeatFloor = (times: number): number =>
  Math.max(MIN_REPEATS, Math.ceil(times * MIN_KEEP_FRACTION))

const repSeconds = (block: Repeat, threshold: SportThreshold): number =>
  block.steps.reduce((sum, step) => sum + stepSeconds(step, threshold), 0)

/**
 * Repeat blocks that are the same set written out several times — 3x6x40/20 is
 * three of them. They give way together, so the short version is still three
 * equal sets rather than one gutted set next to two whole ones.
 */
const twinsOf = (blocks: readonly Block[]): readonly (readonly number[])[] => {
  const keys = blocks.map((block) => (block.kind === 'repeat' ? JSON.stringify(block) : null))
  return keys.map((key) =>
    key === null ? [] : keys.flatMap((other, position) => (other === key ? [position] : [])),
  )
}

/**
 * Drops one repeat from the block with the longest single repetition, so the
 * main set gives way before short accessory work like strides does. Floors come
 * from the original workout, so repeated calls cannot walk a block below half.
 */
const dropOneRepeat = (
  blocks: readonly Block[],
  floors: readonly number[],
  twins: readonly (readonly number[])[],
  threshold: SportThreshold,
): readonly Block[] | null => {
  const index = blocks.reduce<number>((best, block, position) => {
    if (block.kind !== 'repeat' || block.times <= (floors[position] ?? Infinity)) return best
    const incumbent = blocks[best]
    if (incumbent?.kind !== 'repeat') return position
    return repSeconds(incumbent, threshold) >= repSeconds(block, threshold) ? best : position
  }, -1)

  const block = blocks[index]
  if (!block || block.kind !== 'repeat') return null
  const reduced: Repeat = { ...block, times: block.times - 1 }
  return (twins[index] ?? [index]).reduce(
    (current, position) => replaceAt(current, position, reduced),
    blocks,
  )
}

/** Names the change per interval block, so "4x9min" does not read as 12 of something. */
const repeatCuts = (
  original: readonly Block[],
  reduced: readonly Block[],
): readonly string[] => {
  const changes = original.flatMap((block, position) => {
    const after = reduced[position]
    return block.kind === 'repeat' && after?.kind === 'repeat' && after.times !== block.times
      ? [`${block.times}>${after.times}`]
      : []
  })
  const counted = changes.reduce<Readonly<Record<string, number>>>(
    (tally, change) => ({ ...tally, [change]: (tally[change] ?? 0) + 1 }),
    {},
  )
  return Object.entries(counted).map(([change, blocks]) => {
    const [from, to] = change.split('>')
    const prefix = blocks > 1 ? `${blocks}\u00d7` : ''
    return `${prefix}${to} statt ${prefix}${from} Intervalle`
  })
}

/**
 * Drops repeats while that gets closer to the target. Stopping at the nearest
 * fit rather than the first one under it keeps a session from losing a whole
 * interval to save two minutes.
 */
const reduceRepeats = (
  blocks: readonly Block[],
  targetSec: number,
  threshold: SportThreshold,
): Trim => {
  const floors = blocks.map((block) => (block.kind === 'repeat' ? repeatFloor(block.times) : 0))
  const twins = twinsOf(blocks)
  const missBy = (candidate: readonly Block[]) =>
    Math.abs(totalSeconds(candidate, threshold) - targetSec)
  // At most every repeat can be dropped once, which bounds the loop.
  const capacity = blocks.reduce((sum, block) => sum + (block.kind === 'repeat' ? block.times : 0), 0)
  const settled = Array.from({ length: capacity }).reduce<readonly Block[]>((current) => {
    const dropped = dropOneRepeat(current, floors, twins, threshold)
    return dropped && missBy(dropped) < missBy(current) ? dropped : current
  }, blocks)
  return { blocks: settled, cuts: repeatCuts(blocks, settled) }
}

/** The work itself: everything that is neither a repeat nor a named edge. */
const isMainStep = (block: Block): block is Step =>
  block.kind === 'step' && block.label === undefined && isTimed(block.duration)

/**
 * For continuous work the duration is the stimulus, so the whole main body
 * scales down together — shrinking only the longest step would turn a
 * progression run into a different workout. Sessions built from repeats never
 * come through here: their intervals stay exactly as long as prescribed.
 */
const shrinkContinuous = (trim: Trim, targetSec: number, threshold: SportThreshold): Trim => {
  const over = totalSeconds(trim.blocks, threshold) - targetSec
  if (over <= 0 || trim.blocks.some((block) => block.kind === 'repeat')) return trim
  const mainSec = trim.blocks
    .filter(isMainStep)
    .reduce((sum, step) => sum + stepSeconds(step, threshold), 0)
  if (mainSec === 0) return trim
  const keep = Math.max(MIN_KEEP_FRACTION, (mainSec - over) / mainSec)
  if (keep >= 1) return trim
  return {
    blocks: trim.blocks.map((block) =>
      isMainStep(block) ? withMinutes(block, stepSeconds(block, threshold) * keep) : block,
    ),
    cuts: [
      ...trim.cuts,
      `Hauptteil ${Math.round((mainSec * keep) / 60)} statt ${Math.round(mainSec / 60)} min`,
    ],
  }
}

/**
 * The same workout in less time. Intensity and interval length are never
 * touched — only how much of the work is done.
 *
 * The target is a fraction of the original rather than an absolute duration,
 * because step durations are estimates for distance-based work: measuring the
 * cut against the workout's own length keeps that estimation error out of it.
 */
export const shorten = (
  blocks: readonly Block[],
  threshold: SportThreshold,
  keepFraction: number,
): Trim => {
  const targetSec = totalSeconds(blocks, threshold) * keepFraction
  const trimmed = trimEdges(blocks, threshold)
  const repeats = reduceRepeats(trimmed.blocks, targetSec, threshold)
  const merged: Trim = { blocks: repeats.blocks, cuts: [...trimmed.cuts, ...repeats.cuts] }
  return shrinkContinuous(merged, targetSec, threshold)
}

const minutesLabel = (minutes: number): string =>
  `${Number.isInteger(minutes) ? minutes : minutes.toLocaleString('de-DE', { maximumFractionDigits: 1 })}min`

const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Replaces the first count the name gives as `<from>x`, but not the 4 of "14x". */
const replaceCount = (name: string, from: string, to: string): string =>
  name.replace(new RegExp(`(?<![\\d,])${escape(from)}x`), `${to}x`)

/**
 * The counts in a name follow the repeats: "3x6x40/20" with two intervals less
 * per set is "3x4x40/20", and "Over-Under 4x9min" with two of three
 * over-unders per set is "4x6min".
 */
const renameRepeats = (
  name: string,
  original: readonly Block[],
  shortened: readonly Block[],
  threshold: SportThreshold,
): string => {
  const twins = twinsOf(original)
  return original.reduce((current, block, index) => {
    const after = shortened[index]
    const sets = twins[index] ?? []
    // A group of sets is renamed once, from its first member.
    if (block.kind !== 'repeat' || after?.kind !== 'repeat' || sets[0] !== index) return current
    if (after.times === block.times) return current
    if (sets.length === 1) return replaceCount(current, String(block.times), String(after.times))

    const nested = `${sets.length}x${block.times}x`
    if (current.includes(nested)) return current.replace(nested, `${sets.length}x${after.times}x`)
    const rep = repSeconds(block, threshold) / 60
    return current.replace(
      new RegExp(`(?<![\\d,])${sets.length}x${escape(minutesLabel(block.times * rep))}`),
      `${sets.length}x${minutesLabel(after.times * rep)}`,
    )
  }, name)
}

const DURATION_PATTERN = /(?<![\d,])(\d+(?:,\d+)?)(min|h)(?![a-z])/i

const nameMinutes = (value: string, unit: string): number => {
  const amount = Number(value.replace(',', '.'))
  return unit.toLowerCase() === 'h' ? amount * 60 : amount
}

/**
 * Continuous work names its length: "Grundlage 75min" cut to fifty minutes is
 * "Grundlage 50min". The number may be the whole session or its main part, so
 * both are looked for.
 */
const renameDuration = (
  name: string,
  original: readonly Block[],
  shortened: readonly Block[],
  threshold: SportThreshold,
): string => {
  const match = DURATION_PATTERN.exec(name)
  if (!match?.[1] || !match[2]) return name
  const named = nameMinutes(match[1], match[2])
  const minutesOf = (blocks: readonly Block[]) => ({
    total: totalSeconds(blocks, threshold) / 60,
    main: blocks.filter(isMainStep).reduce((sum, step) => sum + stepSeconds(step, threshold), 0) / 60,
  })
  const before = minutesOf(original)
  const after = minutesOf(shortened)
  const now =
    Math.round(before.total) === named
      ? after.total
      : Math.round(before.main) === named
        ? after.main
        : null
  if (now === null || Math.round(now) === named) return name
  return name.replace(match[0], minutesLabel(Math.round(now)))
}

/**
 * The name of a shortened session, so the title says what is actually ridden.
 * Counts and durations the name does not mention are left alone — a name
 * without numbers stays the name it was.
 */
export const renameShortened = (
  name: string,
  original: readonly Block[],
  shortened: readonly Block[],
  threshold: SportThreshold,
): string =>
  original.some((block) => block.kind === 'repeat')
    ? renameRepeats(name, original, shortened, threshold)
    : renameDuration(name, original, shortened, threshold)
