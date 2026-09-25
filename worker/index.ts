import { Hono } from 'hono'
import type { Context } from 'hono'
import { createApiRoutes } from '../server/routes.ts'
import type { RouteDeps } from '../server/routes.ts'
import { kvConfigStore } from './config-store-kv.ts'
import {
  deleteUser,
  loadUser,
  needsTouch,
  saveUser,
  saveUserUnseen,
  touchUser,
  userConfigStore,
  hasConfig,
} from './users.ts'
import { authorizeUrl, exchangeCode, fetchAthlete, refreshTokens } from './oauth.ts'
import type { OAuthApp } from './oauth.ts'
import { randomToken, secretEquals } from './crypto.ts'
import { blocked, clearFailures, recordFailure } from './login-throttle.ts'
import {
  clearSessionCookie,
  clearStateCookie,
  createSessionCookie,
  createStateCookie,
  readSession,
  readState,
  shouldRenew,
} from './session.ts'
import type { Session } from './session.ts'
import type { Bindings, ExecutionContext } from './bindings.ts'
import { isMultiUser } from './bindings.ts'
import { createStravaRoutes, stravaApp } from './strava-routes.ts'
import { withdraw } from './strava.ts'
import { deleteLink, loadLink, renewLink } from './strava-store.ts'
import { syncStrava } from './strava-cron.ts'

const REFRESH_MARGIN_SECONDS = 120

/** The session subject in single user mode, where there is no athlete to name. */
const SINGLE_USER_SUBJECT = 'einzelbetrieb'

const app = new Hono<{ Bindings: Bindings }>()

/** Plain http only happens under `wrangler dev`; there a Secure cookie is never stored. */
const isSecure = (context: Context): boolean => new URL(context.req.url).protocol === 'https:'

const oauthAppFor = (env: Bindings, origin: string): OAuthApp => ({
  clientId: env.INTERVALS_CLIENT_ID ?? '',
  clientSecret: env.INTERVALS_CLIENT_SECRET ?? '',
  redirectUri: `${origin}/auth/callback`,
})

// Derived from the request so localhost and production share one code path.
const oauthApp = (context: Context): OAuthApp =>
  oauthAppFor(context.env as Bindings, new URL(context.req.url).origin)

/**
 * Multi user sessions are signed with `SESSION_SECRET`. Single user sessions fall
 * back to the password itself, so a deployment that only sets `APP_PASSWORD` still
 * gets signed cookies — and changing the password ends every session with it.
 */
const sessionSecret = (env: Bindings): string => env.SESSION_SECRET ?? env.APP_PASSWORD ?? ''

const currentSession = async (context: Context): Promise<Session | null> => {
  const secret = sessionSecret(context.env as Bindings)
  return secret ? readSession(context.req.header('Cookie') ?? null, secret) : null
}

const sessionAthlete = async (context: Context): Promise<string | null> =>
  (await currentSession(context))?.athleteId ?? null

/**
 * Every visit pushes the expiry back out, so an app in weekly use never meets a
 * login screen again. Rewritten at most once a day; anything shorter would put a
 * Set-Cookie on every request for nothing.
 */
const renewIfNeeded = async (context: Context, session: Session): Promise<void> => {
  if (!shouldRenew(session)) return
  context.header(
    'Set-Cookie',
    await createSessionCookie(session.athleteId, sessionSecret(context.env as Bindings), isSecure(context)),
  )
}

/**
 * One athlete's dependencies, refreshing the access token when it is close to
 * expiry. `present` is whether the athlete is the one asking: only a visit
 * renews the retention window, never the cron acting while nobody looks.
 */
const athleteDeps = async (env: Bindings, athleteId: string, present: boolean): Promise<RouteDeps> => {
  const secret = env.SESSION_SECRET ?? ''
  const user = await loadUser(env.COACH_CONFIG, secret, athleteId)
  if (!user) throw new Error('Sitzung ungültig — bitte neu anmelden')

  const expiringSoon = user.tokens.expiresAt < Math.floor(Date.now() / 1000) + REFRESH_MARGIN_SECONDS
  // A refresh needs no redirect, so the cron can do it without knowing the origin.
  const tokens =
    expiringSoon && user.tokens.refreshToken
      ? await refreshTokens(oauthAppFor(env, ''), user.tokens.refreshToken)
      : user.tokens

  if (present && (tokens !== user.tokens || needsTouch(user))) {
    // One write covers both jobs: the new token and the renewed retention window.
    await touchUser(env.COACH_CONFIG, secret, { ...user, tokens, lastSeenAt: new Date().toISOString() })
    await renewLink(env.COACH_CONFIG, athleteId)
  } else if (tokens !== user.tokens) {
    await saveUserUnseen(env.COACH_CONFIG, secret, { ...user, tokens })
  }

  return {
    auth: { kind: 'bearer', accessToken: tokens.accessToken, athleteId },
    store: userConfigStore(env.COACH_CONFIG, athleteId),
  }
}

const singleUserDeps = (env: Bindings): RouteDeps => {
  return {
    auth: {
      kind: 'apiKey',
      apiKey: env.INTERVALS_API_KEY ?? '',
      athleteId: env.INTERVALS_ATHLETE_ID ?? '',
    },
    store: kvConfigStore(env.COACH_CONFIG),
  }
}

const singleUserConfigured = (env: Bindings): boolean =>
  Boolean(env.APP_PASSWORD && env.INTERVALS_API_KEY && env.INTERVALS_ATHLETE_ID)

// ---------------------------------------------------------------- auth routes

app.get('/auth/login', async (context) => {
  if (!isMultiUser(context.env)) return context.text('Anmeldung ist nicht konfiguriert', 404)
  // Health data needs explicit consent (Art. 9 (2) (a) GDPR), so the login refuses
  // without it rather than trusting the page to have asked.
  if (context.req.query('einwilligung') !== 'ja') return context.redirect('/?fehler=einwilligung', 302)
  const state = randomToken()
  context.header('Set-Cookie', createStateCookie(state, isSecure(context)))
  return context.redirect(authorizeUrl(oauthApp(context), state), 302)
})

app.get('/auth/callback', async (context) => {
  if (!isMultiUser(context.env)) return context.text('Anmeldung ist nicht konfiguriert', 404)

  const code = context.req.query('code')
  const state = context.req.query('state')
  const expected = readState(context.req.header('Cookie') ?? null)
  context.header('Set-Cookie', clearStateCookie())

  if (context.req.query('error')) return context.redirect('/?fehler=abgelehnt', 302)
  if (!code || !state || state !== expected) return context.redirect('/?fehler=state', 302)

  const tokens = await exchangeCode(oauthApp(context), code)
  const athlete = await fetchAthlete(tokens.accessToken)
  const secret = context.env.SESSION_SECRET

  const existing = await loadUser(context.env.COACH_CONFIG, secret, athlete.id)
  const now = new Date().toISOString()
  await saveUser(context.env.COACH_CONFIG, secret, {
    athleteId: athlete.id,
    name: athlete.name,
    tokens,
    createdAt: existing?.createdAt ?? now,
    // Reaching this point required the consent gate above; the first pass is the record.
    consentAt: existing?.consentAt ?? now,
    lastSeenAt: now,
  })

  context.header('Set-Cookie', await createSessionCookie(athlete.id, secret, isSecure(context)), {
    append: true,
  })
  return context.redirect((await hasConfig(context.env.COACH_CONFIG, athlete.id)) ? '/app' : '/onboarding', 302)
})

/**
 * Single user sign in. The shared password is exchanged once for a signed session
 * cookie, which is what Basic Auth never gave us: a login that survives closing
 * the browser and can be ended again from the app.
 */
app.post('/api/login', async (context) => {
  const env = context.env as Bindings
  if (isMultiUser(env)) return context.json({ error: 'Die Anmeldung läuft über intervals.icu' }, 400)
  if (!singleUserConfigured(env)) return context.json({ error: 'Nicht konfiguriert' }, 500)

  const client = context.req.header('CF-Connecting-IP') ?? 'unbekannt'
  if (await blocked(env.COACH_CONFIG, client)) {
    return context.json({ error: 'Zu viele Fehlversuche. Bitte in 15 Minuten erneut versuchen.' }, 429)
  }

  const body = (await context.req.json().catch(() => ({}))) as { passwort?: unknown }
  const passwort = typeof body.passwort === 'string' ? body.passwort : ''

  if (!(await secretEquals(passwort, env.APP_PASSWORD ?? ''))) {
    await recordFailure(env.COACH_CONFIG, client)
    return context.json({ error: 'Passwort falsch' }, 401)
  }

  await clearFailures(env.COACH_CONFIG, client)
  context.header(
    'Set-Cookie',
    await createSessionCookie(SINGLE_USER_SUBJECT, sessionSecret(env), isSecure(context)),
  )
  return context.json({ ok: true })
})

app.get('/auth/logout', (context) => {
  context.header('Set-Cookie', clearSessionCookie())
  return context.redirect('/', 302)
})

app.get('/api/me', async (context) => {
  const env = context.env as Bindings
  const session = await currentSession(context)
  if (session) await renewIfNeeded(context, session)

  if (!isMultiUser(env)) {
    return context.json({ mode: 'single', authenticated: Boolean(session), onboarded: true })
  }
  if (!session) return context.json({ mode: 'multi', authenticated: false, onboarded: false })

  const user = await loadUser(env.COACH_CONFIG, env.SESSION_SECRET ?? '', session.athleteId)
  return context.json({
    mode: 'multi',
    authenticated: true,
    onboarded: await hasConfig(env.COACH_CONFIG, session.athleteId),
    name: user?.name ?? 'Athlet',
    athleteId: session.athleteId,
    consentAt: user?.consentAt ?? null,
  })
})

// ------------------------------------------------------------- access control

/**
 * The shell, its assets and the legal pages are readable without a session in
 * either mode. They carry no data — the plan, the configuration and the
 * intervals.icu credentials all sit behind `/api/`, which needs the cookie.
 * intervals.icu also checks the privacy URL before it issues an OAuth client,
 * and a visitor is entitled to read the notice before signing in.
 */
app.use('*', async (context, next) => {
  const env = context.env as Bindings

  if (!isMultiUser(env) && !singleUserConfigured(env)) {
    return context.text(
      'Nicht konfiguriert. Entweder INTERVALS_CLIENT_ID, INTERVALS_CLIENT_SECRET und SESSION_SECRET ' +
        'für den Mehrbenutzer-Betrieb setzen, oder INTERVALS_API_KEY, INTERVALS_ATHLETE_ID und APP_PASSWORD ' +
        'für den Einzelbetrieb.',
      500,
    )
  }

  if (!context.req.path.startsWith('/api/')) return next()

  const session = await currentSession(context)
  if (!session) return context.json({ error: 'Nicht angemeldet', needsLogin: true }, 401)

  await renewIfNeeded(context, session)
  return next()
})

/** Art. 17 in one request: erase the account, then end the session. */
app.delete('/api/account', async (context) => {
  const env = context.env as Bindings
  if (!isMultiUser(env)) return context.json({ error: 'Nur im Mehrbenutzer-Betrieb' }, 400)
  const athleteId = await sessionAthlete(context)
  if (!athleteId) return context.json({ error: 'Nicht angemeldet', needsLogin: true }, 401)

  // Strava is told first, while the token to tell it with still exists.
  const link = await loadLink(env.COACH_CONFIG, sessionSecret(env), athleteId)
  if (link) await withdraw(stravaApp(env, new URL(context.req.url).origin), link.tokens)
  await deleteLink(env.COACH_CONFIG, athleteId)
  await deleteUser(env.COACH_CONFIG, athleteId)
  context.header('Set-Cookie', clearSessionCookie())
  return context.json({ ok: true })
})

const resolveDeps = async (context: Context): Promise<RouteDeps> => {
  const env = context.env as Bindings
  if (!isMultiUser(env)) return singleUserDeps(env)
  const athleteId = await sessionAthlete(context)
  if (!athleteId) throw new Error('Nicht angemeldet')
  return athleteDeps(env, athleteId, true)
}

app.route(
  '/',
  createStravaRoutes({
    subjectOf: sessionAthlete,
    secretOf: sessionSecret,
    depsOf: resolveDeps,
    secure: isSecure,
  }),
)

app.route('/', createApiRoutes(resolveDeps))

app.all('*', (context) => (context.env as Bindings).ASSETS.fetch(context.req.raw))

export { app }

/**
 * Requests go to the app; the cron trigger in wrangler.jsonc writes the summary
 * of every newly recognised session under it on Strava.
 */
export default {
  fetch: app.fetch,
  scheduled: (_event: unknown, env: Bindings, execution: ExecutionContext): void => {
    execution.waitUntil(
      syncStrava(env, {
        secret: sessionSecret(env),
        depsFor: async (subject) => (isMultiUser(env) ? athleteDeps(env, subject, false) : singleUserDeps(env)),
        keepExpiry: isMultiUser(env),
      }),
    )
  },
}
