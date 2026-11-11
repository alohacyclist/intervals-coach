import type { Feasibility, Goal } from '../../coach/types.ts'
import { formatClock } from '../../coach/dates.ts'
import { formatDistance } from '../../coach/format.ts'
import { t } from '../../coach/lang.ts'

const VERDICT_LABEL: Record<Feasibility['verdict'], string> = {
  'on-track': 'realistisch',
  ambitious: 'ambitioniert',
  unrealistic: t('nicht realistisch'),
}

/** Where the athlete stands now, not where they stood when the plan was set up. */
const goalValue = (goal: Goal, current: number): string =>
  goal.kind === 'ftp'
    ? `${current} W → ${goal.targetValue} W`
    : `${formatClock(current)} → ${formatClock(goal.targetValue)}${goal.distanceKm === undefined ? '' : t` auf ${formatDistance(goal.sport, goal.distanceKm)}`}`

const remaining = (goal: Goal, weeksLeft: number | null): string => {
  if (goal.targetDate === undefined) return t('ohne Zieldatum')
  const weeks = Math.round(weeksLeft ?? 0)
  const until = `${goal.targetDate.slice(8, 10)}.${goal.targetDate.slice(5, 7)}.${goal.targetDate.slice(0, 4)}`
  return weeks === 1 ? t`noch 1 Woche · bis ${until}` : t`noch ${weeks} Wochen · bis ${until}`
}

type Props = {
  readonly goals: readonly Goal[]
  readonly feasibility: readonly Feasibility[]
}

export const GoalsPanel = ({ goals, feasibility }: Props) => (
  <section className="goals">
    <h2>{t('Ziele')}</h2>
    {goals.length === 0 && (
      <p className="goal__message">
        {t('Kein konkretes Ziel – fit bleiben. Der Plan wechselt Grundlage und Aufbau in Vier-Wochen-Blöcken; ein Ziel legst du in den Einstellungen an.')}
      </p>
    )}
    {goals.map((goal) => {
      const assessment = feasibility.find((entry) => entry.goalId === goal.id)
      return (
        <article key={goal.id} className="goal">
          <div className="goal__head">
            <strong>{goal.label}</strong>
            {assessment && (
              <span className={`badge badge--${assessment.verdict}`}>
                {VERDICT_LABEL[assessment.verdict]}
              </span>
            )}
          </div>
          <p className="goal__value">
            {goalValue(goal, assessment?.currentValue ?? goal.currentValue)} ·{' '}
            {remaining(goal, assessment?.weeksLeft ?? null)}
          </p>
          {assessment && <p className="goal__message">{assessment.message}</p>}
        </article>
      )
    })}
  </section>
)
