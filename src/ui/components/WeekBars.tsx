import type { WeekLoad } from '../../coach/types.ts'

/**
 * Volume per calendar week. Drawn as plain elements rather than as an SVG:
 * twelve bars need no projection, and native boxes keep their labels legible
 * at any width.
 */

type Props = {
  readonly weeks: readonly WeekLoad[]
}

const label = (week: WeekLoad): string => `${week.start.slice(8, 10)}.${week.start.slice(5, 7)}.`

export const WeekBars = ({ weeks }: Props) => {
  if (weeks.length === 0) return null

  const peak = Math.max(...weeks.map((week) => week.load), 1)
  const done = weeks.filter((week) => !week.partial)
  const average =
    done.length === 0
      ? 0
      : Math.round(done.reduce((sum, week) => sum + week.load, 0) / done.length)

  return (
    <figure className="chart">
      <figcaption className="chart__head">
        <span className="chart__title">Wochenlast</span>
        <span className="chart__span readout">Ø {average} TSS</span>
      </figcaption>

      <ol
        className="weeks"
        aria-label={`Wochenlast der letzten ${weeks.length} Wochen, Höchstwert ${peak} TSS, Durchschnitt ${average} TSS`}
      >
        {weeks.map((week) => (
          <li key={week.start} className="weeks__item">
            <span className="weeks__value readout">{week.load}</span>
            <span
              className={`weeks__bar ${week.load === peak ? 'weeks__bar--peak' : ''} ${
                week.partial ? 'weeks__bar--partial' : ''
              }`}
              style={{ height: `${Math.max(1, (week.load / peak) * 100)}%` }}
              title={`${label(week)} — ${week.load} TSS aus ${week.sessions} Einheiten${
                week.partial ? ' (Woche läuft noch)' : ''
              }`}
            />
            <span className="weeks__label readout">{label(week)}</span>
          </li>
        ))}
      </ol>

      <p className="chart__legend">
        <span>
          <i className="chart__key chart__key--ctl" /> höchste Woche {peak} TSS
        </span>
        <span>
          <i className="chart__key chart__key--partial" /> laufende Woche, noch nicht vorbei
        </span>
      </p>
    </figure>
  )
}
