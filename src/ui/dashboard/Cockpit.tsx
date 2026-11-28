import { useCallback, useMemo, useState } from 'react'
import { DASHBOARD_WEEKS } from '../../coach/dashboard.ts'
import type { DashboardWeeks } from '../../coach/dashboard.ts'
import { t } from '../../coach/lang.ts'
import { garminText } from '../components/GarminAttribution.tsx'
import { CockpitFocus } from './CockpitFocus.tsx'
import { CoverageFocus, FindingsFocus, LoadFocus, RidesFocus } from './CockpitPanels.tsx'
import { EfficiencyFocus } from './CockpitProgress.tsx'
import { RideFocus } from './CockpitRide.tsx'
import { TileGrid } from './CockpitTiles.tsx'
import { byRide, checkedLabel, driftPoints, findingItems, rideRows, TILES, warnedWeeks, warningsLabel } from './model.ts'
import type { FindingItem, TileKey } from './model.ts'
import { useRideTrace } from './useDashboard.ts'
import type { DashboardState } from './useDashboard.ts'

type Ready = DashboardState & { readonly summary: NonNullable<DashboardState['summary']>; readonly analysis: NonNullable<DashboardState['analysis']> }

type Props = {
  readonly state: Ready
  readonly weeks: DashboardWeeks
  readonly onWeeks: (weeks: DashboardWeeks) => void
  readonly calm: boolean
  readonly onCalm: () => void
  /** The system asks for less motion: the focus view opens in place. */
  readonly still: boolean
}

type HeaderProps = Pick<Props, 'state' | 'weeks' | 'onWeeks' | 'calm' | 'onCalm'> & { readonly warned: number }

const Header = ({ state, weeks, onWeeks, calm, onCalm, warned }: HeaderProps) => (
  <header className="hud-head">
    <div className="hud-head__title">
      <h1>{t('Trainings-Cockpit')}</h1>
      <span className="hud-cap">{t`Radfahrten · ${weeks} Wochen · intervals.icu`}</span>
      {state.summary.garmin && <span className="hud-cap">{garminText(state.summary.garmin)}</span>}
    </div>
    <p className="hud-head__sum" role="status" aria-busy={state.read < state.total}>
      <span className={warned > 0 ? 'hud-tone-warn' : 'hud-tone-calm'}>{warningsLabel(warned)}</span>
      {' · '}
      {state.read < state.total ? t`Lese Messreihen ${state.read}/${state.total}` : checkedLabel(state.analysis.coverage)}
    </p>
    <div className="hud-head__tools">
      <div className="hud-switch" role="group" aria-label={t('Zeitraum')} aria-busy={state.busy}>
        {DASHBOARD_WEEKS.map((option) => (
          <button key={option} type="button" aria-pressed={option === weeks} onClick={() => onWeeks(option)}>
            {t`${option} Wo`}
          </button>
        ))}
      </div>
      <button type="button" className="hud-btn" aria-pressed={calm} onClick={onCalm}>
        {calm ? t('Effekte an') : t('Ruhig')}
      </button>
    </div>
    {state.blockError && (
      <p className="hud-head__error hud-tone-warn" role="alert">
        {state.blockError}{' '}
        <button type="button" className="hud-btn" onClick={state.retry}>{t('Weiterlesen')}</button>
      </p>
    )}
  </header>
)

/** Picked ride, else the first finding, else the newest candidate. */
const useSelection = (state: Ready, items: readonly FindingItem[]) => {
  const { summary, analysis, readings } = state
  const grouped = useMemo(() => byRide(analysis.findings), [analysis])
  const [picked, setPicked] = useState<string | null>(null)
  const selectedId = picked ?? items[0]?.rideId ?? summary.rides.find((r) => r.candidate)?.id ?? null
  return {
    grouped,
    selectedId,
    ride: summary.rides.find((r) => r.id === selectedId) ?? null,
    trace: useRideTrace(selectedId),
    findings: (selectedId && grouped.get(selectedId)) || [],
    block: (selectedId && readings.get(selectedId)?.block) || null,
    pick: setPicked,
  }
}

type Focus = { readonly tile: TileKey; readonly origin: DOMRect | null }

const stepFrom = (tile: TileKey, direction: 1 | -1): TileKey =>
  TILES[(TILES.indexOf(tile) + direction + TILES.length) % TILES.length] ?? tile

export const Cockpit = ({ state, weeks, onWeeks, calm, onCalm, still }: Props) => {
  const { summary, analysis, readings } = state
  const items = useMemo(() => findingItems(summary, analysis), [summary, analysis])
  const rows = useMemo(() => rideRows(summary, analysis, readings), [summary, analysis, readings])
  const marked = useMemo(() => warnedWeeks(summary, analysis.findings), [summary, analysis])
  const points = useMemo(() => driftPoints(summary, readings, analysis.findings), [summary, readings, analysis])
  const sel = useSelection(state, items)
  const [focus, setFocus] = useState<Focus | null>(null)
  const close = useCallback(() => setFocus(null), [])
  const step = useCallback((direction: 1 | -1) => setFocus((now) => now && { tile: stepFrom(now.tile, direction), origin: null }), [])
  // A ride picked in the findings or the table opens in the ride view, where verdict and trace sit together.
  const pick = (rideId: string) => {
    sel.pick(rideId)
    setFocus({ tile: 'ride', origin: null })
  }
  const quiet = calm || still
  const status = sel.selectedId ? analysis.status[sel.selectedId] : undefined

  return (
    <div className={`hud${quiet ? ' hud--calm' : ''}${focus ? ' hud--focus' : ''}`}>
      <div className="hud-deck">
        <Header state={state} weeks={weeks} onWeeks={onWeeks} calm={calm} onCalm={onCalm} warned={sel.grouped.size} />
        <TileGrid
          summary={summary}
          analysis={analysis}
          items={items}
          rows={rows}
          warnedWeeks={marked}
          warned={sel.grouped.size}
          read={state.read}
          total={state.total}
          ride={sel.ride}
          trace={sel.trace.trace}
          rideWarned={sel.findings.length > 0}
          onOpen={(tile, origin) => setFocus({ tile, origin })}
        />
      </div>
      <CockpitFocus tile={focus?.tile ?? null} origin={focus?.origin ?? null} quiet={quiet} onClose={close} onStep={step}>
        {focus?.tile === 'findings' && <FindingsFocus items={items} points={points} summary={summary} thresholds={summary.thresholds} selectedId={sel.selectedId} onPick={pick} />}
        {focus?.tile === 'ride' && (
          <RideFocus ride={sel.ride} trace={sel.trace.trace} error={sel.trace.error} status={status} findings={sel.findings} block={sel.block} thresholds={summary.thresholds} />
        )}
        {focus?.tile === 'load' && <LoadFocus summary={summary} warnedWeeks={marked} />}
        {focus?.tile === 'efficiency' && <EfficiencyFocus summary={summary} warnedWeeks={marked} />}
        {focus?.tile === 'coverage' && (
          <CoverageFocus analysis={analysis} read={state.read} total={state.total} stravaStubs={summary.stravaStubs} baselineDays={summary.thresholds.baselineDays} />
        )}
        {focus?.tile === 'rides' && <RidesFocus rows={rows} selectedId={sel.selectedId} onPick={pick} />}
      </CockpitFocus>
    </div>
  )
}
