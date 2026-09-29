import { useState } from 'react'
import type { CoachConfig, Equipment, Goal, GoalKind } from '../../coach/types.ts'
import { EQUIPMENT_LABELS } from '../../coach/types.ts'
import { putConfig, syncSettings } from '../api.ts'
import { ftpOf } from '../../coach/thresholds.ts'
import { localIsoDate } from '../../coach/dates.ts'
import { SportPicker } from './SportPicker.tsx'
import { GoalEditor } from './GoalEditor.tsx'
import type { ThresholdSources } from '../threshold-input.ts'
import type { GoalDraft } from '../goal-draft.ts'
import { draftFromGoal, emptyGoalDraft, goalErrors, goalFromDraft, hasErrors } from '../goal-draft.ts'

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
  const [sources, setSources] = useState<ThresholdSources>({})
  const [thresholdsValid, setThresholdsValid] = useState(true)

  const patchProfile = (patch: Partial<CoachConfig['profile']>) =>
    setDraft((current) => ({ ...current, profile: { ...current.profile, ...patch } }))

  const [goals, setGoals] = useState<readonly GoalDraft[]>(() => config.goals.map(draftFromGoal))
  const [attempted, setAttempted] = useState(false)
  const today = localIsoDate()
  // A stored goal whose date has passed may stay as it is; a newly set date may not lie behind us.
  const earliest = (goal: GoalDraft): string | null =>
    config.goals.some((stored) => stored.id === goal.id && (stored.targetDate ?? '') === goal.targetDate)
      ? null
      : today
  const errors = goals.map((goal) => goalErrors(goal, draft.profile, earliest(goal)))

  const setGoal = (next: GoalDraft) =>
    setGoals((current) => current.map((goal) => (goal.id === next.id ? next : goal)))
  const removeGoal = (id: string) => setGoals((current) => current.filter((goal) => goal.id !== id))
  const addGoal = (kind: GoalKind) =>
    setGoals((current) => [
      ...current,
      emptyGoalDraft(`goal-${Date.now().toString(36)}`, kind, draft.profile.sports[0]?.sport ?? 'Run'),
    ])

  const save = () => {
    setAttempted(true)
    const built = goals.map((goal) => goalFromDraft(goal, draft.profile, earliest(goal)))
    if (!thresholdsValid || errors.some(hasErrors) || built.some((goal) => goal === null)) {
      setError('Bitte die markierten Felder prüfen.')
      return
    }
    void run(() => putConfig({ ...draft, goals: built.filter((goal): goal is Goal => goal !== null) }))
  }

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
      <SportPicker
        sports={draft.profile.sports}
        sources={sources}
        onChange={(sports, next) => {
          patchProfile({ sports })
          setSources(next)
        }}
        onValidity={setThresholdsValid}
      />

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
      {goals.length === 0 && <p className="hint">Kein konkretes Ziel – fit bleiben.</p>}
      {goals.map((goal, index) => (
        <GoalEditor
          key={goal.id}
          draft={goal}
          onChange={setGoal}
          errors={errors[index] ?? {}}
          showMissing={attempted}
          profile={draft.profile}
          detailed
          onRemove={() => removeGoal(goal.id)}
        />
      ))}
      <div className="settings__actions">
        <button type="button" onClick={() => addGoal('raceTime')}>
          Wettkampfziel hinzufügen
        </button>
        {ftp !== null && (
          <button type="button" onClick={() => addGoal('ftp')}>
            FTP-Ziel hinzufügen
          </button>
        )}
      </div>

      {error && <p className="error">{error}</p>}

      <div className="settings__actions">
        <button type="button" disabled={busy} onClick={save}>
          Speichern
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => run(async () => (await syncSettings()).config)}
        >
          Schwellen von intervals.icu holen
        </button>
      </div>

      <StravaPanel />

      {canDelete && <DeleteAccount />}
    </section>
  )
}
