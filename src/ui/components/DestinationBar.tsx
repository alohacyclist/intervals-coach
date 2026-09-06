import { useState } from 'react'
import type { DestinationState } from '../../coach/types.ts'
import { setDestination } from '../api.ts'

type Props = {
  readonly destinations: readonly DestinationState[]
  readonly onChanged: () => void
}

/**
 * intervals.icu forwards planned workouts per athlete, not per session, so this
 * is a standing choice: whatever is on here receives every workout the plan pushes.
 */
export const DestinationBar = ({ destinations, onChanged }: Props) => {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const toggle = async (state: DestinationState) => {
    setBusy(state.destination)
    setError(null)
    try {
      await setDestination(state.destination, !state.enabled)
      onChanged()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Fehler')
    } finally {
      setBusy(null)
    }
  }

  const active = destinations.filter((entry) => entry.enabled)

  return (
    <section className="destinations">
      <div className="destinations__head">
        <h2>Übertragen an</h2>
        <span className="destinations__meta">
          {active.length === 0
            ? 'nirgendwohin — Einheiten bleiben im intervals.icu-Kalender'
            : active.map((entry) => entry.label).join(' · ')}
        </span>
      </div>

      <div className="destinations__row">
        {destinations.map((state) => (
          <button
            key={state.destination}
            type="button"
            disabled={busy !== null}
            className={state.enabled ? 'destinations__on' : ''}
            onClick={() => void toggle(state)}
          >
            {state.enabled ? '✓ ' : ''}
            {state.label}
          </button>
        ))}
      </div>

      <p className="destinations__note">
        Gilt für alle geplanten Einheiten, nicht nur für einzelne. Was hier an ist, bekommt jede
        Einheit, die du in den Kalender legst — auf Uhr, Radcomputer oder Rolle.
      </p>
      {error && <p className="error">{error}</p>}
    </section>
  )
}
