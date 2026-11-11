import { useEffect, useState } from 'react'
import type { ExecutedStep, Execution, ExecutionSegment, RideEstimate } from '../../coach/types.ts'
import { SPORT_DONE } from '../../coach/types.ts'
import { getExecution } from '../api.ts'
import { ZRL_TEMPLATE_ID } from '../../coach/zrl.ts'
import { ExecutionTrace } from './ExecutionTrace.tsx'
import { ExecutionActions } from './ExecutionActions.tsx'
import { drawableTrace, intensityWord, isCompared } from '../trace-geometry.ts'
import { GarminDevice } from './GarminAttribution.tsx'
import { HeartCorrection } from './HeartCorrection.tsx'
import { t } from '../../coach/lang.ts'

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
const WORDS = { on: t('im Ziel'), over: t('zu hart'), under: t('zu leicht') } as const

const clock = (seconds: number): string => {
  const rounded = Math.round(seconds)
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, '0')}`
}

/* ---------------------------------------------------------- estimated sets */

const VERDICT = {
  found: { mark: '■', word: 'erkannt' },
  unclear: { mark: '◧', word: t('nicht eindeutig') },
  missing: { mark: '□', word: t('nicht gefunden') },
} as const

/**
 * A ride without power: where its sets lay, read from speed and the climb. The
 * watts are an estimate — wind and position are unknown — so they are rounded
 * and never compared against the corridor like measured ones.
 */
const EstimatedSets = ({ estimate }: { readonly estimate: RideEstimate }) => {
  const found = estimate.blocks.filter((block) => block.verdict === 'found').length
  return (
    <div className="exec__estimate">
      <p className="exec__note">
        {t('Ohne Watt und Puls aufgezeichnet. Belastung und Sätze sind aus Tempo und Höhenprofil geschätzt')}
        {estimate.blocks.length > 0 && (
          <>
            {' '}— <strong>{found}{t(' von ')}{estimate.blocks.length}{t(' Sätzen erkannt')}</strong>
          </>
        )}
        .
      </p>
      {estimate.blocks.length > 0 && (
        <ol className="exec__estimate-sets">
          {estimate.blocks.map((block, index) => (
            <li key={block.startSecond}>
              <span aria-hidden="true">{VERDICT[block.verdict].mark}</span>{t(' Satz ')}{index + 1}{t(' ab')}{' '}
              <span className="readout">{clock(block.startSecond)}</span>: {VERDICT[block.verdict].word}
              {block.verdict !== 'missing' && (
                <span className="readout">
                  {' '}
                  · ~{Math.round(block.workWatts / 5) * 5} W / ~{Math.round(block.restWatts / 5) * 5} W
                  <small>{t(' (Ziel ')}{block.targetWatts} W)</small>
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
      <p className="exec__legend">
        <span>{t('Wind und Sitzposition sind unbekannt: bei Wind können die Watt um ein Drittel daneben liegen, die Lage der Sätze kaum.')}</span>
      </p>
    </div>
  )
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
  const spoken = t`${steps.length} Intervalle geplant, ${hit} im Zielbereich`

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
            ? t`Intervall ${step.index}: ${
                step.verdict ? `${step.actualPercent} % (${WORDS[step.verdict]})` : t`nicht ${done}`
              }, ${step.actualSeconds === null ? '–' : clock(step.actualSeconds)} von ${clock(step.plannedSeconds)}${
                step.pieces > 1 ? t(', mit Unterbrechung') : ''
              }`
            : segment.label ?? t('Pause')
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
                  ? t`nicht ${done}`
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
                {step.pieces > 1 ? t(', mit Unterbrechung') : ''}
                {step.cutShort ? t(', abgebrochen') : ''}
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

  if (failed) return <p className="exec__quiet">{t('Soll-Ist-Vergleich gerade nicht verfügbar.')}</p>
  if (!execution) return <p className="exec__quiet">{t('Soll-Ist-Vergleich wird geladen…')}</p>
  return (
    <>
      <ExecutionView execution={execution} />
      {execution.heart && (
        <HeartCorrection heart={execution.heart} activityId={activityId} templateId={templateId} date={date} />
      )}
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
      ? t`Ziel ${first.low}–${first.high} %`
      : ''

  return (
    <section className="exec" aria-label={t`Soll und Ist: ${execution.templateName}`}>
      <GarminDevice device={execution.garmin} />
      <dl className="exec__kpis">
        {compared ? (
          <>
            <div>
              <dt>{t('Im Zielbereich')}</dt>
              <dd>
                {clock(execution.inTargetSeconds)}
                <small>{t(' von ')}{clock(execution.workPlannedSeconds)}</small>
              </dd>
            </div>
            <div>
              {/* A soft hyphen: one word this long does not fit a third of a phone. */}
              <dt>{t('Inter­vall­zeit')}</dt>
              <dd>
                {clock(execution.workDoneSeconds)}
                <small>{t(' von ')}{clock(execution.workPlannedSeconds)}</small>
              </dd>
            </div>
          </>
        ) : (
          <div>
            <dt>{t('Dauer')}</dt>
            <dd>
              {Math.round(execution.duration.actual / 60)}
              <small>{t(' von ')}{Math.round(execution.duration.planned / 60)}{t(' min')}</small>
            </dd>
          </div>
        )}
        <div>
          <dt>{t('Belastung')}</dt>
          <dd>
            {execution.load.actual}
            <small>{t(' von ')}{execution.load.planned}{t(' TSS')}</small>
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
          {t`Nicht ${done}: Intervall ${undone.map((step) => step.index).join(', ')}.`}
        </p>
      )}

      {execution.unavailable && !execution.estimate && <p className="exec__note">{execution.unavailable}</p>}
      {execution.estimate && <EstimatedSets estimate={execution.estimate} />}
      {execution.heart && <p className="exec__note exec__note--heart">{execution.heart.message}</p>}
      {execution.benchmark && (
        <p className="exec__benchmark">
          <strong
            className={
              execution.benchmark.verdict === 'better'
                ? 'history__ok'
                : execution.benchmark.verdict === 'worse'
                  ? 'history__miss'
                  : ''
            }
          >
            {t('Formkontrolle:')}
          </strong>{' '}
          {execution.benchmark.message}
        </p>
      )}

      {trace && (
        <p className="exec__legend">
          {compared && (
            <>
              <span><i className="exec__key exec__key--band" />{t(' Zielkorridor')}</span>
              <span><i className="exec__key exec__key--inband" />{t(' Zeit im Korridor')}</span>
            </>
          )}
          <span>
            <i className="exec__key exec__key--line" /> {intensityWord(execution.metric)},{' '}
            {trace.smoothing}{t('-s-Mittel')}
          </span>
          {trace.points.some((point) => point.heartRate !== null && !point.heartEstimated) && (
            <span><i className="exec__key exec__key--pulse" />{t(' Puls')}</span>
          )}
          {trace.points.some((point) => point.heartEstimated) && (
            <span><i className="exec__key exec__key--estimated" />{t(' Puls geschätzt')}</span>
          )}
        </p>
      )}
      {compared && (
        <>
          {!trace && (
            <p className="exec__legend">
              <span><i className="exec__key exec__key--hit" />{t(' im Ziel')}</span>
              <span><i className="exec__key exec__key--off" />{t(' daneben')}</span>
              <span><i className="exec__key exec__key--missing" />{' '}{t`nicht ${done}`}</span>
            </p>
          )}
          <details className="disclose exec__more">
            <summary>
              {t('Intervall für Intervall ')}<span className="readout">{band}</span>
            </summary>
            <Rows steps={steps} done={done} />
          </details>
        </>
      )}
    </section>
  )
}
