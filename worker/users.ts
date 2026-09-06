import type { CoachConfig } from '../src/coach/types.ts'
import type { ConfigStore } from '../src/coach/config-schema.ts'
import { MissingConfigError, validateConfig } from '../src/coach/config-schema.ts'
import { decryptJson, encryptJson } from './crypto.ts'
import type { KVNamespace } from './bindings.ts'
import type { TokenSet } from './oauth.ts'

export type User = {
  readonly athleteId: string
  readonly name: string
  readonly tokens: TokenSet
  readonly createdAt: string
  /** When explicit consent to processing health data was given — Art. 7 (1) GDPR. */
  readonly consentAt: string
  readonly lastSeenAt: string
}

/**
 * The twelve months the privacy notice promises. Nothing sweeps the store: every
 * write sets the key's lifetime, so an account that is not used simply expires.
 */
export const RETENTION_SECONDS = 365 * 24 * 60 * 60

/** Below this the visit is not worth a write; above it the lifetime needs renewing. */
const TOUCH_AFTER_MS = 7 * 24 * 60 * 60 * 1000

const userKey = (athleteId: string): string => `user:${athleteId}`
const configKey = (athleteId: string): string => `config:${athleteId}`

export const saveUser = async (
  namespace: KVNamespace,
  secret: string,
  user: User,
): Promise<User> => {
  await namespace.put(userKey(user.athleteId), await encryptJson(user, secret), {
    expirationTtl: RETENTION_SECONDS,
  })
  return user
}

export const needsTouch = (user: User, now: number = Date.now()): boolean =>
  now - Date.parse(user.lastSeenAt) > TOUCH_AFTER_MS

/** Renews both key lifetimes, so an account in use never expires under the athlete. */
export const touchUser = async (
  namespace: KVNamespace,
  secret: string,
  user: User,
): Promise<User> => {
  const saved = await saveUser(namespace, secret, user)
  const config = await namespace.get(configKey(user.athleteId), 'text')
  if (config !== null) {
    await namespace.put(configKey(user.athleteId), config, { expirationTtl: RETENTION_SECONDS })
  }
  return saved
}

/** Everything this app holds about one athlete. Health data was never stored. */
export const deleteUser = async (namespace: KVNamespace, athleteId: string): Promise<void> => {
  await namespace.delete(userKey(athleteId))
  await namespace.delete(configKey(athleteId))
}

export const loadUser = async (
  namespace: KVNamespace,
  secret: string,
  athleteId: string,
): Promise<User | null> => {
  const stored = await namespace.get(userKey(athleteId), 'text')
  return stored ? await decryptJson<User>(stored, secret) : null
}

/**
 * Per user configuration. Returns null until onboarding has run, which is how
 * the UI knows to show the goal form instead of a plan.
 */
export const userConfigStore = (namespace: KVNamespace, athleteId: string): ConfigStore => ({
  load: async () => {
    const stored = await namespace.get(configKey(athleteId), 'text')
    if (!stored) throw new MissingConfigError()
    return validateConfig(JSON.parse(stored))
  },
  save: async (config: CoachConfig) => {
    await namespace.put(configKey(athleteId), JSON.stringify(config), {
      expirationTtl: RETENTION_SECONDS,
    })
    return config
  },
})

export const hasConfig = async (namespace: KVNamespace, athleteId: string): Promise<boolean> =>
  (await namespace.get(configKey(athleteId), 'text')) !== null
