import { useMemo } from 'react'
import { DASHBOARD_WEEKS } from '../../coach/dashboard.ts'
import type { DashboardSummary, DashboardWeeks } from '../../coach/dashboard.ts'
import { t } from '../../coach/lang.ts'
import { GarminAttribution } from '../components/GarminAttribution.tsx'
import { weekChart } from './geometry.ts'
import { byRide, coverageLine, disclaimer, findingItems, num, rideRows, verdictSentence } from './model.ts'
import type { DashboardState } from './useDashboard.ts'

type Ready = DashboardState & {
  readonly summary: NonNullable<DashboardState['summary']>
  readonly analysis: NonNullable<DashboardState['analysis']>
}

const CHART_W = 320
const CHART_H = 90

const WeekLoad = ({ summary }: { readonly summary: DashboardSummary }) => {
  const chart = weekChart(summary.weeks, CHART_W, CHART_H)
  return (
    <svg className="dash-m__chart" viewBox={`0 0 ${CHART_W} ${CHART_H}`} role="img" aria-label={t`Load je Woche über ${summary.weeks.length} Wochen, Linie: Mittel der vier Wochen davor`}>
      {chart.bars.map((b, i) => (
        <rect key={i} className={b.partial ? 'dash-m__bar dash-m__bar--partial' : 'dash-m__bar'} x={b.x} y={b.y} width={b.width} height={b.height} />
      ))}
      <path className="dash-m__line" d={chart.chronicPath} />
    </svg>
  )
}

const ThisWeek = ({ summary }: { readonly summary: DashboardSummary }) => {
  const now = summary.weeks[summary.weeks.length - 1]
  const ef = [...summary.weeks].reverse().find((w) => w.efficiencyFactor !== null)?.efficiencyFactor ?? null
  return (
    <section className="dash-m__card">
      <h2>{now?.partial ? t('Diese Woche (läuft)') : t('Diese Woche')}</h2>
      <dl className="metrics">
        <div><dt>{t('Load')}</dt><dd>{num(now?.load ?? 0)}</dd></div>
        <div><dt>{t('Mittel 4 Wo')}</dt><dd>{now?.loadChronic == null ? '–' : num(now.loadChronic)}</dd></div>
        <div><dt>{t('Fahrten')}</dt><dd>{now?.rides ?? 0}</dd></div>
        <div><dt>{t('Stunden')}</dt><dd>{num((now?.seconds ?? 0) / 3600, 1)}</dd></div>
        <div><dt>{t('Effizienz')}</dt><dd>{ef === null ? '–' : num(ef, 2)}</dd></div>
        <div><dt>{t('Arbeit kJ')}</dt><dd>{num(now?.workKj ?? 0)}</dd></div>
      </dl>
      <WeekLoad summary={summary} />
      <p className="hint">{t('Balken: Load je Woche. Linie: Mittel der 4 Wochen davor.')}</p>
    </section>
  )
}

const Findings = ({ state }: { readonly state: Ready }) => {
  const { summary, analysis, readings } = state
  const items = useMemo(() => findingItems(summary, analysis), [summary, analysis])
  const grouped = useMemo(() => byRide(analysis.findings), [analysis])
  return (
    <section className="dash-m__card">
      <h2>{t('Befunde')}</h2>
      {state.read < state.total && (
        <p className="hint" role="status">
          <progress max={state.total} value={state.read} /> {t`Messreihen ${state.read} von ${state.total}`}
        </p>
      )}
      {items.length === 0 && <p className="hint">{t('Noch keine Fahrt mit ruhigem Block gelesen.')}</p>}
      <ul className="dash-m__findings">
        {items.map((item) => (
          <li key={item.rideId} className={`dash-m__finding dash-m__finding--${item.tone}`}>
            <details>
              <summary>
                <span className="readout">{item.code} · {item.date}</span>
                <strong>{item.title}</strong>
                <span className="readout">{item.line}</span>
              </summary>
              <p>
                {verdictSentence(analysis.status[item.rideId], grouped.get(item.rideId) ?? [], readings.get(item.rideId)?.block ?? null, summary.thresholds)}
              </p>
            </details>
          </li>
        ))}
      </ul>
      <p className="hint">{coverageLine(analysis.coverage)}</p>
      {state.blockError && (
        <p className="error" role="alert">
          {state.blockError} <button type="button" onClick={state.retry}>{t('Weiterlesen')}</button>
        </p>
      )}
      <p className="hint">{disclaimer()}</p>
    </section>
  )
}

const Rides = ({ state }: { readonly state: Ready }) => {
  const rows = useMemo(() => rideRows(state.summary, state.analysis, state.readings), [state.summary, state.analysis, state.readings])
  return (
    <section className="dash-m__card">
      <h2>{t('Fahrten')}</h2>
      <ul className="dash-m__rides">
        {rows.map((r) => (
          <li key={r.ride.id}>
            <span className="dash-m__ride-name">
              <span className="readout">{r.date}</span> {r.ride.name}
              {r.ride.garminDevice && <span className="hint attribution">{r.ride.garminDevice}</span>}
            </span>
            <span className="readout">{r.where} · NP {r.np}</span>
            <span className={`dash-m__status dash-m__status--${r.tone}`}>{r.status}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

export const MobileDashboard = ({ state, weeks, onWeeks }: {
  readonly state: Ready
  readonly weeks: DashboardWeeks
  readonly onWeeks: (weeks: DashboardWeeks) => void
}) => (
  <div className="dash-m">
    <div className="span-switch">
      <h1 className="span-switch__title">{t('Dashboard')}</h1>
      <div className="mode" role="group" aria-label={t('Zeitraum')} aria-busy={state.busy}>
        {DASHBOARD_WEEKS.map((option) => (
          <button key={option} type="button" aria-pressed={option === weeks} onClick={() => onWeeks(option)}>
            {t`${option} Wo`}
          </button>
        ))}
      </div>
    </div>
    <GarminAttribution attribution={state.summary.garmin} />
    <ThisWeek summary={state.summary} />
    <Findings state={state} />
    <Rides state={state} />
  </div>
)
