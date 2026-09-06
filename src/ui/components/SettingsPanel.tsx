import { useState } from 'react'
import type { CoachConfig, Equipment, Goal } from '../../coach/types.ts'
import { EQUIPMENT_LABELS } from '../../coach/types.ts'
import { formatSeconds } from '../../coach/dates.ts'
import { putConfig, syncSettings } from '../api.ts'
import { parseMmSs } from '../format-input.ts'
import { SportPicker } from './SportPicker.tsx'

type Props = {
  readonly config: CoachConfig
  readonly onSaved: (config: CoachConfig) => void
  readonly onClose: () => void
}

export const SettingsPanel = ({ config, onSaved, onClose }: Props) => {
  const [draft, setDraft] = useState<CoachConfig>(config)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const patchProfile = (patch: Partial<CoachConfig['profile']>) =>
    setDraft((current) => ({ ...current, profile: { ...current.profile, ...patch } }))

  const patchGoal = (id: string, patch: Partial<Goal>) =>
    setDraft((current) => ({
      ...current,
      goals: current.goals.map((goal) => (goal.id === id ? { ...goal, ...patch } : goal)),
    }))

  const run = async (action: () => Promise<CoachConfig>) => {
    setBusy(true)
    setError(null)
    try {
      onSaved(await action())
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Fehler')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="settings">
      <div className="settings__head">
        <h2>Einstellungen</h2>
        <button type="button" onClick={onClose}>
          Schließen
        </button>
      </div>

      <h3>Sportarten</h3>
      <SportPicker sports={draft.profile.sports} onChange={(sports) => patchProfile({ sports })} />

      <div className="grid">
        <label>
          Krafttraining mit
          <select
            value={draft.profile.equipment}
            onChange={(event) => patchProfile({ equipment: event.target.value as Equipment })}
          >
            {(Object.keys(EQUIPMENT_LABELS) as Equipment[]).map((option) => (
              <option key={option} value={option}>
                {EQUIPMENT_LABELS[option]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Gewicht (kg)
          <input
            type="number"
            value={draft.profile.weightKg}
            onChange={(event) => patchProfile({ weightKg: Number(event.target.value) })}
          />
        </label>
        <label>
          Einheiten / Woche (mindestens)
          <input
            type="number"
            min={1}
            max={14}
            value={draft.profile.weeklySessions.min}
            onChange={(event) =>
              patchProfile({
                weeklySessions: { ...draft.profile.weeklySessions, min: Number(event.target.value) },
              })
            }
          />
        </label>
        <label>
          Einheiten / Woche (höchstens)
          <input
            type="number"
            min={1}
            max={14}
            value={draft.profile.weeklySessions.max}
            onChange={(event) =>
              patchProfile({
                weeklySessions: { ...draft.profile.weeklySessions, max: Number(event.target.value) },
              })
            }
          />
        </label>
        <label>
          Max. Dauer (min)
          <input
            type="number"
            value={draft.profile.maxSessionMinutes}
            onChange={(event) => patchProfile({ maxSessionMinutes: Number(event.target.value) })}
          />
        </label>
        <label>
          Planstart
          <input
            type="date"
            value={draft.planStart}
            onChange={(event) => setDraft((current) => ({ ...current, planStart: event.target.value }))}
          />
        </label>
      </div>

      <h3>Ziele</h3>
      {draft.goals.map((goal) => (
        <div key={goal.id} className="grid grid--goal">
          <label>
            Bezeichnung
            <input
              type="text"
              value={goal.label}
              onChange={(event) => patchGoal(goal.id, { label: event.target.value })}
            />
          </label>
          <label>
            {goal.kind === 'ftp' ? 'Aktuell (W)' : 'Aktuell (mm:ss)'}
            <input
              type="text"
              defaultValue={goal.kind === 'ftp' ? String(goal.currentValue) : formatSeconds(goal.currentValue)}
              onBlur={(event) =>
                patchGoal(goal.id, {
                  currentValue: goal.kind === 'ftp' ? Number(event.target.value) : parseMmSs(event.target.value),
                })
              }
            />
          </label>
          <label>
            {goal.kind === 'ftp' ? 'Ziel (W)' : 'Ziel (mm:ss)'}
            <input
              type="text"
              defaultValue={goal.kind === 'ftp' ? String(goal.targetValue) : formatSeconds(goal.targetValue)}
              onBlur={(event) =>
                patchGoal(goal.id, {
                  targetValue: goal.kind === 'ftp' ? Number(event.target.value) : parseMmSs(event.target.value),
                })
              }
            />
          </label>
          <label>
            Zieldatum
            <input
              type="date"
              value={goal.targetDate ?? ''}
              onChange={(event) =>
                patchGoal(goal.id, { targetDate: event.target.value === '' ? undefined : event.target.value })
              }
            />
          </label>
        </div>
      ))}

      {error && <p className="error">{error}</p>}

      <div className="settings__actions">
        <button type="button" disabled={busy} onClick={() => run(() => putConfig(draft))}>
          Speichern
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => run(async () => (await syncSettings()).config)}
        >
          FTP & Pace von intervals.icu holen
        </button>
      </div>
    </section>
  )
}
