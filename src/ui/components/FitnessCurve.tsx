import type { FitnessPoint } from '../../coach/types.ts'

/**
 * Fitness against fatigue over the whole history. The marks live in a stretched
 * SVG so the curve always fills the card, while every label stays HTML at its
 * own size — text inside a scaled viewBox would be unreadable on a phone and
 * oversized on a desktop.
 */

const STEPS = 4

type Props = {
  readonly points: readonly FitnessPoint[]
}

const niceCeiling = (value: number): number => Math.max(20, Math.ceil(value / 20) * 20)

export const FitnessCurve = ({ points }: Props) => {
  if (points.length < 2) return null

  const peak = Math.max(...points.map((point) => Math.max(point.ctl, point.atl)))
  const top = niceCeiling(peak)
  const last = points[points.length - 1]
  const best = points.reduce((high, point) => (point.ctl > high.ctl ? point : high), points[0]!)

  // 0..1000 across, 0..100 down: round numbers keep the generated path readable.
  const path = (pick: (point: FitnessPoint) => number): string =>
    points
      .map((point, index) => {
        const x = (index / (points.length - 1)) * 1000
        const y = 100 - (pick(point) / top) * 100
        return `${Math.round(x * 10) / 10},${Math.round(y * 10) / 10}`
      })
      .join(' ')

  const ticks = Array.from({ length: STEPS + 1 }, (_, index) => {
    const value = (top / STEPS) * index
    return { value: Math.round(value), offset: 100 - (value / top) * 100 }
  })

  const form = Math.round((last!.ctl - last!.atl) * 10) / 10

  return (
    <figure className="chart">
      <figcaption className="chart__head">
        <span className="chart__title">Fitness und Ermüdung</span>
        <span className="chart__span readout">{points.length} Tage</span>
      </figcaption>

      <div className="plot">
        {ticks.map((tick) => (
          <span key={tick.value} className="plot__tick readout" style={{ top: `${tick.offset}%` }}>
            {tick.value}
          </span>
        ))}
        <svg
          className="plot__svg"
          viewBox="0 0 1000 100"
          preserveAspectRatio="none"
          role="img"
          aria-label={
            `Fitness heute ${last!.ctl}, Höchstwert ${best.ctl} am ${best.date}. ` +
            `Ermüdung heute ${last!.atl}. Form ${form > 0 ? 'plus' : 'minus'} ${Math.abs(form)}.`
          }
        >
          {ticks.map((tick) => (
            <line
              key={tick.value}
              x1="0"
              y1={tick.offset}
              x2="1000"
              y2={tick.offset}
              stroke={tick.value === 0 ? 'var(--rule-loud)' : 'var(--rule-soft)'}
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <polyline
            points={path((point) => point.atl)}
            fill="none"
            stroke="var(--run)"
            strokeWidth="1.25"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          <polyline
            points={path((point) => point.ctl)}
            fill="none"
            stroke="var(--data)"
            strokeWidth="2"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>

      <div className="chart__axis readout">
        <span>{points[0]!.date.slice(8, 10)}.{points[0]!.date.slice(5, 7)}.</span>
        <span>heute</span>
      </div>

      <p className="chart__legend">
        <span>
          <i className="chart__key chart__key--ctl" /> Fitness {last!.ctl}
        </span>
        <span>
          <i className="chart__key chart__key--atl" /> Ermüdung {last!.atl}
        </span>
        <span>
          Form {form > 0 ? `+${form}` : form} · Bestwert {best.ctl}
        </span>
      </p>
    </figure>
  )
}
