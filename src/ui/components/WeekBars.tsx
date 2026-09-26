import type { WeekLoad } from '../../coach/types.ts'

/**
 * Volume per calendar week. Drawn as plain elements rather than as an SVG:
 * a bar per week needs no projection, and native boxes keep their labels legible
 * at any width.
 */

type Props = {
  readonly weeks: readonly WeekLoad[]
}

/**
 * Up to a year of weeks share one row, but only about twelve dates fit under it —
 * six on a phone. Every n-th week is labelled, counted back from the current one
 * so the latest always reads.
 */
const LABELS_WIDE = 12

/** A phone labels every second of the wide labels, so its set is always a subset. */
const quiet = (index: number, count: number): string => {
  const fromEnd = count - 1 - index
  const wide = Math.ceil(count / LABELS_WIDE)
  if (fromEnd % wide !== 0) return 'weeks__item--quiet'
  return fromEnd % (wide * 2) !== 0 ? 'weeks__item--quiet-narrow' : ''
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
        {weeks.map((week, index) => (
          <li key={week.start} className={`weeks__item ${quiet(index, weeks.length)}`}>
            <span className="weeks__value readout">{week.load}</span>
            {/* The bar needs a track of its own: sharing the column with the
                labels made its percentage height fight them for the space. */}
            <span className="weeks__track">
              <span
                className={`weeks__bar ${week.load === peak ? 'weeks__bar--peak' : ''} ${
                  week.partial ? 'weeks__bar--partial' : ''
                }`}
                style={{ height: `${Math.max(1, (week.load / peak) * 100)}%` }}
                title={`${label(week)} — ${week.load} TSS aus ${week.sessions} Einheiten${
                  week.partial ? ' (Woche läuft noch)' : ''
                }`}
              />
            </span>
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
