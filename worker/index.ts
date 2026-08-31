import { Hono } from 'hono'
import { basicAuth } from 'hono/basic-auth'
import { createApiRoutes } from '../server/routes.ts'
import { kvConfigStore } from './config-store-kv.ts'
import type { Bindings } from './bindings.ts'

const MISSING_SECRETS =
  'Secrets fehlen. Setze INTERVALS_API_KEY, INTERVALS_ATHLETE_ID und APP_PASSWORD mit "wrangler secret put".'

const api = createApiRoutes((env) => {
  const bindings = env as Bindings
  return {
    auth: { apiKey: bindings.INTERVALS_API_KEY, athleteId: bindings.INTERVALS_ATHLETE_ID },
    store: kvConfigStore(bindings.COACH_CONFIG),
  }
})

const app = new Hono<{ Bindings: Bindings }>()

// Everything, assets included, sits behind the password — the intervals.icu key
// in this Worker has full access to the athlete's account.
app.use('*', async (context, next) => {
  const { APP_PASSWORD, INTERVALS_API_KEY, INTERVALS_ATHLETE_ID } = context.env
  if (!APP_PASSWORD || !INTERVALS_API_KEY || !INTERVALS_ATHLETE_ID) {
    return context.text(MISSING_SECRETS, 500)
  }
  return basicAuth({ username: context.env.APP_USER ?? 'coach', password: APP_PASSWORD })(context, next)
})

app.route('/', api)

app.all('*', (context) => context.env.ASSETS.fetch(context.req.raw))

export default app
