import type { Activity, CompletedSession, Sport, Stimulus } from './types.ts'
import type { Completion } from './progression.ts'
import { deliveredStimuli, isHardActivity } from './fitness.ts'
import { LIBRARY, findTemplate } from './library.ts'
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

/**
 * An activity named after a session of this app — by intervals.icu when it
 * paired the two, or by the watch that ran it — takes the name of the session
 * recognised in it: paired with the wrong one, it would show the easy run it
 * was not. A name the athlete gave stays.
 */
export const sessionName = (name: string, templateId: string | null): string => {
  const recognised = templateId === null ? undefined : findTemplate(templateId)
  if (!recognised || name.startsWith(recognised.name)) return name
  const ours = LIBRARY.some((template) => name === template.name || name.startsWith(`${template.name} (`))
  return ours ? recognised.name : name
}

export const completedFrom = (
  activities: readonly Activity[],
  completions: readonly Completion[],
): readonly CompletedSession[] =>
  trained(activities).map((activity) => {
    const completion = completions.find((entry) => entry.activityId === activity.id)
    // A recognised session carries the compliance that belongs to it, which a wrong pairing does not.
    const compliance = completion && !isZrlRace(activity) ? completion.compliance : activity.compliance
    const templateId = isZrlRace(activity) ? ZRL_TEMPLATE_ID : (completion?.templateId ?? null)
    return {
      activityId: activity.id,
      name: sessionName(activity.name, templateId),
      sport: activity.sport,
      load: Math.round(activity.load),
      minutes: Math.round(activity.movingTimeSec / 60),
      compliance: compliance === null ? null : Math.round(compliance),
      templateId,
    }
  })
