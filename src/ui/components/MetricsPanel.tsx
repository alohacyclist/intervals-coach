import type { Sport, TrainingState } from '../../coach/types.ts'
import { SPORT_LABELS } from '../../coach/types.ts'
import { signed } from '../../coach/wording.ts'
import { Term } from './Term.tsx'

type Props = {
  readonly state: TrainingState
  readonly sports: readonly Sport[]
}

const NEVER = 99

const lastActivityDay = (daysAgo: number): string =>
  daysAgo === 0 ? ' (heute)' : daysAgo === 1 ? ' (gestern)' : ` (vor ${daysAgo} Tagen)`

/** The raw numbers for whoever wants them; the plan's sentence above already says what they mean. */
export const MetricsPanel = ({ state, sports }: Props) => (
  <details className="disclose kpis">
    <summary>Kennzahlen</summary>

    <dl className="metrics">
      <div>
        <dt>
          <Term term="tsb">Form</Term>
        </dt>
        <dd>{signed(state.overall.tsb)}</dd>
      </div>
      <div>
        <dt>
          <Term term="ctl">Fitness</Term>
        </dt>
        <dd>{state.overall.ctl}</dd>
      </div>
      <div>
        <dt>
          <Term term="atl">Ermüdung</Term>
        </dt>
        <dd>{state.overall.atl}</dd>
      </div>
      <div>
        <dt>
          <Term term="ramp">Rampe / Woche</Term>
        </dt>
        <dd>{signed(state.rampRate)}</dd>
      </div>
      <div>
        <dt>
          <Term term="tss">Load 7 Tage</Term>
        </dt>
        <dd>{state.loadLast7}</dd>
      </div>
      <div>
        <dt>Hart diese Woche</dt>
        <dd>{state.hardSessionsThisWeek}</dd>
      </div>
      {sports.map((sport) => (
        <div key={sport}>
          <dt>{SPORT_LABELS[sport]} · letzte harte</dt>
          <dd>{state.daysSinceHard[sport] >= NEVER ? '—' : `vor ${state.daysSinceHard[sport]} T.`}</dd>
        </div>
      ))}
    </dl>

    <p className="datasource">
      {state.lastActivity ? (
        <>
          <span>
            Zuletzt gesehen: <strong>{state.lastActivity.name || 'Einheit ohne Namen'}</strong> am{' '}
            {state.lastActivity.date.slice(8, 10)}.{state.lastActivity.date.slice(5, 7)}.
            {lastActivityDay(state.lastActivity.daysAgo)} · {Math.round(state.lastActivity.load)} TSS
          </span>
          <span className="datasource__count">
            {state.loadedActivityCount} mit Belastung von {state.activityCount} Einträgen (180 Tage)
          </span>
        </>
      ) : (
        <span>Keine Einheiten in den letzten 180 Tagen gefunden.</span>
      )}
    </p>
  </details>
)
