import { useMemo, useState } from 'react'
import type { RideTrace } from '../../coach/dashboard.ts'
import type { MinuteBucket, SteadyFinding } from '../../coach/steady-block.ts'
import { t } from '../../coach/lang.ts'
import { blockMinutes, inBlock, minorStep, nearestBucket, ratioGeometry, timeTicks, TRACE_HEIGHT, TRACE_WIDTH, traceGeometry } from './geometry.ts'
import type { RatioGeometry, TraceGeometry } from './geometry.ts'
import { clock, num } from './model.ts'
import { Better, Plot } from './Plot.tsx'

const VIEW_BOX = `0 0 ${TRACE_WIDTH} ${TRACE_HEIGHT}`

/** The slider's minute. A new ride puts it on the block middle, where the two halves meet. */
const useCursor = (rideId: string, trace: RideTrace) => {
  const last = trace.minutes[trace.minutes.length - 1]?.minute ?? 0
  const start = trace.block ? Math.round(blockMinutes(trace.block).mid) : last
  const key = `${rideId}|${trace.minutes.length}`
  const [minute, setMinute] = useState(start)
  const [shown, setShown] = useState(key)
  if (shown !== key) {
    setShown(key)
    setMinute(start)
  }
  return [minute, setMinute] as const
}

const phaseOf = (minute: number, trace: RideTrace): string => {
  if (minute * 60 < trace.warmupS) return t('Aufwärmen')
  if (trace.block && inBlock(minute, trace.block)) return t('Ruhiger Block')
  return t('Wechselnd')
}

/** Warm-up shade, block area and block middle: the same in every chart, so the eye can run down. */
const Underlay = ({ trace, geometry }: { readonly trace: RideTrace; readonly geometry: TraceGeometry }) => {
  const b = trace.block ? blockMinutes(trace.block) : null
  return (
    <>
      <rect className="hud-warm" x="0" y="0" width={geometry.x(trace.warmupS / 60)} height={TRACE_HEIGHT} />
      {b && <rect className="hud-band" x={geometry.x(b.start)} y="0" width={geometry.x(b.end) - geometry.x(b.start)} height={TRACE_HEIGHT} />}
      <g className="hud-grid">
        <line x1="0" y1="5" x2={TRACE_WIDTH} y2="5" />
        <line x1="0" y1={TRACE_HEIGHT / 2} x2={TRACE_WIDTH} y2={TRACE_HEIGHT / 2} />
        <line x1="0" y1={TRACE_HEIGHT - 5} x2={TRACE_WIDTH} y2={TRACE_HEIGHT - 5} />
      </g>
      {b && <line className="hud-mid-line" x1={geometry.x(b.mid)} y1="0" x2={geometry.x(b.mid)} y2={TRACE_HEIGHT} />}
    </>
  )
}

const Cursor = ({ x, y, tone }: { readonly x: number; readonly y: number | null; readonly tone: 'power' | 'pulse' | 'ratio' }) => {
  const left = `${((x / TRACE_WIDTH) * 100).toFixed(2)}%`
  return (
    <>
      <div className="hud-cur" style={{ left }} />
      {y !== null && <div className={`hud-dot hud-dot--${tone}`} style={{ left, top: `${((y / TRACE_HEIGHT) * 100).toFixed(1)}%` }} />}
    </>
  )
}

type RatioProps = {
  readonly trace: RideTrace
  readonly geometry: TraceGeometry
  readonly ratio: RatioGeometry
  readonly point: MinuteBucket
  readonly reference: number | null
  readonly warned: boolean
}

/** What the rules compute, drawn: the two half means as steps and, for the baseline rule, the baseline. */
const RatioPlot = ({ trace, geometry, ratio, point, reference, warned }: RatioProps) => {
  const block = trace.block
  if (!block) return null
  const b = blockMinutes(block)
  const step = `hud-step hud-step--${warned ? 'warn' : 'calm'}`
  const inside = point.watts > 0 && inBlock(point.minute, block)
  return (
    <Plot
      label={t('Puls pro Watt, bpm/W · nur im ruhigen Block')}
      tone="ratio"
      ticks={[num(ratio.max, 2), num((ratio.max + ratio.min) / 2, 2), num(ratio.min, 2)]}
      viewBox={VIEW_BOX}
      overlay={<Cursor x={geometry.x(point.minute)} y={inside ? ratio.y(point.heartRate / point.watts) : null} tone="ratio" />}
    >
      <Underlay trace={trace} geometry={geometry} />
      {reference !== null && <line className="hud-ref" x1={geometry.x(b.start)} y1={ratio.y(reference)} x2={geometry.x(b.end)} y2={ratio.y(reference)} />}
      <path className="hud-tr hud-tr--ratio" d={ratio.path} />
      <line className={step} x1={geometry.x(b.start)} y1={ratio.y(block.firstHalfHrPerW)} x2={geometry.x(b.mid)} y2={ratio.y(block.firstHalfHrPerW)} />
      <line className={step} x1={geometry.x(b.mid)} y1={ratio.y(block.secondHalfHrPerW)} x2={geometry.x(b.end)} y2={ratio.y(block.secondHalfHrPerW)} />
    </Plot>
  )
}

type ReadoutProps = { readonly label: string; readonly value: string; readonly tone?: 'pulse'; readonly extra?: string; readonly better?: boolean }

const Readout = ({ label, value, tone, extra, better }: ReadoutProps) => (
  <div className="hud-readout">
    <span className="hud-cap">
      {label}
      {better && <Better way="down" />}
    </span>
    <span className={`hud-mono hud-big${tone ? ' hud-tone-calm' : ''}`}>{value}</span>
    {extra && <span className="hud-cap">{extra}</span>}
  </div>
)

const Readouts = ({ point, trace }: { readonly point: MinuteBucket; readonly trace: RideTrace }) => (
  <div className="hud-readouts" aria-live="off">
    <Readout label={t('Fahrtzeit')} value={clock(point.minute)} extra={phaseOf(point.minute, trace)} />
    <Readout label={t('Leistung W')} value={num(point.watts)} />
    <Readout label={t('Puls bpm')} value={num(point.heartRate)} tone="pulse" />
    <Readout label={t('Puls pro Watt')} value={point.watts > 0 ? num(point.heartRate / point.watts, 3) : '–'} extra={t('Minutenmittel')} better />
  </div>
)

type SliderProps = {
  readonly minute: number
  readonly lastMinute: number
  readonly valueText: string
  readonly onMinute: (minute: number) => void
}

/** The only way through the ride: nothing moves unless the athlete moves it. */
const TimeSlider = ({ minute, lastMinute, valueText, onMinute }: SliderProps) => (
  <div className="hud-chart__row">
    <span className="hud-yax hud-cap" aria-hidden="true">min</span>
    <div className="hud-slider">
      <input
        type="range"
        min={0}
        max={lastMinute}
        step={1}
        value={minute}
        onChange={(event) => onMinute(Number(event.target.value))}
        aria-label={t('Fahrtzeit wählen')}
        aria-valuetext={valueText}
      />
      <div
        className="hud-ticks"
        aria-hidden="true"
        style={{ backgroundSize: `${((minorStep(lastMinute) / lastMinute) * 100).toFixed(3)}% 100%` }}
      />
      <div className="hud-xax hud-mono" aria-hidden="true">
        {timeTicks(lastMinute).map((tick) => (
          <span key={tick} style={{ left: `${((tick / lastMinute) * 100).toFixed(2)}%` }}>{tick}</span>
        ))}
      </div>
    </div>
  </div>
)

const Legend = ({ trace, reference, warned }: { readonly trace: RideTrace; readonly reference: boolean; readonly warned: boolean }) => (
  <div className="hud-legend hud-cap">
    <span><i className="hud-sw hud-sw--warm" aria-hidden="true" />{t('Aufwärmen, ausgelassen')}</span>
    {trace.block ? (
      <>
        <span><i className="hud-sw hud-sw--band" aria-hidden="true" />{t`Ruhiger Block, ${num(trace.block.durationS / 60)} min`}</span>
        <span><i className="hud-sw hud-sw--mid" aria-hidden="true" />{t('Blockmitte')}</span>
        <span><i className={`hud-sw hud-sw--step${warned ? ' is-warn' : ''}`} aria-hidden="true" />{t('Mittel je Blockhälfte')}</span>
        {reference && <span><i className="hud-sw hud-sw--ref" aria-hidden="true" />{t('Deine Basis')}</span>}
      </>
    ) : (
      <span>{t('Kein ruhiger Block')}</span>
    )}
  </div>
)

type Props = {
  readonly rideId: string
  readonly trace: RideTrace
  readonly findings: readonly SteadyFinding[]
}

/** Power, heart rate and their ratio on one time axis, read with a slider. */
export const CockpitTrace = ({ rideId, trace, findings }: Props) => {
  const geometry = useMemo(() => traceGeometry(trace), [trace])
  const reference = findings.find((f) => f.rule === 'elevatedHr')?.referenceHrPerW ?? null
  const ratio = useMemo(() => {
    const block = trace.block
    if (!block) return null
    return ratioGeometry(trace, geometry.x, [block.firstHalfHrPerW, block.secondHalfHrPerW, ...(reference === null ? [] : [reference])])
  }, [trace, geometry, reference])
  const [minute, setMinute] = useCursor(rideId, trace)
  const point = nearestBucket(trace.minutes, minute)
  if (!point) return null
  const x = geometry.x(point.minute)

  return (
    <div className="hud-stack hud-gap">
      <Readouts point={point} trace={trace} />
      <Plot
        label={t('Leistung, W')}
        tone="power"
        ticks={[num(geometry.powerMax), num(geometry.powerMax / 2), '0']}
        viewBox={VIEW_BOX}
        overlay={<Cursor x={x} y={geometry.yPower(point.watts)} tone="power" />}
      >
        <Underlay trace={trace} geometry={geometry} />
        <path className="hud-tr hud-tr--power" d={geometry.powerPath} />
      </Plot>
      <Plot
        label={t('Puls, bpm')}
        tone="pulse"
        ticks={[num(geometry.hrMax), num((geometry.hrMax + geometry.hrMin) / 2), num(geometry.hrMin)]}
        viewBox={VIEW_BOX}
        overlay={<Cursor x={x} y={geometry.yHeart(point.heartRate)} tone="pulse" />}
      >
        <Underlay trace={trace} geometry={geometry} />
        <path className="hud-tr hud-tr--pulse" d={geometry.hrPath} />
      </Plot>
      {ratio && <RatioPlot trace={trace} geometry={geometry} ratio={ratio} point={point} reference={reference} warned={findings.length > 0} />}
      <TimeSlider
        minute={minute}
        lastMinute={geometry.lastMinute}
        valueText={`${clock(point.minute)} · ${phaseOf(point.minute, trace)}`}
        onMinute={setMinute}
      />
      <Legend trace={trace} reference={reference !== null} warned={findings.length > 0} />
    </div>
  )
}
