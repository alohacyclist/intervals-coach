import type { BlockReading, DashboardSummary, RideTrace } from '../src/coach/dashboard.ts'
import { BLOCK_BATCH, buildDashboardSummary, dashboardOldest } from '../src/coach/dashboard.ts'
import type { MinuteBucket } from '../src/coach/steady-block.ts'
import { findSteadyBlock, minuteBuckets, STEADY_THRESHOLDS } from '../src/coach/steady-block.ts'
import { IntervalsError, ReauthRequiredError } from './intervals.ts'
import type { IntervalsSource } from './source.ts'

export const loadDashboardSummary = async (
  source: IntervalsSource,
  today: string,
  weeks: number,
): Promise<DashboardSummary> =>
  buildDashboardSummary(await source.activities(dashboardOldest(today, weeks), today), today, weeks)

/** Null when the ride has no power or heart rate recorded. */
const readMinutes = async (source: IntervalsSource, activityId: string): Promise<readonly MinuteBucket[] | null> => {
  const streams = await source.streams(activityId, 'Ride')
  if (!streams.watts || !streams.heartRate) return null
  return minuteBuckets(streams.time, streams.watts, streams.heartRate)
}

const readBlock = async (source: IntervalsSource, id: string): Promise<BlockReading> => {
  try {
    const minutes = await readMinutes(source, id)
    const block = minutes ? findSteadyBlock(minutes) : null
    return { id, status: block ? 'block' : 'noBlock', block }
  } catch (error) {
    // A lost sign-in concerns the whole page, and a bug must not pass as an unreadable ride.
    if (error instanceof ReauthRequiredError || !(error instanceof IntervalsError)) throw error
    return { id, status: 'unreadable', block: null }
  }
}

/**
 * Steady blocks of a few rides. The browser asks in batches of BLOCK_BATCH, so one
 * Worker invocation stays far below its limit on outgoing requests (each stream
 * costs a cache read, a fetch and a cache write).
 */
export const loadBlocks = async (source: IntervalsSource, ids: readonly string[]): Promise<readonly BlockReading[]> =>
  Promise.all(ids.slice(0, BLOCK_BATCH).map((id) => readBlock(source, id)))

/** One ride per minute, for its chart: loaded when the athlete opens it. */
export const loadRideTrace = async (source: IntervalsSource, activityId: string): Promise<RideTrace> => {
  const minutes = (await readMinutes(source, activityId)) ?? []
  return { minutes, block: findSteadyBlock(minutes), warmupS: STEADY_THRESHOLDS.warmupS }
}
