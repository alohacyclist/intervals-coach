import type { RouteDeps } from '../server/routes.ts'
import type { Bindings, KVPutOptions } from './bindings.ts'
import { hasStrava } from './bindings.ts'
import { stravaApp } from './strava-routes.ts'
import { linkExists, linkedSubjects, loadLink, saveLink } from './strava-store.ts'
import { postRecent } from './strava-sync.ts'
import { RETENTION_SECONDS } from './users.ts'

/** KV refuses an absolute expiry less than a minute ahead. */
const KV_MIN_EXPIRY_SECONDS = 61

export type CronSetup = {
  readonly secret: string
  /** Resolves an athlete's intervals.icu access without a request, as the athlete would have it. */
  readonly depsFor: (subject: string) => Promise<RouteDeps>
  /**
   * With accounts, the retention runs from the last visit: the cron keeps each
   * link's expiry. The single user runs the app for themselves and keeps theirs alive.
   */
  readonly keepExpiry: boolean
}

/**
 * Every connected athlete, one after the other. One athlete's failure — a
 * revoked token, Strava being down — is logged and does not stop the rest.
 */
export const syncStrava = async (env: Bindings, setup: CronSetup): Promise<void> => {
  if (!hasStrava(env)) return
  const now = Math.floor(Date.now() / 1000)
  for (const { subject, expiration } of await linkedSubjects(env.COACH_CONFIG)) {
    try {
      const link = await loadLink(env.COACH_CONFIG, setup.secret, subject)
      if (!link) continue
      const options: KVPutOptions =
        setup.keepExpiry && expiration !== null
          ? { expiration: Math.max(expiration, now + KV_MIN_EXPIRY_SECONDS) }
          : { expirationTtl: RETENTION_SECONDS }
      await postRecent({
        deps: await setup.depsFor(subject),
        app: stravaApp(env, link.appUrl),
        link,
        // Disconnected or deleted while this run was busy: writing it back would undo that.
        save: async (next) =>
          (await linkExists(env.COACH_CONFIG, subject)) ? saveLink(env.COACH_CONFIG, setup.secret, next, options) : next,
      })
    } catch (error) {
      console.error('Strava-Abgleich fehlgeschlagen', subject, error)
    }
  }
}
