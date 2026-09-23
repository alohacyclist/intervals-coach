import type { SeasonWeek } from '../../coach/types.ts'
import { PHASE_LABELS } from '../../coach/phase.ts'

/**
 * Where the season stands. Every week here follows from the plan start and the
 * goal date, so this is the one view that does not move when a session does —
 * which is exactly what makes it worth looking at in October.
 */

type Props = {
  readonly season: readonly SeasonWeek[]
}

const label = (week: SeasonWeek): string => `${week.start.slice(8, 10)}.${week.start.slice(5, 7)}.`

export const SeasonBand = ({ season }: Props) => {
  if (season.length === 0) return null

  const goal = season.find((week) => week.goalWeek)

  return (
    <figure className="chart">
      <figcaption className="chart__head">
        <span className="chart__title">Saison</span>
        <span className="chart__span readout">
          {goal ? `${season.length} Wochen bis zum Ziel` : `${season.length} Wochen voraus`}
        </span>
      </figcaption>

      <ol className="band" aria-label="Phasen der kommenden Wochen">
        {season.map((week) => (
          <li
            key={week.start}
            className={`band__week band__week--${week.recovery ? 'recovery' : week.phase.toLowerCase()} ${
              week.current ? 'band__week--current' : ''
            } ${week.goalWeek ? 'band__week--goal' : ''}`}
            title={`Woche ab ${label(week)} — ${
              week.recovery ? 'Erholungswoche' : PHASE_LABELS[week.phase]
            }${week.goalWeek ? ', Zielwoche' : ''}`}
          >
            <span className="band__label readout">{label(week)}</span>
          </li>
        ))}
      </ol>

      <p className="chart__legend">
        <span>
          <i className="chart__key chart__key--current" /> aktuelle Woche
        </span>
        <span>
          <i className="chart__key chart__key--recovery" /> Erholungswoche
        </span>
        {goal ? (
          <span>Zielwoche ab {label(goal)}</span>
        ) : (
          <span>
            {label(season[0]!)} bis {label(season[season.length - 1]!)}
          </span>
        )}
      </p>
    </figure>
  )
}
