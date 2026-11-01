import type { SpeedStreams } from '../src/coach/speed-power.ts'

export const FTP = 289
export const RIDER_KG = 72

/** Deterministic noise, so a failing case fails the same way twice. */
const random = (seed: number) => {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export type Ride = { readonly streams: SpeedStreams; readonly watts: readonly number[] }

/**
 * A ride outdoors, forward: the rider's watts against rolling resistance, a
 * varying head wind and rolling hills, and what a bike computer would record —
 * speed with GPS jitter, a barometer in steps of twenty centimetres, a red light
 * now and then. The model the estimate inverts is deliberately not the same:
 * other drag, other tyres, wind it cannot know. Wind that comes and goes reads
 * high, never low — a tail wind lifts the speed more than a head wind takes it —
 * so the estimate runs a little over what was ridden.
 */
export const simulate = (power: (second: number) => number, seconds: number, seed = 7, stops: readonly number[] = []): Ride => {
  const next = random(seed)
  const mass = RIDER_KG + 8.5
  const cda = 0.3
  const crr = 0.0045
  let speed = 7
  let distance = 0
  let altitude = 50
  let gust = 0
  const time: number[] = []
  const speeds: number[] = []
  const altitudes: number[] = []
  const distances: number[] = []
  const watts: number[] = []
  for (let second = 0; second < seconds; second += 1) {
    const grade = 0.025 * Math.sin(distance / 900) + (distance > 9000 && distance < 11000 ? 0.04 : 0)
    // Three metres a second from one side, the road turning through it on a loop, gusts on top.
    gust = Math.max(-0.6, Math.min(0.6, gust + (next() - 0.5) * 0.1))
    const wind = 3 * Math.cos(distance / 3000) + gust
    const stop = stops.find((at) => second >= at && second < at + 25)
    const rider = stop !== undefined ? 0 : power(second)
    const air = 0.5 * 1.2 * cda * (speed + wind) * Math.abs(speed + wind)
    const resisting = mass * 9.81 * (crr + grade) + air
    const braking = stop !== undefined && second < stop + 6 ? Math.min(speed * mass, 2.5 * mass) : 0
    const force = rider / Math.max(speed, 1) - resisting - braking
    speed = Math.max(stop !== undefined ? 0 : 1, speed + force / (mass * 1.03))
    distance += speed
    altitude += speed * grade
    time.push(second)
    speeds.push(Math.max(0, speed + (next() - 0.5) * 0.3))
    altitudes.push(Math.round((altitude + (next() - 0.5) * 0.4) * 5) / 5)
    distances.push(distance)
    watts.push(rider)
  }
  return { streams: { time, speed: speeds, altitude: altitudes, distance: distances }, watts }
}

/** The 40/20 session as pushed: warm-up, three sets of six, four easy minutes between, base after. */
export const fortyTwenty = (firstSet: number) => (second: number): number => {
  for (let set = 0; set < 3; set += 1) {
    const start = firstSet + set * 600
    const into = second - start
    if (into >= 0 && into < 360) return into % 60 < 40 ? 361 : 145
  }
  return 160
}

