/**
 * The demo deployment: Formkurve on synthetic data, for showing it to people.
 *
 * It is its own Hono app, picked once in the Worker entry when `DEMO_MODE` is
 * on, and it reaches nothing a real athlete has: it does not import the user
 * store, OAuth or Strava, it holds no intervals.icu credential, and it refuses
 * to start if one is configured next to it. The routes are the very ones real
 * athletes use, fed by the fixture source instead of intervals.icu.
 *
 * Every visitor signs in with the shared demo password and gets a sandbox of
 * their own: settings, breaks and today's wish work as in the real app, are
 * kept for two hours after the last change and then forgotten. Nobody can
 * change what the next visitor sees.
 */
import { Hono } from 'hono'
import type { Context } from 'hono'
import type { ConfigStore } from '../src/coach/config-schema.ts'
import { validateConfig } from '../src/coach/config-schema.ts'
import { DEFAULT_TIMEZONE, apiErrorResponse, createApiRoutes, localToday } from '../server/routes.ts'
import type { RouteDeps } from '../server/routes.ts'
import { demoConfig } from '../server/demo/fixtures.ts'
import { demoData, fixtureSource } from '../server/demo/source.ts'
import type { Bindings, KVNamespace } from './bindings.ts'
import { randomToken, secretEquals } from './crypto.ts'
import { blocked, clearFailures, recordFailure } from './login-throttle.ts'
import { withinLimit } from './api-throttle.ts'
import { clearSessionCookie, createSessionCookie, readSession, shouldRenew } from './session.ts'
import type { Session } from './session.ts'

/** How long a visitor's changes outlive their last one. */
export const SANDBOX_SECONDS = 2 * 60 * 60

const SUBJECT_PREFIX = 'demo-'
const SANDBOX_PREFIX = 'demo-sandbox:'

export const isDemo = (env: Bindings): boolean => env.DEMO_MODE === 'on'

/**
 * Anything that would let the demo reach a real account. Named in the answer so
 * the operator knows what to remove; none of them is a value, only a name.
 */
const FORBIDDEN: readonly (keyof Bindings)[] = [
  'INTERVALS_API_KEY',
  'INTERVALS_ATHLETE_ID',
  'INTERVALS_CLIENT_ID',
  'INTERVALS_CLIENT_SECRET',
  'APP_PASSWORD',
  'STRAVA_CLIENT_ID',
  'STRAVA_CLIENT_SECRET',
]

export const demoMisconfiguration = (env: Bindings): string | null => {
  const present = FORBIDDEN.filter((name) => Boolean(env[name]))
  if (present.length > 0) {
    return `Der Demo-Betrieb läuft ohne Zugang zu echten Konten. Bitte entfernen: ${present.join(', ')}.`
  }
  if (!env.DEMO_PASSWORD) return 'Nicht konfiguriert: DEMO_PASSWORD fehlt.'
  return null
}

/** The demo password signs sessions unless a separate secret is set; changing it ends every demo session. */
const secretOf = (env: Bindings): string => env.SESSION_SECRET ?? env.DEMO_PASSWORD ?? ''

const isSecure = (context: Context): boolean => new URL(context.req.url).protocol === 'https:'

const currentSession = async (context: Context): Promise<Session | null> => {
  const secret = secretOf(context.env as Bindings)
  const session = secret ? await readSession(context.req.header('Cookie') ?? null, secret) : null
  // A cookie from another deployment signed with the same secret would still not be a demo visitor.
  return session?.athleteId.startsWith(SUBJECT_PREFIX) ? session : null
}

/**
 * One visitor's configuration. Until they change something it is the fixture
 * configuration of today; their first change starts the two hours, and every
 * later one starts them again.
 */
export const sandboxStore = (namespace: KVNamespace, subject: string, today: string): ConfigStore => ({
  load: async () => {
    const stored = await namespace.get(`${SANDBOX_PREFIX}${subject}`, 'text')
    return stored ? validateConfig(JSON.parse(stored)) : demoConfig(today)
  },
  save: async (config) => {
    await namespace.put(`${SANDBOX_PREFIX}${subject}`, JSON.stringify(config), { expirationTtl: SANDBOX_SECONDS })
    return config
  },
})

const demoDeps = (env: Bindings, subject: string): RouteDeps => {
  const today = localToday(new Date(), DEFAULT_TIMEZONE)
  return {
    source: fixtureSource(demoData(today)),
    store: sandboxStore(env.COACH_CONFIG, subject, today),
    timezone: DEFAULT_TIMEZONE,
  }
}

export const demoApp = new Hono<{ Bindings: Bindings }>()

demoApp.use('*', async (context, next) => {
  const problem = demoMisconfiguration(context.env)
  if (problem) return context.text(problem, 500)
  await next()
})

demoApp.get('/healthz', (context) => {
  context.header('Cache-Control', 'no-store')
  return context.json({ ok: true, demo: true, version: context.env.CF_VERSION_METADATA?.id ?? null })
})

demoApp.post('/api/login', async (context) => {
  const env = context.env
  const client = context.req.header('CF-Connecting-IP') ?? 'unbekannt'
  if (await blocked(env.COACH_CONFIG, client)) {
    return context.json({ error: 'Zu viele Fehlversuche. Bitte in 15 Minuten erneut versuchen.' }, 429)
  }
  const body = (await context.req.json().catch(() => ({}))) as { passwort?: unknown }
  const passwort = typeof body.passwort === 'string' ? body.passwort : ''
  if (!(await secretEquals(passwort, env.DEMO_PASSWORD ?? ''))) {
    await recordFailure(env.COACH_CONFIG, client)
    return context.json({ error: 'Passwort falsch' }, 401)
  }
  await clearFailures(env.COACH_CONFIG, client)
  // A subject of their own per sign-in: the sandbox is theirs, not the next visitor's.
  context.header('Set-Cookie', await createSessionCookie(`${SUBJECT_PREFIX}${randomToken()}`, secretOf(env), isSecure(context)))
  return context.json({ ok: true })
})

demoApp.get('/auth/logout', (context) => {
  context.header('Set-Cookie', clearSessionCookie())
  return context.redirect('/', 302)
})

demoApp.get('/api/me', async (context) => {
  const session = await currentSession(context)
  return context.json({ mode: 'demo', authenticated: session !== null, onboarded: true })
})

demoApp.use('/api/*', async (context, next) => {
  const session = await currentSession(context)
  if (!session) return context.json({ error: 'Nicht angemeldet', needsLogin: true }, 401)
  if (!(await withinLimit(context.env.API_LIMITER, session.athleteId))) {
    context.header('Retry-After', '60')
    return context.json({ error: 'Zu viele Anfragen auf einmal. Bitte eine Minute warten.' }, 429)
  }
  if (shouldRenew(session)) {
    context.header('Set-Cookie', await createSessionCookie(session.athleteId, secretOf(context.env), isSecure(context)))
  }
  await next()
})

const subjectOf = async (context: Context): Promise<string> => {
  const session = await currentSession(context)
  // The middleware above let nobody through without one.
  if (!session) throw new Error('Demo-Sitzung fehlt')
  return session.athleteId
}

demoApp.route(
  '/',
  createApiRoutes(async (context) => demoDeps(context.env as Bindings, await subjectOf(context))),
)

/** Strava, the waitlist, deleting an account: none of it exists here, and an unknown API path is not the app shell. */
demoApp.all('/api/*', (context) => context.json({ error: 'In der Demo nicht verfügbar' }, 404))
demoApp.all('/auth/*', (context) => context.redirect('/', 302))

demoApp.all('*', (context) => context.env.ASSETS.fetch(context.req.raw))

demoApp.onError(apiErrorResponse)
