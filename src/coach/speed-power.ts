import type { Block, RideEstimate, EstimatedBlock } from './types.ts'
import { estimateSeconds } from './variant.ts'

/**
 * A ride recorded without power and without heart rate still says what it was:
 * outdoors, speed and the climb are physics, and physics says what it took.
 * Rolling resistance, air and gravity hold the bike back, and what the rider adds
 * on top goes into getting faster. Each is a guess in its own way — the wind is
 * unknown, the position too — so the watts are rough. When and how often the
 * rider pushed is not: forty seconds of speeding up, twenty of rolling out, six
 * times in a row, is not what traffic does.
 */

/** Bumped whenever the reading changes, so stored estimates are made again. */
export const ESTIMATE_VERSION = 1

/** A road bike with bottles and a computer; the rider's weight comes from the profile. */
const BIKE_KG = 9
/** Hoods, not drops: what most riders hold most of the time. */
const CDA = 0.32
const CRR = 0.005
const AIR_DENSITY = 1.2
const GRAVITY = 9.81
/** Wheels and cranks are spun up too, not only carried. */
const ROTATING_MASS = 1.04

/** A hole longer than this is a stop, not the recording skipping. */
const MAX_FILLED_GAP = 5
/** Grade over this far either side: one altitude sample is noise, a hundred metres a slope. */
const GRADE_HALF_WINDOW_M = 40
const MAX_GRADE = 0.15
/** Rolling down a hill or braking for a corner says nothing about what the legs did. */
const DESCENT_GRADE = -0.03
const BRAKING = -0.8
/** Slower than this is pushing off or standing at a light. */
const MIN_SPEED = 2
const MAX_WATTS = 2000

/** Where work begins in a template, in percent of threshold. */
const WORK_FROM = 88
/** A single long effort is told by the riding around it. */
const SOLO_PAD_SECONDS = 120
/** Below this share of readable seconds, a block is neither found nor missing. */
const MIN_READABLE = 0.6
/** How much more the work has to show than the rests, in shares of FTP. */
const FOUND_CONTRAST = 0.3
const UNCLEAR_CONTRAST = 0.15
/** The work itself, against its target: the wind alone can take a fifth. */
const FOUND_SHARE_OF_TARGET = 0.75

export type SpeedStreams = {
  readonly time: readonly (number | null)[]
  /** Metres per second. */
  readonly speed: readonly (number | null)[] | null
  readonly altitude?: readonly (number | null)[] | null
  readonly distance?: readonly (number | null)[] | null
}

/** One second of the ride, estimated. */
export type PowerSeries = {
  /** Watts, never below zero; zero while stopped. */
  readonly watts: Float64Array
  /** Whether the second says anything about effort: rolling downhill, braking or standing does not. */
  readonly readable: Uint8Array
  /** Whether the rider was moving at all, for the load. */
  readonly moving: Uint8Array
}

const isNumber = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value)

/**
 * Onto one sample per second. Short holes are filled in a straight line; a long
 * one is a stop and stays empty.
 */
const resample = (
  time: readonly (number | null)[],
  values: readonly (number | null)[],
  length: number,
): { readonly series: Float64Array; readonly present: Uint8Array } => {
  const series = new Float64Array(length)
  const present = new Uint8Array(length)
  let previous: { t: number; v: number } | null = null
  for (let index = 0; index < time.length; index += 1) {
    const t = time[index]
    const v = values[index]
    if (!isNumber(t) || !isNumber(v) || t < 0 || t >= length) continue
    const second = Math.round(t)
    if (previous && second > previous.t + 1 && second - previous.t <= MAX_FILLED_GAP) {
      for (let fill = previous.t + 1; fill < second; fill += 1) {
        const share = (fill - previous.t) / (second - previous.t)
        series[fill] = previous.v + (v - previous.v) * share
        present[fill] = 1
      }
    }
    series[second] = v
    present[second] = 1
    previous = { t: second, v }
  }
  return { series, present }
}

/**
 * The road goes on while the recording pauses or the barometer has not woken
 * up yet: altitude is carried across every hole, so no slope appears from nowhere.
 */
const bridge = (resampled: { readonly series: Float64Array; readonly present: Uint8Array }): void => {
  const { series, present } = resampled
  let last = -1
  for (let index = 0; index < series.length; index += 1) {
    if (!present[index]) continue
    const from = last < 0 ? 0 : last + 1
    for (let fill = from; fill < index; fill += 1) {
      series[fill] = last < 0 ? (series[index] ?? 0) : (series[last] ?? 0) + (((series[index] ?? 0) - (series[last] ?? 0)) * (fill - last)) / (index - last)
      present[fill] = 1
    }
    last = index
  }
  for (let fill = last + 1; last >= 0 && fill < series.length; fill += 1) {
    series[fill] = series[last] ?? 0
    present[fill] = 1
  }
}

const centred = (values: Float64Array, present: Uint8Array, half: number): Float64Array => {
  const out = new Float64Array(values.length)
  for (let index = 0; index < values.length; index += 1) {
    if (!present[index]) continue
    let sum = 0
    let count = 0
    for (let offset = -half; offset <= half; offset += 1) {
      const at = index + offset
      if (at >= 0 && at < values.length && present[at]) {
        sum += values[at] ?? 0
        count += 1
      }
    }
    out[index] = count > 0 ? sum / count : 0
  }
  return out
}

/**
 * The power a ride took, second by second, from speed and the climb. Null when
 * the recording lacks either: on the flat a guess at the hills would be a guess
 * at everything.
 */
export const estimatePower = (streams: SpeedStreams, riderKg: number): PowerSeries | null => {
  const { time, speed, altitude } = streams
  if (!speed || !altitude || time.length === 0) return null
  const last = time.reduce<number>((top, t) => (isNumber(t) && t > top ? t : top), 0)
  const length = Math.round(last) + 1
  if (length < 60) return null

  const v = resample(time, speed, length)
  const alt = resample(time, altitude, length)
  if (alt.present.reduce((sum, flag) => sum + flag, 0) < length / 2) return null
  bridge(alt)
  const recordedDistance = streams.distance ? resample(time, streams.distance, length) : null

  const smoothSpeed = centred(v.series, v.present, 1)
  const smoothAltitude = centred(alt.series, alt.present, 2)
  // Where the distance was not recorded, the speed says it.
  const distance = new Float64Array(length)
  for (let index = 1; index < length; index += 1) {
    distance[index] =
      recordedDistance && recordedDistance.present[index]
        ? (recordedDistance.series[index] ?? 0)
        : (distance[index - 1] ?? 0) + (v.present[index] ? (v.series[index] ?? 0) : 0)
  }

  const grade = new Float64Array(length)
  let low = 0
  let high = 0
  for (let index = 0; index < length; index += 1) {
    const here = distance[index] ?? 0
    while (low < index && (distance[low] ?? 0) < here - GRADE_HALF_WINDOW_M) low += 1
    while (high < length - 1 && (distance[high] ?? 0) < here + GRADE_HALF_WINDOW_M) high += 1
    const run = (distance[high] ?? 0) - (distance[low] ?? 0)
    const rise = (smoothAltitude[high] ?? 0) - (smoothAltitude[low] ?? 0)
    grade[index] = run > GRADE_HALF_WINDOW_M / 2 ? Math.max(-MAX_GRADE, Math.min(MAX_GRADE, rise / run)) : 0
  }

  const mass = riderKg + BIKE_KG
  const watts = new Float64Array(length)
  const readable = new Uint8Array(length)
  const moving = new Uint8Array(length)
  for (let index = 0; index < length; index += 1) {
    if (!v.present[index]) continue
    const speedNow = smoothSpeed[index] ?? 0
    const before = v.present[index - 1] ? (smoothSpeed[index - 1] ?? speedNow) : speedNow
    const after = v.present[index + 1] ? (smoothSpeed[index + 1] ?? speedNow) : speedNow
    const acceleration = (after - before) / 2
    const slope = grade[index] ?? 0
    const resisting = mass * GRAVITY * (CRR + slope) + 0.5 * AIR_DENSITY * CDA * speedNow * speedNow
    const power = speedNow * (resisting + ROTATING_MASS * mass * acceleration)
    watts[index] = Math.max(0, Math.min(MAX_WATTS, power))
    moving[index] = speedNow >= MIN_SPEED / 2 ? 1 : 0
    readable[index] = speedNow >= MIN_SPEED && slope >= DESCENT_GRADE && acceleration >= BRAKING ? 1 : 0
  }
  return { watts, readable, moving }
}

/** One stretch of a group as the template prescribes it. */
type Segment = { readonly seconds: number; readonly work: boolean; readonly percent: number }

/** One set; `pad` is the easy riding added either side of a lone effort to set it off against. */
type Group = { readonly segments: readonly Segment[]; readonly pad: number }

const TARGET_PATTERN = /(\d+)(?:-(\d+))?%/

const percentOf = (target: string): number => {
  const match = TARGET_PATTERN.exec(target)
  if (!match?.[1]) return 0
  return (Number(match[1]) + Number(match[2] ?? match[1])) / 2
}

const RIDE_SECONDS = { metric: 'power', ftp: 1 } as const

/**
 * The structured work of a session, one group per set: a repeat with work in it,
 * or a single long effort with easy riding either side. Warm-up, the rests
 * between sets and the cool-down are only what lies between the groups.
 */
export const workGroups = (blocks: readonly Block[]): readonly Group[] =>
  blocks.flatMap((block) => {
    const steps = block.kind === 'repeat' ? Array.from({ length: block.times }, () => block.steps).flat() : [block]
    const segments = steps.map((step) => {
      const percent = percentOf(step.target)
      return { seconds: estimateSeconds(step.duration, RIDE_SECONDS), work: percent >= WORK_FROM, percent }
    })
    if (!segments.some((segment) => segment.work) || segments.some((segment) => segment.seconds <= 0)) return []
    if (segments.every((segment) => segment.work)) {
      const pad = { seconds: SOLO_PAD_SECONDS, work: false, percent: 0 }
      return [{ segments: [pad, ...segments, pad], pad: SOLO_PAD_SECONDS }]
    }
    return [{ segments, pad: 0 }]
  })

type Placement = {
  readonly contrast: number
  readonly onWatts: number
  readonly offWatts: number
  readonly readableShare: number
}

/** Running sums, so a placement costs one subtraction per segment instead of one per second. */
const sums = (series: PowerSeries) => {
  const length = series.watts.length
  const watts = new Float64Array(length + 1)
  const count = new Float64Array(length + 1)
  for (let index = 0; index < length; index += 1) {
    const readable = series.readable[index] ?? 0
    watts[index + 1] = (watts[index] ?? 0) + (readable ? (series.watts[index] ?? 0) : 0)
    count[index + 1] = (count[index] ?? 0) + readable
  }
  return { watts, count }
}

const place = (
  group: readonly Segment[],
  start: number,
  prefix: ReturnType<typeof sums>,
): Placement => {
  let onSum = 0
  let onCount = 0
  let onSeconds = 0
  let offSum = 0
  let offCount = 0
  let at = start
  for (const segment of group) {
    const end = at + segment.seconds
    const sum = (prefix.watts[end] ?? 0) - (prefix.watts[at] ?? 0)
    const count = (prefix.count[end] ?? 0) - (prefix.count[at] ?? 0)
    if (segment.work) {
      onSum += sum
      onCount += count
      onSeconds += segment.seconds
    } else {
      offSum += sum
      offCount += count
    }
    at = end
  }
  const onWatts = onCount > 0 ? onSum / onCount : 0
  const offWatts = offCount > 0 ? offSum / offCount : 0
  return { contrast: onWatts - offWatts, onWatts, offWatts, readableShare: onSeconds > 0 ? onCount / onSeconds : 0 }
}

const groupSeconds = (group: Group): number => group.segments.reduce((sum, segment) => sum + segment.seconds, 0)

/**
 * Where each set of a session lies in the ride, in order and without overlap,
 * so that together they stand out most from the riding around them. Every set
 * gets a place — whether it was ridden there is the verdict's to say.
 */
const arrange = (groups: readonly Group[], series: PowerSeries): readonly number[] | null => {
  const length = series.watts.length
  const lengths = groups.map(groupSeconds)
  if (lengths.reduce((sum, seconds) => sum + seconds, 0) > length) return null
  const prefix = sums(series)
  const scoreAt = (group: Group, start: number): number => {
    const placement = place(group.segments, start, prefix)
    return placement.readableShare >= MIN_READABLE ? placement.contrast : 0
  }

  // best[g][s]: the most the first g+1 sets can stand out with set g starting at s or earlier.
  const best: Float64Array[] = []
  const from: Int32Array[] = []
  groups.forEach((group, g) => {
    const total = new Float64Array(length).fill(Number.NEGATIVE_INFINITY)
    const start = new Int32Array(length).fill(-1)
    const previous = g > 0 ? best[g - 1] : null
    const previousLength = g > 0 ? (lengths[g - 1] ?? 0) : 0
    let running = Number.NEGATIVE_INFINITY
    let runningStart = -1
    for (let s = 0; s + (lengths[g] ?? 0) <= length; s += 1) {
      const before = previous ? (s - previousLength >= 0 ? (previous[s - previousLength] ?? -Infinity) : -Infinity) : 0
      const here = before === Number.NEGATIVE_INFINITY ? before : before + scoreAt(group, s)
      if (here > running) {
        running = here
        runningStart = s
      }
      total[s] = running
      start[s] = runningStart
    }
    for (let s = Math.max(0, length - (lengths[g] ?? 0) + 1); s < length; s += 1) {
      total[s] = running
      start[s] = runningStart
    }
    best.push(total)
    from.push(start)
  })

  const starts: number[] = []
  let limit = length - 1
  for (let g = groups.length - 1; g >= 0; g -= 1) {
    const s = from[g]?.[limit] ?? -1
    if (s < 0) return null
    starts.unshift(s)
    limit = s - (lengths[g - 1] ?? 0)
    if (g > 0 && limit < 0) return null
  }
  return starts
}

const average = (values: readonly number[]): number =>
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length

/** Each set of the session: found where its work stands out and comes near its target, unclear where it cannot be read. */
export const findBlocks = (
  blocks: readonly Block[],
  series: PowerSeries,
  ftp: number,
): readonly EstimatedBlock[] => {
  const groups = workGroups(blocks)
  if (groups.length === 0) return []
  const starts = arrange(groups, series)
  if (!starts) return []
  const prefix = sums(series)
  return groups.map((group, index) => {
    const start = starts[index] ?? 0
    const placement = place(group.segments, start, prefix)
    const work = group.segments.filter((segment) => segment.work)
    const target = (average(work.map((segment) => segment.percent)) / 100) * ftp
    const verdict =
      placement.readableShare < MIN_READABLE
        ? 'unclear'
        : placement.contrast >= FOUND_CONTRAST * ftp && placement.onWatts >= FOUND_SHARE_OF_TARGET * target
          ? 'found'
          : placement.contrast >= UNCLEAR_CONTRAST * ftp
            ? 'unclear'
            : 'missing'
    return {
      startSecond: start + group.pad,
      seconds: groupSeconds(group) - 2 * group.pad,
      verdict,
      workWatts: Math.round(placement.onWatts),
      restWatts: Math.round(placement.offWatts),
      targetWatts: Math.round(target),
    } satisfies EstimatedBlock
  })
}

/** intervals.icu's default power zones, as tops in percent of FTP; sweet spot runs across Z3 and Z4. */
const ZONE_TOPS: readonly (readonly [string, number])[] = [
  ['Z1', 55],
  ['Z2', 75],
  ['Z3', 90],
  ['Z4', 105],
  ['Z5', 120],
  ['Z6', 150],
  ['Z7', Number.POSITIVE_INFINITY],
]
const SWEET_SPOT = [84, 97] as const

const zoneOf = (percent: number): string => ZONE_TOPS.find(([, top]) => percent <= top)?.[0] ?? 'Z7'

/**
 * Thirty seconds, as normalised power has it: the body does not answer faster
 * than that. The load weighs those averages by their square, not by the fourth
 * power normalised power uses: the fourth power is right for measured watts, but
 * here it would mostly weigh the wind. A tail wind of a few minutes reads as a
 * surge, and to the fourth power a loop on a windy day came out half again as
 * hard as it was; squared, it stays within a quarter or so, and the 40/20 itself
 * comes out about right.
 */
const ROLLING_SECONDS = 30

const rolling = (series: PowerSeries, seconds: number): Float64Array => {
  const out = new Float64Array(series.watts.length)
  let sum = 0
  let count = 0
  for (let index = 0; index < series.watts.length; index += 1) {
    if (series.moving[index]) {
      sum += series.watts[index] ?? 0
      count += 1
    }
    const leaving = index - seconds
    if (leaving >= 0 && series.moving[leaving]) {
      sum -= series.watts[leaving] ?? 0
      count -= 1
    }
    out[index] = count > 0 ? sum / count : 0
  }
  return out
}

/**
 * Time in zone. Inside a set that was found, each work and each rest counts at
 * that set's average — thirty seconds of rolling would smear a 40/20 into
 * threshold. Elsewhere the thirty-second average decides.
 */
const zoneSecondsOf = (
  series: PowerSeries,
  blocks: readonly Block[],
  found: readonly EstimatedBlock[],
  ftp: number,
): Record<string, number> => {
  const smooth = rolling(series, ROLLING_SECONDS)
  const assigned = new Float64Array(series.watts.length).fill(Number.NaN)
  const groups = workGroups(blocks)
  found.forEach((block, index) => {
    const group = groups[index]
    if (block.verdict !== 'found' || !group) return
    let at = block.startSecond - group.pad
    for (const segment of group.segments) {
      const watts = segment.work ? block.workWatts : block.restWatts
      for (let second = at; second < at + segment.seconds && second < assigned.length; second += 1) assigned[second] = watts
      at += segment.seconds
    }
  })
  const zones: Record<string, number> = {}
  for (let index = 0; index < series.watts.length; index += 1) {
    if (!series.moving[index]) continue
    const watts = Number.isNaN(assigned[index] ?? Number.NaN) ? (smooth[index] ?? 0) : (assigned[index] ?? 0)
    const percent = (watts / ftp) * 100
    const zone = zoneOf(percent)
    zones[zone] = (zones[zone] ?? 0) + 1
    if (percent >= SWEET_SPOT[0] && percent <= SWEET_SPOT[1]) zones['SS'] = (zones['SS'] ?? 0) + 1
  }
  return zones
}

/**
 * The whole reading of one ride: its load from the weighted power over FTP, its time
 * in zone, and — when it was ridden as a session of this app — where that
 * session's sets lie. Null when speed or the climb were not recorded.
 */
export const estimateRide = (
  streams: SpeedStreams,
  riderKg: number,
  ftp: number,
  blocks: readonly Block[] | null,
): RideEstimate | null => {
  if (ftp <= 0) return null
  const series = estimatePower(streams, riderKg)
  if (!series) return null
  const movingSeconds = series.moving.reduce((sum, flag) => sum + flag, 0)
  if (movingSeconds < 600) return null

  const smooth = rolling(series, ROLLING_SECONDS)
  let squares = 0
  let total = 0
  for (let index = 0; index < series.watts.length; index += 1) {
    if (!series.moving[index]) continue
    squares += (smooth[index] ?? 0) ** 2
    total += series.watts[index] ?? 0
  }
  const weighted = Math.sqrt(squares / movingSeconds)
  const intensity = weighted / ftp
  const found = blocks ? findBlocks(blocks, series, ftp) : []
  return {
    version: ESTIMATE_VERSION,
    load: Math.round(((movingSeconds * weighted * intensity) / (ftp * 3600)) * 100),
    intensity: Math.round(intensity * 100),
    weightedWatts: Math.round(weighted),
    averageWatts: Math.round(total / movingSeconds),
    zoneSeconds: zoneSecondsOf(series, blocks ?? [], found, ftp),
    blocks: found,
  }
}
