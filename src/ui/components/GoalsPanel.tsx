import type { Feasibility, Goal } from '../../coach/types.ts'
import { formatSeconds } from '../../coach/dates.ts'

const VERDICT_LABEL: Record<Feasibility['verdict'], string> = {
  'on-track': 'realistisch',
  ambitious: 'ambitioniert',
  unrealistic: 'nicht realistisch',
}

/** Where the athlete stands now, not where they stood when the plan was set up. */
const goalValue = (goal: Goal, current: number): string =>
  goal.kind === 'ftp'
    ? `${current} W → ${goal.targetValue} W`
    : `${formatSeconds(current)} → ${formatSeconds(goal.targetValue)} auf ${goal.distanceKm ?? 10} km`

const remaining = (goal: Goal, weeksLeft: number | null): string => {
  if (goal.targetDate === undefined) return 'ohne Zieldatum'
  const weeks = Math.round(weeksLeft ?? 0)
  return `noch ${weeks} Woche${weeks === 1 ? '' : 'n'} · bis ${goal.targetDate.slice(8, 10)}.${goal.targetDate.slice(5, 7)}.${goal.targetDate.slice(0, 4)}`
}

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
