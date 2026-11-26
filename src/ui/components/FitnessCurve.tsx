import type { FitnessCeiling, FitnessPoint } from '../../coach/types.ts'
import { locale, t } from '../../coach/lang.ts'

/**
 * Fitness against fatigue over the whole history. The marks live in a stretched
 * SVG so the curve always fills the card, while every label stays HTML at its
 * own size — text inside a scaled viewBox would be unreadable on a phone and
 * oversized on a desktop.
 */

const STEPS = 4

type Props = {
  readonly points: readonly FitnessPoint[]
  readonly ceiling?: FitnessCeiling | null
}

const decimal = (value: number): string => value.toLocaleString(locale(), { maximumFractionDigits: 1 })

/**
 * Says before the curve shows it that the same training will not bring more,
 * and what it takes instead: time for easy volume, not harder sessions.
 */
const CeilingNote = ({ ceiling }: { readonly ceiling: FitnessCeiling }) => {
  const level = Math.round(ceiling.level)
  const hours = decimal(ceiling.hoursPerWeek)
  const budget = decimal(ceiling.budgetHours)
  return (
    <div className="ceiling" role="note">
      <p className="ceiling__head">
        {ceiling.kind === 'falling' ? t('Fitness sinkt') : t('Fitness flacht ab')}
      </p>
      <p>
        {ceiling.kind === 'falling'
          ? t`Bei der Last der letzten vier Wochen (${hours} h pro Woche) sinkt deine Fitness Richtung ${level}.`
          : t`Bei der Last der letzten vier Wochen (${hours} h pro Woche) pendelt sich deine Fitness bei etwa ${level} ein — ohne mehr Training ist keine weitere Verbesserung zu erwarten.`}
        {ceiling.kind === 'flat' && ceiling.ahead > 0 &&
          t` Die nächsten vier Wochen bringen nur noch +${decimal(ceiling.ahead)}.`}
      </p>
      <p>
        {t`Etwa ${ceiling.moreMinutes} min lockeres Training mehr pro Woche heben das Niveau auf ${Math.round(ceiling.raised)} — mehr Umfang, nicht mehr Härte.`}{' '}
        {ceiling.budgetFull
          ? t`Dein Zeitbudget (bis ${budget} h pro Woche) reicht dafür nicht: In den Einstellungen mehr oder längere Einheiten freigeben.`
          : t`Dein Zeitbudget (bis ${budget} h pro Woche) lässt das zu: eine Einheit mehr, oder an freien Tagen mit dem Regler „Zeit“ verlängern.`}
      </p>
    </div>
  )
}

const niceCeiling = (value: number): number => Math.max(20, Math.ceil(value / 20) * 20)

export const FitnessCurve = ({ points, ceiling = null }: Props) => {
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

  // Form is yesterday's balance in fitness.ts ("matching the intervals.icu
  // convention"); today's would print a different number under the same label.
  const yesterday = points[points.length - 2] ?? last!
  const form = Math.round((yesterday.ctl - yesterday.atl) * 10) / 10

  return (
    <figure className="chart">
      <figcaption className="chart__head">
        <span className="chart__title">{t('Fitness und Ermüdung')}</span>
        <span className="chart__span readout">{points.length}{t(' Tage')}</span>
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
            t`Fitness heute ${last!.ctl}, Höchstwert ${best.ctl} am ${best.date}. ` +
            t`Ermüdung heute ${last!.atl}. Form ${form > 0 ? 'plus' : 'minus'} ${Math.abs(form)}.`
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
        <span>{t('heute')}</span>
      </div>

      <p className="chart__legend">
        <span>
          <i className="chart__key chart__key--ctl" />{t(' Fitness ')}{last!.ctl}
        </span>
        <span>
          <i className="chart__key chart__key--atl" />{t(' Ermüdung ')}{last!.atl}
        </span>
        <span>
          {t('Form ')}{form > 0 ? `+${form}` : form}{t(' · Bestwert ')}{best.ctl}
        </span>
      </p>

      {ceiling && <CeilingNote ceiling={ceiling} />}
    </figure>
  )
}
