import type { FamilyLevel } from '../../coach/types.ts'
import { SportIcon } from './SportIcon.tsx'
import { t } from '../../coach/lang.ts'

/**
 * The ladder the engine has always climbed, finally shown.
 *
 * `levelFor` returns the level currently ON OFFER — one above the highest one
 * cleared, capped by what the family has. So standing on the top rung means
 * the hardest version is being offered, not that it is already done, and the
 * wording here has to say "angeboten" rather than "erreicht".
 *
 * Every rung can also be chosen: the intervals cannot always be read, and the
 * athlete may know better — up or down. "Auto" hands the family back.
 */

type Props = {
  readonly levels: readonly FamilyLevel[]
  /** Without it the ladder only shows; with it every level can be chosen. */
  readonly onChoose?: (family: string, level: number | null) => void
  /** The family whose choice is being saved. */
  readonly saving?: string | null
}

const stateText = (entry: FamilyLevel): string => {
  const name = entry.current ?? '—'
  const where =
    entry.level >= entry.top
      ? t`${name} · oberste Stufe`
      : entry.next
        ? `${name} → ${entry.next}`
        : name
  if (entry.chosen === null) return where
  return t`${where} · selbst gewählt, erreicht ist Stufe ${entry.earned}`
}

export const LevelLadder = ({ levels, onChoose, saving = null }: Props) => {
  if (levels.length === 0) return null

  return (
    <section className="ladder">
      <div className="ladder__head">
        <h2>{t('Stufen')}</h2>
        <span className="ladder__hint readout">
          {levels.filter((entry) => entry.level > 1).length}{t(' von ')}{levels.length}{t(' gesteigert')}
        </span>
      </div>

      {levels.map((entry) => (
        <div key={entry.family} className="rung">
          <SportIcon sport={entry.sport} />
          <span className="rung__name">{entry.label}</span>

          <span
            className="pips"
            role="img"
            aria-label={t`Stufe ${entry.level} von ${entry.top} angeboten`}
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

          <span className="rung__next">{stateText(entry)}</span>

          {onChoose && entry.top > 1 ? (
            <span className="rung__choose" role="group" aria-label={t`Stufe für ${entry.label} wählen`}>
              <button
                type="button"
                className="rung__pick"
                aria-pressed={entry.chosen === null}
                disabled={saving !== null}
                onClick={() => onChoose(entry.family, null)}
                title={t('Stufe folgt den gelaufenen und gefahrenen Intervallen')}
              >
                {t('Auto')}
              </button>
              {Array.from({ length: entry.top }, (_, index) => index + 1).map((level) => (
                <button
                  key={level}
                  type="button"
                  className="rung__pick"
                  aria-pressed={entry.chosen === level}
                  disabled={saving !== null}
                  onClick={() => onChoose(entry.family, level)}
                >
                  {t('Stufe ')}{level}
                </button>
              ))}
              {saving === entry.family ? <span className="rung__saving readout">{t('speichert…')}</span> : null}
            </span>
          ) : null}
        </div>
      ))}

      {/* The rule once for all rungs, instead of once in every one. */}
      <p className="ladder__rule">
        {t('Die nächste Stufe wird frei, sobald du in einer Einheit jedes Intervall voll und mindestens im Zielbereich fährst. Zu hart gefahren hebt die Schwelle, nicht die Stufe. Auf der obersten steigern sich die Einheiten über die Schwellenwerte. Du kannst die Stufe auch selbst wählen — nach oben wie nach unten; mit „Auto“ entscheiden wieder die Intervalle.')}
      </p>
    </section>
  )
}
