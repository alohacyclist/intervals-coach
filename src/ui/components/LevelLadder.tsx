import type { FamilyLevel } from '../../coach/types.ts'
import { SPORT_LABELS } from '../../coach/types.ts'

/**
 * The ladder the engine has always climbed, finally shown. A level is earned by
 * completing the full version of a session closely enough, which is why a
 * trimmed week does not move a rung.
 */

type Props = {
  readonly levels: readonly FamilyLevel[]
}

export const LevelLadder = ({ levels }: Props) => {
  if (levels.length === 0) return null

  return (
    <section className="ladder">
      <div className="ladder__head">
        <h2>Stufen</h2>
        <span className="ladder__hint readout">
          {levels.filter((entry) => entry.level >= entry.top).length} von {levels.length}{' '}
          ausgereizt
        </span>
      </div>

      {levels.map((entry) => (
        <div key={entry.family} className="rung">
          <span className={`badge badge--${entry.sport.toLowerCase()}`}>
            {SPORT_LABELS[entry.sport]}
          </span>
          <span className="rung__name">{entry.label}</span>

          <span
            className="pips"
            role="img"
            aria-label={`Stufe ${entry.level} von ${entry.top}`}
          >
            {Array.from({ length: entry.top }, (_, index) => (
              <i
                key={index}
                className={`pip ${index < entry.level ? 'pip--on' : ''}`}
              />
            ))}
          </span>

          <span className="rung__state readout">
            {entry.level} / {entry.top}
          </span>

          <span className="rung__next">
            {entry.level >= entry.top
              ? `Höchste Stufe: ${entry.current ?? '—'}. Weiter geht es über die Schwellenwerte.`
              : entry.next
                ? `Aktuell ${entry.current ?? '—'}. Eine saubere Absolvierung bis „${entry.next}“.`
                : `Aktuell ${entry.current ?? '—'}.`}
          </span>
        </div>
      ))}
    </section>
  )
}
