import type { Activity, DestinationState, GarminAttribution, Wellness } from './types.ts'

/**
 * Garmin's API brand guidelines, which the intervals.icu API terms pass on:
 * a view built on Garmin device data names "Garmin [device model]", or plain
 * "Garmin" where the model is unknown — and says nothing where no such data
 * is involved.
 */

const GARMIN_SOURCE = 'GARMIN_CONNECT'
const GARMIN_NAME = /^garmin\b/i

const isGarmin = (activity: Activity): boolean =>
  activity.source === GARMIN_SOURCE || GARMIN_NAME.test(activity.device ?? '')

const deviceLabel = (device: string | null | undefined): string => {
  const name = device?.trim() ?? ''
  if (name.length === 0) return 'Garmin'
  return GARMIN_NAME.test(name) ? name : `Garmin ${name}`
}

/** The label for one session, or null when it was not recorded on a Garmin. */
export const garminDevice = (activity: Activity): string | null => (isGarmin(activity) ? deviceLabel(activity.device) : null)

/**
 * For a view over many sessions and recovery values. HRV, resting pulse and
 * sleep carry no device, so they count as Garmin's when the athlete has
 * Garmin connected to intervals.icu and such values exist.
 */
export const garminAttribution = (
  activities: readonly Activity[],
  wellness: readonly Wellness[] = [],
  destinations: readonly DestinationState[] = [],
): GarminAttribution | null => {
  const devices = [...new Set(activities.filter(isGarmin).map((activity) => deviceLabel(activity.device)))].sort()
  const garminLinked = destinations.some((entry) => entry.destination === 'garmin' && entry.connected)
  const recovery = wellness.some((entry) => entry.hrv !== null || entry.restingHr !== null || entry.sleepSecs !== null)
  if (devices.length === 0 && !(garminLinked && recovery)) return null
  return { devices: devices.filter((device) => device !== 'Garmin') }
}
