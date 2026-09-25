import { decryptJson, encryptJson } from './crypto.ts'
import type { KVNamespace, KVPutOptions } from './bindings.ts'
import type { StravaTokens } from './strava.ts'
import { RETENTION_SECONDS } from './users.ts'

/** One athlete's link to Strava, encrypted at rest like the intervals.icu tokens. */
export type StravaLink = {
  /** Who this is in this app: the intervals.icu athlete id, or the single user subject. */
  readonly subject: string
  readonly stravaAthleteId: string
  readonly name: string
  readonly tokens: StravaTokens
  /** Where the app runs, for the link under each summary; the cron has no request to read it from. */
  readonly appUrl: string
  readonly connectedAt: string
  /** Sessions already written, newest first, so the cron does not rewrite them every run. */
  readonly posted: readonly PostedSession[]
}

export type PostedSession = { readonly activityId: string; readonly stravaId: string; readonly at: string }

/** Far more than the two days the cron looks back; old entries only cost space. */
const POSTED_KEPT = 60
const PREFIX = 'strava:'

const linkKey = (subject: string): string => `${PREFIX}${subject}`

/**
 * Written with the full twelve months when the athlete is present. The cron
 * passes the expiry it found instead, so its writes never extend the retention.
 */
export const saveLink = async (
  namespace: KVNamespace,
  secret: string,
  link: StravaLink,
  options: KVPutOptions = { expirationTtl: RETENTION_SECONDS },
): Promise<StravaLink> => {
  const kept = { ...link, posted: link.posted.slice(0, POSTED_KEPT) }
  await namespace.put(linkKey(link.subject), await encryptJson(kept, secret), options)
  return kept
}

/** A visit renews the link together with the account, like the configuration. */
export const renewLink = async (namespace: KVNamespace, subject: string): Promise<void> => {
  const stored = await namespace.get(linkKey(subject), 'text')
  if (stored !== null) await namespace.put(linkKey(subject), stored, { expirationTtl: RETENTION_SECONDS })
}

/** Null when there is none, or when it can no longer be read because the secret changed. */
export const loadLink = async (namespace: KVNamespace, secret: string, subject: string): Promise<StravaLink | null> => {
  const stored = await namespace.get(linkKey(subject), 'text')
  return stored ? await decryptJson<StravaLink>(stored, secret) : null
}

export const linkExists = async (namespace: KVNamespace, subject: string): Promise<boolean> =>
  (await namespace.get(linkKey(subject), 'text')) !== null

export const deleteLink = (namespace: KVNamespace, subject: string): Promise<void> =>
  namespace.delete(linkKey(subject))

export const withPosted = (link: StravaLink, entry: PostedSession): StravaLink => ({
  ...link,
  posted: [entry, ...link.posted.filter((known) => known.activityId !== entry.activityId)],
})

export type LinkedSubject = { readonly subject: string; readonly expiration: number | null }

/** Everyone connected, with the expiry each link already has, for the cron. */
export const linkedSubjects = async (namespace: KVNamespace): Promise<readonly LinkedSubject[]> => {
  const collect = async (cursor: string | undefined, found: readonly LinkedSubject[]): Promise<readonly LinkedSubject[]> => {
    const page = await namespace.list({ prefix: PREFIX, ...(cursor ? { cursor } : {}) })
    const next = [
      ...found,
      ...page.keys.map((key) => ({ subject: key.name.slice(PREFIX.length), expiration: key.expiration ?? null })),
    ]
    return page.list_complete || !page.cursor ? next : collect(page.cursor, next)
  }
  return collect(undefined, [])
}
