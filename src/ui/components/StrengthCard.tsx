import { useState } from 'react'
import type { StrengthPhase, StrengthSuggestion } from '../../coach/types.ts'
import { logStrength } from '../api.ts'

const PHASE_LABEL: Readonly<Record<StrengthPhase, string>> = {
  intro: 'Einstieg',
  full: 'Volles Programm',
  maintain: 'Erhalt',
}

type Props = {
  readonly strength: StrengthSuggestion
  readonly date: string
  readonly done: boolean
  readonly onLogged: () => void
}

/** Runs a save and says what went wrong, instead of letting the checkbox silently snap back. */
export const settle = async (save: () => Promise<unknown>, onSaved: () => void): Promise<string | null> => {
  try {
    await save()
    onSaved()
    return null
  } catch (caught) {
    return caught instanceof Error ? caught.message : 'Speichern fehlgeschlagen'
  }
}

export const StrengthCard = ({ strength, date, done, onLogged }: Props) => {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggle = async () => {
    setBusy(true)
    setError(null)
    setError(await settle(() => logStrength(date, !done), onLogged))
    setBusy(false)
  }

  return (
    <details className="disclose strength">
      <summary>
        <span className="badge badge--strength">Kraft</span>
        <strong>{strength.name}</strong>
        <span className="badge">{PHASE_LABEL[strength.phase]}</span>
        <span className="strength__meta">
          {strength.minutes} min · {strength.completed} absolviert
        </span>
      </summary>

      <table className="strength__table">
        <tbody>
          {strength.exercises.map((exercise) => (
            <tr key={exercise.name}>
              <td>{exercise.name}</td>
              <td>{exercise.sets}</td>
              <td>{exercise.load}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="strength__note">{strength.note}</p>

      <label className="strength__done">
        <input type="checkbox" checked={done} disabled={busy} onChange={() => void toggle()} />
        Erledigt — zählt für die Progression
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </details>
  )
}
