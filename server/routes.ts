import { Hono } from 'hono'
import type { Context } from 'hono'
import type { ConfigStore } from '../src/coach/config-schema.ts'
import { MissingConfigError, ValidationError, validateConfig } from '../src/coach/config-schema.ts'
import type { IntervalsAuth } from './intervals.ts'
import { IntervalsError, createWorkoutEvent, fetchActivities, fetchSportSettings, fetchWellness } from './intervals.ts'
import { addDays } from '../src/coach/dates.ts'
import { buildState } from '../src/coach/state.ts'
import { planDays } from '../src/coach/engine.ts'
import { assessGoals } from '../src/coach/feasibility.ts'
import { findTemplate } from '../src/coach/library.ts'
import { describeWorkout } from '../src/coach/format.ts'
import type { Plan } from '../src/coach/types.ts'

const TIMEZONE = 'Europe/Berlin'
const ACTIVITY_HISTORY_DAYS = 180
const WELLNESS_HISTORY_DAYS = 60

/** Local calendar date in the athlete's timezone — sv-SE formats as YYYY-MM-DD. */
export const localToday = (now: Date = new Date()): string =>
  now.toLocaleDateString('sv-SE', { timeZone: TIMEZONE })

export type RouteDeps = {
  readonly auth: IntervalsAuth
  readonly store: ConfigStore
}

/**
 * Resolves per-request dependencies: fixed under Node, derived from the signed
 * session and the Worker bindings in the hosted multi user setup.
 */
export type DepsResolver = (context: Context) => Promise<RouteDeps>

const buildPlan = async (deps: RouteDeps, days: number): Promise<Plan> => {
  const today = localToday()
  const config = await deps.store.load()
  const [activities, wellness] = await Promise.all([
    fetchActivities(deps.auth, addDays(today, -ACTIVITY_HISTORY_DAYS), today),
    fetchWellness(deps.auth, addDays(today, -WELLNESS_HISTORY_DAYS), today),
  ])
  const state = buildState(activities, wellness, today)

  return {
    generatedAt: new Date().toISOString(),
    state,
    days: planDays(state, config, days),
    feasibility: assessGoals(config.goals, config.profile, today),
  }
}

export const createApiRoutes = (resolve: DepsResolver): Hono => {
  const app = new Hono()

  // Plan data changes as soon as an activity syncs, so it must never be cached.
  app.use('/api/*', async (context, next) => {
    await next()
    context.header('Cache-Control', 'no-store, max-age=0')
  })

  app.onError((error, context) => {
    if (error instanceof MissingConfigError) {
      return context.json({ error: error.message, needsOnboarding: true }, 409)
    }
    if (error instanceof ValidationError) return context.json({ error: error.message, issues: error.issues }, 400)
    if (error instanceof IntervalsError) return context.json({ error: error.message }, 502)
    console.error(error)
    return context.json({ error: error.message ?? 'Unbekannter Fehler' }, 500)
  })

  app.get('/api/health', (context) => context.json({ ok: true, today: localToday() }))

  app.get('/api/config', async (context) => context.json(await (await resolve(context)).store.load()))

  app.put('/api/config', async (context) => {
    const { store } = await resolve(context)
    return context.json(await store.save(validateConfig(await context.req.json())))
  })

  app.get('/api/plan', async (context) => {
    const requested = Number(context.req.query('days') ?? 3)
    const days = Number.isFinite(requested) ? Math.min(Math.max(Math.trunc(requested), 1), 7) : 3
    return context.json(await buildPlan(await resolve(context), days))
  })

  /** Pulls FTP and threshold pace from intervals.icu into the stored profile. */
  app.post('/api/sync-settings', async (context) => {
    const { auth, store } = await resolve(context)
    const settings = await fetchSportSettings(auth)
    const config = await store.load()
    const merged = validateConfig({
      ...config,
      profile: {
        ...config.profile,
        ftp: settings.ftp ?? config.profile.ftp,
        thresholdPaceSecPerKm: settings.thresholdPaceSecPerKm ?? config.profile.thresholdPaceSecPerKm,
        lthr: settings.lthr ?? config.profile.lthr,
        maxHr: settings.maxHr ?? config.profile.maxHr,
      },
    })
    return context.json({ config: await store.save(merged), settings })
  })

  /** Raw sport settings, used to prefill onboarding before any config exists. */
  app.get('/api/sport-settings', async (context) => {
    const { auth } = await resolve(context)
    return context.json(await fetchSportSettings(auth))
  })

  app.post('/api/push', async (context) => {
    const body = (await context.req.json()) as { date?: string; templateId?: string }
    const template = body.templateId ? findTemplate(body.templateId) : undefined
    if (!body.date || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
      return context.json({ error: 'date muss YYYY-MM-DD sein' }, 400)
    }
    if (!template) return context.json({ error: `Unbekanntes Workout: ${body.templateId}` }, 400)

    const deps = await resolve(context)
    const plan = await buildPlan(deps, 7)
    const planned = plan.days
      .find((day) => day.date === body.date)
      ?.options.find((option) => option.template.id === template.id)

    await createWorkoutEvent(deps.auth, {
      date: body.date,
      sport: template.sport,
      name: template.name,
      description: planned?.description ?? describeWorkout(template, 'manuell ausgewählt'),
      movingTimeSec: template.minutes * 60,
    })

    return context.json({ ok: true, date: body.date, name: template.name })
  })

  return app
}
