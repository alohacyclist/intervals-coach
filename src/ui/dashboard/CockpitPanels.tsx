import type { DashboardRide, DashboardSummary, SteadyAnalysis, SteadyStatus } from '../../coach/dashboard.ts'
import type { SteadyBlock, SteadyFinding } from '../../coach/steady-block.ts'
import { seriesPath, weekChart } from './geometry.ts'
import type { FindingItem, RideRow } from './model.ts'
import { COVERAGE_ORDER, coverageLabel, disclaimer, driftOf, num, pct, verdictSentence } from './model.ts'
import { t } from '../../coach/lang.ts'

const CHART_W = 360
const CHART_H = 64

/** Amber ticks above the weeks that hold a finding. */
const Marks = ({ centres, weeks }: { readonly centres: readonly number[]; readonly weeks: readonly boolean[] }) => (
  <>
    {weeks.map((hit, i) =>
      hit ? <polygon key={i} className="hud-mk" points={`${(centres[i] ?? 0) - 5},0 ${(centres[i] ?? 0) + 5},0 ${centres[i] ?? 0},8`} /> : null,
    )}
  </>
)

export const LoadPanel = ({ summary, warnedWeeks }: { readonly summary: DashboardSummary; readonly warnedWeeks: readonly boolean[] }) => {
  const weeks = summary.weeks
  const chart = weekChart(weeks, CHART_W, CHART_H - 6)
  const ef = seriesPath(weeks.map((w) => w.efficiencyFactor), chart.centres, CHART_H - 6)
  const now = weeks[weeks.length - 1]
  const lastEf = [...weeks].reverse().find((w) => w.efficiencyFactor !== null)?.efficiencyFactor ?? null
  return (
    <section className="hud-pn hud-b2 hud-wing-l hud-stack hud-gap-l">
      <div className="hud-lbl">{t('Belastung und Effizienz')}</div>
      <div className="hud-stack">
        <div className="hud-kv">
          <span className="hud-lbl">{now?.partial ? t('Load diese Woche · läuft') : t('Load diese Woche')}</span>
          <span className="hud-mono hud-num">{num(now?.load ?? 0)}</span>
        </div>
        <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} role="img" aria-label={t`Load je Woche über ${weeks.length} Wochen als Balken, Linie: Mittel der vier Wochen davor`}>
          <g transform="translate(0 6)">
            <g className="hud-grid"><line x1="0" y1={CHART_H - 6} x2={CHART_W} y2={CHART_H - 6} /></g>
            {chart.bars.map((b, i) => (
              <rect key={i} className={b.partial ? 'hud-bar hud-bar--partial' : 'hud-bar'} x={b.x} y={b.y} width={b.width} height={b.height} />
            ))}
            <path className="hud-tr hud-tr--pw hud-tr--thin" d={chart.chronicPath} />
          </g>
          <Marks centres={chart.centres} weeks={warnedWeeks} />
        </svg>
        <span className="hud-note">
          {t('Balken: jede Woche. Linie: Mittel der 4 Wochen davor, jetzt')}{' '}
          <span className="hud-mono hud-hi">{now?.loadChronic === null || !now ? '–' : num(now.loadChronic)}</span>
          {t('. Nebeneinander, nie als Verhältnis.')}
        </span>
      </div>
      <div className="hud-stack">
        <div className="hud-kv">
          <span className="hud-lbl">{t('Effizienzfaktor')}</span>
          <span className="hud-mono hud-num hud-num--hr">
            {lastEf === null ? '–' : num(lastEf, 2)}
            <small> W/bpm</small>
          </span>
        </div>
        <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} role="img" aria-label={t('Effizienzfaktor je Woche, nur gleichmäßige Fahrten')}>
          <g transform="translate(0 6)">
            <g className="hud-grid"><line x1="0" y1={CHART_H - 6} x2={CHART_W} y2={CHART_H - 6} /></g>
            <path className="hud-tr hud-tr--hr hud-tr--thin" d={ef.path} />
          </g>
          <Marks centres={chart.centres} weeks={warnedWeeks} />
        </svg>
        <span className="hud-note">{t('Normalisierte Leistung pro Herzschlag, nur gleichmäßige Fahrten. Höher ist besser. Ein Trend, kein Alarm.')}</span>
      </div>
      <div className="hud-stack">
        <div className="hud-kv">
          <span className="hud-lbl">{t('Arbeit diese Woche')}</span>
          <span className="hud-mono hud-num">
            {num(now?.workKj ?? 0)}
            <small> kJ</small>
          </span>
        </div>
        <span className="hud-note">
          {now ? `${now.rides === 1 ? t('1 Fahrt') : t`${now.rides} Fahrten`} · ${num(now.seconds / 3600, 1)} h · ${num(now.distanceM / 1000)} km` : ''}
        </span>
      </div>
    </section>
  )
}

const Meter = ({ label, value, share, tone }: { readonly label: string; readonly value: string; readonly share: number; readonly tone: 'ref' | 'warn' | 'calm' }) => (
  <div className="hud-stack hud-gap-s">
    <div className="hud-kv">
      <span className={tone === 'ref' ? 'hud-small hud-dim' : 'hud-small'}>{label}</span>
      <span className={`hud-mono hud-small hud-tone-${tone}`}>{value}</span>
    </div>
    <div className="hud-meter hud-meter--tall">
      <div className={`hud-fill-${tone}`} style={{ width: `${Math.min(100, share * 100).toFixed(1)}%` }} />
    </div>
  </div>
)

/** The rule as it is built: the two HR/W numbers it compares, side by side. */
const RuleMeters = ({ findings, block }: { readonly findings: readonly SteadyFinding[]; readonly block: SteadyBlock | null }) => {
  const pairs = findings.length > 0
    ? findings.map((f) => ({
        key: f.rule,
        refLabel: f.rule === 'hrDrift' ? t('Erste Blockhälfte') : t`Basis aus ${f.referenceRides} Fahrten`,
        obsLabel: f.rule === 'hrDrift' ? t('Zweite Blockhälfte') : t('Diese Fahrt, erste Hälfte'),
        ref: f.referenceHrPerW,
        obs: f.observedHrPerW,
        dev: f.deviation,
        warn: true,
      }))
    : block
      ? [{ key: 'drift', refLabel: t('Erste Blockhälfte'), obsLabel: t('Zweite Blockhälfte'), ref: block.firstHalfHrPerW, obs: block.secondHalfHrPerW, dev: driftOf(block), warn: false }]
      : []
  if (pairs.length === 0) return null
  const top = Math.max(...pairs.flatMap((p) => [p.ref, p.obs])) * 1.12
  return (
    <>
      <span className="hud-lbl">{t('Regel wie gebaut · Puls pro Watt, bpm/W')}</span>
      {pairs.map((p) => (
        <div key={p.key} className="hud-stack hud-gap-s">
          <Meter label={p.refLabel} value={num(p.ref, 3)} share={p.ref / top} tone="ref" />
          <Meter label={p.obsLabel} value={`${num(p.obs, 3)} · ${pct(p.dev)}`} share={p.obs / top} tone={p.warn ? 'warn' : 'calm'} />
        </div>
      ))}
    </>
  )
}

const ItemButton = ({ item, selected, onPick }: { readonly item: FindingItem; readonly selected: boolean; readonly onPick: () => void }) => (
  <button type="button" className={`hud-al hud-al--${item.tone}${selected ? ' is-on' : ''}`} aria-pressed={selected} onClick={onPick}>
    <span className="hud-kv">
      <span className={`hud-mono hud-code hud-tone-${item.tone === 'warn' ? 'warn' : 'ref'}`}>
        {item.tone === 'warn' ? (
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><polygon className="hud-mk" points="6,1 11,11 1,11" /></svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><rect x="1.5" y="1.5" width="9" height="9" className="hud-box" /></svg>
        )}
        {item.code}
      </span>
      <span className="hud-mono hud-small hud-dim">{item.date}</span>
    </span>
    <span className="hud-item-title">{item.title}</span>
    <span className="hud-mono hud-small">{item.line}</span>
  </button>
)

type FindingsProps = {
  readonly items: readonly FindingItem[]
  readonly selectedId: string | null
  readonly onPick: (rideId: string) => void
  readonly ride: DashboardRide | null
  readonly status: SteadyStatus | undefined
  readonly findings: readonly SteadyFinding[]
  readonly block: SteadyBlock | null
  readonly summary: DashboardSummary
  readonly glitch: boolean
}

export const FindingsPanel = ({ items, selectedId, onPick, ride, status, findings, block, summary, glitch }: FindingsProps) => (
  <section className="hud-pn hud-b4 hud-wing-r">
    <div className="hud-stack hud-gap hud-3d">
      <div className="hud-lbl">{t('Befunde · eins auswählen')}</div>
      {items.length === 0 && <p className="hud-note">{t('Noch keine Fahrt mit ruhigem Block gelesen.')}</p>}
      <div className="hud-al-list">
        {items.map((item) => (
          <ItemButton key={item.rideId} item={item} selected={item.rideId === selectedId} onPick={() => onPick(item.rideId)} />
        ))}
      </div>
      {ride && (
        <div className={`${glitch ? 'hud-glitch-a' : 'hud-glitch-b'} hud-stack hud-gap hud-detail`}>
          <RuleMeters findings={findings} block={block} />
          <div className="hud-tiles hud-z1">
            <div className="hud-tile"><span className="hud-lbl">NP W</span><span className="hud-mono hud-mid">{ride.normalizedWatts === null ? '–' : num(ride.normalizedWatts)}</span></div>
            <div className="hud-tile"><span className="hud-lbl">VI</span><span className="hud-mono hud-mid">{ride.variabilityIndex === null ? '–' : num(ride.variabilityIndex, 2)}</span></div>
            <div className="hud-tile"><span className="hud-lbl">EF</span><span className="hud-mono hud-mid">{ride.efficiencyFactor === null ? '–' : num(ride.efficiencyFactor, 2)}</span></div>
          </div>
          <p className="hud-sentence">{verdictSentence(status, findings, block, summary.thresholds)}</p>
          <span className="hud-note">{disclaimer()}</span>
        </div>
      )}
    </div>
  </section>
)

type CoverageProps = {
  readonly analysis: SteadyAnalysis
  readonly read: number
  readonly total: number
  readonly stravaStubs: number
  readonly baselineDays: number
  readonly blockError: string | null
  readonly onRetry: () => void
}

/** How much of the range the rules could judge, so silence never reads as health. */
export const CoveragePanel = ({ analysis, read, total, stravaStubs, baselineDays, blockError, onRetry }: CoverageProps) => {
  const counts = analysis.coverage
  const all = Math.max(1, COVERAGE_ORDER.reduce((sum, s) => sum + counts[s], 0))
  return (
    <section className="hud-pn hud-b5 hud-stack hud-gap" style={{ flex: '1 1 340px' }}>
      <div className="hud-lbl">{t('Regelabdeckung · was geprüft werden konnte')}</div>
      <div className="hud-split-bar" role="img" aria-label={COVERAGE_ORDER.map((s) => `${counts[s]} ${coverageLabel(s)}`).join(', ')}>
        {COVERAGE_ORDER.map((s) => (counts[s] > 0 ? <div key={s} className={`hud-cov hud-cov--${s}`} style={{ width: `${(counts[s] / all) * 100}%` }} /> : null))}
      </div>
      <ul className="hud-cov-list">
        {COVERAGE_ORDER.filter((s) => counts[s] > 0).map((s) => (
          <li key={s}>
            <span className={`hud-swatch hud-cov--${s}`} aria-hidden="true" />
            <span className="hud-mono">{counts[s]}</span> {coverageLabel(s)}
          </li>
        ))}
      </ul>
      <div className="hud-stack hud-gap-s">
        <div className="hud-kv">
          <span className="hud-lbl">{t('Messreihen gelesen')}</span>
          <span className="hud-mono">{read} / {total}</span>
        </div>
        <div className="hud-meter"><div className="hud-fill-calm" style={{ width: `${total === 0 ? 100 : (read / total) * 100}%` }} /></div>
        <span className="hud-note">{t`Dazu zählen Fahrten der ${baselineDays} Tage vor dem Zeitraum. Sie dienen nur als Basis.`}</span>
      </div>
      {stravaStubs > 0 && (
        <span className="hud-note">{t`${stravaStubs} Fahrten aus Strava gibt intervals.icu nicht weiter. Sie fehlen in allen Zahlen.`}</span>
      )}
      {blockError && (
        <p className="hud-note hud-tone-warn" role="alert">
          {blockError}{' '}
          <button type="button" className="hud-btn hud-btn--small" onClick={onRetry}>{t('Weiterlesen')}</button>
        </p>
      )}
    </section>
  )
}

export const RideTable = ({ rows, selectedId, onPick }: { readonly rows: readonly RideRow[]; readonly selectedId: string | null; readonly onPick: (id: string) => void }) => (
  <section className="hud-pn hud-b5 hud-stack hud-gap" style={{ flex: '2 1 600px' }}>
    <div className="hud-lbl">{t('Fahrten · Indoor und draußen werden nie miteinander verglichen')}</div>
    <div className="hud-scroll">
      <table className="hud-tbl">
        <thead>
          <tr><th>{t('Fahrt')}</th><th>{t('Wo')}</th><th>NP W</th><th>VI</th><th>EF</th><th>{t('Ruhiger Block')}</th><th>{t('Status')}</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.ride.id} className={r.ride.id === selectedId ? 'is-on' : undefined}>
              <td>
                <button type="button" className="hud-row-btn" onClick={() => onPick(r.ride.id)} aria-pressed={r.ride.id === selectedId}>
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
  </section>
)
