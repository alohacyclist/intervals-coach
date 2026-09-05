import { Hono } from 'hono'
import type { Context } from 'hono'
import type { ConfigStore } from '../src/coach/config-schema.ts'
import { MissingConfigError, ValidationError, validateConfig } from '../src/coach/config-schema.ts'
import type { IntervalsAuth } from './intervals.ts'
import {
  IntervalsError,
  createWorkoutEvent,
  fetchActivities,
  fetchEvents,
  fetchSportSettings,
  fetchWellness,
  updateSportThreshold,
} from './intervals.ts'
import { addDays } from '../src/coach/dates.ts'
import { buildState } from '../src/coach/state.ts'
import { planDays } from '../src/coach/engine.ts'
import { assessGoals } from '../src/coach/feasibility.ts'
import { buildHistory } from '../src/coach/adherence.ts'
import { completionsFrom } from '../src/coach/progression.ts'
import { benchmarkStatus } from '../src/coach/benchmark.ts'
import { adoptThreshold, thresholdSuggestions } from '../src/coach/threshold-drift.ts'
import type { ObservedThresholds } from '../src/coach/threshold-drift.ts'
import type { Sport } from '../src/coach/types.ts'
import { findTemplate } from '../src/coach/library.ts'
import { describeWorkout } from '../src/coach/format.ts'
import type { Plan } from '../src/coach/types.ts'

const TIMEZONE = 'Europe/Berlin'
const ACTIVITY_HISTORY_DAYS = 180
const WELLNESS_HISTORY_DAYS = 60
const ADHERENCE_DAYS = 7
/** Progression looks further back than the visible history strip. */
const PROGRESSION_DAYS = 120

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

/**
 * What intervals.icu currently measures. The estimated FTP comes from actual
 * rides, so it beats the manually entered value; pace has no estimate and falls
 * back to the athlete's own setting.
 */
const observedThresholds = (
  wellness: readonly { readonly eftpBySport: Partial<Record<Sport, number>> }[],
  settings: { readonly thresholdPaceSecPerKm: number | null; readonly cssSecPer100m: number | null } | null,
): ObservedThresholds => {
  const latestEftp = [...wellness]
    .reverse()
    .find((entry) => Object.keys(entry.eftpBySport).length > 0)?.eftpBySport
  return {
    ...(latestEftp ?? {}),
    ...(settings?.thresholdPaceSecPerKm ? { Run: settings.thresholdPaceSecPerKm } : {}),
    ...(settings?.cssSecPer100m ? { Swim: settings.cssSecPer100m } : {}),
  }
}

const buildPlan = async (deps: RouteDeps, days: number): Promise<Plan> => {
  const today = localToday()
  const config = await deps.store.load()
  const [activities, wellness, events, settings] = await Promise.all([
    fetchActivities(deps.auth, addDays(today, -ACTIVITY_HISTORY_DAYS), today),
    fetchWellness(deps.auth, addDays(today, -WELLNESS_HISTORY_DAYS), today),
    fetchEvents(deps.auth, addDays(today, -PROGRESSION_DAYS), today),
    // Optional: a missing scope must not take the whole plan down.
    fetchSportSettings(deps.auth).catch(() => null),
  ])
  const state = buildState(activities, wellness, today)
  const completions = completionsFrom(events, activities)

  return {
    generatedAt: new Date().toISOString(),
    state,
    history: buildHistory(events, activities, today, ADHERENCE_DAYS),
    thresholdSuggestions: thresholdSuggestions(config.profile, observedThresholds(wellness, settings)),
    benchmark: benchmarkStatus(config, completions, activities, today),
    days: planDays(state, config, days, completions),
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
    // Only the sports the athlete actually trains are updated; the rest is theirs.
    const synced = config.profile.sports.map((setting) => {
      if (setting.sport === 'Ride' && settings.ftp) {
        return { ...setting, threshold: { metric: 'power' as const, ftp: settings.ftp } }
      }
      if (setting.sport === 'Run' && settings.thresholdPaceSecPerKm) {
        return {
          ...setting,
          threshold: { metric: 'pace' as const, thresholdSecPerKm: settings.thresholdPaceSecPerKm },
        }
      }
      if (setting.sport === 'Swim' && settings.cssSecPer100m) {
        return {
          ...setting,
          threshold: { metric: 'swimPace' as const, cssSecPer100m: settings.cssSecPer100m },
        }
      }
      return setting
    })

    const merged = validateConfig({
      ...config,
      profile: {
        ...config.profile,
        sports: synced,
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

  /** Adopts one drifted threshold, leaving every other sport untouched. */
  app.post('/api/threshold', async (context) => {
    const body = (await context.req.json()) as { sport?: string; observed?: number }
    if (body.sport !== 'Ride' && body.sport !== 'Run' && body.sport !== 'Swim') {
      return context.json({ error: 'sport muss Ride, Run oder Swim sein' }, 400)
    }
    if (typeof body.observed !== 'number' || body.observed <= 0) {
      return context.json({ error: 'observed muss > 0 sein' }, 400)
    }
    const { auth, store } = await resolve(context)
    const config = await store.load()
    const saved = await store.save(
      validateConfig({ ...config, profile: adoptThreshold(config.profile, body.sport, body.observed) }),
    )
    // Keep intervals.icu in step, but never let a failed write lose the local change.
    const synced = await updateSportThreshold(auth, body.sport, body.observed).then(
      () => true,
      () => false,
    )
    return context.json({ ...saved, syncedToIntervals: synced })
  })

  /** Records or removes a completed strength session; progression follows the log. */
  app.post('/api/strength', async (context) => {
    const body = (await context.req.json()) as { date?: string; done?: boolean }
    if (!body.date || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
      return context.json({ error: 'date muss YYYY-MM-DD sein' }, 400)
    }
    const { store } = await resolve(context)
    const config = await store.load()
    const strengthLog =
      body.done === false
        ? config.strengthLog.filter((entry) => entry !== body.date)
        : [...config.strengthLog, body.date]
    return context.json(await store.save(validateConfig({ ...config, strengthLog })))
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
      templateId: template.id,
      name: template.name,
      description: planned?.description ?? describeWorkout(template, 'manuell ausgewählt'),
      movingTimeSec: template.minutes * 60,
    })

    return context.json({ ok: true, date: body.date, name: template.name })
  })

  return app
}
