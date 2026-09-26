import type { Execution, ExecutionTrace } from '../coach/types.ts'
import {
  areaPath,
  ceilingFor,
  clock,
  corridorLabel,
  corridorsOf,
  heartLine,
  heartRange,
  heightOf,
  hitCount,
  intensityLine,
  isCompared,
  linePath,
  timeTicks,
} from './trace-geometry.ts'

/**
 * The session as a square picture for the phone's share sheet: Strava takes no
 * images from outside apps, so the athlete adds it there — or to a story — with
 * one tap. Always the dark instrument look: a shared image has no theme to follow.
 */

const SIZE = 1080
const MARGIN = 60
const INK = '#eef2f2'
const DIM = '#8a9594'
const FAINT = '#6b7676'
const DATA = '#ffa62b'
const BAND = 'rgba(125, 136, 135, 0.26)'
const HIT = 'rgba(255, 166, 43, 0.45)'
const RULE = '#1e2526'
const RULE_LOUD = '#2f3839'
const SHADE = '#141a1b'
const FOOTER = 'Geplant und ausgewertet mit intervals-coach'
const MONO = "'IBM Plex Mono', ui-monospace, monospace"
const SANS = "'IBM Plex Sans Condensed', 'Helvetica Neue', Arial, sans-serif"

const PLOT = { x: MARGIN, y: 450, width: SIZE - 2 * MARGIN, height: 310 }
const HEART = { x: MARGIN, y: 790, width: SIZE - 2 * MARGIN, height: 100 }

const WEEKDAYS = ['SO', 'MO', 'DI', 'MI', 'DO', 'FR', 'SA'] as const

export type ShareMeta = { readonly sport: string; readonly date: string }

const dateLine = (meta: ShareMeta): string => {
  const [year, month, day] = meta.date.split('-')
  const weekday = WEEKDAYS[new Date(`${meta.date}T12:00:00Z`).getUTCDay()]
  return `${meta.sport.toUpperCase()} · ${weekday} ${day}.${month}.${year}`
}

const text = (
  context: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  font: string,
  color: string,
  align: CanvasTextAlign = 'left',
) => {
  context.font = font
  context.fillStyle = color
  context.textAlign = align
  context.fillText(value, x, y)
}

/** The largest size up to `start` at which the title fits one line. */
const fittedTitle = (context: CanvasRenderingContext2D, title: string, start: number): number => {
  const sizes = Array.from({ length: start - 39 }, (_, index) => start - index)
  return (
    sizes.find((size) => {
      context.font = `600 ${size}px ${SANS}`
      return context.measureText(title).width <= SIZE - 2 * MARGIN
    }) ?? 40
  )
}

const drawHeader = (context: CanvasRenderingContext2D, execution: Execution, meta: ShareMeta) => {
  text(context, dateLine(meta), MARGIN, 96, `500 24px ${MONO}`, FAINT)
  const size = fittedTitle(context, execution.templateName, 66)
  text(context, execution.templateName, MARGIN, 172, `600 ${size}px ${SANS}`, INK)

  const { hit, planned } = hitCount(execution)
  const figures = isCompared(execution)
    ? [
        ['IM ZIEL', clock(execution.inTargetSeconds), `/ ${clock(execution.workPlannedSeconds)}`],
        ['INTERVALLE', `${hit}/${planned}`, '✓'],
        ['BELASTUNG', String(execution.load.actual), 'TSS'],
      ]
    : [
        ['DAUER', String(Math.round(execution.duration.actual / 60)), 'min'],
        ['BELASTUNG', String(execution.load.actual), 'TSS'],
      ]
  figures.forEach(([label, value, unit], index) => {
    const x = MARGIN + index * 330
    text(context, label!, x, 262, `500 22px ${MONO}`, FAINT)
    text(context, value!, x, 324, `600 58px ${SANS}`, INK)
    const width = context.measureText(value!).width
    text(context, unit!, x + width + 10, 324, `400 28px ${SANS}`, DIM)
  })

  context.fillStyle = RULE_LOUD
  context.fillRect(MARGIN, 372, SIZE - 2 * MARGIN, 2)
}

const drawTrace = (context: CanvasRenderingContext2D, execution: Execution, trace: ExecutionTrace) => {
  const total = trace.seconds
  const ceiling = ceilingFor(execution.steps)
  const x = (seconds: number) => PLOT.x + (seconds / total) * PLOT.width
  const y = (percent: number) => PLOT.y + PLOT.height * (1 - heightOf(percent, ceiling))
  const corridors = isCompared(execution) ? corridorsOf(execution.steps, trace) : []

  context.save()
  ;[50, 100].forEach((percent) => {
    context.strokeStyle = percent === 100 ? RULE_LOUD : RULE
    context.lineWidth = 2
    context.setLineDash(percent === 100 ? [] : [8, 8])
    context.beginPath()
    context.moveTo(PLOT.x, y(percent))
    context.lineTo(PLOT.x + PLOT.width, y(percent))
    context.stroke()
    text(context, `${percent} %`, PLOT.x, y(percent) - 8, `400 22px ${MONO}`, FAINT)
  })
  context.setLineDash([])

  // Ground first, corridors over it, the line last — as on the card.
  const intensity = intensityLine(trace, ceiling)
  context.save()
  context.translate(PLOT.x, PLOT.y)
  context.fillStyle = 'rgba(255, 166, 43, 0.13)'
  context.fill(new Path2D(areaPath(intensity, PLOT.width, PLOT.height)))
  context.restore()

  corridors.forEach((corridor) => {
    const top = y(corridor.step.high)
    const height = y(corridor.step.low) - top
    context.fillStyle = BAND
    context.fillRect(x(corridor.from), top, x(corridor.to) - x(corridor.from), height)
    context.fillStyle = HIT
    corridor.runs.forEach((run) => context.fillRect(x(run.from), top, x(run.to) - x(run.from), height))
    text(context, corridorLabel(corridor, total), (x(corridor.from) + x(corridor.to)) / 2, PLOT.y - 22, `600 26px ${MONO}`, INK, 'center')
  })

  context.translate(PLOT.x, PLOT.y)
  context.strokeStyle = DATA
  context.lineWidth = 4
  context.lineJoin = 'round'
  context.stroke(new Path2D(linePath(intensity, PLOT.width, PLOT.height)))
  context.restore()

  const hearts = heartRange(trace)
  if (hearts) {
    context.save()
    context.fillStyle = SHADE
    corridors.forEach((corridor) => context.fillRect(x(corridor.from), HEART.y, x(corridor.to) - x(corridor.from), HEART.height))
    context.translate(HEART.x, HEART.y)
    context.strokeStyle = DIM
    context.lineWidth = 3
    context.lineJoin = 'round'
    context.stroke(new Path2D(linePath(heartLine(trace, hearts), HEART.width, HEART.height)))
    context.restore()
    corridors
      .filter((corridor) => corridor.step.heartRate !== null)
      .forEach((corridor) =>
        text(context, `♥${corridor.step.heartRate}`, (x(corridor.from) + x(corridor.to)) / 2, HEART.y + HEART.height - 10, `400 22px ${MONO}`, INK, 'center'),
      )
  }

  const ticks = timeTicks(total)
  ticks.forEach((minute, index) => {
    const last = index === ticks.length - 1
    const align: CanvasTextAlign = index === 0 ? 'left' : last ? 'right' : 'center'
    text(context, last ? `${minute} min` : String(minute), x(minute * 60), HEART.y + HEART.height + 38, `400 22px ${MONO}`, FAINT, align)
  })
}

const drawFooter = (context: CanvasRenderingContext2D) => {
  context.fillStyle = RULE
  context.fillRect(MARGIN, 990, SIZE - 2 * MARGIN, 2)
  context.fillStyle = DATA
  context.fillRect(MARGIN, 1022, 18, 18)
  text(context, FOOTER, MARGIN + 32, 1039, `400 22px ${MONO}`, DIM)
}

export const renderShareImage = async (execution: Execution, trace: ExecutionTrace, meta: ShareMeta): Promise<Blob> => {
  // The card's fonts, not the fallback: the canvas only draws faces already loaded.
  await document.fonts.ready
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Dieser Browser kann kein Bild zeichnen')
  context.fillStyle = '#0a0d0e'
  context.fillRect(0, 0, SIZE, SIZE)
  drawHeader(context, execution, meta)
  drawTrace(context, execution, trace)
  drawFooter(context)
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Bild konnte nicht erzeugt werden'))), 'image/png'),
  )
}

/** The share sheet where the phone has one, a plain download everywhere else. */
export const shareImage = async (blob: Blob, name: string): Promise<'shared' | 'saved'> => {
  const file = new File([blob], `${name}.png`, { type: 'image/png' })
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file] })
    return 'shared'
  }
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = file.name
  link.click()
  // Revoked a moment later: some browsers still read the address after the click returns.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return 'saved'
}
