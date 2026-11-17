/**
 * Running fitness as Daniels and Gilbert tabulate it: what a performance proves
 * (VDOT), and the time over a distance a VDOT stands for. Shared by the reading
 * of today's runs and the forecast towards race day.
 */

/** Oxygen cost of running at a speed in metres per minute (Daniels & Gilbert). */
export const oxygenCost = (metresPerMinute: number): number =>
  -4.6 + 0.182258 * metresPerMinute + 0.000104 * metresPerMinute ** 2

/** Share of VO2max that can be held all out for this many minutes (Daniels & Gilbert). */
const sustainable = (minutes: number): number =>
  0.8 + 0.1894393 * Math.exp(-0.012778 * minutes) + 0.2989558 * Math.exp(-0.1932605 * minutes)

/** The running fitness a performance proves: VDOT, as Daniels tabulates it. */
export const vdotOfEffort = (metres: number, seconds: number): number =>
  oxygenCost(metres / (seconds / 60)) / sustainable(seconds / 60)

/** The time over a distance a VDOT predicts, found by halving the interval. */
export const raceSeconds = (vdot: number, metres: number): number => {
  const [low, high] = Array.from({ length: 60 }).reduce<readonly [number, number]>(
    ([fast, slow]) => {
      const middle = (fast + slow) / 2
      // A faster time than the fitness allows asks for more than it has.
      return vdotOfEffort(metres, middle * 60) > vdot ? [middle, slow] : [fast, middle]
    },
    [3, 900],
  )
  return Math.round(((low + high) / 2) * 60)
}
