import type { ConfigStore } from '../src/coach/config-schema.ts'
import { defaultConfig, validateConfig } from '../src/coach/config-schema.ts'
import type { KVNamespace } from './bindings.ts'

const KEY = 'athlete-config'

/** KV backed store — the Worker filesystem is read only, so config lives in KV. */
export const kvConfigStore = (namespace: KVNamespace): ConfigStore => ({
  load: async () => {
    const stored = await namespace.get(KEY, 'text')
    if (!stored) {
      const fresh = defaultConfig()
      await namespace.put(KEY, JSON.stringify(fresh))
      return fresh
    }
    return validateConfig(JSON.parse(stored))
  },
  save: async (config) => {
    await namespace.put(KEY, JSON.stringify(config))
    return config
  },
})
