import { useEffect, useState, type CSSProperties } from 'react'

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

/**
 * Where the work of a lengthened session may begin, in quarter hours: the first stop is
 * right after the warm-up, the last the latest the added base allows.
 */
export const coreStartStops = (latest: number): readonly (number | undefined)[] => {
  const count = Math.max(0, Math.floor(latest / STEP) - 1)
  return [undefined, ...Array.from({ length: count }, (_unused, index) => (index + 2) * STEP)]
}

export const hoursLabel = (minutes: number): string => {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return `${rest} min`
  return rest === 0 ? `${hours} h` : `${hours} h ${String(rest).padStart(2, '0')}`
}

type StopSliderProps = {
  readonly id: string
  readonly label: string
  /** The first stop is the resting point and stands for undefined. */
  readonly stops: readonly (number | undefined)[]
  readonly restingLabel: string
  /** Called once the slider rests. */
  readonly onSettled: (value: number | undefined) => void
}

/**
 * A choice among stops as a slider rather than a row of buttons. The plan is asked
 * again only once the slider rests.
 */
const StopSlider = ({ id, label, stops, restingLabel, onSettled }: StopSliderProps) => {
  const [value, setValue] = useState<number | undefined>(undefined)
  const [settled, setSettled] = useState<number | undefined>(undefined)

  useEffect(() => {
    if (value === settled) return
    const timer = window.setTimeout(() => {
      setSettled(value)
      onSettled(value)
    }, SETTLE_MS)
    return () => window.clearTimeout(timer)
  }, [value, settled, onSettled])

  const index = value === undefined ? 0 : Math.max(0, stops.indexOf(value))
  const text = value === undefined ? restingLabel : hoursLabel(value)
  const fill = { '--fill': stops.length > 1 ? index / (stops.length - 1) : 0 } as CSSProperties

  return (
    <div className="intent more-time">
      <label className="intent__label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type="range"
        min={0}
        max={stops.length - 1}
        step={1}
        value={index}
        aria-valuetext={text}
        style={fill}
        onChange={(event) => setValue(stops[Number(event.target.value)])}
      />
      <span className="more-time__value readout" aria-hidden="true">
        {text}
      </span>
    </div>
  )
}

/**
 * How much time today has, as a slider rather than a handful of buttons: the
 * time an athlete has is whatever it is, not one of four answers.
 */
export const MoreTimeSlider = ({
  usual,
  onSettled,
}: {
  /** The usual ceiling: the slider's resting point, meaning "as always". */
  readonly usual: number
  /** Undefined is the usual time. */
  readonly onSettled: (minutes: number | undefined) => void
}) => (
  <StopSlider
    id="more-time"
    label="Zeit"
    stops={[undefined, ...moreTimeStops(usual).slice(1)]}
    restingLabel="wie immer"
    onSettled={onSettled}
  />
)

/**
 * On a longer day the added base goes after the work unless the athlete would rather
 * ride in first: then the work begins at the minute set here.
 */
export const CoreStartSlider = ({
  latest,
  onSettled,
}: {
  /** The latest minute the work can begin with all the added base in front of it. */
  readonly latest: number
  /** Undefined is right after the warm-up. */
  readonly onSettled: (minute: number | undefined) => void
}) => (
  <StopSlider
    id="core-start"
    label="Kern ab"
    stops={coreStartStops(latest)}
    restingLabel="direkt"
    onSettled={onSettled}
  />
)
