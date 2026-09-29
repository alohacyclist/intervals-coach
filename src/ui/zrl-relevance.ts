import type { CoachConfig, DestinationState, TrainingState } from '../coach/types.ts'

/**
 * The league panel is for athletes who race on Zwift. Nobody is asked: a league
 * already set up, a league race ridden, or Zwift linked in intervals.icu says so,
 * and everyone else never sees the panel.
 */
export const zrlRelevant = (
  config: CoachConfig,
  state: TrainingState,
  destinations: readonly DestinationState[],
): boolean => {
  if (!config.profile.sports.some((setting) => setting.sport === 'Ride')) return false
  const zwiftLinked = destinations.some((entry) => entry.destination === 'zwift' && (entry.connected || entry.enabled))
  const zwiftChosen = Object.values(config.destinations).some((list) => list?.includes('zwift'))
  return (
    config.zrl.enabled ||
    config.zrlRaces.length > 0 ||
    state.raceHistory.length > 0 ||
    zwiftLinked ||
    zwiftChosen
  )
}
