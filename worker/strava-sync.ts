import type { RouteDeps } from '../server/routes.ts'
import { localToday } from '../server/routes.ts'
import { loadExecution } from '../server/execution-load.ts'
import { fetchActivities, fetchEvents } from '../server/intervals.ts'
import { addDays } from '../src/coach/dates.ts'
import { findTemplate } from '../src/coach/library.ts'
import { matchedCompletions, mergeCompletions } from '../src/coach/matching.ts'
import { completionsFrom } from '../src/coach/progression.ts'
import type { Completion } from '../src/coach/progression.ts'
import type { StravaCandidate } from '../src/coach/strava-summary.ts'
import { findStravaMatch, summaryOf, withSummary } from '../src/coach/strava-summary.ts'
import type { Activity, Execution, WorkoutTemplate } from '../src/coach/types.ts'
import type { StravaApp } from './strava.ts'
import { StravaError, listActivities, readDescription, refreshTokens, writeDescription } from './strava.ts'
import type { StravaLink } from './strava-store.ts'
import { withPosted } from './strava-store.ts'

/**
 * Writes the planned-against-done summary under the session on Strava. The
 * device keeps uploading to Strava as before; this only adds the paragraph, so
 * nothing is lost when this app is down and nothing arrives twice.
 */

/** A day back covers a session finished late in the evening and synced the next morning. */
const LOOKBACK_DAYS = 1
/** Refreshed a little early, so a token never expires between two calls of one run. */
const REFRESH_MARGIN_SECONDS = 300
/** Strava lists by start; an hour either side is plenty to find one session. */
const SEARCH_MARGIN_MS = 60 * 60 * 1000

export type SessionRef = { readonly activityId: string; readonly templateId: string; readonly date: string }

export type PostOutcome =
  | { readonly status: 'posted'; readonly activityId: string; readonly stravaId: string }
  | { readonly status: 'not-found'; readonly activityId: string }
  | { readonly status: 'no-comparison'; readonly activityId: string }
  | { readonly status: 'failed'; readonly activityId: string }

export type SyncContext = {
  readonly deps: RouteDeps
  readonly app: StravaApp
  readonly link: StravaLink
  readonly save: (link: StravaLink) => Promise<StravaLink>
  readonly now?: () => Date
}

const clockOf = (context: SyncContext): Date => context.now?.() ?? new Date()

const withFreshToken = async (context: SyncContext): Promise<StravaLink> => {
  const { link, app, save } = context
  if (link.tokens.expiresAt > Math.floor(clockOf(context).getTime() / 1000) + REFRESH_MARGIN_SECONDS) return link
  return save({ ...link, tokens: await refreshTokens(app, link.tokens.refreshToken) })
}

/** Races have no plan to compare against; everything else in the library has. */
const comparableTemplate = (templateId: string): WorkoutTemplate | null => {
  const template = findTemplate(templateId)
  return template && template.occasion === undefined ? template : null
}

const writeSummary = async (link: StravaLink, execution: Execution, stravaId: string): Promise<void> => {
  const current = await readDescription(link.tokens.accessToken, stravaId)
  const next = withSummary(current, summaryOf(execution, link.appUrl))
  if (next !== (current ?? '')) await writeDescription(link.tokens.accessToken, stravaId, next)
}

/**
 * The button on one session: always writes, even when it was written before —
 * the athlete asked, and the summary may have changed since.
 */
export const postSession = async (context: SyncContext, session: SessionRef): Promise<PostOutcome> => {
  const template = comparableTemplate(session.templateId)
  if (!template) return { status: 'no-comparison', activityId: session.activityId }
  const link = await withFreshToken(context)
  const config = await context.deps.store.load()
  const { activity, execution } = await loadExecution(
    context.deps.auth,
    config.profile,
    session.activityId,
    template,
    session.date,
  )
  const start = activity.startedAt === null ? Number.NaN : Date.parse(activity.startedAt)
  if (Number.isNaN(start)) return { status: 'not-found', activityId: session.activityId }

  const candidates = await listActivities(
    link.tokens.accessToken,
    new Date(start - SEARCH_MARGIN_MS),
    new Date(start + SEARCH_MARGIN_MS),
  )
  const match = findStravaMatch(candidates, activity.startedAt!, template.sport)
  if (!match) return { status: 'not-found', activityId: session.activityId }

  await writeSummary(link, execution, match.id)
  await context.save(withPosted(link, { activityId: session.activityId, stravaId: match.id, at: clockOf(context).toISOString() }))
  return { status: 'posted', activityId: session.activityId, stravaId: match.id }
}

type Open = { readonly completion: Completion; readonly template: WorkoutTemplate; readonly activity: Activity }

/**
 * The cron: every recognised session of the last two days that is not on Strava
 * yet. Strava is asked once per run for the whole window, and intervals.icu for
 * a comparison only once a session was actually found there — a session that
 * never reaches Strava costs one list call per run, not five.
 */
export const postRecent = async (context: SyncContext, today: string = localToday()): Promise<readonly PostOutcome[]> => {
  const { deps } = context
  const config = await deps.store.load()
  const oldest = addDays(today, -LOOKBACK_DAYS)
  const [activities, events] = await Promise.all([
    fetchActivities(deps.auth, oldest, today),
    fetchEvents(deps.auth, oldest, today),
  ])
  const posted = new Set(context.link.posted.map((entry) => entry.activityId))
  const open = mergeCompletions(completionsFrom(events, activities), matchedCompletions(config.proposals, activities, config.profile))
    .filter((completion) => !posted.has(completion.activityId))
    .flatMap((completion): readonly Open[] => {
      const template = comparableTemplate(completion.templateId)
      const activity = activities.find((entry) => entry.id === completion.activityId)
      return template && activity?.startedAt ? [{ completion, template, activity }] : []
    })
  if (open.length === 0) return []

  const fresh = await withFreshToken(context)
  const starts = open.map((entry) => Date.parse(entry.activity.startedAt!))
  const candidates: readonly StravaCandidate[] = await listActivities(
    fresh.tokens.accessToken,
    new Date(Math.min(...starts) - SEARCH_MARGIN_MS),
    new Date(Math.max(...starts) + SEARCH_MARGIN_MS),
  )

  type Run = { readonly link: StravaLink; readonly outcomes: readonly PostOutcome[]; readonly halted: boolean }
  // One after the other: Strava counts requests per fifteen minutes.
  const result = await open.reduce<Promise<Run>>(
    async (previous, { completion, template, activity }) => {
      const run = await previous
      if (run.halted) return run
      const match = findStravaMatch(candidates, activity.startedAt!, template.sport)
      if (!match) return { ...run, outcomes: [...run.outcomes, { status: 'not-found', activityId: activity.id }] }
      try {
        const { execution } = await loadExecution(deps.auth, config.profile, activity.id, template, completion.date)
        await writeSummary(run.link, execution, match.id)
        return {
          ...run,
          link: withPosted(run.link, { activityId: activity.id, stravaId: match.id, at: clockOf(context).toISOString() }),
          outcomes: [...run.outcomes, { status: 'posted', activityId: activity.id, stravaId: match.id }],
        }
      } catch (error) {
        console.error('Strava: Einheit nicht geschrieben', activity.id, error)
        // Over the rate limit every further call fails too; the next run picks up from here.
        const halted = error instanceof StravaError && error.status === 429
        return { ...run, halted, outcomes: [...run.outcomes, { status: 'failed', activityId: activity.id }] }
      }
    },
    Promise.resolve({ link: fresh, outcomes: [], halted: false }),
  )

  if (result.link !== fresh) await context.save(result.link)
  return result.outcomes
}
