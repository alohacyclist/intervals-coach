import type { Execution, ExecutionTrace, HeartNote, Sport, SportThreshold } from './types.ts'
import type { ActivityStreams, Span } from './trace.ts'
import { percentOf } from './trace.ts'

/**
 * Whether the heart rate of a session was recorded, or only written down. A
 * watch on the wrist fails in a few typical ways: it counts the cadence instead
 * of the pulse, sits too loose and reads far too low, or loses contact for
 * minutes. None of it shows in the number on the card — 168 bpm reads as a
 * measurement either way.
 *
 * What gives it away is the work. Heart rate follows power or pace with a lag of
 * a quarter of a minute to two, keeps climbing for minutes above threshold and
 * drifts up slowly over a long session. A stretch that leaves that relation by
 * more than its own noise, for more than a minute and a half, was not the heart.
 * The relation is fitted on the session itself, so it needs no threshold heart
 * rate, and the clean stretches then estimate the faulty ones.
 */

/**
 * Seconds per slot: ten for an hour, wider for longer sessions so the fit never
 * handles more than a few hundred — the Worker has milliseconds, not seconds.
 */
const MIN_GRID = 10
const MAX_SLOTS = 600
/** Below and above these, no sensor read a heart while moving. */
const LOWEST = 35
const HIGHEST = 225
/** Smart recording leaves holes this long; a longer one is a sensor without contact. */
const BRIDGE_SECONDS = 20
/**
 * How long heart rate takes to follow the work, tried in turn; the best fit
 * wins. After hard work it often comes down slower than it went up, so each
 * rise is tried with a fall as quick and with one twice as slow.
 */
type Lag = { readonly rise: number; readonly fall: number }
const LAGS: readonly Lag[] = [15, 30, 45, 60, 90].flatMap((rise) => [
  { rise, fall: rise },
  { rise, fall: 2 * rise },
])
/** Above threshold heart rate keeps climbing for minutes; a straight line alone calls that a fault. */
const SLOW_FROM = 100
const SLOW_LAG: Lag = { rise: 180, fall: 180 }
/** The fit only trusts the best three fifths of the session, so a long failure cannot pull it over. */
const KEEP = 0.6
const STEPS = 4
/** Beats per point of threshold at the least: a flatter line means the recording ignored the work. */
const MIN_BEATS_PER_POINT = 0.2
/** Work that varies this much, in points of threshold, has to show in any real heart rate. */
const VARIED_WORK = 8
/** Off by less than this is the heart, not the sensor: lag and drift are not that exact. */
const MIN_TOLERANCE = 10
const SPREADS = 3
/** Shorter than this is a spike or the slow recovery after a hard interval, not a failed recording. */
const MIN_FAULT_SECONDS = 90
/** Share of the tolerance a faulty stretch has to be off on average, in one direction. */
const ONE_WAY = 0.75
/** Two faulty stretches this close are one. */
const JOIN_SECONDS = 30
/** Less than this altogether changes no average worth naming. */
const NAMED_FROM_SECONDS = 120
/** Clean recording needed to estimate the rest: ten minutes, and at least two fifths of it. */
const MIN_CLEAN_SECONDS = 600
const MIN_CLEAN_SHARE = 0.4
/** A fit whose clean residuals spread wider than this predicts nothing better than a guess. */
const MAX_SPREAD = 8
/** Where the estimate meets the recording, it takes the offset of this much clean recording on either side. */
const EDGE_SECONDS = 120

const isNumber = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value)

type Grid = {
  /** Seconds per slot. */
  readonly step: number
  readonly slots: number
  /** Something was recorded in this slot; a paused recording leaves slots empty. */
  readonly recorded: readonly boolean[]
  /** Share of threshold; zero where nothing was ridden or the recording paused. */
  readonly percent: Float64Array
  /** NaN where no heart rate was recorded. */
  readonly heart: Float64Array
}

const gridOf = (streams: ActivityStreams, threshold: SportThreshold): Grid | null => {
  if (threshold.metric === 'swimPace') return null
  const intensity = threshold.metric === 'power' ? streams.watts : streams.speed
  if (!intensity?.some(isNumber) || !streams.heartRate?.some((beat) => isNumber(beat) && beat > 0)) return null
  const last = streams.time.reduce<number>((top, time) => (isNumber(time) && time > top ? time : top), 0)
  if (last === 0) return null

  const step = Math.max(MIN_GRID, Math.ceil(last / MAX_SLOTS / 5) * 5)
  const slots = Math.floor(last / step) + 1
  const recorded = new Array<boolean>(slots).fill(false)
  const sums = new Float64Array(slots)
  const counts = new Float64Array(slots)
  const beats = new Float64Array(slots)
  const beatCounts = new Float64Array(slots)
  streams.time.forEach((time, index) => {
    if (!isNumber(time)) return
    const slot = Math.floor(time / step)
    recorded[slot] = true
    const value = intensity[index]
    if (isNumber(value)) {
      sums[slot]! += value
      counts[slot]! += 1
    }
    const beat = streams.heartRate?.[index]
    // A zero is the strap reporting no contact, not a heart at rest.
    if (isNumber(beat) && beat > 0) {
      beats[slot]! += beat
      beatCounts[slot]! += 1
    }
  })
  const hills = threshold.metric === 'pace' ? hillFactors(streams, step, slots) : null
  const percent = new Float64Array(slots)
  const heart = new Float64Array(slots).fill(Number.NaN)
  for (let slot = 0; slot < slots; slot += 1) {
    const value = counts[slot]! > 0 ? (sums[slot]! / counts[slot]!) * (hills?.[slot] ?? 1) : 0
    percent[slot] = Math.max(0, percentOf(value, threshold))
    if (beatCounts[slot]! > 0) heart[slot] = beats[slot]! / beatCounts[slot]!
  }
  return { step, slots, recorded, percent, heart }
}

/** Climbs are averaged over this much either side: GPS altitude is rough over a few metres. */
const HILL_SECONDS = 30
const STEEPEST = 0.3

/**
 * Energy cost of running on a grade against the flat, after Minetti et al.
 * (2002): ten percent uphill costs about one and a half times as much, gentle
 * downhill a little less. The heart follows the cost, not the pace.
 */
const costOfGrade = (grade: number): number => {
  const g = Math.min(STEEPEST, Math.max(-STEEPEST, grade))
  return (155.4 * g ** 5 - 30.4 * g ** 4 - 43.3 * g ** 3 + 46.3 * g ** 2 + 19.5 * g + 3.6) / 3.6
}

/** Per slot, how much harder than the flat the ground made the pace; null without altitude. */
const hillFactors = (streams: ActivityStreams, step: number, slots: number): Float64Array | null => {
  const { altitude, distance } = streams
  if (!altitude?.some(isNumber) || !distance?.some(isNumber)) return null
  const height = new Float64Array(slots).fill(Number.NaN)
  const metres = new Float64Array(slots).fill(Number.NaN)
  streams.time.forEach((time, index) => {
    if (!isNumber(time)) return
    const slot = Math.floor(time / step)
    const up = altitude[index]
    const along = distance[index]
    if (isNumber(up) && isNumber(along)) {
      height[slot] = up
      metres[slot] = along
    }
  })
  const reach = Math.max(1, Math.round(HILL_SECONDS / step))
  const factors = new Float64Array(slots).fill(1)
  for (let slot = 0; slot < slots; slot += 1) {
    const from = Math.max(0, slot - reach)
    const to = Math.min(slots - 1, slot + reach)
    const run = metres[to]! - metres[from]!
    // Standing, or a hole in the recording: no grade to read.
    if (!(run > 10)) continue
    factors[slot] = costOfGrade((height[to]! - height[from]!) / run)
  }
  return factors
}

/** Work as the heart sees it: followed with a lag, so it rises and falls late. */
const lagged = (values: Float64Array, lag: Lag, step: number): Float64Array => {
  const up = 1 - Math.exp(-step / lag.rise)
  const down = 1 - Math.exp(-step / lag.fall)
  const out = new Float64Array(values.length)
  let level = 0
  for (let slot = 0; slot < values.length; slot += 1) {
    const value = values[slot]!
    level += (value > level ? up : down) * (value - level)
    out[slot] = level
  }
  return out
}

/** Constant, lagged work, hours into the session, lagged work above threshold. */
type Features = readonly [Float64Array, Float64Array, Float64Array]

const featuresFor = (grid: Grid, lag: Lag): Features => {
  const hours = new Float64Array(grid.slots)
  const above = new Float64Array(grid.slots)
  for (let slot = 0; slot < grid.slots; slot += 1) {
    hours[slot] = (slot * grid.step) / 3600
    above[slot] = Math.max(0, grid.percent[slot]! - SLOW_FROM)
  }
  return [lagged(grid.percent, lag, grid.step), hours, lagged(above, SLOW_LAG, grid.step)]
}

type Model = {
  readonly lag: Lag
  readonly features: Features
  /** Base, beats per point of work, beats per hour of drift, beats per point above threshold. */
  readonly weights: readonly [number, number, number, number]
}

// Indexed, not destructured: this runs tens of thousands of times per session.
const predict = (model: Model, slot: number): number =>
  model.weights[0] +
  model.weights[1] * model.features[0][slot]! +
  model.weights[2] * model.features[1][slot]! +
  model.weights[3] * model.features[2][slot]!

/** Gaussian elimination on the first `size` features of the summed normal equations. */
const eliminate = (sums: Float64Array, n: number, size: number): readonly number[] | null => {
  const m = Array.from({ length: size }, (_, i) => {
    const line = new Float64Array(size + 1)
    for (let j = 0; j < size; j += 1) line[j] = sums[i * 5 + j]!
    line[size] = sums[i * 5 + 4]!
    return line
  })
  for (let i = 1; i < size; i += 1) m[i]![i]! += 1e-6 * n
  for (let col = 0; col < size; col += 1) {
    let pivot = col
    for (let r = col + 1; r < size; r += 1) if (Math.abs(m[r]![col]!) > Math.abs(m[pivot]![col]!)) pivot = r
    ;[m[col], m[pivot]] = [m[pivot]!, m[col]!]
    if (Math.abs(m[col]![col]!) < 1e-12) return null
    for (let r = 0; r < size; r += 1) {
      if (r === col) continue
      const factor = m[r]![col]! / m[col]![col]!
      for (let k = col; k <= size; k += 1) m[r]![k]! -= factor * m[col]![k]!
    }
  }
  return m.map((line, i) => line[size]! / line[i]!)
}

/**
 * Least squares over the used slots, by the normal equations. Slightly damped,
 * so a flat feature — a steady ride has no work above threshold — never makes
 * it singular. Work above threshold can only add beats: a negative share is the
 * fit chasing noise, and is left out.
 */
const solve = (features: Features, heart: Float64Array, use: Uint8Array): Model['weights'] | null => {
  // Summed in scalars, not in a matrix: this is the inner loop of the whole check.
  const [work, hours, above] = features
  let n = 0
  let w = 0, h = 0, a = 0, ww = 0, wh = 0, wa = 0, hh = 0, ha = 0, aa = 0
  let y = 0, wy = 0, hy = 0, ay = 0
  for (let slot = 0; slot < use.length; slot += 1) {
    if (!use[slot]) continue
    const x1 = work[slot]!
    const x2 = hours[slot]!
    const x3 = above[slot]!
    const beat = heart[slot]!
    n += 1
    w += x1
    h += x2
    a += x3
    ww += x1 * x1
    wh += x1 * x2
    wa += x1 * x3
    hh += x2 * x2
    ha += x2 * x3
    aa += x3 * x3
    y += beat
    wy += x1 * beat
    hy += x2 * beat
    ay += x3 * beat
  }
  if (n < 16) return null
  // Rows of [features..., right-hand side], five wide.
  const sums = Float64Array.of(n, w, h, a, y, w, ww, wh, wa, wy, h, wh, hh, ha, hy, a, wa, ha, aa, ay)
  const full = eliminate(sums, n, 4)
  if (full && full[3]! >= 0) return [full[0]!, full[1]!, full[2]!, full[3]!]
  const reduced = eliminate(sums, n, 3)
  return reduced ? [reduced[0]!, reduced[1]!, reduced[2]!, 0] : null
}

/**
 * Least squares over the part of the session that fits best, by concentration
 * steps: fit, keep the best three fifths, fit again. A watch that read 168
 * through a twenty-minute warm-up pulls an ordinary fit towards itself until
 * nothing stands out any more; fitted to the best part, the failure is left
 * over as what it is.
 */
const trimmedFit = (
  lag: Lag,
  features: Features,
  heart: Float64Array,
  candidates: readonly number[],
  start: readonly number[],
  steps: number,
): { readonly model: Model; readonly error: number } | null => {
  const keep = Math.floor(candidates.length * KEEP)
  const use = new Uint8Array(heart.length)
  for (const slot of start) use[slot] = 1
  const errors = new Float64Array(candidates.length)
  const sorted = new Float64Array(candidates.length)
  let error = Number.POSITIVE_INFINITY
  let weights = solve(features, heart, use)
  // Plain loops: this is run some hundred times per session.
  for (let step = 0; weights && step < steps; step += 1) {
    const model: Model = { lag, features, weights }
    for (let index = 0; index < candidates.length; index += 1) {
      const slot = candidates[index]!
      errors[index] = (heart[slot]! - predict(model, slot)) ** 2
    }
    sorted.set(errors)
    const cut = sorted.sort()[keep - 1]!
    error = 0
    use.fill(0)
    for (let index = 0; index < candidates.length; index += 1) {
      if (errors[index]! > cut) continue
      use[candidates[index]!] = 1
      error += errors[index]!
    }
    weights = solve(features, heart, use)
  }
  return weights ? { model: { lag, features, weights }, error } : null
}

/**
 * The lag is chosen with a single start, which is cheap; the fit is then
 * started from each third of the session in turn, so a failure in any one of
 * them cannot steer every start. Each start's answer is returned: which one
 * tells the truth is decided by what each would call faulty.
 */
const robustFits = (grid: Grid, candidates: readonly number[]): readonly Model[] => {
  const third = Math.ceil(candidates.length / 3)
  const starts = [candidates, candidates.slice(0, third), candidates.slice(third, 2 * third), candidates.slice(2 * third)]
  const features = LAGS.map((lag) => featuresFor(grid, lag))
  return starts.flatMap((start) => {
    // The lag is chosen per start, with one cheap step: a failure that steers one start may not steer the others.
    const chosen = LAGS.reduce<{ readonly index: number; readonly error: number } | null>((best, lag, index) => {
      const found = trimmedFit(lag, features[index]!, grid.heart, candidates, start, 1)
      return found && (best === null || found.error < best.error) ? { index, error: found.error } : best
    }, null)
    if (chosen === null) return []
    const found = trimmedFit(LAGS[chosen.index]!, features[chosen.index]!, grid.heart, candidates, start, STEPS)
    return found ? [found.model] : []
  })
}

const median = (values: Float64Array): number => {
  if (values.length === 0) return 0
  const sorted = Float64Array.from(values).sort()
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2
}

/** Runs of flagged slots, joined across short clean gaps, kept when long enough to be a failure. */
const runsOf = (flagged: readonly boolean[], step: number): readonly Span[] => {
  const runs: { from: number; to: number }[] = []
  flagged.forEach((flag, slot) => {
    if (!flag) return
    const previous = runs[runs.length - 1]
    if (previous && slot - previous.to <= JOIN_SECONDS / step) previous.to = slot + 1
    else runs.push({ from: slot, to: slot + 1 })
  })
  return runs.filter((run) => (run.to - run.from) * step >= MIN_FAULT_SECONDS)
}

export type HeartCheck = {
  /** Seconds per slot of the lists below. */
  readonly step: number
  /** Faulty stretches, in slots. */
  readonly faulty: readonly Span[]
  /** Per slot: what the heart most likely did. Null where nothing is known. */
  readonly heart: readonly (number | null)[]
  readonly estimated: readonly boolean[]
  readonly direction: 'high' | 'low' | 'missing' | 'mixed' | 'flat'
  readonly canEstimate: boolean
  readonly cleanSeconds: number
  readonly recordedSeconds: number
  readonly measuredAverage: number | null
  readonly correctedAverage: number | null
}

const average = (values: readonly (number | null)[], recorded: readonly boolean[]): number | null => {
  let sum = 0
  let count = 0
  values.forEach((value, slot) => {
    if (!recorded[slot] || value === null) return
    sum += value
    count += 1
  })
  return count === 0 ? null : sum / count
}

const spreadOf = (values: Float64Array): number => {
  const mean = values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, values.length))
}

/**
 * The heart rate of a session, checked against its work. Null when there is
 * nothing to check against: no heart rate, no power or pace, a pool swim.
 */
export const checkHeart = (
  streams: ActivityStreams,
  threshold: SportThreshold,
  maxHr: number | null = null,
): HeartCheck | null => {
  const grid = gridOf(streams, threshold)
  if (!grid) return null
  const { step, slots, recorded } = grid
  const beat = (slot: number): number | null => (Number.isNaN(grid.heart[slot]!) ? null : grid.heart[slot]!)
  // A configured maximum is often an old one: it caps the estimate, but a reading above it may be real.
  const ceiling = maxHr !== null && maxHr > 0 ? Math.min(HIGHEST, maxHr) : HIGHEST

  // Missing for longer than smart recording leaves out, or beyond what a heart can do.
  const reach = Math.ceil(BRIDGE_SECONDS / step)
  const impossible = Array.from({ length: slots }, (_, slot) => {
    if (!recorded[slot]) return false
    const value = beat(slot)
    if (value === null) {
      for (let near = Math.max(0, slot - reach); near <= Math.min(slots - 1, slot + reach); near += 1) {
        if (beat(near) !== null) return false
      }
      return true
    }
    return value < LOWEST || value > HIGHEST
  })
  const candidate = Array.from({ length: slots }, (_, slot) => recorded[slot]! && beat(slot) !== null && !impossible[slot])
  const candidates = candidate.flatMap((ok, slot) => (ok ? [slot] : []))
  const recordedSeconds = recorded.filter(Boolean).length * step
  const measuredAverage = average(Array.from({ length: slots }, (_, slot) => beat(slot)), recorded)
  const fine: HeartCheck = {
    step,
    faulty: [],
    heart: Array.from({ length: slots }, (_, slot) => beat(slot)),
    estimated: new Array<boolean>(slots).fill(false),
    direction: 'mixed',
    canEstimate: true,
    cleanSeconds: candidates.length * step,
    recordedSeconds,
    measuredAverage,
    correctedAverage: measuredAverage,
  }

  const fits = robustFits(grid, candidates)
  if (fits.length === 0) return fine

  const flag = (model: Model) => {
    const residuals = new Float64Array(slots)
    candidates.forEach((slot) => (residuals[slot] = grid.heart[slot]! - predict(model, slot)))
    // The median absolute residual is the noise of the fitting part: the faults are too few to move it.
    const spread = 1.4826 * median(Float64Array.from(candidates, (slot) => Math.abs(residuals[slot]!)))
    const tolerance = Math.max(MIN_TOLERANCE, SPREADS * spread)
    const flagged = Array.from({ length: slots }, (_, slot) => impossible[slot]! || (candidate[slot]! && Math.abs(residuals[slot]!) > tolerance))
    // A failed sensor is off one way for minutes; a fit that misses the shape of
    // hard intervals is off both ways in turn, and that is not a fault.
    const faulty = runsOf(flagged, step).filter((run) => {
      let sum = 0
      let count = 0
      let gone = 0
      for (let slot = run.from; slot < run.to; slot += 1) {
        if (impossible[slot]) gone += 1
        else if (candidate[slot]) {
          sum += residuals[slot]!
          count += 1
        }
      }
      return gone >= count || Math.abs(sum / count) >= ONE_WAY * tolerance
    })
    const inFault = new Array<boolean>(slots).fill(false)
    faulty.forEach((run) => inFault.fill(true, run.from, run.to))
    const use = new Uint8Array(slots)
    candidates.forEach((slot) => (use[slot] = flagged[slot] || inFault[slot] ? 0 : 1))
    return { residuals, spread, faulty, use }
  }
  // Every reading costs its squared distance from the fit, but never more than
  // the tolerance squared: a faulty one costs the same however wrong it is. A
  // twelve-minute warm-up at 168 bpm and every recovery since then too low
  // then costs more than the warm-up wrong, and a fit bent around a failure
  // pays for the bend in every clean minute.
  const costOf = (model: Model): number =>
    candidates.reduce((sum, slot) => sum + Math.min((grid.heart[slot]! - predict(model, slot)) ** 2, MIN_TOLERANCE ** 2), 0)
  // Once the faults are known, every clean minute counts for the fit, not only the best three fifths.
  const model = fits
    .map((fit) => {
      const weights = solve(fit.features, grid.heart, flag(fit).use)
      const model = weights ? { ...fit, weights } : fit
      return { model, cost: costOf(model) }
    })
    .reduce((best, next) => (next.cost < best.cost ? next : best)).model
  const { residuals, spread, faulty: found, use } = flag(model)
  const cleanSeconds = use.reduce((sum, used) => sum + used, 0) * step

  // A heart rate that ignores clearly varied work — a watch locked on one value
  // for most of the session — fits best as a flat line. Nothing in it is the heart.
  const flat =
    model.weights[1] < MIN_BEATS_PER_POINT &&
    spreadOf(Float64Array.from(candidates, (slot) => model.features[0][slot]!)) >= VARIED_WORK
  const faulty: readonly Span[] = flat ? [{ from: 0, to: slots }] : found
  const faultySlots = faulty.reduce((sum, run) => sum + run.to - run.from, 0)
  if (faultySlots * step < NAMED_FROM_SECONDS) return fine

  const canEstimate =
    !flat &&
    cleanSeconds >= MIN_CLEAN_SECONDS &&
    cleanSeconds >= MIN_CLEAN_SHARE * recordedSeconds &&
    model.weights[1] >= MIN_BEATS_PER_POINT &&
    spread <= MAX_SPREAD

  // Which way it failed, by the share of faulty time: too high, too low, or gone.
  let high = 0
  let low = 0
  let missing = 0
  faulty.forEach((run) => {
    for (let slot = run.from; slot < run.to; slot += 1) {
      if (!recorded[slot]) continue
      const value = beat(slot)
      if (value === null) missing += 1
      else if (impossible[slot] ? value > HIGHEST : residuals[slot]! > 0) high += 1
      else low += 1
    }
  })
  const total = Math.max(1, high + low + missing)
  const direction: HeartCheck['direction'] = flat
    ? 'flat'
    : high >= 0.7 * total
      ? 'high'
      : low >= 0.7 * total
        ? 'low'
        : missing >= 0.7 * total
          ? 'missing'
          : 'mixed'

  const heart = Array.from({ length: slots }, (_, slot) => (impossible[slot] ? null : beat(slot)))
  const estimated = new Array<boolean>(slots).fill(false)
  const edge = Math.round(EDGE_SECONDS / step)
  const offsetIn = (from: number, to: number): number | null => {
    let sum = 0
    let count = 0
    for (let slot = Math.max(0, from); slot < Math.min(slots, to); slot += 1) {
      if (!use[slot]) continue
      sum += residuals[slot]!
      count += 1
    }
    return count === 0 ? null : sum / count
  }
  faulty.forEach((run) => {
    // The fit is right on average; where the estimate meets the recording it
    // takes the offset of the clean minutes on either side, so the line does not jump.
    const before = offsetIn(run.from - edge, run.from)
    const after = offsetIn(run.to, run.to + edge)
    for (let slot = run.from; slot < run.to; slot += 1) {
      heart[slot] = null
      if (!recorded[slot] || !canEstimate) continue
      const share = (slot - run.from + 0.5) / (run.to - run.from)
      const offset = before !== null && after !== null ? before + (after - before) * share : (before ?? after ?? 0)
      heart[slot] = Math.min(ceiling, Math.max(LOWEST, predict(model, slot) + offset))
      estimated[slot] = true
    }
  })

  return {
    step,
    faulty,
    heart,
    estimated,
    direction,
    canEstimate,
    cleanSeconds: flat ? 0 : cleanSeconds,
    recordedSeconds,
    measuredAverage,
    correctedAverage: average(heart, recorded),
  }
}

/* ----------------------------------------------------------------- words */

const minute = (seconds: number): number => Math.round(seconds / 60)

const where = (spans: readonly Span[]): string => {
  const named = spans
    .slice(0, 3)
    .map((span) => `${minute(span.from)}.–${Math.max(minute(span.from) + 1, minute(span.to))}. min`)
  return spans.length > 3 ? `${named.join(', ')} und ${spans.length - 3} weitere` : named.join(', ')
}

const CAUSE: Record<HeartCheck['direction'], { readonly Ride: string; readonly Run: string }> = {
  high: {
    Ride: 'zu hoch für die Leistung',
    Run: 'zu hoch für das Tempo — oft zählt die Uhr dann die Schritte statt des Pulses',
  },
  low: {
    Ride: 'zu niedrig für die Leistung — oft sitzt der Sensor zu locker',
    Run: 'zu niedrig für das Tempo — oft sitzt die Uhr zu locker',
  },
  missing: { Ride: 'ohne Messung', Run: 'ohne Messung' },
  mixed: { Ride: 'passen nicht zur Leistung', Run: 'passen nicht zum Tempo' },
  flat: { Ride: 'folgen der Leistung gar nicht', Run: 'folgen dem Tempo gar nicht' },
}

const noteFor = (check: HeartCheck, sport: Sport): HeartNote => {
  const spans = check.faulty.map((span) => ({ from: span.from * check.step, to: span.to * check.step }))
  const faultySeconds = spans.reduce((sum, span) => sum + span.to - span.from, 0)
  const cause = CAUSE[check.direction][sport === 'Run' ? 'Run' : 'Ride']
  const head =
    check.direction === 'flat'
      ? `Pulsaufzeichnung unbrauchbar: die Werte ${cause}.`
      : `Pulsaufzeichnung gestört: ${minute(faultySeconds)} von ${minute(check.recordedSeconds)} min ${cause} (${where(spans)}).`
  const measured = check.measuredAverage === null ? null : Math.round(check.measuredAverage)
  const corrected = check.correctedAverage === null ? null : Math.round(check.correctedAverage)
  const tail = check.canEstimate
    ? ` Geschätzt aus ${minute(check.cleanSeconds)} min sauberer Messung${
        measured !== null && corrected !== null && measured !== corrected
          ? `: Ø ${corrected} bpm statt der aufgezeichneten ${measured}`
          : ''
      }. Geschätzte Werte sind mit ~ markiert.`
    : check.direction === 'flat'
      ? ' Daraus lässt sich nichts schätzen — der Puls ist für diese Einheit ausgeblendet.'
      : ' Zu wenig saubere Messung für eine Schätzung — der Puls ist dort ausgeblendet.'
  return {
    faultySeconds,
    recordedSeconds: check.recordedSeconds,
    spans,
    estimated: check.canEstimate,
    measuredAverage: measured,
    correctedAverage: check.canEstimate ? corrected : null,
    message: head + tail,
  }
}

/* --------------------------------------------------------------- applied */

/** The checked heart rate over an elapsed span: its mean, and whether any of it was faulty or estimated. */
const over = (check: HeartCheck, from: number, to: number) => {
  const first = Math.max(0, Math.floor(from / check.step))
  const last = Math.min(check.heart.length, Math.max(first + 1, Math.ceil(to / check.step)))
  let sum = 0
  let known = 0
  let estimated = false
  for (let slot = first; slot < last; slot += 1) {
    const value = check.heart[slot]
    if (value !== null && value !== undefined) {
      sum += value
      known += 1
    }
    if (check.estimated[slot]) estimated = true
  }
  const faulty = check.faulty.some((span) => span.from < last && span.to > first)
  return { mean: known === 0 ? null : sum / known, estimated, faulty }
}

const traceWith = (trace: ExecutionTrace, check: HeartCheck): ExecutionTrace => ({
  ...trace,
  points: trace.points.map((point) => {
    const slot = over(check, point.seconds, point.seconds + trace.step)
    if (!slot.faulty) return point
    return {
      ...point,
      heartRate: slot.mean === null ? null : Math.round(slot.mean),
      ...(slot.estimated ? { heartEstimated: true } : {}),
    }
  }),
})

/**
 * The execution with its heart rate checked: faulty stretches replaced by the
 * estimate or left out, each interval's heart rate taken from what is left, and
 * a note for the card. Untouched when the recording was fine.
 */
export const withHeartCheck = (execution: Execution, check: HeartCheck | null): Execution => {
  if (!check || check.faulty.length === 0) return execution
  return {
    ...execution,
    steps: execution.steps.map((step) => {
      if (step.span === null) return step
      const span = over(check, step.span.from, step.span.to)
      if (!span.faulty) return step
      return {
        ...step,
        heartRate: span.mean === null ? null : Math.round(span.mean),
        ...(span.estimated ? { heartEstimated: true } : {}),
      }
    }),
    trace: execution.trace ? traceWith(execution.trace, check) : null,
    heart: noteFor(check, execution.sport),
  }
}
