import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { DashboardRide, RideTrace } from '../../coach/dashboard.ts'
import type { MinuteBucket, SteadyBlock, SteadyFinding } from '../../coach/steady-block.ts'
import { TRACE_HEIGHT, TRACE_WIDTH, traceGeometry } from './geometry.ts'
import type { TraceGeometry } from './geometry.ts'
import { clock, num, shortDate, where } from './model.ts'
import { t } from '../../coach/lang.ts'

const REPLAY_STEP_MS = 90

/** Moves a cursor along the ride; still when motion is unwanted. */
const useReplay = (length: number, still: boolean, rideId: string | null) => {
  const start = still ? Math.max(0, length - 1) : 0
  const [minute, setMinute] = useState(start)
  const [run, setRun] = useState(true)
  // A new ride, a longer trace or a change of motion starts the cursor over, during render.
  const key = `${rideId}|${length}|${still}`
  const [shown, setShown] = useState(key)
  if (shown !== key) {
    setShown(key)
    setMinute(start)
  }
  useEffect(() => {
    if (!run || still || length < 2) return
    const id = window.setInterval(() => setMinute((v) => (v + 1) % length), REPLAY_STEP_MS)
    return () => window.clearInterval(id)
  }, [run, still, length])
  return { minute, run: run && !still, toggle: () => setRun((r) => !r) }
}

type Marks = {
  readonly warmEnd: number
  readonly block: SteadyBlock | null
  readonly split: boolean
  readonly referenceBpm: number | null
}

const Chart = ({
  label,
  kind,
  path,
  geometry,
  marks,
  cursor,
  dotTop,
  showBlock,
}: {
  readonly label: string
  readonly kind: 'pw' | 'hr'
  readonly path: string
  readonly geometry: TraceGeometry
  readonly marks: Marks
  readonly cursor: number
  readonly dotTop: number
  readonly showBlock: boolean
}) => {
  const { block } = marks
  const left = `${((cursor / TRACE_WIDTH) * 100).toFixed(2)}%`
  const rest = `${(100 - (cursor / TRACE_WIDTH) * 100).toFixed(2)}%`
  const refY = marks.referenceBpm === null ? null : geometry.yHeart(marks.referenceBpm)
  return (
    <div className="hud-chart">
      <span className={`hud-lbl hud-lbl--${kind}`}>{label}</span>
      <div className="hud-chart__plot hud-reveal">
        <svg viewBox={`0 0 ${TRACE_WIDTH} ${TRACE_HEIGHT}`} preserveAspectRatio="none" role="img" aria-label={label}>
          <rect className="hud-warm" x="0" y="0" width={geometry.x(marks.warmEnd)} height={TRACE_HEIGHT} />
          <g className="hud-grid">
            <line x1="0" y1="5" x2={TRACE_WIDTH} y2="5" />
            <line x1="0" y1={TRACE_HEIGHT / 2} x2={TRACE_WIDTH} y2={TRACE_HEIGHT / 2} />
            <line x1="0" y1={TRACE_HEIGHT - 5} x2={TRACE_WIDTH} y2={TRACE_HEIGHT - 5} />
          </g>
          {showBlock && block && (
            <rect
              className="hud-steady"
              x={geometry.x(block.startS / 60)}
              y="0"
              width={geometry.x(block.durationS / 60)}
              height="3"
            />
          )}
          {marks.split && block && (
            <line className="hud-split" x1={geometry.x((block.startS + block.durationS / 2) / 60)} y1="0" x2={geometry.x((block.startS + block.durationS / 2) / 60)} y2={TRACE_HEIGHT} />
          )}
          {kind === 'hr' && refY !== null && <line className="hud-split" x1="0" y1={refY} x2={TRACE_WIDTH} y2={refY} />}
          <path className="hud-tr hud-tr--ghost" d={path} />
        </svg>
        <div className="hud-live" style={{ clipPath: `inset(0 ${rest} 0 0)` }} aria-hidden="true">
          <svg viewBox={`0 0 ${TRACE_WIDTH} ${TRACE_HEIGHT}`} preserveAspectRatio="none" aria-hidden="true">
            <path className={`hud-tr hud-tr--${kind}`} d={path} />
          </svg>
        </div>
        <div className="hud-cur" style={{ left }} />
        <div className={`hud-dot hud-dot--${kind}`} style={{ left, top: `${((dotTop / TRACE_HEIGHT) * 100).toFixed(1)}%` }} />
      </div>
    </div>
  )
}

const Readout = ({ label, value, meter, kind, extra }: {
  readonly label: ReactNode
  readonly value: string
  readonly meter?: number
  readonly kind?: 'pw' | 'hr'
  readonly extra?: string
}) => (
  <div className="hud-readout">
    <span className="hud-lbl">{label}</span>
    <span className={`hud-mono hud-big${kind ? ` hud-big--${kind}` : ''}`}>{value}</span>
    {meter !== undefined && (
      <div className="hud-meter">
        <div className={kind ? `hud-meter--${kind}` : undefined} style={{ width: `${Math.max(0, Math.min(100, meter * 100)).toFixed(1)}%` }} />
      </div>
    )}
    {extra && <span className="hud-lbl">{extra}</span>}
  </div>
)

const phaseOf = (minute: number, trace: RideTrace): string => {
  if (minute * 60 < trace.warmupS) return t('Aufwärmen')
  const b = trace.block
  if (b && minute * 60 >= b.startS && minute * 60 < b.startS + b.durationS) return t('Ruhiger Block')
  return t('Wechselnd')
}

const dashedLabel = (marks: Marks): string | null => {
  if (!marks.block) return null
  const ref = marks.referenceBpm !== null
  if (ref && marks.split) return t('Gestrichelt: Blockmitte und Puls deiner Basis')
  if (ref) return t('Gestrichelt: Puls deiner Basis bei dieser Leistung')
  return marks.split ? t('Gestrichelt: Blockmitte') : null
}

const TraceHeader = ({ ride, replay }: { readonly ride: DashboardRide | null; readonly replay: { run: boolean; toggle: () => void } | null }) => (
  <div className="hud-trace__head">
    <div className="hud-stack">
      <span className="hud-lbl">
        {t('Fahrtverlauf')}{ride ? ` · ${shortDate(ride.date)} · ${where(ride.indoor)}` : ''}
      </span>
      <span className="hud-title">{ride?.name ?? t('Keine Fahrt gewählt')}</span>
      {ride?.garminDevice && <span className="hud-lbl hud-attr">{ride.garminDevice}</span>}
    </div>
    {replay && (
      <button type="button" className="hud-btn" onClick={replay.toggle}>
        {replay.run ? t('Replay halten') : t('Replay starten')}
      </button>
    )}
  </div>
)

const Readouts = ({ point, trace, geometry }: { readonly point: MinuteBucket; readonly trace: RideTrace; readonly geometry: TraceGeometry }) => {
  const beat = (60 / Math.max(40, point.heartRate)).toFixed(2)
  const pulse = (
    <>
      {t('Puls bpm')} <span className="hud-lamp" aria-hidden="true" style={{ animationDuration: `${beat}s` }} />
    </>
  )
  return (
    <div className="hud-readouts hud-z2">
      <Readout label={t('Fahrtzeit')} value={clock(point.minute)} extra={phaseOf(point.minute, trace)} />
      <Readout label={t('Leistung W')} value={num(point.watts)} meter={point.watts / geometry.powerMax} kind="pw" />
      <Readout label={pulse} value={num(point.heartRate)} meter={(point.heartRate - geometry.hrMin) / (geometry.hrMax - geometry.hrMin)} kind="hr" />
      <Readout label={t('Puls pro Watt')} value={num(point.heartRate / Math.max(1, point.watts), 3)} extra={t('Minutenmittel')} />
    </div>
  )
}

const Legend = ({ marks, trace, lastMinute }: { readonly marks: Marks; readonly trace: RideTrace; readonly lastMinute: number }) => {
  const dashed = dashedLabel(marks)
  return (
    <div className="hud-legend">
      <span className="hud-lbl">{t('0 min · schattiert: Aufwärmen, ausgelassen')}</span>
      {dashed && <span className="hud-lbl hud-lbl--warn">{dashed}</span>}
      <span className="hud-lbl hud-lbl--hr">
        {trace.block ? t`Balken oben: ruhiger Block, ${num(trace.block.durationS / 60)} min` : t('Kein ruhiger Block')}
      </span>
      <span className="hud-lbl">{num(lastMinute)} min</span>
    </div>
  )
}

const marksOf = (trace: RideTrace, findings: readonly SteadyFinding[]): Marks => {
  const elevated = findings.find((f) => f.rule === 'elevatedHr')
  return {
    warmEnd: trace.warmupS / 60,
    block: trace.block,
    split: !elevated || findings.length > 1,
    referenceBpm: elevated ? elevated.referenceHrPerW * elevated.block.avgWatts : null,
  }
}

type Props = {
  readonly ride: DashboardRide | null
  readonly trace: RideTrace | null
  readonly error: string | null
  readonly findings: readonly SteadyFinding[]
  readonly still: boolean
  readonly glitch: boolean
}

export const CockpitTrace = ({ ride, trace, error, findings, still, glitch }: Props) => {
  const geometry = useMemo(() => (trace && trace.minutes.length > 1 ? traceGeometry(trace) : null), [trace])
  const length = trace?.minutes.length ?? 0
  const { minute, run, toggle } = useReplay(length, still, ride?.id ?? null)
  const frame = glitch ? 'hud-glitch-a hud-stack hud-gap' : 'hud-glitch-b hud-stack hud-gap'
  const header = <TraceHeader ride={ride} replay={geometry && !still ? { run, toggle } : null} />

  if (!ride || !trace || !geometry) {
    return (
      <div className={frame}>
        {header}
        <p className="hud-note" role="status">
          {error ?? (ride ? (trace ? t('Keine Leistungs- und Pulsdaten in dieser Fahrt.') : t('Lese Messreihe…')) : t('Wähle rechts eine Fahrt.'))}
        </p>
      </div>
    )
  }

  const point = trace.minutes[Math.min(minute, length - 1)] ?? trace.minutes[0]!
  const marks = marksOf(trace, findings)
  const cursor = geometry.x(point.minute)
  const chart = { geometry, marks, cursor }
  return (
    <div className={frame}>
      {header}
      <Readouts point={point} trace={trace} geometry={geometry} />
      <Chart {...chart} label={t`Leistung · 0 bis ${geometry.powerMax} W`} kind="pw" path={geometry.powerPath} dotTop={geometry.yPower(point.watts)} showBlock />
      <Chart {...chart} label={t`Puls · ${geometry.hrMin} bis ${geometry.hrMax} bpm`} kind="hr" path={geometry.hrPath} dotTop={geometry.yHeart(point.heartRate)} showBlock={false} />
      <Legend marks={marks} trace={trace} lastMinute={geometry.lastMinute} />
    </div>
  )
}
