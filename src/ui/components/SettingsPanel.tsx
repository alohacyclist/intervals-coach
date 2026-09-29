import { useState } from 'react'
import type { CoachConfig, Equipment, Goal } from '../../coach/types.ts'
import { EQUIPMENT_LABELS } from '../../coach/types.ts'
import { putConfig, syncSettings } from '../api.ts'
import { formatClock, parseTime, timeError } from '../format-input.ts'
import { ftpOf } from '../../coach/thresholds.ts'
import { SportPicker } from './SportPicker.tsx'
import { TimeField } from './TimeField.tsx'

const MINUTE_LABELS = {
  min: 'Min. — schaffe ich immer',
  normal: 'Min. — normalerweise',
  max: 'Min. — wenn viel Zeit ist',
} as const
import { DeleteAccount } from './DeleteAccount.tsx'
import { StravaPanel } from './StravaPanel.tsx'

type Props = {
  readonly config: CoachConfig
  readonly onSaved: (config: CoachConfig) => void
  readonly onClose: () => void
  /** Single user mode has no account to erase — the key lives in a secret. */
  readonly canDelete: boolean
}

export const SettingsPanel = ({ config, onSaved, onClose, canDelete }: Props) => {
  const [draft, setDraft] = useState<CoachConfig>(config)
  const ftp = ftpOf(draft.profile)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const patchProfile = (patch: Partial<CoachConfig['profile']>) =>
    setDraft((current) => ({ ...current, profile: { ...current.profile, ...patch } }))

  const [times, setTimes] = useState<Readonly<Record<string, string>>>(() =>
    Object.fromEntries(
      config.goals
        .filter((goal) => goal.kind === 'raceTime')
        .flatMap((goal) => [
          [`${goal.id}:currentValue`, formatClock(goal.currentValue)],
          [`${goal.id}:targetValue`, formatClock(goal.targetValue)],
        ]),
    ),
  )
  const timeErrors = Object.fromEntries(
    Object.entries(times).map(([key, value]) => [key, timeError(value, true)]),
  )
  const hasTimeErrors = Object.values(timeErrors).some((message) => message !== null)

  const setTime = (goal: Goal, field: 'currentValue' | 'targetValue', value: string) => {
    setTimes((current) => ({ ...current, [`${goal.id}:${field}`]: value }))
    const seconds = parseTime(value)
    if (seconds !== null) patchGoal(goal.id, { [field]: seconds })
  }

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
        {(['min', 'normal', 'max'] as const).map((tier) => (
          <label key={tier}>
            {MINUTE_LABELS[tier]}
            <input
              type="number"
              value={draft.profile.sessionMinutes[tier]}
              onChange={(event) =>
                patchProfile({
                  sessionMinutes: {
                    ...draft.profile.sessionMinutes,
                    [tier]: Number(event.target.value),
                  },
                })
              }
            />
          </label>
        ))}
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
          {goal.kind === 'ftp' && ftp !== null ? (
            // Follows the FTP above: a second place to type it would only drift apart.
            <label>
              Aktuell (W)
              <input type="text" value={String(ftp)} readOnly title="Folgt der FTP bei den Sportarten" />
            </label>
          ) : goal.kind === 'ftp' ? (
            <label>
              Aktuell (W)
              <input
                type="text"
                defaultValue={String(goal.currentValue)}
                onBlur={(event) => patchGoal(goal.id, { currentValue: Number(event.target.value) })}
              />
            </label>
          ) : (
            <TimeField
              label="Aktuell"
              value={times[`${goal.id}:currentValue`] ?? ''}
              onChange={(value) => setTime(goal, 'currentValue', value)}
              error={timeErrors[`${goal.id}:currentValue`] ?? null}
            />
          )}
          {goal.kind === 'ftp' ? (
            <label>
              Ziel (W)
              <input
                type="text"
                defaultValue={String(goal.targetValue)}
                onBlur={(event) => patchGoal(goal.id, { targetValue: Number(event.target.value) })}
              />
            </label>
          ) : (
            <TimeField
              label="Ziel"
              value={times[`${goal.id}:targetValue`] ?? ''}
              onChange={(value) => setTime(goal, 'targetValue', value)}
              error={timeErrors[`${goal.id}:targetValue`] ?? null}
            />
          )}
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
        <button type="button" disabled={busy || hasTimeErrors} onClick={() => run(() => putConfig(draft))}>
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

      <StravaPanel />

      {canDelete && <DeleteAccount />}
    </section>
  )
}
