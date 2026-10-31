import { useState } from 'react'
import type { CoachConfig, DestinationState, Sport, WorkoutDestination } from '../../coach/types.ts'
import { SPORT_LABELS } from '../../coach/types.ts'
import { putConfig } from '../api.ts'

type Props = {
  readonly config: CoachConfig
  readonly destinations: readonly DestinationState[]
  readonly onSaved: (config: CoachConfig) => void
}

/**
 * intervals.icu forwards per athlete, not per workout. The app keeps the choice
 * per sport instead and sets the switches to match right before it sends — so a
 * run goes to the watch and a ride to trainer and head unit.
 */
export const DestinationBar = ({ config, destinations, onSaved }: Props) => {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sports = config.profile.sports.map((setting) => setting.sport)
  const offered = destinations.filter(
    (state) =>
      state.connected ||
      sports.some((sport) => (config.destinations[sport] ?? []).includes(state.destination)),
  )

  // Nothing chosen yet for a sport means "as intervals.icu is set", which is what it starts from.
  const chosenFor = (sport: Sport): readonly WorkoutDestination[] =>
    config.destinations[sport] ??
    destinations.filter((state) => state.enabled).map((state) => state.destination)

  const toggle = async (sport: Sport, destination: WorkoutDestination) => {
    const current = chosenFor(sport)
    const next = current.includes(destination)
      ? current.filter((entry) => entry !== destination)
      : [...current, destination]
    setBusy(true)
    setError(null)
    try {
      onSaved(
        await putConfig({
          ...config,
          destinations: { ...config.destinations, [sport]: next },
        }),
      )
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Fehler')
    } finally {
      setBusy(false)
    }
  }

  const names = (sport: Sport): string => {
    const chosen = chosenFor(sport)
    const labels = offered.filter((state) => chosen.includes(state.destination)).map((state) => state.label)
    return labels.length > 0 ? labels.join(', ') : 'nur Kalender'
  }

  // Sports going to the same place share a line: "Rad, Laufen → Wahoo".
  const routes = [...new Set(sports.map(names))].map((target) => ({
    target,
    sports: sports.filter((sport) => names(sport) === target).map((sport) => SPORT_LABELS[sport]),
  }))

  // Nothing connected leaves nothing to switch: everything goes to the calendar anyway.
  if (offered.length === 0) return null

  return (
    <details className="disclose destinations">
      <summary aria-label="Übertragen an, pro Sportart">
        <span className="destinations__summary">
          {routes.map((route) => (
            <span key={route.target}>
              {route.sports.join(', ')} → {route.target}
            </span>
          ))}
        </span>
      </summary>

      {sports.map((sport) => {
        const chosen = chosenFor(sport)
        return (
          <div key={sport} className="destinations__sport">
            <span className={`badge badge--${sport.toLowerCase()}`}>{SPORT_LABELS[sport]}</span>
            <div className="destinations__row">
              {offered.map((state) => (
                <button
                  key={state.destination}
                  type="button"
                  disabled={busy}
                  className={chosen.includes(state.destination) ? 'destinations__on' : ''}
                  aria-pressed={chosen.includes(state.destination)}
                  onClick={() => void toggle(sport, state.destination)}
                >
                  {chosen.includes(state.destination) && <span aria-hidden="true">✓ </span>}
                  {state.label}
                </button>
              ))}
            </div>
          </div>
        )
      })}
      {error && <p className="error" role="alert">{error}</p>}
    </details>
  )
}
