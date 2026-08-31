import { useState } from 'react'
import type { CoachConfig, Goal } from '../../coach/types.ts'
import { formatSeconds } from '../../coach/dates.ts'
import { putConfig, syncSettings } from '../api.ts'

const parseMmSs = (value: string): number => {
  const [minutes = '0', seconds = '0'] = value.split(':')
  return Number(minutes) * 60 + Number(seconds)
}

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

      <div className="grid">
        <label>
          FTP (W)
          <input
            type="number"
            value={draft.profile.ftp}
            onChange={(event) => patchProfile({ ftp: Number(event.target.value) })}
          />
        </label>
        <label>
          Schwellenpace (min/km)
          <input
            type="text"
            defaultValue={formatSeconds(draft.profile.thresholdPaceSecPerKm)}
            onBlur={(event) => patchProfile({ thresholdPaceSecPerKm: parseMmSs(event.target.value) })}
          />
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
          Einheiten / Woche
          <input
            type="number"
            min={1}
            max={7}
            value={draft.profile.weeklySessions}
            onChange={(event) => patchProfile({ weeklySessions: Number(event.target.value) })}
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
