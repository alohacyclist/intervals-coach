import { useEffect, useState, type CSSProperties } from 'react'

type Props = {
  /** The usual ceiling: the slider's resting point, meaning "as always". */
  readonly usual: number
  /** Called once the slider rests; undefined is the usual time. */
  readonly onSettled: (minutes: number | undefined) => void
}

/** From the usual ceiling up to five hours, in quarter hours. */
const STEP = 15
const LONGEST = 300
/** Long enough to drag past a few stops without loading the plan for each. */
const SETTLE_MS = 450

export const moreTimeStops = (usual: number): readonly number[] => {
  const first = Math.floor(usual / STEP) * STEP + STEP
  const count = Math.max(0, Math.floor((LONGEST - first) / STEP) + 1)
  return [usual, ...Array.from({ length: count }, (_unused, index) => first + index * STEP)]
}

export const hoursLabel = (minutes: number): string => {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return `${rest} min`
  return rest === 0 ? `${hours} h` : `${hours} h ${String(rest).padStart(2, '0')}`
}

/**
 * How much time today has, as a slider rather than a handful of buttons: the
 * time an athlete has is whatever it is, not one of four answers. The plan is
 * asked again only once the slider rests.
 */
export const MoreTimeSlider = ({ usual, onSettled }: Props) => {
  const [minutes, setMinutes] = useState<number | undefined>(undefined)
  const [settled, setSettled] = useState<number | undefined>(undefined)

  useEffect(() => {
    if (minutes === settled) return
    const timer = window.setTimeout(() => {
      setSettled(minutes)
      onSettled(minutes)
    }, SETTLE_MS)
    return () => window.clearTimeout(timer)
  }, [minutes, settled, onSettled])

  const stops = moreTimeStops(usual)
  const index = minutes === undefined ? 0 : Math.max(0, stops.indexOf(minutes))
  const label = minutes === undefined ? 'wie immer' : hoursLabel(minutes)
  const fill = { '--fill': stops.length > 1 ? index / (stops.length - 1) : 0 } as CSSProperties

  return (
    <div className="intent more-time">
      <label className="intent__label" htmlFor="more-time">
        Zeit
      </label>
      <input
        id="more-time"
        type="range"
        min={0}
        max={stops.length - 1}
        step={1}
        value={index}
        aria-valuetext={label}
        style={fill}
        onChange={(event) => {
          const next = stops[Number(event.target.value)]
          setMinutes(next === undefined || next <= usual ? undefined : next)
        }}
      />
      <span className="more-time__value readout" aria-hidden="true">
        {label}
      </span>
    </div>
  )
}
