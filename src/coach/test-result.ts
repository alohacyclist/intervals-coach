import type { Sport, SportThreshold } from './types.ts'
import type { ActivityStreams } from './trace.ts'

/**
 * Turning a maximal block into a threshold.
 *
 * The app prescribes the test, so it knows which effort was the test and can
 * read the number off it. Waiting instead for intervals.icu's own estimate to
 * move means waiting on a model that is bounded by everything else the athlete
 * has done — which is the very problem the test exists to escape.
 */

/** Below this the effort is an interval, not a sustained maximal block. */
const MIN_TEST_SECONDS = 15 * 60
/** Beyond this the factors below stop describing the effort that was made. */
const MAX_TEST_SECONDS = 25 * 60

/** Twenty minutes all out sits above an hour's power by about this much. */
const POWER_FACTOR = 0.95
/** Running is the same idea in reverse: threshold pace is slower than test pace. */
const PACE_FACTOR = 1.05

export type MeasuredEffort = {
  readonly seconds: number
  readonly averageWatts: number | null
  readonly averageSpeedMps: number | null
}

/**
 * The best sustained stretch of the test.
 *
 * intervals.icu detects intervals from the recorded data, not from the workout
 * that was prescribed: a twenty minute block comes back split into five four
 * minute pieces, and the recoveries around it are typed as work like everything
 * else. So the block is found rather than looked up — the neighbouring stretch
 * of at least fifteen minutes whose time weighted average is the strongest.
 */
const bestSustained = (
  efforts: readonly MeasuredEffort[],
  valueOf: (effort: MeasuredEffort) => number | null,
): number | null => {
  const usable = efforts.map((effort) => ({ seconds: effort.seconds, value: valueOf(effort) }))

  return usable.reduce<number | null>((best, _unused, start) => {
    const window = usable.slice(start).reduce<{ seconds: number; sum: number; best: number | null }>(
      (running, entry) => {
        // A stretch with nothing to measure ends the window rather than skewing it.
        if (entry.value === null || running.seconds >= MAX_TEST_SECONDS) return running
        const seconds = running.seconds + entry.seconds
        const sum = running.sum + entry.value * entry.seconds
        const average = sum / seconds
        const reached = seconds >= MIN_TEST_SECONDS && seconds <= MAX_TEST_SECONDS
        return {
          seconds,
          sum,
          best: reached && (running.best === null || average > running.best) ? average : running.best,
        }
      },
      { seconds: 0, sum: 0, best: null },
    ).best
    if (window === null) return best
    return best === null || window > best ? window : best
  }, null)
}

/** How far a stretch may miss the prescribed distance and still count as it. */
const DISTANCE_TOLERANCE = 0.1
/** Beyond these, a "CSS" says more about the recording than about the swimmer. */
const MIN_CSS_SEC_PER_100M = 55
const MAX_CSS_SEC_PER_100M = 240

type Stretch = { readonly from: number; readonly to: number; readonly metres: number; readonly seconds: number }

type Piece = { readonly seconds: number; readonly metres: number }

const pieceOf = (effort: MeasuredEffort): Piece | null =>
  effort.averageSpeedMps !== null && effort.averageSpeedMps > 0
    ? { seconds: effort.seconds, metres: effort.seconds * effort.averageSpeedMps }
    : null

/** Every run of neighbouring efforts that covers about `metres`, with its time scaled to exactly that. */
const stretchesOf = (efforts: readonly MeasuredEffort[], metres: number): readonly Stretch[] => {
  const pieces = efforts.map(pieceOf)
  return pieces.flatMap((_unused, from) => {
    const following = pieces.slice(from)
    // A piece without speed cannot be measured, so it ends the run rather than skewing it.
    const gap = following.indexOf(null)
    const run = (gap === -1 ? following : following.slice(0, gap)) as readonly Piece[]
    return run
      .map((_piece, offset) => {
        const part = run.slice(0, offset + 1)
        const covered = part.reduce((sum, piece) => sum + piece.metres, 0)
        const seconds = part.reduce((sum, piece) => sum + piece.seconds, 0)
        return { from, to: from + offset, covered, seconds }
      })
      .filter(({ covered }) => Math.abs(covered - metres) <= metres * DISTANCE_TOLERANCE)
      .map(({ from: start, to, covered, seconds }) => ({ from: start, to, metres, seconds: (seconds * metres) / covered }))
  })
}

const fastest = (stretches: readonly Stretch[]): Stretch | null =>
  stretches.reduce<Stretch | null>((best, stretch) => (best === null || stretch.seconds < best.seconds ? stretch : best), null)

const overlaps = (left: Stretch, right: Stretch): boolean => left.from <= right.to && right.from <= left.to

/**
 * Critical swim speed from a 400 m and a 200 m all out: the pace of the extra
 * 200 m, (t400 − t200) ÷ 2 per 100 m. The 200 is found first, as the fastest
 * stretch of that length; the 400 is the fastest one that does not share an
 * effort with it, because intervals.icu may hand the two back in pieces and
 * with the easy swim between them typed as work.
 */
export const cssFromTest = (efforts: readonly MeasuredEffort[]): number | null => {
  const short = fastest(stretchesOf(efforts, 200))
  if (short === null) return null
  const long = fastest(stretchesOf(efforts, 400).filter((stretch) => !overlaps(stretch, short)))
  if (long === null) return null
  // The 200 has to be the quicker pace, or the difference measures nothing.
  if (short.seconds / 200 >= long.seconds / 400) return null
  const css = (long.seconds - short.seconds) / 2
  return css >= MIN_CSS_SEC_PER_100M && css <= MAX_CSS_SEC_PER_100M ? Math.round(css) : null
}

/** The maximal block of the ride and the run test. */
const TEST_BLOCK_SECONDS = 20 * 60
/**
 * Below this share of the current threshold the best twenty minutes were not a
 * test held to the end — a stop, a cramp, a test given up — and a value read off
 * them would only drag the targets down.
 */
export const HELD_PERCENT = 90

type Sample = { readonly time: number; readonly total: number }

const isNumber = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value)

/** A stream as a running total over time: watts become joules, speed becomes metres. */
const integrated = (time: readonly (number | null)[], values: readonly (number | null)[]): readonly Sample[] => {
  const samples: Sample[] = []
  let total = 0
  let previous: { readonly time: number; readonly value: number } | null = null
  for (let index = 0; index < time.length; index++) {
    const at = time[index]
    if (!isNumber(at)) continue
    if (previous !== null) total += previous.value * (at - previous.time)
    samples.push({ time: at, total })
    const value = values[index]
    // A hole in the recording counts as nothing done, never as the last value held on.
    previous = { time: at, value: isNumber(value) && value > 0 ? value : 0 }
  }
  return samples
}

/** The distance stream is already a running total; only the samples with both values count. */
const along = (time: readonly (number | null)[], distance: readonly (number | null)[]): readonly Sample[] =>
  time.flatMap((at, index) => {
    const metres = distance[index]
    return isNumber(at) && isNumber(metres) ? [{ time: at, total: metres }] : []
  })

/** The highest average over any stretch of at least `seconds`, the shortest such stretch at each end. */
const bestWindow = (samples: readonly Sample[], seconds: number): number | null => {
  let best: number | null = null
  let start = 0
  for (let end = 0; end < samples.length; end++) {
    const last = samples[end]!
    while (start + 1 < end && last.time - samples[start + 1]!.time >= seconds) start += 1
    const first = samples[start]!
    const span = last.time - first.time
    if (span < seconds) continue
    const average = (last.total - first.total) / span
    if (best === null || average > best) best = average
  }
  return best
}

export type StreamTest = {
  readonly metric: 'power' | 'pace'
  /** The best twenty minutes as they were: watts, or seconds per kilometre. */
  readonly average: number
  /** The threshold they give, in the same unit. */
  readonly value: number
  /** The best twenty minutes against the threshold set now, faster or stronger above 100. */
  readonly percent: number
}

/**
 * The ride and the run test read off the recording itself: the best twenty
 * minutes of it. intervals.icu's detected intervals may cut the block into
 * pieces and lose some of it on the way — the recording does not.
 */
export const thresholdFromStreams = (
  sport: Sport,
  streams: ActivityStreams,
  threshold: SportThreshold,
): StreamTest | null => {
  if (sport === 'Ride' && threshold.metric === 'power') {
    if (!streams.watts?.some(isNumber)) return null
    const watts = bestWindow(integrated(streams.time, streams.watts), TEST_BLOCK_SECONDS)
    if (watts === null || watts <= 0) return null
    return {
      metric: 'power',
      average: Math.round(watts),
      value: Math.round(watts * POWER_FACTOR),
      percent: Math.round((watts / threshold.ftp) * 100),
    }
  }
  if (sport === 'Run' && threshold.metric === 'pace') {
    const samples = streams.distance?.some(isNumber)
      ? along(streams.time, streams.distance)
      : streams.speed?.some(isNumber)
        ? integrated(streams.time, streams.speed)
        : null
    const speed = samples === null ? null : bestWindow(samples, TEST_BLOCK_SECONDS)
    if (speed === null || speed <= 0) return null
    const secondsPerKm = 1000 / speed
    return {
      metric: 'pace',
      average: Math.round(secondsPerKm),
      value: Math.round(secondsPerKm * PACE_FACTOR),
      percent: Math.round((threshold.thresholdSecPerKm / secondsPerKm) * 100),
    }
  }
  return null
}

/**
 * The threshold this test measured, in the sport's own unit — null when the
 * activity holds no sustained block, which means the test was not completed as
 * prescribed and nothing should be read into it.
 */
export const thresholdFromTest = (
  sport: Sport,
  efforts: readonly MeasuredEffort[],
): { readonly metric: SportThreshold['metric']; readonly value: number } | null => {
  if (sport === 'Ride') {
    const watts = bestSustained(efforts, (effort) =>
      effort.averageWatts !== null && effort.averageWatts > 0 ? effort.averageWatts : null,
    )
    return watts === null ? null : { metric: 'power', value: Math.round(watts * POWER_FACTOR) }
  }
  if (sport === 'Swim') {
    const css = cssFromTest(efforts)
    return css === null ? null : { metric: 'swimPace', value: css }
  }

  // Speed rather than pace, so that faster is larger and the best window is a maximum.
  const speed = bestSustained(efforts, (effort) =>
    effort.averageSpeedMps !== null && effort.averageSpeedMps > 0 ? effort.averageSpeedMps : null,
  )
  if (speed === null) return null
  return { metric: 'pace', value: Math.round((1000 / speed) * PACE_FACTOR) }
}
