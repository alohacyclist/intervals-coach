import type { Sport, TrainingState } from '../../coach/types.ts'
import { signed } from '../../coach/wording.ts'
import { Term } from './Term.tsx'
import { SportIcon } from './SportIcon.tsx'
import { t } from '../../coach/lang.ts'

type Props = {
  readonly state: TrainingState
  readonly sports: readonly Sport[]
}

const NEVER = 99

const lastActivityDay = (daysAgo: number): string =>
  daysAgo === 0 ? t(' (heute)') : daysAgo === 1 ? t(' (gestern)') : t` (vor ${daysAgo} Tagen)`

/** The raw numbers for whoever wants them; the plan's sentence above already says what they mean. */
export const MetricsPanel = ({ state, sports }: Props) => (
  <details className="disclose kpis">
    <summary>{t('Kennzahlen')}</summary>

    <dl className="metrics">
      <div>
        <dt>
          <Term term="tsb">{t('Form')}</Term>
        </dt>
        <dd>{signed(state.overall.tsb)}</dd>
      </div>
      <div>
        <dt>
          <Term term="ctl">{t('Fitness')}</Term>
        </dt>
        <dd>{state.overall.ctl}</dd>
      </div>
      <div>
        <dt>
          <Term term="atl">{t('Ermüdung')}</Term>
        </dt>
        <dd>{state.overall.atl}</dd>
      </div>
      <div>
        <dt>
          <Term term="ramp">{t('Rampe / Woche')}</Term>
        </dt>
        <dd>{signed(state.rampRate)}</dd>
      </div>
      <div>
        <dt>
          <Term term="tss">{t('Load 7 Tage')}</Term>
        </dt>
        <dd>{state.loadLast7}</dd>
      </div>
      <div>
        <dt>{t('Hart diese Woche')}</dt>
        <dd>{state.hardSessionsThisWeek}</dd>
      </div>
      {sports.map((sport) => (
        <div key={sport}>
          <dt><SportIcon sport={sport} />{t(' letzte harte')}</dt>
          <dd>{state.daysSinceHard[sport] >= NEVER ? '—' : t`vor ${state.daysSinceHard[sport]} T.`}</dd>
        </div>
      ))}
    </dl>

    <p className="datasource">
      {state.lastActivity ? (
        <>
          <span>
            {t('Zuletzt gesehen: ')}<strong>{state.lastActivity.name || t('Einheit ohne Namen')}</strong>{t(' am')}{' '}
            {state.lastActivity.date.slice(8, 10)}.{state.lastActivity.date.slice(5, 7)}.
            {lastActivityDay(state.lastActivity.daysAgo)} · {Math.round(state.lastActivity.load)}{t(' TSS')}
          </span>
          <span className="datasource__count">
            {state.loadedActivityCount}{t(' mit Belastung von ')}{state.activityCount}{t(' Einträgen (180 Tage)')}
          </span>
        </>
      ) : (
        <span>{t('Keine Einheiten in den letzten 180 Tagen gefunden.')}</span>
      )}
    </p>
  </details>
)
