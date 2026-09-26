import type { FamilyLevel } from '../../coach/types.ts'
import { SPORT_LABELS } from '../../coach/types.ts'

/**
 * The ladder the engine has always climbed, finally shown.
 *
 * `levelFor` returns the level currently ON OFFER — one above the highest one
 * cleared, capped by what the family has. So standing on the top rung means
 * the hardest version is being offered, not that it is already done, and the
 * wording here has to say "angeboten" rather than "erreicht".
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
          {levels.filter((entry) => entry.level > 1).length} von {levels.length} gesteigert
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
            aria-label={`Stufe ${entry.level} von ${entry.top} angeboten`}
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
              ? `${entry.current ?? '—'} · oberste Stufe`
              : entry.next
                ? `${entry.current ?? '—'} → ${entry.next}`
                : (entry.current ?? '—')}
          </span>
        </div>
      ))}

      {/* The rule once for all rungs, instead of once in every one. */}
      <p className="ladder__rule">
        Die nächste Stufe wird frei, wenn die angebotene Einheit sauber und vollständig absolviert
        ist. Auf der obersten steigern sich die Einheiten über die Schwellenwerte.
      </p>
    </section>
  )
}
