import type { AdherenceDay, AdherenceStatus } from '../../coach/types.ts'
import { SPORT_LABELS } from '../../coach/types.ts'
import { ExecutionCard, comparable } from './ExecutionCard.tsx'

const STATUS_LABEL: Readonly<Record<AdherenceStatus, string>> = {
  done: 'geplant und absolviert',
  race: 'Rennen',
  switched: 'anders trainiert als geplant',
  missed: 'geplant, nicht absolviert',
  open: 'heute, noch offen',
  unplanned: 'spontan trainiert',
  rest: 'Ruhetag',
}

const sportOf = (day: AdherenceDay): string =>
  day.completedSport && day.completedSport !== 'Other' ? SPORT_LABELS[day.completedSport] : 'Training'

const detail = (day: AdherenceDay): string => {
  const date = `${day.date.slice(8, 10)}.${day.date.slice(5, 7)}.`
  const planned = day.planned.length > 0 ? `geplant: ${day.planned.join(' oder ')}` : 'nichts geplant'
  const done = day.completed ? `${sportOf(day)}: ${day.completed} (${day.load} TSS)` : 'kein Training'
  return `${date} — ${planned} · ${done}`
}

/** The most recent day that carried a proposal and is over, which is what the athlete asks about. */
const lastPlanned = (history: readonly AdherenceDay[]): AdherenceDay | undefined =>
  [...history].reverse().find((day) => day.planned.length > 0 && day.status !== 'open')

export const HistoryStrip = ({ history }: { readonly history: readonly AdherenceDay[] }) => {
  const last = lastPlanned(history)
  const trained = history.filter((day) => day.load > 0).length
  // Today's session already shows its comparison on today's card.
  const today = history[history.length - 1]?.date
  const compare =
    last && last.status === 'done' && last.date !== today && last.activityId && comparable(last.templateId)
      ? { activityId: last.activityId, templateId: last.templateId, date: last.date }
      : null

  return (
    <section className="history">
      <div className="history__head">
        <h2>Letzte 7 Tage</h2>
        <span className="history__summary">{trained} Tage trainiert</span>
      </div>

      <ol className="history__strip">
        {history.map((day) => (
          <li key={day.date} className={`history__day history__day--${day.status}`} title={detail(day)}>
            <span className="history__weekday">{day.weekday}</span>
            <span className="history__load">{day.load > 0 ? day.load : '–'}</span>
          </li>
        ))}
      </ol>

      {last && (
        <p className="history__last">
          Zuletzt geplant: <strong>{last.planned.join(' oder ')}</strong> am{' '}
          {last.date.slice(8, 10)}.{last.date.slice(5, 7)}. —{' '}
          {last.status === 'done' ? (
            <span className="history__ok">
              absolviert
              {last.compliance !== null && ` (${Math.round(last.compliance)} % Übereinstimmung)`}
            </span>
          ) : last.status === 'switched' || last.status === 'race' ? (
            <span className="history__alt">
              stattdessen {sportOf(last)}: {last.completed}
            </span>
          ) : (
            <span className="history__miss">nicht absolviert</span>
          )}
        </p>
      )}

      {compare && (
        <ExecutionCard activityId={compare.activityId} templateId={compare.templateId} date={compare.date} />
      )}

      {/* A legend is understood once; after that it is only chrome above the data. */}
      <details className="disclose history__key">
        <summary>Legende</summary>
        <p className="history__legend">
          {(['done', 'race', 'switched', 'unplanned', 'missed', 'rest'] as const).map((status) => (
            <span key={status}>
              <i className={`history__dot history__day--${status}`} /> {STATUS_LABEL[status]}
            </span>
          ))}
        </p>
      </details>
    </section>
  )
}
