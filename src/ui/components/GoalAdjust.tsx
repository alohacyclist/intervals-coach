import { useState } from 'react'
import type { Goal, GoalOption } from '../../coach/types.ts'
import { formatClock } from '../../coach/dates.ts'
import { locale, t } from '../../coach/lang.ts'
import { adjustGoal } from '../api.ts'

const fullDate = (date: string): string => `${date.slice(8, 10)}.${date.slice(5, 7)}.${date.slice(0, 4)}`

const valueText = (goal: Goal, value: number): string =>
  goal.kind === 'ftp' ? `${Math.round(value)} W` : formatClock(value)

/** The pace the options assume, in the goal's own unit. */
const paceText = (goal: Goal, option: GoalOption): string =>
  goal.kind === 'ftp'
    ? t`+${option.perWeek.toLocaleString(locale(), { maximumFractionDigits: 1 })} W pro Woche`
    : t`${Math.round(option.perWeek)} s schneller pro Woche`

type Props = {
  readonly goal: Goal
  readonly option: GoalOption
  readonly onAdjusted: () => void
}

/**
 * Two ways out for a goal that will not happen as set: a target the date allows,
 * or a date the target needs. One tap takes it; the plan follows from the next load.
 */
export const GoalAdjust = ({ goal, option, onAdjusted }: Props) => {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const take = async (change: { readonly targetValue?: number; readonly targetDate?: string }) => {
    setBusy(true)
    setError(null)
    try {
      await adjustGoal(goal.id, change)
      onAdjusted()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('Ziel nicht gespeichert'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="goal-adjust">
      <p className="goal-adjust__basis">
        {option.basis === 'trend'
          ? t`Realistisch mit deinem Trend (${paceText(goal, option)}):`
          : t`Dein Trend zeigt gerade nicht nach oben. Mit typischem Fortschritt (${paceText(goal, option)}):`}
      </p>
      <div className="goal-adjust__choices">
        {option.value && goal.targetDate && (
          <button type="button" disabled={busy} onClick={() => void take({ targetValue: option.value!.targetValue })}>
            <strong>{t`${valueText(goal, option.value.targetValue)} bis ${fullDate(goal.targetDate)}`}</strong>
            <span>{t('Ziel anpassen, Datum bleibt')}</span>
          </button>
        )}
        {option.date && (
          <button type="button" disabled={busy} onClick={() => void take({ targetDate: option.date!.targetDate })}>
            <strong>{t`${valueText(goal, goal.targetValue)} bis ${fullDate(option.date.targetDate)}`}</strong>
            <span>{goal.targetDate ? t('Ziel bleibt, Datum verschieben') : t('als Zieldatum setzen')}</span>
          </button>
        )}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
