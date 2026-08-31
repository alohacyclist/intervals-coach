import type { TrainingState } from '../../coach/types.ts'

const READINESS_LABEL: Record<TrainingState['readiness']['score'], string> = {
  green: 'Bereit',
  amber: 'Eingeschränkt',
  red: 'Erholung nötig',
}

type Props = {
  readonly state: TrainingState
  readonly onRefresh: () => void
  readonly onSettings: () => void
  readonly busy: boolean
}

export const StateHeader = ({ state, onRefresh, onSettings, busy }: Props) => (
  <header className="header">
    <div className="header__top">
      <h1>Intervals Coach</h1>
      <div className="header__actions">
        <button type="button" onClick={onSettings}>
          Einstellungen
        </button>
        <button type="button" onClick={onRefresh} disabled={busy}>
          {busy ? 'Lädt…' : 'Aktualisieren'}
        </button>
      </div>
    </div>

    <div className={`chip chip--${state.readiness.score}`}>
      {READINESS_LABEL[state.readiness.score]}
    </div>

    <dl className="metrics">
      <div>
        <dt>Fitness (CTL)</dt>
        <dd>{state.overall.ctl}</dd>
      </div>
      <div>
        <dt>Ermüdung (ATL)</dt>
        <dd>{state.overall.atl}</dd>
      </div>
      <div>
        <dt>Form (TSB)</dt>
        <dd>{state.overall.tsb}</dd>
      </div>
      <div>
        <dt>Rampe / Woche</dt>
        <dd>{state.rampRate > 0 ? `+${state.rampRate}` : state.rampRate}</dd>
      </div>
      <div>
        <dt>Load 7 Tage</dt>
        <dd>{state.loadLast7}</dd>
      </div>
      <div>
        <dt>Hart diese Woche</dt>
        <dd>{state.hardSessionsThisWeek}</dd>
      </div>
    </dl>

    <div className="metrics metrics--sport">
      <div>
        <dt>Rad · letzte harte Einheit</dt>
        <dd>{state.daysSinceHard.Ride >= 99 ? '—' : `vor ${state.daysSinceHard.Ride} T.`}</dd>
      </div>
      <div>
        <dt>Lauf · letzte harte Einheit</dt>
        <dd>{state.daysSinceHard.Run >= 99 ? '—' : `vor ${state.daysSinceHard.Run} T.`}</dd>
      </div>
    </div>
  </header>
)
