import { useEffect, useState } from 'react'
import type { ExecutedStep, Execution, ExecutionSegment } from '../../coach/types.ts'
import { SPORT_DONE } from '../../coach/types.ts'
import { getExecution } from '../api.ts'
import { ZRL_TEMPLATE_ID } from '../../coach/zrl.ts'
import { ExecutionTrace } from './ExecutionTrace.tsx'
import { ExecutionActions } from './ExecutionActions.tsx'
import { drawableTrace, intensityWord, isCompared } from '../trace-geometry.ts'

/**
 * Planned against done. The strip answers "did it sit" in a glance; the rows
 * behind the disclosure answer "where did it slip". Neither uses red and green:
 * against this app's amber they fail colour-blind separation, and the data amber
 * and the error red are close enough to be confused with full colour vision too.
 * A hit is a filled block, a miss a hollow one, and the direction is a symbol.
 */

type Props = {
  readonly activityId: string
  readonly templateId: string
  readonly date: string
}

const SYMBOL = { on: '✓', over: '↑', under: '↓' } as const
const WORDS = { on: 'im Ziel', over: 'zu hart', under: 'zu leicht' } as const

const clock = (seconds: number): string => {
  const rounded = Math.round(seconds)
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, '0')}`
}

/* ------------------------------------------------------------------ strip */

const WIDTH = 320
const HEIGHT = 46
const GAP = 1.1
const CEILING = 130

const Strip = ({
  segments,
  steps,
  done,
}: {
  readonly segments: readonly ExecutionSegment[]
  readonly steps: readonly ExecutedStep[]
  readonly done: string
}) => {
  const total = segments.reduce((sum, segment) => sum + segment.seconds, 0)
  if (total === 0) return null
  const ceiling = Math.max(CEILING, ...segments.map((segment) => segment.percent))

  let cursor = 0
  let work = 0
  const drawn = segments.map((segment, index) => {
    const x = cursor
    const width = (segment.seconds / total) * WIDTH
    cursor += width
    const height = Math.max(1.5, (segment.percent / ceiling) * (HEIGHT - 4))
    const step = segment.state === 'rest' ? undefined : steps[work++]
    return { segment, index, x, width: Math.min(width, Math.max(0.35, width - GAP)), height, step, centre: x + width / 2 }
  })

  const hit = steps.filter((step) => step.verdict === 'on').length
  const spoken = `${steps.length} Intervalle geplant, ${hit} im Zielbereich`

  return (
    <div className={steps.length > 0 ? 'exec__strip' : 'exec__strip exec__strip--plain'}>
      <div className="exec__marks" aria-hidden="true">
        {drawn
          .filter((entry) => entry.step?.verdict)
          .map((entry) => (
            <span key={entry.index} className="exec__mark" style={{ left: `${(entry.centre / WIDTH) * 100}%` }}>
              {SYMBOL[entry.step!.verdict!]}
            </span>
          ))}
      </div>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT + 2}`} preserveAspectRatio="none" className="exec__svg" role="img" aria-label={spoken}>
        {drawn.map(({ segment, index, x, width, height, step }) => {
          const y = HEIGHT - height
          const title = step
            ? `Intervall ${step.index}: ${
                step.verdict ? `${step.actualPercent} % (${WORDS[step.verdict]})` : `nicht ${done}`
              }, ${step.actualSeconds === null ? '–' : clock(step.actualSeconds)} von ${clock(step.plannedSeconds)}${
                step.pieces > 1 ? ', mit Unterbrechung' : ''
              }`
            : segment.label ?? 'Pause'
          if (segment.state === 'rest') {
            return (
              <rect key={index} x={x} y={y} width={width} height={height} className="exec__rest">
                <title>{title}</title>
              </rect>
            )
          }
          return (
            <g key={index}>
              <title>{title}</title>
              <rect x={x} y={y} width={width} height={height} className="exec__missing" />
              {segment.state !== 'missing' && (
                <rect
                  x={x}
                  y={y}
                  width={width * segment.done}
                  height={height}
                  className={segment.state === 'on' ? 'exec__hit' : 'exec__off'}
                />
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

/* ------------------------------------------------------------------- rows */

/** One axis for every row, or a band that moves between rows reads as a different target. */
const axisFor = (steps: readonly ExecutedStep[]): { readonly from: number; readonly to: number } => {
  const values = steps.flatMap((step) => [step.low, step.high, step.actualPercent ?? step.low])
  const from = Math.floor((Math.min(...values) - 4) / 5) * 5
  const to = Math.ceil((Math.max(...values) + 4) / 5) * 5
  return { from, to: Math.max(to, from + 10) }
}

const Rows = ({ steps, done }: { readonly steps: readonly ExecutedStep[]; readonly done: string }) => {
  const axis = axisFor(steps)
  const at = (percent: number) => ((percent - axis.from) / (axis.to - axis.from)) * 100

  return (
    <>
      <ol className="exec__rows">
        {steps.map((step) => {
          const verdict = step.verdict
          return (
            <li key={step.index} className="exec__row">
              <span className="exec__index readout">{step.index}</span>
              <span className="exec__track" aria-hidden="true">
                <span className="exec__band" style={{ left: `${at(step.low)}%`, width: `${at(step.high) - at(step.low)}%` }} />
                {step.actualPercent !== null && (
                  <span
                    className={`exec__dot ${verdict === 'on' ? 'exec__dot--on' : ''}`}
                    style={{ left: `${Math.min(100, Math.max(0, at(step.actualPercent)))}%` }}
                  />
                )}
              </span>
              <span className="exec__value readout">
                {step.actualPercent === null
                  ? `nicht ${done}`
                  : `${step.actualValue ?? ''} · ${step.actualPercent} %`}
                {verdict && <b> {SYMBOL[verdict]}</b>}
              </span>
              <span className="exec__time">
                <span className="exec__meter">
                  <span style={{ width: `${Math.min(100, ((step.actualSeconds ?? 0) / step.plannedSeconds) * 100)}%` }} />
                </span>
                <span className="readout">
                  {step.actualSeconds === null ? '–' : clock(step.actualSeconds)} / {clock(step.plannedSeconds)}
                </span>
              </span>
              <span className="exec__word">
                {verdict ? WORDS[verdict] : ''}
                {step.pieces > 1 ? ', mit Unterbrechung' : ''}
                {step.cutShort ? ', abgebrochen' : ''}
              </span>
            </li>
          )
        })}
      </ol>
      <div className="exec__scale readout" aria-hidden="true">
        <span>{axis.from} %</span>
        <span>{axis.to} %</span>
      </div>
    </>
  )
}

/* ------------------------------------------------------------------- card */

/** Races have no blocks to meet, and an unknown proposal has nothing to compare against. */
export const comparable = (templateId: string | null): templateId is string =>
  templateId !== null && templateId !== ZRL_TEMPLATE_ID

export const ExecutionCard = ({ activityId, templateId, date }: Props) => {
  const [execution, setExecution] = useState<Execution | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let current = true
    getExecution(activityId, templateId, date)
      .then((result) => current && setExecution(result))
      .catch(() => current && setFailed(true))
    return () => {
      current = false
    }
  }, [activityId, templateId, date])

  if (failed) return <p className="exec__quiet">Soll-Ist-Vergleich gerade nicht verfügbar.</p>
  if (!execution) return <p className="exec__quiet">Soll-Ist-Vergleich wird geladen…</p>
  return (
    <>
      <ExecutionView execution={execution} />
      <ExecutionActions execution={execution} activityId={activityId} templateId={templateId} date={date} />
    </>
  )
}

/** The comparison itself, apart from loading it — so it can be rendered and checked as it is. */
export const ExecutionView = ({ execution }: { readonly execution: Execution }) => {
  const { steps } = execution
  const done = SPORT_DONE[execution.sport]
  const compared = isCompared(execution)
  const trace = drawableTrace(execution)
  // What was not done has no place on the clock, so it is named instead.
  const undone = steps.filter((step) => step.actualSeconds === null)
  // Over-unders carry several targets; one label would then name only the first.
  const first = steps[0]
  const band =
    first && steps.every((step) => step.low === first.low && step.high === first.high)
      ? `Ziel ${first.low}–${first.high} %`
      : ''

  return (
    <section className="exec" aria-label={`Soll und Ist: ${execution.templateName}`}>
      <dl className="exec__kpis">
        {compared ? (
          <>
            <div>
              <dt>Im Zielbereich</dt>
              <dd>
                {clock(execution.inTargetSeconds)}
                <small> von {clock(execution.workPlannedSeconds)}</small>
              </dd>
            </div>
            <div>
              <dt>Intervallzeit</dt>
              <dd>
                {clock(execution.workDoneSeconds)}
                <small> von {clock(execution.workPlannedSeconds)}</small>
              </dd>
            </div>
          </>
        ) : (
          <div>
            <dt>Dauer</dt>
            <dd>
              {Math.round(execution.duration.actual / 60)}
              <small> von {Math.round(execution.duration.planned / 60)} min</small>
            </dd>
          </div>
        )}
        <div>
          <dt>Belastung</dt>
          <dd>
            {execution.load.actual}
            <small> von {execution.load.planned} TSS</small>
          </dd>
        </div>
      </dl>

      {trace ? (
        <ExecutionTrace execution={execution} trace={trace} compared={compared} />
      ) : (
        <Strip segments={execution.segments} steps={compared ? steps : []} done={done} />
      )}
      {trace && compared && undone.length > 0 && (
        <p className="exec__note">
          Nicht {done}: Intervall {undone.map((step) => step.index).join(', ')}.
        </p>
      )}

      {execution.unavailable && <p className="exec__note">{execution.unavailable}</p>}
      {execution.mismatch && (
        <p className="exec__note">
          Erkannt wurden {execution.mismatch.detected} Intervalle, geplant waren{' '}
          {execution.mismatch.planned} — zugeordnet nach Reihenfolge und Dauer
          {execution.mismatch.detected > execution.mismatch.planned
            ? '; was zu keinem geplanten passte, bleibt außen vor.'
            : '.'}
        </p>
      )}

      {trace && (
        <p className="exec__legend">
          {compared && (
            <>
              <span><i className="exec__key exec__key--band" /> Zielkorridor</span>
              <span><i className="exec__key exec__key--inband" /> Zeit im Korridor</span>
            </>
          )}
          <span>
            <i className="exec__key exec__key--line" /> {intensityWord(execution.metric)},{' '}
            {trace.smoothing}-s-Mittel
          </span>
          {trace.points.some((point) => point.heartRate !== null) && (
            <span><i className="exec__key exec__key--pulse" /> Puls</span>
          )}
        </p>
      )}
      {compared && (
        <>
          {!trace && (
            <p className="exec__legend">
              <span><i className="exec__key exec__key--hit" /> im Ziel</span>
              <span><i className="exec__key exec__key--off" /> daneben</span>
              <span><i className="exec__key exec__key--missing" /> nicht {done}</span>
            </p>
          )}
          <details className="disclose exec__more">
            <summary>
              Intervall für Intervall <span className="readout">{band}</span>
            </summary>
            <Rows steps={steps} done={done} />
          </details>
        </>
      )}
    </section>
  )
}
