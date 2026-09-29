import type { ReadinessScore } from '../../coach/types.ts'

type Props = {
  /** One sentence on how the athlete stands and what that means for today. */
  readonly summary: string
  readonly readiness: ReadinessScore
  readonly onRefresh: () => void
  readonly onSettings: () => void
  readonly busy: boolean
}

/** The numbers behind the sentence live in the Kennzahlen panel below today's session. */
export const StateHeader = ({ summary, readiness, onRefresh, onSettings, busy }: Props) => (
  <header className="header">
    <div className="header__top">
      <h1>Formkurve</h1>
      <div className="header__actions">
        <button type="button" onClick={onSettings}>
          Einstellungen
        </button>
        <button type="button" onClick={onRefresh} disabled={busy}>
          {busy ? 'Lädt…' : 'Aktualisieren'}
        </button>
      </div>
    </div>
    <p className={`header__summary header__summary--${readiness}`}>{summary}</p>
  </header>
)
