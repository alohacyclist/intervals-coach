import type { ConfigStore } from '../src/coach/config-schema.ts'
import { validateConfig } from '../src/coach/config-schema.ts'
import { diffDays } from '../src/coach/dates.ts'
import { plannedBlocks } from '../src/coach/execution.ts'
import { findTemplate } from '../src/coach/library.ts'
import { pushedOf } from '../src/coach/progression.ts'
import { ESTIMATE_VERSION, estimateRide } from '../src/coach/speed-power.ts'
import { ftpOf } from '../src/coach/thresholds.ts'
import type {
  Activity,
  CoachConfig,
  EstimateSummary,
  PlannedEvent,
  RideEstimate,
  StoredRideEstimate,
} from '../src/coach/types.ts'
import type { IntervalsSource } from './source.ts'

/**
 * A ride without power and heart rate carries no load on intervals.icu, and a
 * ride without load counts for nothing here: not as done, not for fitness. Read
 * from speed and the climb it counts again, marked as the estimate it is.
 */

/** Older rides stay as they are: each reading costs a request, and the plan looks forward. */
const ESTIMATE_DAYS = 14
/** New readings per plan; a backlog of rides must not spend the day's allowance at once. */
const NEW_PER_REQUEST = 2
const MIN_MOVING_SECONDS = 600
const MIN_DISTANCE_M = 3000

/** Outdoors, long enough, and nothing on intervals.icu to go by. */
export const needsEstimate = (activity: Activity, today: string): boolean => {
  const age = diffDays(activity.date, today)
  return (
    activity.sport === 'Ride' &&
    activity.load <= 0 &&
    activity.indoor !== true &&
    activity.movingTimeSec >= MIN_MOVING_SECONDS &&
    activity.distanceM >= MIN_DISTANCE_M &&
    age >= 0 &&
    age <= ESTIMATE_DAYS
  )
}

/** The session of this app the ride was paired with on the calendar, and the minutes it was sent with. */
const pairedSession = (activity: Activity, events: readonly PlannedEvent[]) => {
  const event =
    events.find((entry) => entry.id === activity.pairedEventId) ??
    events.find((entry) => entry.pairedActivityId === activity.id)
  const pushed = event ? pushedOf(event) : null
  const template = pushed ? findTemplate(pushed.templateId) : undefined
  return template && template.sport === 'Ride' ? { template, minutes: pushed?.minutes ?? null } : null
}

const isCurrent = (stored: StoredRideEstimate): boolean => stored.version === ESTIMATE_VERSION

/**
 * Reads the rides that need it and are not read yet. Only new entries come
 * back; a ride whose streams could not be read is kept as null, so it is not
 * asked for again on every plan.
 */
export const readRideEstimates = async (
  source: IntervalsSource,
  config: CoachConfig,
  activities: readonly Activity[],
  events: readonly PlannedEvent[],
  today: string,
): Promise<readonly StoredRideEstimate[]> => {
  const known = new Set((config.rideEstimates ?? []).filter(isCurrent).map((entry) => entry.activityId))
  const ftp = ftpOf(config.profile)
  if (ftp === null) return []
  const open = activities
    .filter((activity) => needsEstimate(activity, today) && !known.has(activity.id))
    .sort((left, right) => right.date.localeCompare(left.date))
    .slice(0, NEW_PER_REQUEST)

  const read = await Promise.all(
    open.map(async (activity): Promise<StoredRideEstimate | null> => {
      const session = pairedSession(activity, events)
      const streams = await source.streams(activity.id, 'Ride', true).catch(() => null)
      // Unreachable now is not unreadable: asked again next time.
      if (!streams) return null
      // A meter or a strap recorded after all: intervals.icu has not got round to it yet.
      if (streams.watts?.some((value) => value !== null && value > 0)) return null
      const blocks = session
        ? plannedBlocks(session.template, { metric: 'power', ftp }, session.minutes)
        : null
      return {
        activityId: activity.id,
        date: activity.date,
        templateId: session?.template.id ?? null,
        version: ESTIMATE_VERSION,
        estimate: estimateRide(streams, config.profile.weightKg, ftp, blocks),
      }
    }),
  )
  return read.filter((entry): entry is StoredRideEstimate => entry !== null)
}

export const summaryOf = (estimate: RideEstimate): EstimateSummary => ({
  blocksFound: estimate.blocks.filter((block) => block.verdict === 'found').length,
  blocksUnclear: estimate.blocks.filter((block) => block.verdict === 'unclear').length,
  blocksTotal: estimate.blocks.length,
})

/**
 * The rides as the coach should see them: an estimate stands in where
 * intervals.icu has no load. intervals.icu's compliance goes — without power it
 * measured only the time.
 */
export const withRideEstimates = (
  activities: readonly Activity[],
  stored: readonly StoredRideEstimate[],
): readonly Activity[] => {
  const byId = new Map(stored.filter(isCurrent).map((entry) => [entry.activityId, entry.estimate]))
  if (byId.size === 0) return activities
  return activities.map((activity) => {
    const estimate = byId.get(activity.id)
    if (!estimate || activity.load > 0) return activity
    return {
      ...activity,
      load: estimate.load,
      intensity: estimate.intensity,
      zoneSeconds: estimate.zoneSeconds,
      compliance: null,
      estimate: summaryOf(estimate),
    }
  })
}

/** Re-reads before writing, like the proposals, so nothing saved meanwhile is rolled back. */
export const rememberRideEstimates = async (
  store: ConfigStore,
  fresh: readonly StoredRideEstimate[],
): Promise<void> => {
  if (fresh.length === 0) return
  const latest = await store.load()
  const replaced = new Set(fresh.map((entry) => entry.activityId))
  const rideEstimates = [...(latest.rideEstimates ?? []).filter((entry) => !replaced.has(entry.activityId)), ...fresh]
  await store.save(validateConfig({ ...latest, rideEstimates }))
}
