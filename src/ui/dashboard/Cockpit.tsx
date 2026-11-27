import { useEffect, useMemo, useRef, useState } from 'react'
import { DASHBOARD_WEEKS } from '../../coach/dashboard.ts'
import type { DashboardWeeks } from '../../coach/dashboard.ts'
import { t } from '../../coach/lang.ts'
import { garminText } from '../components/GarminAttribution.tsx'
import { CockpitTrace } from './CockpitTrace.tsx'
import { CoveragePanel, FindingsPanel, LoadPanel, RideTable } from './CockpitPanels.tsx'
import { byRide, findingItems, rideRows, warnedWeeks } from './model.ts'
import type { FindingItem } from './model.ts'
import { useRideTrace } from './useDashboard.ts'
import type { DashboardState } from './useDashboard.ts'

type Props = {
  readonly state: DashboardState & { readonly summary: NonNullable<DashboardState['summary']>; readonly analysis: NonNullable<DashboardState['analysis']> }
  readonly weeks: DashboardWeeks
  readonly onWeeks: (weeks: DashboardWeeks) => void
  readonly calm: boolean
  readonly onCalm: () => void
  /** The system asks for less motion: no doors, no tilt, no replay. */
  readonly still: boolean
}

const TILT_X = 2.4
const TILT_Y = 3.2

/** Mouse position tilts the deck a little, written straight to the style so React does not re-render. */
const useTilt = (enabled: boolean) => {
  const root = useRef<HTMLDivElement>(null)
  const deck = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const area = root.current
    if (!enabled || !area) return
    let frame = 0
    const set = (rx: number, ry: number) => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        if (deck.current) deck.current.style.transform = `rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`
      })
    }
    const onMove = (event: MouseEvent) => {
      const box = area.getBoundingClientRect()
      set(-((event.clientY - box.top) / box.height - 0.5) * TILT_X, ((event.clientX - box.left) / box.width - 0.5) * TILT_Y)
    }
    const onLeave = () => set(0, 0)
    area.addEventListener('mousemove', onMove)
    area.addEventListener('mouseleave', onLeave)
    return () => {
      cancelAnimationFrame(frame)
      area.removeEventListener('mousemove', onMove)
      area.removeEventListener('mouseleave', onLeave)
      if (deck.current) deck.current.style.transform = ''
    }
  }, [enabled])
  return { root, deck }
}

/** Matches the last boot delay in dashboard.css (reveal: --d + 1s + 1.6s). */
const BOOT_MS = 4500

/** True once the boot sequence has played; later reveals skip its delay. */
const useBooted = () => {
  const [booted, setBooted] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setBooted(true), BOOT_MS)
    return () => clearTimeout(timer)
  }, [])
  return booted
}

const Doors = ({ rides, total, warnings }: { readonly rides: number; readonly total: number; readonly warnings: number }) => (
  <>
    <div className="hud-door hud-door--t" aria-hidden="true">
      <span className="hud-chk hud-c1 hud-lbl">{t`Import · ${rides} Fahrten · ok`}</span>
      <span className="hud-chk hud-c2 hud-lbl">{t`Messreihen · ${total} Kandidaten · Basis 42 Tage`}</span>
      <span className="hud-chk hud-c3 hud-lbl">{t('Regeln · Puls-Drift · Puls über Basis · Block-Prüfung')}</span>
      <span className="hud-chk hud-c4 hud-lbl hud-tone-warn">{warnings > 0 ? t`${warnings} Warnungen` : t('Lese Blöcke')}</span>
    </div>
    <div className="hud-door hud-door--b" aria-hidden="true" />
    <div className="hud-sweep" aria-hidden="true" />
  </>
)

const Header = ({ state, weeks, onWeeks, calm, onCalm, warned }: Pick<Props, 'state' | 'weeks' | 'onWeeks' | 'calm' | 'onCalm'> & { readonly warned: number }) => (
  <header className="hud-head hud-b1">
    <div className="hud-head__title">
      <h1>{t('Trainings-Cockpit')}</h1>
      <span className="hud-lbl">{t`Radfahrten · ${weeks} Wochen · intervals.icu`}</span>
      {state.summary.garmin && <span className="hud-lbl hud-attr">{garminText(state.summary.garmin)}</span>}
    </div>
    <div className="hud-head__status">
      <div className="hud-switch" role="group" aria-label={t('Zeitraum')} aria-busy={state.busy}>
        {DASHBOARD_WEEKS.map((option) => (
          <button key={option} type="button" aria-pressed={option === weeks} onClick={() => onWeeks(option)}>
            {t`${option} Wo`}
          </button>
        ))}
      </div>
      <span className="hud-lbl">{t('Messreihen')} <span className="hud-hi">{state.read}/{state.total}</span></span>
      <span className="hud-lbl">{t('Regeln')} <span className="hud-hi">{t('2 aktiv')}</span></span>
      <span className="hud-lbl">{t('Verworfen')} <span className="hud-hi">{state.analysis.coverage.noBlock}</span></span>
      <span className={warned > 0 ? 'hud-lbl hud-tone-warn hud-alert' : 'hud-lbl hud-alert'}>
        {warned > 0 && (
          <svg className="hud-beat" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><polygon className="hud-mk" points="6,1 11,11 1,11" /></svg>
        )}
        {warned > 0 ? t`${warned} Warnungen offen` : t('Keine Warnung')}
      </span>
      <button type="button" className="hud-btn hud-btn--small" aria-pressed={calm} onClick={onCalm}>
        {calm ? t('Effekte an') : t('Ruhig')}
      </button>
    </div>
  </header>
)

/** Picked ride, else the first finding, else the newest candidate; picking restarts the glitch. */
const useSelection = (state: Props['state'], items: readonly FindingItem[]) => {
  const { summary, analysis, readings } = state
  const grouped = useMemo(() => byRide(analysis.findings), [analysis])
  const [picked, setPicked] = useState<string | null>(null)
  const [flip, setFlip] = useState(false)
  const selectedId = picked ?? items[0]?.rideId ?? summary.rides.find((r) => r.candidate)?.id ?? null
  return {
    grouped,
    flip,
    selectedId,
    ride: summary.rides.find((r) => r.id === selectedId) ?? null,
    trace: useRideTrace(selectedId),
    findings: (selectedId && grouped.get(selectedId)) || [],
    block: (selectedId && readings.get(selectedId)?.block) || null,
    pick: (id: string) => {
      setPicked(id)
      setFlip((f) => !f)
    },
  }
}

export const Cockpit = ({ state, weeks, onWeeks, calm, onCalm, still }: Props) => {
  const { summary, analysis, readings } = state
  const items = useMemo(() => findingItems(summary, analysis), [summary, analysis])
  const rows = useMemo(() => rideRows(summary, analysis, readings), [summary, analysis, readings])
  const { grouped, flip, selectedId, ride, trace, findings, block, pick } = useSelection(state, items)
  const quiet = calm || still
  const tilt = useTilt(!quiet)
  const booted = useBooted()

  return (
    <div ref={tilt.root} className={`hud${quiet ? ' hud--calm' : ''}${booted ? ' hud--booted' : ''}`}>
      {!quiet && <div className="hud-floor" aria-hidden="true" />}
      {!quiet && <Doors rides={summary.rides.length} total={state.total} warnings={grouped.size} />}
      <div className="hud-deck" ref={tilt.deck}>
        <Header state={state} weeks={weeks} onWeeks={onWeeks} calm={calm} onCalm={onCalm} warned={grouped.size} />
        <div className="hud-row">
          <LoadPanel summary={summary} warnedWeeks={warnedWeeks(summary, analysis.findings)} />
          <section className="hud-pn hud-b3 hud-center">
            <CockpitTrace ride={ride} trace={trace.trace} error={trace.error} findings={findings} still={still} glitch={flip} />
          </section>
          <FindingsPanel
            items={items}
            selectedId={selectedId}
            onPick={pick}
            ride={ride}
            status={selectedId ? analysis.status[selectedId] : undefined}
            findings={findings}
            block={block}
            summary={summary}
            glitch={flip}
          />
        </div>
        <div className="hud-row hud-row--top">
          <CoveragePanel
            analysis={analysis}
            read={state.read}
            total={state.total}
            stravaStubs={summary.stravaStubs}
            baselineDays={summary.thresholds.baselineDays}
            blockError={state.blockError}
            onRetry={state.retry}
          />
          <RideTable rows={rows} selectedId={selectedId} onPick={pick} />
        </div>
      </div>
    </div>
  )
}
