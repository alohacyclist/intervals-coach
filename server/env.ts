import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const ENV_FILE = resolve(process.cwd(), '.env')

/** Minimal .env loader — avoids a dependency and keeps `npm start` flag-free. */
const loadEnvFile = (): void => {
  if (!existsSync(ENV_FILE)) return
  for (const line of readFileSync(ENV_FILE, 'utf8').split('\n')) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i.exec(line)
    if (!match || line.trimStart().startsWith('#')) continue
    const [, key, rawValue] = match
    if (!key || key in process.env) continue
    process.env[key] = (rawValue ?? '').replace(/^["']|["']$/g, '')
  }
}

loadEnvFile()

const required = (key: string): string => {
  const value = process.env[key]
  if (!value || value.startsWith('your_')) {
    throw new Error(`Missing environment variable ${key}. Copy .env.example to .env and fill it in.`)
  }
  return value
}

export type Env = {
  readonly apiKey: string
  readonly athleteId: string
  readonly port: number
  readonly production: boolean
}

export const readEnv = (): Env => ({
  apiKey: required('INTERVALS_API_KEY'),
  athleteId: required('INTERVALS_ATHLETE_ID'),
  port: Number(process.env['PORT'] ?? 8787),
  production: process.env['NODE_ENV'] === 'production',
})
