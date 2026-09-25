import { Hono } from 'hono'
import type { Context } from 'hono'
import type { RouteDeps } from '../server/routes.ts'
import { isIsoDate } from '../src/coach/config-schema.ts'
import type { Bindings } from './bindings.ts'
import { hasStrava } from './bindings.ts'
import { randomToken } from './crypto.ts'
import { clearStateCookie, createStateCookie, readState } from './session.ts'
import type { StravaApp } from './strava.ts'
import { StravaError, authorizeUrl, exchangeCode, grantedEnough, withdraw } from './strava.ts'
import { deleteLink, loadLink, saveLink } from './strava-store.ts'
import { postSession } from './strava-sync.ts'

/** What these routes need from the Worker around them: who is asking, and with which secrets. */
export type StravaRouteHelpers = {
  readonly subjectOf: (context: Context) => Promise<string | null>
  readonly secretOf: (env: Bindings) => string
  readonly depsOf: (context: Context) => Promise<RouteDeps>
  readonly secure: (context: Context) => boolean
}

export const stravaApp = (env: Bindings, origin: string): StravaApp => ({
  clientId: env.STRAVA_CLIENT_ID ?? '',
  clientSecret: env.STRAVA_CLIENT_SECRET ?? '',
  redirectUri: `${origin}/auth/strava/callback`,
})

/** Back to the plan with a word on how it went; the settings read it from the address. */
const back = (context: Context, result: string) => context.redirect(`/app?strava=${result}`, 302)

export const createStravaRoutes = (helpers: StravaRouteHelpers): Hono<{ Bindings: Bindings }> => {
  const app = new Hono<{ Bindings: Bindings }>()

  app.get('/auth/strava/login', async (context) => {
    if (!hasStrava(context.env)) return context.text('Strava ist nicht eingerichtet', 404)
    if (!(await helpers.subjectOf(context))) return context.redirect('/', 302)
    const state = randomToken()
    context.header('Set-Cookie', createStateCookie(state, helpers.secure(context), 'strava'))
    return context.redirect(authorizeUrl(stravaApp(context.env, new URL(context.req.url).origin), state), 302)
  })

  app.get('/auth/strava/callback', async (context) => {
    if (!hasStrava(context.env)) return context.text('Strava ist nicht eingerichtet', 404)
    const subject = await helpers.subjectOf(context)
    if (!subject) return context.redirect('/', 302)

    const expected = readState(context.req.header('Cookie') ?? null, 'strava')
    context.header('Set-Cookie', clearStateCookie('strava'))
    const code = context.req.query('code')
    const state = context.req.query('state')
    if (context.req.query('error')) return back(context, 'abgelehnt')
    if (!code || !state || state !== expected) return back(context, 'fehler')
    if (!grantedEnough(context.req.query('scope'))) return back(context, 'rechte')

    const origin = new URL(context.req.url).origin
    const { tokens, athlete } = await exchangeCode(stravaApp(context.env, origin), code)
    const secret = helpers.secretOf(context.env)
    const existing = await loadLink(context.env.COACH_CONFIG, secret, subject)
    await saveLink(context.env.COACH_CONFIG, secret, {
      subject,
      stravaAthleteId: athlete.id,
      name: athlete.name,
      tokens,
      appUrl: origin,
      connectedAt: new Date().toISOString(),
      // The same Strava account again keeps its record, so nothing is written twice.
      posted: existing?.stravaAthleteId === athlete.id ? existing.posted : [],
    })
    return back(context, 'verbunden')
  })

  app.get('/api/strava', async (context) => {
    const subject = await helpers.subjectOf(context)
    const link = subject ? await loadLink(context.env.COACH_CONFIG, helpers.secretOf(context.env), subject) : null
    return context.json({
      available: hasStrava(context.env),
      connected: link !== null,
      name: link?.name ?? null,
      posted: link?.posted.map((entry) => entry.activityId) ?? [],
    })
  })

  /** Disconnecting also withdraws this app's access on Strava's side. */
  app.delete('/api/strava', async (context) => {
    const subject = await helpers.subjectOf(context)
    if (!subject) return context.json({ error: 'Nicht angemeldet', needsLogin: true }, 401)
    const link = await loadLink(context.env.COACH_CONFIG, helpers.secretOf(context.env), subject)
    if (link) await withdraw(stravaApp(context.env, new URL(context.req.url).origin), link.tokens)
    await deleteLink(context.env.COACH_CONFIG, subject)
    return context.json({ ok: true })
  })

  app.post('/api/strava/sessions', async (context) => {
    if (!hasStrava(context.env)) return context.json({ error: 'Strava ist nicht eingerichtet' }, 404)
    const subject = await helpers.subjectOf(context)
    if (!subject) return context.json({ error: 'Nicht angemeldet', needsLogin: true }, 401)
    const body = (await context.req.json().catch(() => ({}))) as Record<string, unknown>
    const { activityId, templateId, date } = body
    if (typeof activityId !== 'string' || !/^[A-Za-z0-9_-]{1,40}$/.test(activityId)) {
      return context.json({ error: 'Ungültige Aktivität' }, 400)
    }
    if (typeof templateId !== 'string' || !isIsoDate(date)) {
      return context.json({ error: 'templateId und date (YYYY-MM-DD) fehlen' }, 400)
    }

    const secret = helpers.secretOf(context.env)
    const link = await loadLink(context.env.COACH_CONFIG, secret, subject)
    if (!link) return context.json({ error: 'Strava ist nicht verbunden' }, 409)

    try {
      const outcome = await postSession(
        {
          deps: await helpers.depsOf(context),
          app: stravaApp(context.env, new URL(context.req.url).origin),
          link,
          save: (next) => saveLink(context.env.COACH_CONFIG, secret, next),
        },
        { activityId, templateId, date },
      )
      return context.json(outcome)
    } catch (error) {
      if (error instanceof StravaError) {
        console.error('Strava-Schreiben fehlgeschlagen', error.status, error.message)
        return context.json({ error: `Strava hat abgelehnt (${error.status})` }, 502)
      }
      throw error
    }
  })

  return app
}
