import { addDays } from '../src/coach/dates.ts'
import type { DayProposal } from '../src/coach/types.ts'

/**
 * When the cron asks intervals.icu about an athlete at all. Each look costs two
 * requests of an allowance of about a hundred per athlete and day, so the cron
 * looks only where a summary can be waiting: a day the app proposed a session
 * for, at an hour people train. The longer nothing is written, the less often
 * it looks; the button under each session stays for the impatient.
 *
 * Nothing is stored for this. The looks follow a fixed timetable counted from
 * the first hour of the athlete's day, or from the newest summary written,
 * whichever is later. A write per look would cost a KV write per athlete every
 * half hour, and the free plan's thousand writes a day would run out at a few
 * dozen athletes — for the sign-ins and settings too.
 */

/** Before this local hour nobody has finished today's session, and yesterday's was checked last night. */
export const FIRST_HOUR = 6
/** Yesterday stays open through the morning, for a late session synced after midnight. */
export const YESTERDAY_UNTIL_HOUR = 12
export const BASE_INTERVAL_MINUTES = 30
export const MAX_INTERVAL_MINUTES = 120
/** How often the cron runs (wrangler.jsonc); each slot of the timetable gets exactly one run. */
export const CRON_MINUTES = 30
/** Cron runs drift by a few seconds to minutes; a look due in that margin is due now. */
const SLACK_MINUTES = 5

/**
 * Days with a proposed session. A written summary does not settle its day: a
 * swim in the morning can be followed by a run at night, and the sessions
 * already written are skipped one by one in strava-sync.ts.
 */
export const pendingDates = (proposals: readonly DayProposal[], today: string, hour: number): readonly string[] => {
  const candidates = hour < YESTERDAY_UNTIL_HOUR ? [today, addDays(today, -1)] : [today]
  return candidates.filter((date) =>
    proposals.some((proposal) => proposal.date === date && proposal.templateIds.length > 0),
  )
}

/**
 * Looks fall at 0, 30, 90, 210, 330 … minutes after the anchor: each gap
 * doubles up to the maximum. A slot is as wide as the cron's period, so one
 * run, early or a few minutes late, lands in it.
 */
export const lookDue = (elapsed: number, offset = 0, gap = BASE_INTERVAL_MINUTES): boolean => {
  if (elapsed < offset - SLACK_MINUTES) return false
  if (elapsed < offset - SLACK_MINUTES + CRON_MINUTES) return true
  return lookDue(elapsed, offset + gap, Math.min(gap * 2, MAX_INTERVAL_MINUTES))
}

export type CheckInput = {
  readonly now: Date
  /** Minutes since midnight on the athlete's clock. */
  readonly minuteOfDay: number
  readonly pending: readonly string[]
  /** When the newest summary was written, by the cron or the button: the next session may be close. */
  readonly lastPostedAt: string | null
}

export const shouldCheck = ({ now, minuteOfDay, pending, lastPostedAt }: CheckInput): boolean => {
  const sinceDayStart = minuteOfDay - FIRST_HOUR * 60
  if (pending.length === 0 || sinceDayStart < 0) return false
  const sincePost = lastPostedAt === null ? Number.NaN : (now.getTime() - Date.parse(lastPostedAt)) / 60_000
  return lookDue(sincePost >= 0 && sincePost < sinceDayStart ? sincePost : sinceDayStart)
}
