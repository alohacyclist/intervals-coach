import type { Activity, AthleteProfile, DayProposal, Stimulus, WorkoutTemplate } from './types.ts'
import type { Completion } from './progression.ts'
import { findTemplate, flattenBlocks, intensityClass } from './library.ts'
import { deliveredStimuli, inferStimulus } from './fitness.ts'
import { defaultThreshold, thresholdFor } from './thresholds.ts'
import { estimateSeconds } from './variant.ts'

/** Shorter than this is a different session, not the knapp version of this one. */
const MIN_SHARE = 0.4
/** Longer than this the session was something else that happened to fit. */
const MAX_SHARE = 1.5
/** From here on the whole session counts, not a shortened one. */
const FULL_SHARE = 0.85
/**
 * Share of the prescribed work that has to show up as time in zone. Heart rate
 * lags every interval and zones cut through targets, so all of it never does —
 * but a few hard minutes inside an otherwise easy ride stay well below this.
 */
const HELD_SHARE = 0.6

/** Where the work of each stimulus sits: target from, in percent of threshold, and the zones that record it. */
const WORK: Partial<
  Record<Stimulus, { readonly from: number; readonly zones: readonly string[] }>
> = {
  VO2: { from: 106, zones: ['Z5', 'Z6', 'Z7'] },
  THRESHOLD: { from: 91, zones: ['Z4', 'Z5', 'Z6', 'Z7'] },
  SWEETSPOT: { from: 84, zones: ['SS'] },
  TEMPO: { from: 76, zones: ['Z3', 'Z4', 'Z5', 'Z6', 'Z7'] },
}

const TARGET_PATTERN = /(\d+)(?:-(\d+))?%/

const targetPercent = (target: string): number | null => {
  const match = TARGET_PATTERN.exec(target)
  if (!match?.[1]) return null
  return (Number(match[1]) + Number(match[2] ?? match[1])) / 2
}

type Candidate = {
  readonly template: WorkoutTemplate
  readonly evidence: 'exact' | 'similar'
  readonly share: number
}

const isHard = (activity: Activity): boolean => intensityClass(inferStimulus(activity)) === 'hard'

/**
 * Exact means the session's own work was actually held, not only touched. For
 * structured work that is time in zone against what was prescribed; without
 * zone data it cannot be shown, so at most the day counts as similar.
 */
const heldTheWork = (
  template: WorkoutTemplate,
  activity: Activity,
  profile: AthleteProfile,
  share: number,
): boolean => {
  if (!deliveredStimuli(activity).includes(template.stimulus)) return false
  const work = WORK[template.stimulus]
  if (!work) return true
  if (Object.keys(activity.zoneSeconds).length === 0) return false

  const threshold = thresholdFor(profile, template.sport) ?? defaultThreshold(template.sport)
  const prescribed = flattenBlocks(template.blocks)
    .filter((step) => (targetPercent(step.target) ?? 0) >= work.from)
    .reduce((sum, step) => sum + estimateSeconds(step.duration, threshold), 0)
  const held = work.zones.reduce((sum, zone) => sum + (activity.zoneSeconds[zone] ?? 0), 0)
  return held >= HELD_SHARE * prescribed * Math.min(share, 1)
}

const fit = (
  template: WorkoutTemplate,
  activity: Activity,
  profile: AthleteProfile,
): Candidate | null => {
  if (template.sport !== activity.sport) return null
  const share = activity.movingTimeSec / 60 / template.minutes
  if (share < MIN_SHARE || share > MAX_SHARE) return null

  if (heldTheWork(template, activity, profile, share)) {
    return { template, evidence: 'exact', share }
  }
  // A measurement needs its own stimulus; anything close would measure something else.
  if (template.benchmark === true || template.measures !== undefined) return null
  // Hard asks for hard. Easy and moderate are done by anything that was not hard.
  const hardWanted = intensityClass(template.stimulus) === 'hard'
  return hardWanted === isHard(activity) ? { template, evidence: 'similar', share } : null
}

const RANK = { exact: 0, similar: 1 } as const

const best = (candidates: readonly Candidate[]): Candidate | null =>
  [...candidates].sort(
    (left, right) =>
      RANK[left.evidence] - RANK[right.evidence] ||
      Math.abs(1 - left.share) - Math.abs(1 - right.share),
  )[0] ?? null

/**
 * The session an activity fulfilled, read from the data instead of from a
 * calendar entry — the athlete decides spontaneously and should not have to
 * send anything first for training to count.
 */
export const matchedCompletions = (
  proposals: readonly DayProposal[],
  activities: readonly Activity[],
  profile: AthleteProfile,
): readonly Completion[] =>
  activities.flatMap((activity) => {
    if (activity.load <= 0 || activity.sport === 'Other') return []
    const proposal = proposals.find((entry) => entry.date === activity.date)
    const templates = (proposal?.templateIds ?? [])
      .map(findTemplate)
      .filter((template): template is WorkoutTemplate => template !== undefined)
    const match = best(
      templates
        .map((template) => fit(template, activity, profile))
        .filter((candidate): candidate is Candidate => candidate !== null),
    )
    return match
      ? [
          {
            templateId: match.template.id,
            date: activity.date,
            compliance: activity.compliance,
            activityId: activity.id,
            variant: match.share >= FULL_SHARE ? 'full' : 'short',
            evidence: match.evidence,
          },
        ]
      : []
  })

/** A calendar pairing is the more direct evidence, so it wins for the same activity. */
export const mergeCompletions = (
  calendar: readonly Completion[],
  matched: readonly Completion[],
): readonly Completion[] => [
  ...calendar,
  ...matched.filter((entry) => !calendar.some((known) => known.activityId === entry.activityId)),
]
