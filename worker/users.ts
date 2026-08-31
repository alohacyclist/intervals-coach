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
}

const userKey = (athleteId: string): string => `user:${athleteId}`
const configKey = (athleteId: string): string => `config:${athleteId}`

export const saveUser = async (
  namespace: KVNamespace,
  secret: string,
  user: User,
): Promise<User> => {
  await namespace.put(userKey(user.athleteId), await encryptJson(user, secret))
  return user
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
    await namespace.put(configKey(athleteId), JSON.stringify(config))
    return config
  },
})

export const hasConfig = async (namespace: KVNamespace, athleteId: string): Promise<boolean> =>
  (await namespace.get(configKey(athleteId), 'text')) !== null
