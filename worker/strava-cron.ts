import type { ConfigStore } from '../src/coach/config-schema.ts'
import type { RouteDeps } from '../server/routes.ts'
import { DEFAULT_TIMEZONE, localHour, localToday } from '../server/routes.ts'
import type { Bindings, KVPutOptions } from './bindings.ts'
import { hasStrava } from './bindings.ts'
import { stravaApp } from './strava-routes.ts'
import { linkExists, linkedSubjects, loadLink, saveLink } from './strava-store.ts'
import { pendingDates, shouldCheck } from './strava-schedule.ts'
import { postRecent } from './strava-sync.ts'
import { RETENTION_SECONDS } from './users.ts'

/** KV refuses an absolute expiry less than a minute ahead. */
const KV_MIN_EXPIRY_SECONDS = 61

export type CronSetup = {
  readonly secret: string
  /** Resolves an athlete's intervals.icu access without a request, as the athlete would have it. */
  readonly depsFor: (subject: string) => Promise<RouteDeps>
  /** The stored configuration alone: deciding whether to look must not touch intervals.icu. */
  readonly storeFor: (subject: string) => ConfigStore
  /** The athlete's own clock decides what "today" and "at night" mean. */
  readonly timezoneFor?: (subject: string) => Promise<string>
  /**
   * With accounts, the retention runs from the last visit: the cron keeps each
   * link's expiry. The single user runs the app for themselves and keeps theirs alive.
   */
  readonly keepExpiry: boolean
  readonly now?: () => Date
}

type Linked = { readonly subject: string; readonly expiration: number | null }

/** Minutes since midnight in the athlete's timezone, for zones half an hour off too. */
export const localMinuteOfDay = (now: Date, timeZone: string = DEFAULT_TIMEZONE): number => {
  const minute = Number(new Intl.DateTimeFormat('en-GB', { minute: 'numeric', timeZone }).format(now))
  return localHour(now, timeZone) * 60 + minute
}

/**
 * One athlete: decide from what is stored whether a summary can be waiting,
 * and only then ask intervals.icu. Deciding writes nothing.
 */
const syncOne = async (env: Bindings, setup: CronSetup, { subject, expiration }: Linked, now: Date): Promise<void> => {
  const link = await loadLink(env.COACH_CONFIG, setup.secret, subject)
  if (!link) return
  const config = await setup.storeFor(subject).load().catch(() => null)
  if (!config) return

  const timeZone = (await setup.timezoneFor?.(subject)) ?? DEFAULT_TIMEZONE
  const today = localToday(now, timeZone)
  const hour = localHour(now, timeZone)
  const pending = pendingDates(config.proposals, today, hour)
  const lastPostedAt = link.posted[0]?.at ?? null
  if (!shouldCheck({ now, minuteOfDay: localMinuteOfDay(now, timeZone), pending, lastPostedAt })) return

  const seconds = Math.floor(now.getTime() / 1000)
  const options: KVPutOptions =
    setup.keepExpiry && expiration !== null
      ? { expiration: Math.max(expiration, seconds + KV_MIN_EXPIRY_SECONDS) }
      : { expirationTtl: RETENTION_SECONDS }
  await postRecent(
    {
      deps: await setup.depsFor(subject),
      app: stravaApp(env, link.appUrl),
      link,
      // Disconnected or deleted while this run was busy: writing it back would undo that.
      save: async (next) =>
        (await linkExists(env.COACH_CONFIG, subject)) ? saveLink(env.COACH_CONFIG, setup.secret, next, options) : next,
      now: () => now,
    },
    today,
  )
}

/**
 * Every connected athlete, one after the other. One athlete's failure — a
 * revoked token, Strava being down — is logged and does not stop the rest.
 */
export const syncStrava = async (env: Bindings, setup: CronSetup): Promise<void> => {
  if (!hasStrava(env)) return
  const now = setup.now?.() ?? new Date()
  for (const linked of await linkedSubjects(env.COACH_CONFIG)) {
    try {
      await syncOne(env, setup, linked, now)
    } catch (error) {
      console.error('Strava sync failed', linked.subject, error)
    }
  }
}
