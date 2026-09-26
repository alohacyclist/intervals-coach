import { useState } from 'react'
import type { PointerEvent } from 'react'
import type { Execution, ExecutionTrace as Trace } from '../../coach/types.ts'
import {
  areaPath,
  ceilingFor,
  clock,
  corridorLabel,
  corridorsOf,
  heartLine,
  heartRange,
  heightOf,
  intensityLine,
  intensityWord,
  linePath,
  timeTicks,
  valueText,
} from '../trace-geometry.ts'

/**
 * The session over time: what was ridden or run as a line in front of the
 * target corridors, heart rate in its own strip below. The corridor fills where
 * the line sat inside it — filled means hit, as everywhere else on this card —
 * so a hot start, a stop at the lights and a fade at the end each show as a
 * hole. The ground under the line goes first, so it never hides a corridor, and
 * the line last, so it reads through the filled part.
 *
 * Drawn in a 1000 × 100 box stretched to the card, like the strip it replaces;
 * text stays HTML so it is never stretched with it.
 */

const W = 1000
const H = 100

type Props = { readonly execution: Execution; readonly trace: Trace; readonly compared: boolean }

const at = (seconds: number, total: number): number => (seconds / total) * W
const percentAt = (seconds: number, total: number): string => `${(seconds / total) * 100}%`

export const ExecutionTrace = ({ execution, trace, compared }: Props) => {
  const [cursor, setCursor] = useState<number | null>(null)
  const total = trace.seconds
  const ceiling = ceilingFor(execution.steps)
  const y = (percent: number): number => H - heightOf(percent, ceiling) * H
  const corridors = compared ? corridorsOf(execution.steps, trace) : []
  const hearts = heartRange(trace)
  const intensity = intensityLine(trace, ceiling)
  const line = linePath(intensity, W, H)
  const hit = corridors.filter((corridor) => corridor.step.verdict === 'on').length

  const follow = (event: PointerEvent<HTMLElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    const share = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width))
    setCursor(Math.min(trace.points.length - 1, Math.round((share * total) / trace.step)))
  }

  const point = cursor === null ? null : trace.points[cursor]
  const readout = point
    ? [
        clock(point.seconds),
        valueText(point.value, execution.metric),
        point.percent === null ? null : `${point.percent} %`,
        point.heartRate === null ? null : `♥ ${point.heartRate}`,
      ]
        .filter(Boolean)
        .join(' · ')
    : null

  const spoken =
    `${intensityWord(execution.metric)} über ${Math.round(total / 60)} Minuten` +
    (corridors.length > 0 ? `, ${hit} von ${corridors.length} Intervallen im Zielbereich` : '')

  return (
    <figure
      className="trace"
      onPointerMove={follow}
      onPointerDown={follow}
      onPointerLeave={() => setCursor(null)}
    >
      <div className="trace__labels" aria-hidden="true">
        {corridors.map((corridor) => (
          <span
            key={corridor.step.index}
            className="trace__label readout"
            style={{ left: percentAt((corridor.from + corridor.to) / 2, total) }}
          >
            {corridorLabel(corridor, total)}
          </span>
        ))}
      </div>

      <div className="trace__plot">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={spoken}>
          {[50, 100].map((percent) => (
            <line
              key={percent}
              x1="0"
              x2={W}
              y1={y(percent)}
              y2={y(percent)}
              className={percent === 100 ? 'trace__grid trace__grid--threshold' : 'trace__grid'}
            />
          ))}
          <path d={areaPath(intensity, W, H)} className="trace__area" />
          {corridors.map((corridor) => (
            <g key={corridor.step.index}>
              <rect
                x={at(corridor.from, total)}
                y={y(corridor.step.high)}
                width={at(corridor.to - corridor.from, total)}
                height={y(corridor.step.low) - y(corridor.step.high)}
                className="trace__band"
              />
              {corridor.runs.map((run) => (
                <rect
                  key={run.from}
                  x={at(run.from, total)}
                  y={y(corridor.step.high)}
                  width={at(run.to - run.from, total)}
                  height={y(corridor.step.low) - y(corridor.step.high)}
                  className="trace__hit"
                />
              ))}
            </g>
          ))}
          <path d={line} className="trace__line" />
        </svg>
        <span className="trace__tick readout" style={{ top: `${y(100)}%` }}>
          100 %
        </span>
        <span className="trace__tick readout" style={{ top: `${y(50)}%` }}>
          50 %
        </span>
        {point && <span className="trace__cursor" style={{ left: percentAt(point.seconds, total) }} />}
      </div>

      {hearts && (
        <div className="trace__heart">
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
            {corridors.map((corridor) => (
              <rect
                key={corridor.step.index}
                x={at(corridor.from, total)}
                y="0"
                width={at(corridor.to - corridor.from, total)}
                height={H}
                className="trace__shade"
              />
            ))}
            <path d={linePath(heartLine(trace, hearts), W, H)} className="trace__pulse" />
          </svg>
          <span className="trace__tick trace__tick--top readout">{hearts.high}</span>
          <span className="trace__tick trace__tick--bottom readout">{hearts.low}</span>
          {corridors
            .filter((corridor) => corridor.step.heartRate !== null)
            .map((corridor) => (
              <span
                key={corridor.step.index}
                className="trace__beat readout"
                style={{ left: percentAt((corridor.from + corridor.to) / 2, total) }}
              >
                ♥{corridor.step.heartRate}
              </span>
            ))}
          {point && <span className="trace__cursor" style={{ left: percentAt(point.seconds, total) }} />}
        </div>
      )}

      <div className="trace__axis readout" aria-hidden="true">
        {timeTicks(total).map((minute, index, all) => (
          <span
            key={minute}
            className={
              index === 0 ? 'trace__time trace__time--first' : index === all.length - 1 ? 'trace__time trace__time--last' : 'trace__time'
            }
            style={{ left: percentAt(minute * 60, total) }}
          >
            {index === all.length - 1 ? `${minute} min` : minute}
          </span>
        ))}
      </div>

      <figcaption className={readout ? 'trace__readout readout' : 'trace__readout trace__readout--hint readout'}>
        {readout ?? 'Tippen oder darüberfahren für Werte'}
      </figcaption>
    </figure>
  )
}
