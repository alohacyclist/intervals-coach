import type { DashboardSummary, SteadyAnalysis } from '../../coach/dashboard.ts'
import type { SteadyThresholds } from '../../coach/steady-block.ts'
import { t } from '../../coach/lang.ts'
import { DriftPlot } from './CockpitProgress.tsx'
import { weekChart } from './geometry.ts'
import type { DriftPoint, FindingItem, RideRow } from './model.ts'
import { COVERAGE_ORDER, coverageLabel, disclaimer, num, RULE_NAMES } from './model.ts'
import { Better, Fact, MarkLegend, Plot, WEEK_BOX, WEEK_H, WEEK_PAD, WEEK_W, WeekAxis, WeekMarks } from './Plot.tsx'

type WeekProps = { readonly summary: DashboardSummary; readonly warnedWeeks: readonly boolean[] }

export const LoadFocus = ({ summary, warnedWeeks }: WeekProps) => {
  const weeks = summary.weeks
  const chart = weekChart(weeks, WEEK_W, WEEK_H, WEEK_PAD)
  const now = weeks[weeks.length - 1]
  return (
    <div className="hud-stack hud-gap-l">
      <div className="hud-facts">
        <Fact
          big
          label={now?.partial ? t('Load diese Woche · läuft') : t('Load diese Woche')}
          value={num(now?.load ?? 0)}
          hint={t('Dauer mal Härte aller Fahrten. Mehr ist nicht besser, nur mehr Belastung.')}
        />
        <Fact
          big
          label={t('Mittel der 4 Wochen davor')}
          value={now?.loadChronic == null ? '–' : num(now.loadChronic)}
          hint={t('Die Messlatte. Langsam darüber heißt aufbauen, weit darüber ist ein großer Sprung, darunter Erholung.')}
        />
        <Fact big label={t('Arbeit diese Woche, kJ')} value={num(now?.workKj ?? 0)} hint={t('Etwa die verbrannten kcal. Zeigt Umfang, nicht Form.')} />
        <Fact
          big
          label={t('Fahrten · Stunden · km')}
          value={now ? `${now.rides} · ${num(now.seconds / 3600, 1)} · ${num(now.distanceM / 1000)}` : '–'}
          hint={t('Umfang. Stunden sagen mehr als km, die hängen an Wind und Strecke.')}
        />
      </div>
      <div className="hud-stack">
        <Plot label={t('Load je Woche')} tone="plain" ticks={[num(chart.max), num(chart.max / 2), '0']} viewBox={WEEK_BOX} size="week">
          <g className="hud-grid">
            <line x1="0" y1={WEEK_PAD} x2={WEEK_W} y2={WEEK_PAD} />
            <line x1="0" y1={(WEEK_H + WEEK_PAD) / 2} x2={WEEK_W} y2={(WEEK_H + WEEK_PAD) / 2} />
            <line x1="0" y1={WEEK_H} x2={WEEK_W} y2={WEEK_H} />
          </g>
          {chart.bars.map((b, i) => (
            <rect key={i} className={b.partial ? 'hud-bar hud-bar--partial' : 'hud-bar'} x={b.x} y={b.y} width={b.width} height={b.height} />
          ))}
          <path className="hud-tr hud-tr--power" d={chart.chronicPath} />
          <WeekMarks bars={chart.bars} weeks={warnedWeeks} />
        </Plot>
        <WeekAxis weeks={weeks} />
      </div>
      <div className="hud-legend hud-cap">
        <span><i className="hud-sw hud-sw--bar" aria-hidden="true" />{t('Load der Woche')}</span>
        <span><i className="hud-sw hud-sw--line" aria-hidden="true" />{t('Mittel der 4 Wochen davor')}</span>
        <MarkLegend shown={warnedWeeks.some(Boolean)} />
      </div>
      <p className="hud-note">{t('Woche und Mittel stehen nebeneinander, nie als Verhältnis.')}</p>
    </div>
  )
}

type CoverageProps = {
  readonly analysis: SteadyAnalysis
  readonly read: number
  readonly total: number
  readonly stravaStubs: number
  readonly baselineDays: number
}

/** The split bar of what the rules could judge; the tile and the focus view share it. */
export const CoverageBar = ({ analysis }: { readonly analysis: SteadyAnalysis }) => {
  const counts = analysis.coverage
  const all = Math.max(1, COVERAGE_ORDER.reduce((sum, s) => sum + counts[s], 0))
  return (
    <span className="hud-split-bar" role="img" aria-label={COVERAGE_ORDER.map((s) => `${counts[s]} ${coverageLabel(s)}`).join(', ')}>
      {COVERAGE_ORDER.map((s) => (counts[s] > 0 ? <span key={s} className={`hud-cov hud-cov--${s}`} style={{ width: `${(counts[s] / all) * 100}%` }} /> : null))}
    </span>
  )
}

/** How much of the range the rules could judge, so silence never reads as health. */
export const CoverageFocus = ({ analysis, read, total, stravaStubs, baselineDays }: CoverageProps) => {
  const counts = analysis.coverage
  return (
    <div className="hud-stack hud-gap-l">
      <div className="hud-facts">
        {COVERAGE_ORDER.filter((s) => counts[s] > 0).map((s) => (
          <div key={s} className="hud-fact">
            <span className="hud-cap"><i className={`hud-sw hud-cov--${s}`} aria-hidden="true" />{coverageLabel(s)}</span>
            <span className="hud-mono hud-big">{counts[s]}</span>
          </div>
        ))}
      </div>
      <CoverageBar analysis={analysis} />
      <div className="hud-stack">
        <div className="hud-kv">
          <span>{t('Messreihen gelesen')}</span>
          <span className="hud-mono">{read} / {total}</span>
        </div>
        <div className="hud-meter"><div className="hud-fill-calm" style={{ width: `${total === 0 ? 100 : (read / total) * 100}%` }} /></div>
        <span className="hud-note">{t`Dazu zählen Fahrten der ${baselineDays} Tage vor dem Zeitraum. Sie dienen nur als Basis.`}</span>
      </div>
      <div className="hud-kv">
        <span>{t('Regeln aktiv')}</span>
        <span className="hud-mono">{RULE_NAMES.hrDrift} · {RULE_NAMES.elevatedHr}</span>
      </div>
      <p className="hud-note">{t('Ohne ruhigen Block gibt es kein Urteil: Bei wechselnder Last schwankt der Puls pro Watt mit der Last, nicht mit dem Körper.')}</p>
      {stravaStubs > 0 && (
        <p className="hud-note">{t`${stravaStubs} Fahrten aus Strava gibt intervals.icu nicht weiter. Sie fehlen in allen Zahlen.`}</p>
      )}
    </div>
  )
}

const ItemButton = ({ item, selected, onPick }: { readonly item: FindingItem; readonly selected: boolean; readonly onPick: () => void }) => (
  <button type="button" className={`hud-al hud-al--${item.tone}${selected ? ' is-on' : ''}`} onClick={onPick}>
    <span className="hud-kv">
      <span className={`hud-mono hud-cap hud-tone-${item.tone === 'warn' ? 'warn' : 'ref'}`}>{item.code}</span>
      <span className="hud-mono hud-cap">{item.date}</span>
    </span>
    <span className="hud-item-title">{item.title}</span>
    <span className="hud-mono">{item.line}</span>
  </button>
)

type FindingsProps = {
  readonly items: readonly FindingItem[]
  readonly points: readonly DriftPoint[]
  readonly summary: DashboardSummary
  readonly thresholds: SteadyThresholds
  readonly selectedId: string | null
  readonly onPick: (rideId: string) => void
}

export const FindingsFocus = ({ items, points, summary, thresholds, selectedId, onPick }: FindingsProps) => (
  <div className="hud-stack hud-gap-l">
    {items.length === 0 && <p className="hud-note">{t('Noch keine Fahrt mit ruhigem Block gelesen.')}</p>}
    {points.length > 0 && <DriftPlot points={points} weeks={summary.weeks} thresholds={thresholds} onPick={onPick} />}
    <div className="hud-al-list">
      {items.map((item) => (
        <ItemButton key={item.rideId} item={item} selected={item.rideId === selectedId} onPick={() => onPick(item.rideId)} />
      ))}
    </div>
    <p className="hud-note">{t('Ein Klick öffnet den Fahrtverlauf mit Urteil und Zahlen.')} {disclaimer()}</p>
  </div>
)

type RidesProps = { readonly rows: readonly RideRow[]; readonly selectedId: string | null; readonly onPick: (id: string) => void }

export const RidesFocus = ({ rows, selectedId, onPick }: RidesProps) => (
  <div className="hud-stack hud-gap">
    <div className="hud-scroll">
      <table className="hud-tbl">
        <thead>
          <tr><th>{t('Fahrt')}</th><th>{t('Wo')}</th><th>NP W</th><th>VI</th><th>EF <Better way="up" /></th><th>{t('Ruhiger Block')}</th><th>{t('Status')}</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.ride.id} className={r.ride.id === selectedId ? 'is-on' : undefined}>
              <td>
                <button type="button" className="hud-row-btn" onClick={() => onPick(r.ride.id)}>
                  {r.date} <span className="hud-dim">{r.ride.name}</span>
                </button>
              </td>
              <td>{r.where}</td>
              <td>{r.np}</td>
              <td>{r.vi}</td>
              <td>{r.ef}</td>
              <td>{r.steady}</td>
              <td className={`hud-tone-${r.tone === 'warn' ? 'warn' : r.tone === 'calm' ? 'calm' : 'ref'}`}>{r.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    <p className="hud-note">{t('Ein Klick auf eine Fahrt öffnet ihren Verlauf. Indoor und draußen werden nie miteinander verglichen.')}</p>
  </div>
)
