import type { DashboardSummary, DashboardWeek } from '../../coach/dashboard.ts'
import { efficiencyAt, efficiencyTrend, lastEfficiency } from '../../coach/dashboard-trend.ts'
import { diffDays } from '../../coach/dates.ts'
import { t } from '../../coach/lang.ts'
import type { SteadyThresholds } from '../../coach/steady-block.ts'
import { seriesPath, weekChart } from './geometry.ts'
import type { DriftPoint } from './model.ts'
import { driftPointLabel, num, pct, trendSentence, where } from './model.ts'
import { Better, Fact, MarkLegend, Plot, WEEK_BOX, WEEK_H, WEEK_PAD, WEEK_W, WeekAxis, WeekMarks } from './Plot.tsx'

const PLACES = [false, true] as const

/** Both lines on one scale: a gap between indoor and outdoor must read as a gap. */
export const efficiencyLines = (weeks: readonly DashboardWeek[], centres: readonly number[], height: number, pad: number) => {
  const known = weeks.flatMap((w) => PLACES.flatMap((indoor) => efficiencyAt(w, indoor) ?? []))
  const range = known.length === 0 ? undefined : { min: Math.min(...known), max: Math.max(...known) }
  const [outdoor, indoor] = PLACES.map((place) => seriesPath(weeks.map((w) => efficiencyAt(w, place)), centres, height, pad, range))
  return { outdoor, indoor, min: range?.min ?? 0, max: range?.max ?? 0, known: known.length }
}

type WeekProps = { readonly summary: DashboardSummary; readonly warnedWeeks: readonly boolean[] }

export const EfficiencyFocus = ({ summary, warnedWeeks }: WeekProps) => {
  const weeks = summary.weeks
  const chart = weekChart(weeks, WEEK_W, WEEK_H, WEEK_PAD)
  const lines = efficiencyLines(weeks, chart.centres, WEEK_H, WEEK_PAD)
  const withValue = weeks.filter((w) => w.efficiency.indoor !== null || w.efficiency.outdoor !== null).length
  return (
    <div className="hud-stack hud-gap-l">
      <div className="hud-facts">
        {PLACES.map((indoor) => {
          const last = lastEfficiency(weeks, indoor)
          return (
            <Fact
              key={String(indoor)}
              big
              label={t`EF ${where(indoor)}, W/bpm`}
              value={last === null ? '–' : num(last, 2)}
              better="up"
              hint={trendSentence(efficiencyTrend(summary.rides, weeks, indoor))}
            />
          )
        })}
        <Fact big label={t('Wochen mit Wert')} value={`${withValue} / ${weeks.length}`} hint={t('Nur Wochen mit mindestens einer gleichmäßigen Fahrt.')} />
      </div>
      <div className="hud-stack">
        <Plot
          label={t('Effizienzfaktor je Woche')}
          tone="pulse"
          ticks={lines.known === 0 ? [] : lines.max === lines.min ? [num(lines.max, 2)] : [num(lines.max, 2), num((lines.max + lines.min) / 2, 2), num(lines.min, 2)]}
          viewBox={WEEK_BOX}
          size="week"
        >
          <g className="hud-grid">
            <line x1="0" y1={WEEK_PAD} x2={WEEK_W} y2={WEEK_PAD} />
            <line x1="0" y1={WEEK_H / 2} x2={WEEK_W} y2={WEEK_H / 2} />
            <line x1="0" y1={WEEK_H - WEEK_PAD} x2={WEEK_W} y2={WEEK_H - WEEK_PAD} />
          </g>
          <path className="hud-tr hud-tr--pulse" d={lines.outdoor?.path} />
          <path className="hud-tr hud-tr--pulse hud-tr--alt" d={lines.indoor?.path} />
          <WeekMarks bars={chart.bars} weeks={warnedWeeks} />
        </Plot>
        <WeekAxis weeks={weeks} />
      </div>
      <div className="hud-legend hud-cap">
        <span><i className="hud-sw hud-sw--pulse" aria-hidden="true" />{t`EF ${where(false)}`}</span>
        <span><i className="hud-sw hud-sw--alt" aria-hidden="true" />{t`EF ${where(true)}`}</span>
        <MarkLegend shown={warnedWeeks.some(Boolean)} />
      </div>
      <p className="hud-note">
        {t('Normalisierte Leistung pro Herzschlag, nur gleichmäßige Fahrten. Steigt er über Wochen, wird deine Ausdauer besser. Ein Trend, kein Alarm.')}{' '}
        {t('Indoor und draußen getrennt: Drinnen fehlt der Fahrtwind, der Puls liegt meist höher.')}{' '}
        {t('Die Achse beginnt nicht bei null: Sie zeigt nur den Bereich im Zeitraum, kleine Ausschläge wirken deshalb groß.')}
      </p>
    </div>
  )
}

type DriftProps = {
  readonly points: readonly DriftPoint[]
  readonly weeks: readonly DashboardWeek[]
  readonly thresholds: SteadyThresholds
  readonly onPick: (rideId: string) => void
}

/** One dot per steady block over the weeks: is the heart rate holding longer than it used to? */
export const DriftPlot = ({ points, weeks, thresholds, onPick }: DriftProps) => {
  const since = weeks[0]?.weekStart ?? ''
  const days = Math.max(1, weeks.length * 7)
  const drifts = points.map((p) => p.drift)
  const low = Math.min(0, ...drifts)
  const high = Math.max(thresholds.hrDriftHigh * 1.2, ...drifts)
  const y = (v: number) => WEEK_PAD + ((high - v) / (high - low)) * (WEEK_H - 2 * WEEK_PAD)
  const pctOf = (v: number) => `${num(v * 100)} %`
  return (
    <div className="hud-stack">
      <Plot
        label={t('Puls-Drift je ruhigem Block')}
        aside={<Better way="down" />}
        tone="plain"
        ticks={[pctOf(high), pctOf((high + low) / 2), pctOf(low)]}
        viewBox={WEEK_BOX}
        size="week"
        overlay={points.map((p) => (
          <button
            key={p.rideId}
            type="button"
            className={`hud-pt${p.indoor ? ' hud-pt--in' : ''}${p.warned ? ' is-warn' : ''}`}
            style={{
              left: `${(((diffDays(since, p.date) + 0.5) / days) * 100).toFixed(2)}%`,
              top: `${((y(p.drift) / WEEK_H) * 100).toFixed(1)}%`,
            }}
            aria-label={driftPointLabel(p)}
            title={driftPointLabel(p)}
            onClick={() => onPick(p.rideId)}
          />
        ))}
      >
        <g className="hud-grid">
          <line x1="0" y1={WEEK_PAD} x2={WEEK_W} y2={WEEK_PAD} />
          <line x1="0" y1={WEEK_H / 2} x2={WEEK_W} y2={WEEK_H / 2} />
          <line x1="0" y1={WEEK_H - WEEK_PAD} x2={WEEK_W} y2={WEEK_H - WEEK_PAD} />
        </g>
        <line className="hud-ref" x1="0" y1={y(thresholds.hrDrift)} x2={WEEK_W} y2={y(thresholds.hrDrift)} />
      </Plot>
      <WeekAxis weeks={weeks} />
      <div className="hud-legend hud-cap">
        <span><i className="hud-sw hud-sw--pt" aria-hidden="true" />{where(false)}</span>
        <span><i className="hud-sw hud-sw--pt hud-sw--pt-in" aria-hidden="true" />{where(true)}</span>
        <span><i className="hud-sw hud-sw--pt is-warn" aria-hidden="true" />{t('Warnung')}</span>
        <span><i className="hud-sw hud-sw--ref" aria-hidden="true" />{t`Warnlinie ${pct(thresholds.hrDrift)}`}</span>
      </div>
      <p className="hud-note">
        {t('Vergleiche nur Blöcke mit ähnlicher Dauer und Leistung. Beides zeigt der Punkt unter dem Mauszeiger, ein Klick öffnet die Fahrt.')}{' '}
        {t('Weniger Drift bei gleicher Dauer und Leistung, oder gleiche Drift länger oder härter: Deine Ausdauer wird besser.')}
      </p>
    </div>
  )
}
