import { Hono } from 'hono'
import type { Context } from 'hono'
import { basicAuth } from 'hono/basic-auth'
import { createApiRoutes } from '../server/routes.ts'
import type { RouteDeps } from '../server/routes.ts'
import { kvConfigStore } from './config-store-kv.ts'
import { deleteUser, loadUser, needsTouch, saveUser, touchUser, userConfigStore, hasConfig } from './users.ts'
import { authorizeUrl, exchangeCode, fetchAthlete, refreshTokens } from './oauth.ts'
import type { OAuthApp } from './oauth.ts'
import { randomToken } from './crypto.ts'
import {
  clearSessionCookie,
  clearStateCookie,
  createSessionCookie,
  createStateCookie,
  readSession,
  readState,
} from './session.ts'
import type { Bindings } from './bindings.ts'
import { isMultiUser } from './bindings.ts'

const REFRESH_MARGIN_SECONDS = 120

const app = new Hono<{ Bindings: Bindings }>()

const oauthApp = (context: Context): OAuthApp => {
  const env = context.env as Bindings
  return {
    clientId: env.INTERVALS_CLIENT_ID ?? '',
    clientSecret: env.INTERVALS_CLIENT_SECRET ?? '',
    // Derived from the request so localhost and production share one code path.
    redirectUri: `${new URL(context.req.url).origin}/auth/callback`,
  }
}

const sessionAthlete = async (context: Context): Promise<string | null> => {
  const env = context.env as Bindings
  if (!env.SESSION_SECRET) return null
  const session = await readSession(context.req.header('Cookie') ?? null, env.SESSION_SECRET)
  return session?.athleteId ?? null
}

/** Signed-in user's dependencies, refreshing the access token when it is close to expiry. */
const multiUserDeps = async (context: Context, athleteId: string): Promise<RouteDeps> => {
  const env = context.env as Bindings
  const secret = env.SESSION_SECRET ?? ''
  const user = await loadUser(env.COACH_CONFIG, secret, athleteId)
  if (!user) throw new Error('Sitzung ungültig — bitte neu anmelden')

  const expiringSoon = user.tokens.expiresAt < Math.floor(Date.now() / 1000) + REFRESH_MARGIN_SECONDS
  const tokens =
    expiringSoon && user.tokens.refreshToken
      ? await refreshTokens(oauthApp(context), user.tokens.refreshToken)
      : user.tokens

  // One write covers both jobs: the new token and the renewed retention window.
  if (tokens !== user.tokens || needsTouch(user)) {
    await touchUser(env.COACH_CONFIG, secret, {
      ...user,
      tokens,
      lastSeenAt: new Date().toISOString(),
    })
  }

  return {
    auth: { kind: 'bearer', accessToken: tokens.accessToken, athleteId },
    store: userConfigStore(env.COACH_CONFIG, athleteId),
  }
}

const singleUserDeps = (context: Context): RouteDeps => {
  const env = context.env as Bindings
  return {
    auth: {
      kind: 'apiKey',
      apiKey: env.INTERVALS_API_KEY ?? '',
      athleteId: env.INTERVALS_ATHLETE_ID ?? '',
    },
    store: kvConfigStore(env.COACH_CONFIG),
  }
}

// ---------------------------------------------------------------- auth routes

app.get('/auth/login', async (context) => {
  if (!isMultiUser(context.env)) return context.text('Anmeldung ist nicht konfiguriert', 404)
  // Health data needs explicit consent (Art. 9 (2) (a) GDPR), so the login refuses
  // without it rather than trusting the page to have asked.
  if (context.req.query('einwilligung') !== 'ja') return context.redirect('/?fehler=einwilligung', 302)
  const state = randomToken()
  context.header('Set-Cookie', createStateCookie(state))
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

  context.header('Set-Cookie', await createSessionCookie(athlete.id, secret), { append: true })
  return context.redirect((await hasConfig(context.env.COACH_CONFIG, athlete.id)) ? '/app' : '/onboarding', 302)
})

app.get('/auth/logout', (context) => {
  context.header('Set-Cookie', clearSessionCookie())
  return context.redirect('/', 302)
})

app.get('/api/me', async (context) => {
  const env = context.env as Bindings
  if (!isMultiUser(env)) {
    return context.json({ mode: 'single', authenticated: true, onboarded: true })
  }
  const athleteId = await sessionAthlete(context)
  if (!athleteId) return context.json({ mode: 'multi', authenticated: false, onboarded: false })
  const user = await loadUser(env.COACH_CONFIG, env.SESSION_SECRET ?? '', athleteId)
  return context.json({
    mode: 'multi',
    authenticated: true,
    onboarded: await hasConfig(env.COACH_CONFIG, athleteId),
    name: user?.name ?? 'Athlet',
    athleteId,
    consentAt: user?.consentAt ?? null,
  })
})

// ------------------------------------------------------------- access control

/**
 * Readable without the password even in single user mode. intervals.icu checks
 * the privacy URL before it issues an OAuth client, and a visitor is entitled to
 * read the notice before signing in. Only the shell and the legal text are open —
 * every data route stays behind the password.
 */
const PUBLIC_PATHS = ['/datenschutz', '/impressum']
const PUBLIC_FILES = ['/logo.svg', '/logo.png', '/favicon.png', '/apple-touch-icon.png']

const isPublicPath = (path: string): boolean =>
  PUBLIC_PATHS.includes(path) || PUBLIC_FILES.includes(path) || path.startsWith('/assets/')

app.use('*', async (context, next) => {
  const env = context.env as Bindings

  if (isMultiUser(env)) {
    // Public landing page and assets; only the data API needs a session.
    if (!context.req.path.startsWith('/api/')) return next()
    if (context.req.path === '/api/me') return next()
    const athleteId = await sessionAthlete(context)
    if (!athleteId) return context.json({ error: 'Nicht angemeldet', needsLogin: true }, 401)
    return next()
  }

  if (isPublicPath(context.req.path)) return next()

  if (!env.APP_PASSWORD || !env.INTERVALS_API_KEY || !env.INTERVALS_ATHLETE_ID) {
    return context.text(
      'Nicht konfiguriert. Entweder INTERVALS_CLIENT_ID, INTERVALS_CLIENT_SECRET und SESSION_SECRET ' +
        'für den Mehrbenutzer-Betrieb setzen, oder INTERVALS_API_KEY, INTERVALS_ATHLETE_ID und APP_PASSWORD ' +
        'für den Einzelbetrieb.',
      500,
    )
  }
  return basicAuth({ username: env.APP_USER ?? 'coach', password: env.APP_PASSWORD })(context, next)
})

/** Art. 17 in one request: erase the account, then end the session. */
app.delete('/api/account', async (context) => {
  const env = context.env as Bindings
  if (!isMultiUser(env)) return context.json({ error: 'Nur im Mehrbenutzer-Betrieb' }, 400)
  const athleteId = await sessionAthlete(context)
  if (!athleteId) return context.json({ error: 'Nicht angemeldet', needsLogin: true }, 401)

  await deleteUser(env.COACH_CONFIG, athleteId)
  context.header('Set-Cookie', clearSessionCookie())
  return context.json({ ok: true })
})

app.route(
  '/',
  createApiRoutes(async (context) => {
    const env = context.env as Bindings
    if (!isMultiUser(env)) return singleUserDeps(context)
    const athleteId = await sessionAthlete(context)
    if (!athleteId) throw new Error('Nicht angemeldet')
    return multiUserDeps(context, athleteId)
  }),
)

app.all('*', (context) => (context.env as Bindings).ASSETS.fetch(context.req.raw))

export default app
