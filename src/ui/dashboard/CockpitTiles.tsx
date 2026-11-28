import { useMemo } from 'react'
import type { ReactNode } from 'react'
import type { DashboardRide, DashboardSummary, RideTrace, SteadyAnalysis, SteadyStatus } from '../../coach/dashboard.ts'
import { t } from '../../coach/lang.ts'
import { efficiencyTrend, lastEfficiency } from '../../coach/dashboard-trend.ts'
import { CoverageBar } from './CockpitPanels.tsx'
import { efficiencyLines } from './CockpitProgress.tsx'
import { blockMinutes, TRACE_HEIGHT, TRACE_WIDTH, traceGeometry, weekChart } from './geometry.ts'
import type { FindingItem, RideRow, TileKey } from './model.ts'
import { coverageLine, num, pct, shortDate, statusLabel, tileTitle, toneOf, warningsLabel, where } from './model.ts'
import { Better, WeekMarks } from './Plot.tsx'

const MINI_W = 360
const MINI_H = 56
const MINI_BOX = `0 0 ${MINI_W} ${MINI_H}`
const SHOWN_FINDINGS = 3
const SHOWN_RIDES = 5

export type OpenTile = (tile: TileKey, origin: DOMRect) => void

/** A tile is one button: the whole face opens its focus view. */
const Tile = ({ tile, onOpen, children }: { readonly tile: TileKey; readonly onOpen: OpenTile; readonly children: ReactNode }) => (
  <button
    type="button"
    className={`hud-tile hud-tile--${tile}`}
    aria-haspopup="dialog"
    onClick={(event) => onOpen(tile, event.currentTarget.getBoundingClientRect())}
  >
    <span className="hud-tile__head">
      <span className="hud-lbl">{tileTitle(tile)}</span>
      <svg className="hud-tile__open" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
        <path d="M7 1h4v4M11 1 6.5 5.5M5 11H1V7M1 11l4.5-4.5" />
      </svg>
    </span>
    {children}
  </button>
)

const FindingsTile = ({ items, warned, onOpen }: { readonly items: readonly FindingItem[]; readonly warned: number; readonly onOpen: OpenTile }) => (
  <Tile tile="findings" onOpen={onOpen}>
    <span className={`hud-mono hud-big hud-tone-${warned > 0 ? 'warn' : 'calm'}`}>{warningsLabel(warned)}</span>
    {items.length === 0 && <span className="hud-cap">{t('Noch keine Fahrt mit ruhigem Block gelesen.')}</span>}
    <span className="hud-tile__rows hud-tile__rows--findings">
      {items.slice(0, SHOWN_FINDINGS).map((item) => (
        <span key={item.rideId} className="hud-tile__row">
          <span className={`hud-mark hud-mark--${item.tone}`} aria-hidden="true" />
          <span className="hud-mono hud-dim">{item.date}</span>
          <span className="hud-ell">{item.title}</span>
          <span className="hud-mono hud-ell hud-dim">{item.line}</span>
        </span>
      ))}
    </span>
    {items.length > SHOWN_FINDINGS && <span className="hud-cap">{t`${items.length - SHOWN_FINDINGS} weitere`}</span>}
  </Tile>
)

const MiniTrace = ({ trace }: { readonly trace: RideTrace | null }) => {
  const geometry = useMemo(() => (trace && trace.minutes.length > 1 ? traceGeometry(trace) : null), [trace])
  if (!trace || !geometry) return <span className="hud-mini" />
  const b = trace.block ? blockMinutes(trace.block) : null
  return (
    <svg className="hud-mini" viewBox={`0 0 ${TRACE_WIDTH} ${TRACE_HEIGHT}`} preserveAspectRatio="none" aria-hidden="true">
      {b && <rect className="hud-band" x={geometry.x(b.start)} y="0" width={geometry.x(b.end) - geometry.x(b.start)} height={TRACE_HEIGHT} />}
      <path className="hud-tr hud-tr--thin hud-tr--power" d={geometry.powerPath} />
      <path className="hud-tr hud-tr--thin hud-tr--pulse" d={geometry.hrPath} />
    </svg>
  )
}

type RideTileProps = {
  readonly ride: DashboardRide | null
  readonly trace: RideTrace | null
  readonly status: SteadyStatus | undefined
  readonly warned: boolean
  readonly onOpen: OpenTile
}

const RideTile = ({ ride, trace, status, warned, onOpen }: RideTileProps) => (
  <Tile tile="ride" onOpen={onOpen}>
    <span className="hud-title hud-ell">{ride?.name ?? t('Keine Fahrt gewählt')}</span>
    {ride && (
      <span className="hud-cap">
        {shortDate(ride.date)} · {where(ride.indoor)} · <span className={`hud-tone-${toneOf(status, warned) === 'muted' ? 'ref' : toneOf(status, warned)}`}>{statusLabel(status, warned)}</span>
      </span>
    )}
    <MiniTrace trace={trace} />
    {ride?.garminDevice && <span className="hud-cap">{ride.garminDevice}</span>}
  </Tile>
)

type WeekTileProps = { readonly summary: DashboardSummary; readonly warnedWeeks: readonly boolean[]; readonly onOpen: OpenTile }

const LoadTile = ({ summary, warnedWeeks, onOpen }: WeekTileProps) => {
  const chart = weekChart(summary.weeks, MINI_W, MINI_H, 8)
  const now = summary.weeks[summary.weeks.length - 1]
  return (
    <Tile tile="load" onOpen={onOpen}>
      <span className="hud-mono hud-big">{num(now?.load ?? 0)}</span>
      <span className="hud-cap">{now?.partial ? t('Load diese Woche · läuft') : t('Load diese Woche')}</span>
      <svg className="hud-mini" viewBox={MINI_BOX} preserveAspectRatio="none" aria-hidden="true">
        {chart.bars.map((b, i) => (
          <rect key={i} className={b.partial ? 'hud-bar hud-bar--partial' : 'hud-bar'} x={b.x} y={b.y} width={b.width} height={b.height} />
        ))}
        <path className="hud-tr hud-tr--thin hud-tr--power" d={chart.chronicPath} />
        <WeekMarks bars={chart.bars} weeks={warnedWeeks} height={3} />
      </svg>
    </Tile>
  )
}

/** One line per place: the newest weekly value and the four-week trend beside it. */
const EfficiencyRow = ({ summary, indoor }: { readonly summary: DashboardSummary; readonly indoor: boolean }) => {
  const last = lastEfficiency(summary.weeks, indoor)
  const change = efficiencyTrend(summary.rides, summary.weeks, indoor).change
  return (
    <span className="hud-tile__ef">
      <span className="hud-dim">{where(indoor)}</span>
      <span className="hud-mono hud-mid hud-tone-calm">{last === null ? '–' : num(last, 2)}</span>
      <span className="hud-mono">{change === null ? t('kein Trend') : pct(change)}</span>
    </span>
  )
}

const EfficiencyTile = ({ summary, warnedWeeks, onOpen }: WeekTileProps) => {
  const chart = weekChart(summary.weeks, MINI_W, MINI_H, 8)
  const lines = efficiencyLines(summary.weeks, chart.centres, MINI_H, 8)
  return (
    <Tile tile="efficiency" onOpen={onOpen}>
      <EfficiencyRow summary={summary} indoor={false} />
      <EfficiencyRow summary={summary} indoor />
      <span className="hud-cap">
        {lines.known === 0 ? t('Noch keine gleichmäßige Fahrt') : t('EF in W/bpm · 4 Wochen zu den 4 davor')}
        <Better way="up" />
      </span>
      <svg className="hud-mini" viewBox={MINI_BOX} preserveAspectRatio="none" aria-hidden="true">
        <path className="hud-tr hud-tr--thin hud-tr--pulse" d={lines.outdoor?.path} />
        <path className="hud-tr hud-tr--thin hud-tr--pulse hud-tr--alt" d={lines.indoor?.path} />
        <WeekMarks bars={chart.bars} weeks={warnedWeeks} height={3} />
      </svg>
    </Tile>
  )
}

type CoverageTileProps = { readonly analysis: SteadyAnalysis; readonly read: number; readonly total: number; readonly onOpen: OpenTile }

const CoverageTile = ({ analysis, read, total, onOpen }: CoverageTileProps) => {
  const counts = analysis.coverage
  const all = Object.values(counts).reduce((sum, n) => sum + n, 0)
  return (
    <Tile tile="coverage" onOpen={onOpen}>
      <span className="hud-mono hud-big">
        {counts.checked}
        <small> / {all}</small>
      </span>
      <span className="hud-cap">{read < total ? t`Lese Messreihen ${read}/${total}` : t('Fahrten voll geprüft')}</span>
      <CoverageBar analysis={analysis} />
      <span className="hud-cap hud-ell">{coverageLine({ ...counts, checked: 0 })}</span>
    </Tile>
  )
}

const RidesTile = ({ rows, onOpen }: { readonly rows: readonly RideRow[]; readonly onOpen: OpenTile }) => (
  <Tile tile="rides" onOpen={onOpen}>
    <span className="hud-tile__rows hud-tile__rows--rides">
      {rows.slice(0, SHOWN_RIDES).map((r) => (
        <span key={r.ride.id} className="hud-tile__row">
          <span className="hud-mono hud-dim">{r.date}</span>
          <span className="hud-ell">{r.ride.name}</span>
          <span className="hud-dim">{r.where}</span>
          <span className="hud-mono">{r.np === '–' ? '–' : `${r.np} W`}</span>
          <span className="hud-mono hud-ell">{r.steady}</span>
          <span className={`hud-tone-${r.tone === 'muted' ? 'ref' : r.tone}`}>{r.status}</span>
        </span>
      ))}
    </span>
    <span className="hud-cap">
      {rows.length > SHOWN_RIDES ? t`${rows.length - SHOWN_RIDES} weitere` : rows.length === 0 ? t('Keine Fahrten im Zeitraum') : ''}
    </span>
  </Tile>
)

type GridProps = {
  readonly summary: DashboardSummary
  readonly analysis: SteadyAnalysis
  readonly items: readonly FindingItem[]
  readonly rows: readonly RideRow[]
  readonly warnedWeeks: readonly boolean[]
  readonly warned: number
  readonly read: number
  readonly total: number
  readonly ride: DashboardRide | null
  readonly trace: RideTrace | null
  readonly rideWarned: boolean
  readonly onOpen: OpenTile
}

/** The whole range on one screen: each tile answers one question and holds the evidence behind a click. */
export const TileGrid = ({ summary, analysis, items, rows, warnedWeeks, warned, read, total, ride, trace, rideWarned, onOpen }: GridProps) => (
  <div className="hud-tiles">
    <FindingsTile items={items} warned={warned} onOpen={onOpen} />
    <RideTile ride={ride} trace={trace} status={ride ? analysis.status[ride.id] : undefined} warned={rideWarned} onOpen={onOpen} />
    <LoadTile summary={summary} warnedWeeks={warnedWeeks} onOpen={onOpen} />
    <EfficiencyTile summary={summary} warnedWeeks={warnedWeeks} onOpen={onOpen} />
    <CoverageTile analysis={analysis} read={read} total={total} onOpen={onOpen} />
    <RidesTile rows={rows} onOpen={onOpen} />
  </div>
)
