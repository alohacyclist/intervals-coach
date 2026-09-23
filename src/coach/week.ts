import type { CoachConfig, Sport, Stimulus, StimulusRecency, TrainingState, WeekOutlook } from './types.ts'
import { diffDays, startOfWeek } from './dates.ts'
import { effectiveWeeklyMin } from './engine.ts'
import { LIBRARY } from './library.ts'
import { isRecoveryWeek, phaseForSport, primaryGoal, weeklyHardBudget } from './phase.ts'
import { selectedSports } from './thresholds.ts'

/**
 * Stimuli worth watching over a week. Endurance and recovery take care of
 * themselves — nobody needs reminding to ride easy — and neuro work is a garnish.
 */
const WATCHED: readonly Stimulus[] = ['VO2', 'THRESHOLD', 'SWEETSPOT', 'LONG']

/** Long enough that missing it is a gap, short enough to still fix inside a month. */
const STALE_DAYS = 14
/** No recency entry at all: the stimulus has not happened in the whole window. */
const NEVER = 99
const MOST_SHOWN = 3

const ageOf = (recency: readonly StimulusRecency[], sport: Sport, stimulus: Stimulus): number =>
  recency.find((entry) => entry.sport === sport && entry.stimulus === stimulus)?.daysAgo ?? NEVER

/** Only what this athlete's sports can actually deliver — no swimming sweetspot. */
const deliverable = (sport: Sport, stimulus: Stimulus): boolean =>
  LIBRARY.some(
    (template) =>
      template.sport === sport &&
      template.stimulus === stimulus &&
      template.benchmark !== true &&
      template.occasion === undefined,
  )

/**
 * The week as a shape rather than as days: how much of it is spoken for, what is
 * still missing, and how long is left to fit it in. Deliberately says nothing
 * about *when* — that is the part the athlete decides, and the part that would
 * otherwise be rewritten every time a session moves.
 */
export const weekOutlook = (state: TrainingState, config: CoachConfig): WeekOutlook => {
  const today = state.today
  const weekStart = startOfWeek(today)
  const sports = selectedSports(config.profile)
  const primarySport = primaryGoal(config.goals, today)?.sport ?? sports[0] ?? 'Ride'
  const phase = phaseForSport(config, primarySport, today)
  const elapsed = diffDays(weekStart, today)

  const openStimuli = sports
    .flatMap((sport) =>
      WATCHED.filter((stimulus) => deliverable(sport, stimulus)).map((stimulus) => ({
        sport,
        stimulus,
        daysAgo: ageOf(state.recency, sport, stimulus),
      })),
    )
    .filter((entry) => entry.daysAgo >= STALE_DAYS)
    .sort((left, right) => right.daysAgo - left.daysAgo)
    .slice(0, MOST_SHOWN)

  return {
    weekStart,
    daysLeft: 7 - elapsed,
    sessions: {
      done: state.sessionsThisWeek,
      planned: effectiveWeeklyMin(config, state),
      max: config.profile.weeklySessions.max,
    },
    quality: {
      done: state.hardSessionsThisWeek,
      budget: weeklyHardBudget(phase, config.profile),
    },
    phase,
    recoveryWeek: isRecoveryWeek(config.planStart, today),
    // Within this week, not within the last seven days: the week is the unit.
    longDone: sports.some((sport) => ageOf(state.recency, sport, 'LONG') <= elapsed),
    openStimuli,
  }
}
