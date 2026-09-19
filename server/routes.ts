import { Hono } from 'hono'
import type { Context } from 'hono'
import type { ConfigStore } from '../src/coach/config-schema.ts'
import {
  MissingConfigError,
  ValidationError,
  validateConfig,
  validateZrlRaces,
  MAX_ZRL_RACES,
} from '../src/coach/config-schema.ts'
import type { IntervalsAuth } from './intervals.ts'
import {
  IntervalsError,
  createWorkoutEvent,
  fetchActivities,
  fetchEvents,
  fetchDestinations,
  fetchSportSettings,
  fetchWellness,
  applyDestinations,
  updateSportThreshold,
} from './intervals.ts'
import { addDays } from '../src/coach/dates.ts'
import { buildState } from '../src/coach/state.ts'
import { planFromMorning } from '../src/coach/today.ts'
import { assessGoals } from '../src/coach/feasibility.ts'
import { buildHistory } from '../src/coach/adherence.ts'
import { completionsFrom, scheduledFrom } from '../src/coach/progression.ts'
import { benchmarkStatus } from '../src/coach/benchmark.ts'
import { buildProgress } from '../src/coach/progress.ts'
import { adoptThreshold, thresholdSuggestions } from '../src/coach/threshold-drift.ts'
import type { ObservedThresholds } from '../src/coach/threshold-drift.ts'
import { matchedCompletions, mergeCompletions } from '../src/coach/matching.ts'
import { withProposal } from '../src/coach/proposals.ts'
import type { DayProposal, PlannedDay, Sport } from '../src/coach/types.ts'
import { readThresholdTests } from './threshold-tests.ts'
import { ZWIFT_ROUTES, findRoute } from './zwift-routes.ts'
import { isZrlRace } from '../src/coach/zrl.ts'
import { ALL_BREAK_KINDS } from '../src/coach/types.ts'
import type { SessionTier } from '../src/coach/types.ts'

const TIERS: readonly SessionTier[] = ['min', 'normal', 'max']
import { activeBreak, endedBefore } from '../src/coach/breaks.ts'
import { findTemplate } from '../src/coach/library.ts'
import { describeWorkout } from '../src/coach/format.ts'
import type { Intent, Plan, Progress } from '../src/coach/types.ts'

const TIMEZONE = 'Europe/Berlin'
/** Longer than this is not a break any more, it is a different training year. */
const MAX_BREAK_DAYS = 120
const ACTIVITY_HISTORY_DAYS = 180
const WELLNESS_HISTORY_DAYS = 60
const ADHERENCE_DAYS = 7
/** A whole league season, September to April, so last season's races inform this one. */
const RACE_HISTORY_DAYS = 400
/** Progression looks further back than the visible history strip. */
const PROGRESSION_DAYS = 120
/** A training block plus its recovery weeks — enough to see a rhythm. */
const WEEKS_SHOWN = 12

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

/**
 * Re-reads the stored config before writing, so a settings change saved while
 * the plan was being built is not rolled back by this write.
 */
const rememberProposals = async (store: ConfigStore, days: readonly PlannedDay[]): Promise<void> => {
  const latest = await store.load()
  const proposals = days.reduce(withProposal, latest.proposals)
  if (proposals !== latest.proposals) await store.save(validateConfig({ ...latest, proposals }))
}

/**
 * The development view. Deliberately lighter than the plan: it needs the same
 * activity history the plan already reads, but neither wellness nor the
 * calendar ahead, because nothing here is about today.
 */
const buildProgressView = async (deps: RouteDeps): Promise<Progress> => {
  const today = localToday()
  const config = await deps.store.load()
  const [activities, events] = await Promise.all([
    fetchActivities(deps.auth, addDays(today, -ACTIVITY_HISTORY_DAYS), today),
    fetchEvents(deps.auth, addDays(today, -PROGRESSION_DAYS), today),
  ])
  const completions = mergeCompletions(
    completionsFrom(events, activities),
    matchedCompletions(config.proposals, activities, config.profile),
  )
  return buildProgress(activities, completions, today, ACTIVITY_HISTORY_DAYS, WEEKS_SHOWN, {
    benchmark: benchmarkStatus(config, completions, activities, today),
    feasibility: assessGoals(config.goals, config.profile, today),
  })
}

const buildPlan = async (deps: RouteDeps, days: number, intent?: Intent): Promise<Plan> => {
  const today = localToday()
  const config = await deps.store.load()
  const [activities, wellness, events, settings, destinations] = await Promise.all([
    fetchActivities(deps.auth, addDays(today, -ACTIVITY_HISTORY_DAYS), today),
    fetchWellness(deps.auth, addDays(today, -WELLNESS_HISTORY_DAYS), today),
    // Ahead too, so the plan knows which versions are already on the calendar.
    fetchEvents(deps.auth, addDays(today, -PROGRESSION_DAYS), addDays(today, days)),
    // Optional: a missing scope must not take the whole plan down.
    fetchSportSettings(deps.auth).catch(() => null),
    fetchDestinations(deps.auth).catch(() => []),
  ])
  // Only an athlete with races entered pays for the extra history; without it the estimate is rougher, not wrong.
  const olderRaces =
    config.zrlRaces.length === 0
      ? []
      : await fetchActivities(
          deps.auth,
          addDays(today, -RACE_HISTORY_DAYS),
          addDays(today, -ACTIVITY_HISTORY_DAYS - 1),
        ).then(
          (older) => older.filter(isZrlRace),
          () => [],
        )
  const raceActivities = [...olderRaces, ...activities]
  const state = buildState(activities, wellness, today, raceActivities)
  const calendar = completionsFrom(events, activities)
  const recognised = (proposals: readonly DayProposal[]) =>
    mergeCompletions(calendar, matchedCompletions(proposals, activities, config.profile))

  // Today has to be on record before training done today can be recognised against it.
  const [morning] = planFromMorning(
    activities,
    wellness,
    recognised(config.proposals),
    config,
    today,
    1,
    intent,
    raceActivities,
  )
  const proposals = morning ? withProposal(config.proposals, morning) : config.proposals

  const tests = await readThresholdTests(deps.auth, config, recognised(proposals), today)
  const completions = tests.completions
  const estimated = thresholdSuggestions(config.profile, observedThresholds(wellness, settings))
  // A measurement outranks an estimate for the same sport, always.
  const suggestions = [
    ...tests.suggestions,
    ...estimated.filter((entry) => !tests.suggestions.some((hit) => hit.sport === entry.sport)),
  ]

  const planned = planFromMorning(
    activities,
    wellness,
    completions,
    config,
    today,
    days,
    intent,
    raceActivities,
  )
  // The days ahead are kept too: training on a day the app was not opened is still recognised.
  if (planned.reduce(withProposal, proposals) !== config.proposals) {
    await rememberProposals(deps.store, planned).catch((error: unknown) =>
      console.error('Vorschläge nicht gespeichert', error),
    )
  }

  return {
    generatedAt: new Date().toISOString(),
    state,
    history: buildHistory(events, activities, today, ADHERENCE_DAYS, proposals, completions),
    thresholdSuggestions: suggestions,
    destinations,
    days: planned,
    scheduled: scheduledFrom(events).filter((entry) => entry.date >= today),
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
    const body = (await context.req.json()) as Record<string, unknown>
    // Kept by their own endpoints; a settings form holding an older copy must not roll them back.
    // Only a missing config means there is nothing to keep; any other failure must not erase it.
    const owned = await store.load().then(
      (stored) => ({ proposals: stored.proposals, zrlRaces: stored.zrlRaces }),
      (error: unknown) => {
        if (error instanceof MissingConfigError) return { proposals: [], zrlRaces: [] }
        throw error
      },
    )
    return context.json(await store.save(validateConfig({ ...body, ...owned })))
  })

  app.get('/api/progress', async (context) =>
    context.json(await buildProgressView(await resolve(context))),
  )

  app.get('/api/plan', async (context) => {
    const requested = Number(context.req.query('days') ?? 3)
    const days = Number.isFinite(requested) ? Math.min(Math.max(Math.trunc(requested), 1), 7) : 3
    const wish = context.req.query('intent')
    const intent = wish === 'hard' || wish === 'easy' || wish === 'rest' ? wish : undefined
    return context.json(await buildPlan(await resolve(context), days, intent))
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

  /** Every rideable Zwift route, for entering a league round. Not athlete data. */
  app.get('/api/zwift-routes', (context) => context.json(ZWIFT_ROUTES))

  /** Replaces the entered Zwift Racing League dates; route details come from the route list, not the client. */
  app.put('/api/zrl', async (context) => {
    const body = (await context.req.json()) as { races?: unknown }
    if (!Array.isArray(body.races)) return context.json({ error: 'races muss eine Liste sein' }, 400)
    if (body.races.length > MAX_ZRL_RACES) {
      return context.json({ error: `Höchstens ${MAX_ZRL_RACES} Rennen` }, 400)
    }

    const issues: string[] = []
    const races = body.races.map((entry: unknown, index: number) => {
      const raw = (entry ?? {}) as Record<string, unknown>
      const where = typeof raw['date'] === 'string' ? raw['date'] : `Eintrag ${index + 1}`
      const route = raw['routeId'] == null ? null : findRoute(Number(raw['routeId']))
      if (raw['routeId'] != null && route === null) issues.push(`${where}: Route unbekannt`)
      const race = { date: raw['date'], format: raw['format'], laps: raw['laps'], route }
      if (validateZrlRaces([race]).length === 0) issues.push(`${where}: Datum, Format oder Runden ungültig`)
      return race
    })
    const dates = races.map((race) => String(race.date))
    if (new Set(dates).size !== dates.length) issues.push('Ein Datum ist doppelt eingetragen')
    if (issues.length > 0) return context.json({ error: issues.join('; ') }, 400)

    const { store } = await resolve(context)
    const config = await store.load()
    return context.json(await store.save(validateConfig({ ...config, zrlRaces: validateZrlRaces(races) })))
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

  /** Declares a break: illness, a vaccination, an injury, or plain absence. */
  app.post('/api/break', async (context) => {
    const body = (await context.req.json()) as { kind?: string; days?: number }
    const kind = ALL_BREAK_KINDS.find((known) => known === body.kind)
    const days = Math.round(Number(body.days))
    if (!kind) {
      return context.json({ error: `kind muss eines von ${ALL_BREAK_KINDS.join(', ')} sein` }, 400)
    }
    if (!Number.isFinite(days) || days < 1 || days > MAX_BREAK_DAYS) {
      return context.json({ error: `days muss zwischen 1 und ${MAX_BREAK_DAYS} liegen` }, 400)
    }

    const today = localToday()
    const { store } = await resolve(context)
    const config = await store.load()
    // A new break replaces one already running; two at once would only conflict.
    const kept = config.breaks.filter((entry) => entry.until < today)
    const entry = { id: `${kind}-${today}`, kind, from: today, until: addDays(today, days - 1) }
    return context.json(await store.save(validateConfig({ ...config, breaks: [...kept, entry] })))
  })

  /** Ends the running break from today, for an athlete who recovered early. */
  app.post('/api/break/end', async (context) => {
    const today = localToday()
    const { store } = await resolve(context)
    const config = await store.load()
    const running = activeBreak(config.breaks, today)
    if (!running) return context.json({ error: 'Keine Pause eingetragen' }, 400)

    const shortened = endedBefore(running, today)
    const breaks = config.breaks
      .filter((entry) => entry.id !== running.id)
      .concat(shortened ? [shortened] : [])
    return context.json(await store.save(validateConfig({ ...config, breaks })))
  })

  app.post('/api/push', async (context) => {
    const body = (await context.req.json()) as {
      date?: string
      templateId?: string
      variant?: string
    }
    const template = body.templateId ? findTemplate(body.templateId) : undefined
    if (!body.date || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
      return context.json({ error: 'date muss YYYY-MM-DD sein' }, 400)
    }
    if (!template) return context.json({ error: `Unbekanntes Workout: ${body.templateId}` }, 400)
    if (body.variant !== undefined && !TIERS.includes(body.variant as SessionTier)) {
      return context.json({ error: `variant muss eines von ${TIERS.join(', ')} sein` }, 400)
    }

    const deps = await resolve(context)
    const plan = await buildPlan(deps, 7)
    const planned = plan.days
      .find((day) => day.date === body.date)
      ?.options.find((option) => option.template.id === template.id)

    const chosen = planned?.variants.find((variant) => variant.tier === body.variant)
    if (body.variant !== undefined && !chosen) {
      return context.json({ error: `Keine ${body.variant}-Fassung für ${template.name}` }, 400)
    }
    const short = chosen && chosen.minutes < template.minutes ? chosen : undefined
    const minutes = short?.minutes ?? template.minutes
    const name = short ? `${template.name} (${minutes} min)` : template.name

    // Each version may go on the calendar once; sending several is the athlete's way of deciding later.
    const alreadyScheduled = plan.scheduled.some(
      (entry) => entry.date === body.date && entry.templateId === template.id && entry.minutes === minutes,
    )
    if (alreadyScheduled) return context.json({ ok: true, date: body.date, name, alreadyScheduled })

    // intervals.icu forwards per athlete: the switches are set to this sport's
    // destinations first, so a run does not land on the turbo trainer.
    const config = await deps.store.load()
    const wanted = config.destinations[template.sport]
    if (wanted) await applyDestinations(deps.auth, wanted)

    await createWorkoutEvent(deps.auth, {
      date: body.date,
      sport: template.sport,
      templateId: template.id,
      name,
      description:
        short?.description ?? planned?.description ?? describeWorkout(template, 'manuell ausgewählt'),
      minutes,
    })

    return context.json({ ok: true, date: body.date, name, alreadyScheduled })
  })

  return app
}
