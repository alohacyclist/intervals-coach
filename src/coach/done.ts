import type { Activity, CompletedSession, Sport, Stimulus } from './types.ts'
import type { Completion } from './progression.ts'
import { deliveredStimuli, isHardActivity } from './fitness.ts'
import { ZRL_TEMPLATE_ID, isZrlRace } from './zrl.ts'

/** What a day cost, whether the plan proposed it or the athlete actually trained it. */
export type Effort = {
  readonly sport: Sport | 'Other'
  readonly load: number
  readonly hard: boolean
  readonly stimuli: readonly Stimulus[]
}

/** Watches auto-log walks and similar. They carry no load and are not training. */
const trained = (activities: readonly Activity[]): readonly Activity[] =>
  activities.filter((activity) => activity.load > 0)

export const effortsFrom = (activities: readonly Activity[]): readonly Effort[] =>
  trained(activities).map((activity) => ({
    sport: activity.sport,
    load: activity.load,
    hard: isHardActivity(activity),
    stimuli: activity.sport === 'Other' ? [] : deliveredStimuli(activity),
  }))

export const completedFrom = (
  activities: readonly Activity[],
  completions: readonly Completion[],
): readonly CompletedSession[] =>
  trained(activities).map((activity) => {
    const completion = completions.find((entry) => entry.activityId === activity.id)
    // A recognised session carries the compliance that belongs to it, which a wrong pairing does not.
    const compliance = completion && !isZrlRace(activity) ? completion.compliance : activity.compliance
    return {
      activityId: activity.id,
      name: activity.name,
      sport: activity.sport,
      load: Math.round(activity.load),
      minutes: Math.round(activity.movingTimeSec / 60),
      compliance: compliance === null ? null : Math.round(compliance),
      templateId: isZrlRace(activity) ? ZRL_TEMPLATE_ID : (completion?.templateId ?? null),
    }
  })
