import type { ReactNode } from 'react'
import type { DashboardWeek } from '../../coach/dashboard.ts'
import { t } from '../../coach/lang.ts'
import type { WeekBar } from './geometry.ts'
import { dayMonth } from './model.ts'

export type PlotTone = 'power' | 'pulse' | 'ratio' | 'plain'

type Props = {
  readonly label: string
  readonly tone: PlotTone
  /** Axis values, top to bottom. */
  readonly ticks: readonly string[]
  readonly viewBox: string
  readonly size?: 'trace' | 'week' | 'mini'
  readonly children: ReactNode
  /** Cursor and dot, laid over the drawing in its own box. */
  readonly overlay?: ReactNode
  /** Beside the caption, e.g. which way is better. */
  readonly aside?: ReactNode
}

/** One chart: a caption, the axis values to its left and a drawing that stretches with the box. */
export const Plot = ({ label, tone, ticks, viewBox, size = 'trace', children, overlay, aside }: Props) => (
  <div className="hud-chart">
    <span className={`hud-cap hud-key hud-key--${tone}`}>
      {label}
      {aside}
    </span>
    <div className="hud-chart__row">
      <div className="hud-yax hud-mono" aria-hidden="true">
        {ticks.map((tick, i) => (
          <span key={i}>{tick}</span>
        ))}
      </div>
      <div className={`hud-plot hud-plot--${size}`}>
        <svg viewBox={viewBox} preserveAspectRatio="none" role="img" aria-label={label}>
          {children}
        </svg>
        {overlay}
      </div>
    </div>
  </div>
)

export type Direction = 'up' | 'down'

/** Which way a number moves when the athlete gets fitter; only for the few numbers that have such a way. */
export const Better = ({ way }: { readonly way: Direction }) => (
  <span className="hud-better">
    <span aria-hidden="true">{way === 'up' ? '↑' : '↓'}</span>
    <span className="sr-only">{way === 'up' ? t('höher ist') : t('niedriger ist')}</span> {t('besser')}
  </span>
)

type FactProps = {
  readonly label: string
  readonly value: string
  readonly big?: boolean
  readonly better?: Direction
  /** One plain sentence on what the number tells. */
  readonly hint?: string
}

export const Fact = ({ label, value, big, better, hint }: FactProps) => (
  <div className="hud-fact">
    <span className="hud-cap">
      {label}
      {better && <Better way={better} />}
    </span>
    <span className={`hud-mono ${big ? 'hud-big' : 'hud-mid'}`}>{value}</span>
    {hint && <span className="hud-fact__hint">{hint}</span>}
  </div>
)

export const WEEK_W = 1000
export const WEEK_H = 200
export const WEEK_BOX = `0 0 ${WEEK_W} ${WEEK_H}`
/** Room above the highest value, so the top axis value sits beside its grid line. */
export const WEEK_PAD = 8

/** A warn-coloured bar over every week that holds a finding. */
export const WeekMarks = ({ bars, weeks, height = 5 }: { readonly bars: readonly WeekBar[]; readonly weeks: readonly boolean[]; readonly height?: number }) => (
  <>
    {bars.map((bar, i) => (weeks[i] ? <rect key={i} className="hud-mk" x={bar.x} y="0" width={bar.width} height={height} /> : null))}
  </>
)

/** Week starts under a week chart; with many weeks only every few get a date. */
export const WeekAxis = ({ weeks }: { readonly weeks: readonly DashboardWeek[] }) => {
  const every = Math.ceil(weeks.length / 9)
  return (
    <div className="hud-chart__row" aria-hidden="true">
      <span className="hud-yax" />
      <div className="hud-weeks hud-mono" style={{ gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` }}>
        {weeks.map((w, i) => (
          <span key={w.weekStart}>{i % every === 0 ? dayMonth(w.weekStart) : ''}</span>
        ))}
      </div>
    </div>
  )
}

export const MarkLegend = ({ shown }: { readonly shown: boolean }) =>
  shown ? (
    <span><i className="hud-sw hud-sw--warn" aria-hidden="true" />{t('Woche mit Warnung')}</span>
  ) : null
