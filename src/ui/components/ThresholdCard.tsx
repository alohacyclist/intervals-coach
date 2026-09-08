import { useState } from 'react'
import type { ThresholdSuggestion } from '../../coach/types.ts'
import { SPORT_LABELS } from '../../coach/types.ts'
import { thresholdTestFor } from '../../coach/library.ts'
import { adoptThreshold, pushWorkout } from '../api.ts'

type Props = {
  readonly suggestions: readonly ThresholdSuggestion[]
  readonly date: string
  readonly onAdopted: () => void
}

export const ThresholdCard = ({ suggestions, date, onAdopted }: Props) => {
  const [busy, setBusy] = useState<string | null>(null)
  const [scheduled, setScheduled] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Telling an athlete to verify a value is empty without the session that does it.
  const schedule = async (suggestion: ThresholdSuggestion, templateId: string) => {
    setBusy(suggestion.sport)
    setError(null)
    try {
      await pushWorkout(date, templateId)
      setScheduled(suggestion.sport)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Einplanen fehlgeschlagen')
    } finally {
      setBusy(null)
    }
  }

  const adopt = async (suggestion: ThresholdSuggestion) => {
    setBusy(suggestion.sport)
    setError(null)
    try {
      await adoptThreshold(suggestion.sport, suggestion.observed)
      onAdopted()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Übernehmen fehlgeschlagen')
    } finally {
      setBusy(null)
    }
  }

  return (
    <aside className="issue">
      <h2>Deine Schwellenwerte stimmen nicht mehr</h2>
      <p>
        Sämtliche Watt- und Pace-Vorgaben werden aus diesen Werten berechnet — und intervals.icu
        rechnet Belastung und Übereinstimmung mit seinen eigenen. Übernehmen setzt beide Seiten auf
        denselben Wert.
      </p>
      {suggestions.map((suggestion) => {
        const test = suggestion.action === 'verify' ? thresholdTestFor(suggestion.sport) : undefined
        return (
          <div key={suggestion.sport} className="threshold">
            <p>
              <strong>{SPORT_LABELS[suggestion.sport]}:</strong> {suggestion.message}
            </p>
            {test && (
              <button
                type="button"
                disabled={busy !== null || scheduled === suggestion.sport}
                onClick={() => void schedule(suggestion, test.id)}
              >
                {scheduled === suggestion.sport
                  ? '✓ Im Kalender'
                  : `${test.name} einplanen`}
              </button>
            )}
            <button type="button" disabled={busy !== null} onClick={() => void adopt(suggestion)}>
              {busy === suggestion.sport
                ? 'Übernimmt…'
                : suggestion.action === 'adopt'
                  ? 'Übernehmen und synchronisieren'
                  : 'Trotzdem übernehmen'}
            </button>
          </div>
        )
      })}
      {error && <p className="error">{error}</p>}
    </aside>
  )
}
