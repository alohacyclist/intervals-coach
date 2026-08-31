import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import type { CoachConfig } from '../src/coach/types.ts'
import type { ConfigStore } from '../src/coach/config-schema.ts'
import { DEFAULT_CONFIG, validateConfig } from '../src/coach/config-schema.ts'

const CONFIG_PATH = resolve(process.cwd(), 'config/athlete.json')

const write = (config: CoachConfig): CoachConfig => {
  mkdirSync(dirname(CONFIG_PATH), { recursive: true })
  writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, 'utf8')
  return config
}

/** File backed store for local development. */
export const fileConfigStore = (): ConfigStore => ({
  load: async () =>
    existsSync(CONFIG_PATH)
      ? validateConfig(JSON.parse(readFileSync(CONFIG_PATH, 'utf8')))
      : write(DEFAULT_CONFIG),
  save: async (config) => write(config),
})
