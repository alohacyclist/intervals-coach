import type { ProfileSegment } from '../../coach/types.ts'

/**
 * The workout as a shape. Drawn in viewBox units and stretched to the card's
 * width, so the height stays 52 px on any screen while the time axis fills
 * whatever room there is. Colour marks the hard part; the height carries the
 * exact intensity, because that is what the scale is for.
 */

const WIDTH = 320
const BASE = 46
const TOP = 4
/** A hairline of ground between blocks, so four intervals read as four. */
const GAP = 1.1

type Props = {
  readonly profile: readonly ProfileSegment[]
  readonly minutes: number
}

export const WorkoutProfile = ({ profile, minutes }: Props) => {
  const total = profile.reduce((sum, segment) => sum + segment.seconds, 0)
  if (total === 0) return null

  const peak = Math.max(...profile.map((segment) => segment.percent))
  const hard = profile.filter((segment) => segment.intensity === 'hard').length

  let cursor = 0
  const bars = profile.map((segment, index) => {
    const width = (segment.seconds / total) * WIDTH
    const height = Math.max(1.5, (segment.percent / peak) * (BASE - TOP))
    const bar = {
      key: `${index}-${segment.seconds}`,
      x: cursor,
      // The last block still ends on the edge even after the gap is taken off.
      width: Math.max(0.7, width - GAP),
      y: BASE - height,
      height,
      intensity: segment.intensity,
    }
    cursor += width
    return bar
  })

  const spoken =
    `Profil über ${minutes} Minuten, ${profile.length} Abschnitte, ` +
    `${hard === 0 ? 'keiner davon hart' : `${hard} davon hart`}, Spitze bei ${peak} Prozent der Schwelle.`

  return (
    <figure className="profile">
      <svg
        className="profile__plot"
        viewBox={`0 0 ${WIDTH} ${BASE + 1}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={spoken}
      >
        {bars.map((bar) =>
          bar.intensity === 'moderate' ? (
            // Hollow rather than a third grey: an outline separates at any
            // contrast, where a middle tone stops being distinguishable.
            <rect
              key={bar.key}
              x={bar.x + 0.5}
              y={bar.y + 0.5}
              width={Math.max(0.7, bar.width - 1)}
              height={Math.max(1, bar.height - 1)}
              fill="none"
              stroke="var(--data)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          ) : (
            <rect
              key={bar.key}
              x={bar.x}
              y={bar.y}
              width={bar.width}
              height={bar.height}
              fill={bar.intensity === 'hard' ? 'var(--data)' : 'var(--dim)'}
            />
          ),
        )}
        <line
          x1="0"
          y1={BASE + 0.5}
          x2={WIDTH}
          y2={BASE + 0.5}
          stroke="var(--rule-loud)"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <figcaption className="profile__scale readout">
        <span>{minutes} min</span>
        <span>Spitze {peak} %</span>
      </figcaption>
    </figure>
  )
}
