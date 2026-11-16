import { useState } from 'react'
import type { Goal, GoalOption, SportStanding, StandingVerdict } from '../../coach/types.ts'
import { SPORT_LABELS } from '../../coach/types.ts'
import { addDays, diffDays, formatClock } from '../../coach/dates.ts'
import { formatDistance } from '../../coach/format.ts'
import { t } from '../../coach/lang.ts'
import { SportIcon } from './SportIcon.tsx'
import { GoalAdjust } from './GoalAdjust.tsx'

/**
 * What the athlete could do today if it counted, per sport: the number first,
 * then how it has moved and where the line through the last weeks meets the
 * goal. Estimates from training, said as such on the card.
 */

const dayMonth = (date: string): string => `${date.slice(8, 10)}.${date.slice(5, 7)}.`
const fullDate = (date: string): string => `${dayMonth(date)}${date.slice(0, 4)}`

const valueText = (standing: SportStanding, value: number): string =>
  standing.measure === 'ftp' ? `${Math.round(value)} W` : formatClock(value)

/** Watts up is better; seconds down is better, and both read as a signed change. */
const changeText = (standing: SportStanding): string | null => {
  if (standing.change === null) return null
  if (standing.measure === 'ftp') {
    const watts = Math.round(standing.change)
    return t`${watts > 0 ? '+' : watts < 0 ? '−' : '±'}${Math.abs(watts)} W in 4 Wochen`
  }
  // A plus on a race time means slower, which a sign alone does not say.
  const seconds = Math.round(standing.change)
  if (seconds === 0) return t('Gleich wie vor 4 Wochen')
  return seconds < 0
    ? t`${formatClock(-seconds)} schneller als vor 4 Wochen`
    : t`${formatClock(seconds)} langsamer als vor 4 Wochen`
}

const VERDICT_MARK: Readonly<Record<StandingVerdict, string>> = {
  reached: '✓',
  'on-track': '↗',
  late: '!',
  stalled: '→',
}

const verdictText = (standing: SportStanding): string | null => {
  switch (standing.verdict) {
    case 'reached':
      return t('Ziel erreicht')
    case 'on-track':
      return standing.reachBy ? t`Bei diesem Trend ungefähr am ${fullDate(standing.reachBy)}` : null
    case 'late':
      return standing.reachBy ? t`Bei diesem Trend erst ungefähr am ${fullDate(standing.reachBy)}` : null
    case 'stalled':
      return t('Der Trend der letzten acht Wochen zeigt nicht zum Ziel')
    default:
      return null
  }
}

const sourceText = (standing: SportStanding): string => {
  if (standing.source === 'eftp') return t('Geschätzte FTP (eFTP) von intervals.icu')
  if (standing.source === 'runs') return t('Aus Tempo und Puls deiner Läufe der letzten sechs Wochen')
  return standing.measure === 'ftp'
    ? t('Deine eingetragene FTP — für eine Schätzung fehlt die eFTP')
    : t('Aus deiner eingetragenen Schwellenpace — für eine Schätzung fehlen Läufe mit Puls')
}

type Point = { readonly date: string; readonly value: number }

/**
 * The series, and the line on from today to where the trend meets the goal —
 * cut at half the span ahead, so the weeks behind keep most of the width.
 */
const Trend = ({ standing }: { readonly standing: SportStanding }) => {
  const [hover, setHover] = useState<Point | null>(null)
  const { series, goal } = standing
  const first = series[0]
  const last = series.at(-1)
  if (!first || !last || series.length < 2) return null

  const today = last.date
  const behind = diffDays(first.date, today)
  // Only a trend that reaches the goal earns room ahead; otherwise there is nothing to draw there.
  const ahead =
    goal === null || standing.reachBy === null
      ? 0
      : Math.max(0, Math.min(Math.round(behind / 2), diffDays(today, standing.reachBy)))
  const end = addDays(today, ahead)
  const total = behind + ahead

  // The projection runs from today towards the goal, reaching it at `reachBy` — or cut where the chart ends.
  const projection: readonly Point[] =
    goal !== null && standing.reachBy !== null && ahead > 0
      ? [
          last,
          {
            date: end,
            value:
              last.value +
              (goal.value - last.value) * Math.min(1, ahead / Math.max(1, diffDays(today, standing.reachBy))),
          },
        ]
      : []

  const values = [...series, ...projection].map((point) => point.value).concat(goal ? [goal.value] : [])
  const low = Math.min(...values)
  const high = Math.max(...values)
  const pad = Math.max((high - low) * 0.12, standing.measure === 'ftp' ? 3 : 15)
  const [bottom, top] = [low - pad, high + pad]
  // Faster is better: a run's chart puts the shorter time higher, so up means better in both.
  const better = standing.measure === 'ftp' ? 1 : -1
  const yOf = (value: number) => {
    const share = (value - bottom) / (top - bottom)
    return Math.round((better === 1 ? 1 - share : share) * 1000) / 10
  }
  const xOf = (date: string) => Math.round((diffDays(first.date, date) / total) * 10000) / 10
  const line = (points: readonly Point[]) => points.map((point) => `${xOf(point.date)},${yOf(point.value)}`).join(' ')

  const pick = (fraction: number) => {
    const date = addDays(first.date, Math.round(fraction * total))
    const nearest = series.reduce((best, point) =>
      Math.abs(diffDays(point.date, date)) < Math.abs(diffDays(best.date, date)) ? point : best,
    )
    setHover(nearest)
  }

  return (
    <>
      <div
        className="plot standing__plot"
        onPointerMove={(event) => {
          const box = event.currentTarget.getBoundingClientRect()
          pick(Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)))
        }}
        onPointerLeave={() => setHover(null)}
      >
        {goal && (
          <span className="plot__tick readout standing__goal-tick" style={{ top: `${yOf(goal.value)}%` }}>
            {t('Ziel')}
          </span>
        )}
        <svg
          className="plot__svg"
          viewBox="0 0 1000 100"
          preserveAspectRatio="none"
          role="img"
          aria-label={t`${SPORT_LABELS[standing.sport]}: von ${valueText(standing, first.value)} am ${dayMonth(first.date)} auf ${valueText(standing, last.value)} heute.`}
        >
          {goal && (
            <line
              x1="0"
              y1={yOf(goal.value)}
              x2="1000"
              y2={yOf(goal.value)}
              stroke="var(--faint)"
              strokeWidth="1"
              strokeDasharray="6 5"
              vectorEffect="non-scaling-stroke"
            />
          )}
          {ahead > 0 && (
            <line
              x1={xOf(today)}
              y1="0"
              x2={xOf(today)}
              y2="100"
              stroke="var(--rule-soft)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          )}
          {projection.length > 0 && (
            <polyline
              points={line(projection)}
              fill="none"
              stroke="var(--data)"
              strokeWidth="2"
              strokeDasharray="2 5"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          )}
          <polyline
            points={line(series)}
            fill="none"
            stroke="var(--data)"
            strokeWidth="2"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          {hover && (
            <line
              x1={xOf(hover.date)}
              y1="0"
              x2={xOf(hover.date)}
              y2="100"
              stroke="var(--faint)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
        {/* Markers stay round however the plot is stretched, so they are HTML, not SVG. */}
        <i className="standing__dot" style={{ left: `${xOf(last.date) / 10}%`, top: `${yOf(last.value)}%` }} />
        {hover && (
          <>
            <i
              className="standing__dot standing__dot--hover"
              style={{ left: `${xOf(hover.date) / 10}%`, top: `${yOf(hover.value)}%` }}
            />
            <span
              className="standing__tip readout"
              style={{ left: `${Math.min(80, Math.max(0, xOf(hover.date) / 10 - 10))}%` }}
            >
              <span>{dayMonth(hover.date)}</span>
              <span>{valueText(standing, hover.value)}</span>
            </span>
          </>
        )}
      </div>
      <div className="chart__axis readout standing__axis">
        <span>{dayMonth(first.date)}</span>
        <span>{t('heute')}</span>
        {ahead > 0 && <span>{dayMonth(end)}</span>}
      </div>
    </>
  )
}

type PanelProps = {
  readonly standing: SportStanding
  /** The goal shown, with its ways out where it will not happen as set. */
  readonly goal: Goal | undefined
  readonly option: GoalOption | undefined
  readonly onAdjusted: () => void
}

const SportPanel = ({ standing, goal, option, onAdjusted }: PanelProps) => {
  const change = changeText(standing)
  const verdict = verdictText(standing)
  const measure =
    standing.measure === 'ftp' ? 'FTP' : formatDistance(standing.sport, standing.distanceKm ?? 10)
  return (
    <article className="standing__sport">
      <div className="standing__label">
        <SportIcon sport={standing.sport} />
        <span>{SPORT_LABELS[standing.sport]}</span>
        <span aria-hidden="true">·</span>
        <span>{measure}</span>
      </div>
      <p className="standing__value readout">
        {standing.source === 'setting' ? '' : '≈ '}
        {valueText(standing, standing.current)}
        {standing.goal && (
          <span className="standing__target">
            {t`Ziel ${valueText(standing, standing.goal.value)}`}
            {standing.goal.date ? t` bis ${fullDate(standing.goal.date)}` : ''}
          </span>
        )}
      </p>
      {change && <p className="standing__change readout">{change}</p>}
      <Trend standing={standing} />
      {verdict && standing.verdict && (
        <p className={`standing__verdict standing__verdict--${standing.verdict}`}>
          <span aria-hidden="true">{VERDICT_MARK[standing.verdict]}</span> {verdict}
        </p>
      )}
      {goal && option && <GoalAdjust goal={goal} option={option} onAdjusted={onAdjusted} />}
      <p className="standing__source">{sourceText(standing)}</p>
    </article>
  )
}

type Props = {
  readonly standing: readonly SportStanding[]
  readonly goals: readonly Goal[]
  readonly options: readonly GoalOption[]
  readonly onAdjusted: () => void
}

export const StandingCard = ({ standing, goals, options, onAdjusted }: Props) => {
  if (standing.length === 0) return null
  return (
    <section className="standing">
      <div className="totals__head">
        <h2>{t('Leistungsstand')}</h2>
        <span className="totals__span readout">{t('geschätzt, nicht getestet')}</span>
      </div>
      <div className="standing__grid">
        {standing.map((entry) => (
          <SportPanel
            key={entry.sport}
            standing={entry}
            goal={goals.find((goal) => goal.id === entry.goal?.id)}
            option={options.find((option) => option.goalId === entry.goal?.id)}
            onAdjusted={onAdjusted}
          />
        ))}
      </div>
      <p className="standing__note">
        {t('Ein Test oder ein Rennen misst genauer als jede Schätzung.')}
      </p>
    </section>
  )
}
