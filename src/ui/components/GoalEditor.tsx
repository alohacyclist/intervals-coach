import { useId } from 'react'
import type { AthleteProfile, Sport } from '../../coach/types.ts'
import { SPORT_LABELS } from '../../coach/types.ts'
import { ftpOf } from '../../coach/thresholds.ts'
import { formatClock } from '../format-input.ts'
import type { GoalDraft, GoalErrors, GoalField } from '../goal-draft.ts'
import { distancePlaceholder, distanceUnit, predictedTime } from '../goal-draft.ts'
import { TimeField } from './TimeField.tsx'

type Props = {
  readonly draft: GoalDraft
  readonly onChange: (draft: GoalDraft) => void
  readonly errors: GoalErrors
  /** Before the first save, an empty field is not yet a mistake. */
  readonly showMissing: boolean
  readonly profile: AthleteProfile
  /** Label and priority, for the settings; onboarding keeps to the essentials. */
  readonly detailed?: boolean
  readonly onRemove?: () => void
}

const Message = ({ id, text }: { readonly id: string; readonly text: string | null }) =>
  text === null ? null : (
    <small id={id} className="error">
      {text}
    </small>
  )

export const GoalEditor = ({ draft, onChange, errors, showMissing, profile, detailed = false, onRemove }: Props) => {
  const baseId = useId()
  const set = (patch: Partial<GoalDraft>) => onChange({ ...draft, ...patch })
  const shown = (field: GoalField): string | null => {
    const message = errors[field] ?? null
    const empty = (field === 'targetDate' ? draft.targetDate : draft[field]).trim() === ''
    return message !== null && (showMissing || !empty) ? message : null
  }
  const invalid = (field: GoalField) => ({
    'aria-invalid': shown(field) !== null,
    'aria-describedby': shown(field) === null ? undefined : `${baseId}-${field}`,
  })
  const sports = profile.sports.map((setting) => setting.sport)
  const ftp = ftpOf(profile)
  const predicted = draft.kind === 'raceTime' ? predictedTime(draft, profile) : null

  return (
    <div className="grid grid--goal">
      {detailed && (
        <label>
          Bezeichnung
          <input
            type="text"
            placeholder="wird aus den Werten gebildet"
            value={draft.label}
            onChange={(event) => set({ label: event.target.value })}
          />
        </label>
      )}
      {draft.kind === 'ftp' ? (
        <label>
          FTP-Ziel (W){ftp !== null && ` · jetzt ${ftp} W`}
          <input
            type="text"
            inputMode="numeric"
            placeholder="z. B. 300"
            value={draft.target}
            onChange={(event) => set({ target: event.target.value })}
            {...invalid('target')}
          />
          <Message id={`${baseId}-target`} text={shown('target')} />
        </label>
      ) : (
        <>
          <label>
            Sportart
            <select value={draft.sport} onChange={(event) => set({ sport: event.target.value as Sport })}>
              {[...new Set([...sports, draft.sport])].map((sport) => (
                <option key={sport} value={sport}>
                  {SPORT_LABELS[sport]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Distanz ({distanceUnit(draft.sport)})
            <input
              type="text"
              inputMode="decimal"
              placeholder={`z. B. ${distancePlaceholder(draft.sport)}`}
              value={draft.distance}
              onChange={(event) => set({ distance: event.target.value })}
              {...invalid('distance')}
            />
            <Message id={`${baseId}-distance`} text={shown('distance')} />
          </label>
          <TimeField
            label={predicted === null ? 'aktuelle Zeit' : 'aktuelle Zeit (optional)'}
            placeholder={predicted === null ? '38:00 oder 1:45:00' : `geschätzt ${formatClock(predicted)}`}
            value={draft.current}
            onChange={(current) => set({ current })}
            error={shown('current')}
          />
          <TimeField
            label="Zielzeit"
            placeholder="36:00 oder 1:39:00"
            value={draft.target}
            onChange={(target) => set({ target })}
            error={shown('target')}
          />
        </>
      )}
      <label>
        bis wann (optional)
        <input
          type="date"
          value={draft.targetDate}
          onChange={(event) => set({ targetDate: event.target.value })}
          {...invalid('targetDate')}
        />
        <Message id={`${baseId}-targetDate`} text={shown('targetDate')} />
      </label>
      {detailed && (
        <label>
          Priorität
          <select value={draft.priority} onChange={(event) => set({ priority: event.target.value === 'B' ? 'B' : 'A' })}>
            <option value="A">A – Hauptziel</option>
            <option value="B">B – Nebenziel</option>
          </select>
        </label>
      )}
      {onRemove && (
        <button type="button" onClick={onRemove}>
          Ziel entfernen
        </button>
      )}
    </div>
  )
}
