import type { Feasibility, Goal } from '../../coach/types.ts'
import { formatSeconds } from '../../coach/dates.ts'

const VERDICT_LABEL: Record<Feasibility['verdict'], string> = {
  'on-track': 'realistisch',
  ambitious: 'ambitioniert',
  unrealistic: 'nicht realistisch',
}

const goalValue = (goal: Goal): string =>
  goal.kind === 'ftp'
    ? `${goal.currentValue} W → ${goal.targetValue} W`
    : `${formatSeconds(goal.currentValue)} → ${formatSeconds(goal.targetValue)} auf ${goal.distanceKm ?? 10} km`

type Props = {
  readonly goals: readonly Goal[]
  readonly feasibility: readonly Feasibility[]
}

export const GoalsPanel = ({ goals, feasibility }: Props) => (
  <section className="goals">
    <h2>Ziele</h2>
    {goals.map((goal) => {
      const assessment = feasibility.find((entry) => entry.goalId === goal.id)
      return (
        <article key={goal.id} className="goal">
          <div className="goal__head">
            <strong>{goal.label}</strong>
            {assessment && (
              <span className={`badge badge--${assessment.verdict}`}>{VERDICT_LABEL[assessment.verdict]}</span>
            )}
          </div>
          <p className="goal__value">
            {goalValue(goal)}
            {goal.targetDate ? ` · bis ${goal.targetDate}` : ' · ohne Zieldatum'}
          </p>
          {assessment && <p className="goal__message">{assessment.message}</p>}
        </article>
      )
    })}
  </section>
)
