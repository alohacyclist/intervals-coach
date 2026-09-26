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

  return (
    <section className="destinations">
      <div className="destinations__head">
        <h2>Übertragen an</h2>
        <span className="destinations__meta">pro Sportart</span>
      </div>

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
                  onClick={() => void toggle(sport, state.destination)}
                >
                  {chosen.includes(state.destination) ? '✓ ' : ''}
                  {state.label}
                </button>
              ))}
              {chosen.length === 0 && (
                <span className="destinations__meta">nur der intervals.icu-Kalender</span>
              )}
            </div>
          </div>
        )
      })}

      <details className="disclose destinations__note">
        <summary>Wie das funktioniert</summary>
        intervals.icu leitet je Konto weiter, nicht je Einheit. Die App stellt die Schalter deshalb
        kurz vor jedem Senden auf die Sportart um.
      </details>
      {error && <p className="error">{error}</p>}
    </section>
  )
}
