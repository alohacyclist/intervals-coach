import type { PlannedDay } from '../../coach/types.ts'
import { PHASE_LABELS } from '../../coach/phase.ts'
import { SessionCard } from './SessionCard.tsx'

const DAY_TYPE_LABEL: Record<PlannedDay['dayType'], string> = {
  KEY: 'Qualitätstag',
  EASY: 'Locker',
  RECOVERY: 'Regeneration',
  REST: 'Ruhetag',
}

export const DayCard = ({ day, index }: { readonly day: PlannedDay; readonly index: number }) => (
  <section className="day">
    <div className="day__head">
      <h2>
        {index === 0 ? 'Heute' : index === 1 ? 'Morgen' : `${day.weekday}.`}{' '}
        <span className="day__date">{day.date.slice(8, 10)}.{day.date.slice(5, 7)}.</span>
      </h2>
      <div className="day__tags">
        <span className={`badge badge--${day.dayType.toLowerCase()}`}>{DAY_TYPE_LABEL[day.dayType]}</span>
        <span className="badge">{PHASE_LABELS[day.phase]}</span>
      </div>
    </div>

    <ul className="notes">
      {day.notes.map((note) => (
        <li key={note}>{note}</li>
      ))}
    </ul>

    {day.recommended === 'REST' && (
      <p className="rest-hint">
        <strong>Heute ist Pause vorgesehen.</strong> Ruhetage sind Teil des Plans, nicht das
        Ausbleiben davon — die Anpassung passiert dazwischen. Falls du dich trotzdem bewegen willst,
        stehen unten die lockersten Varianten.
      </p>
    )}

    <div className={`day__options ${day.recommended === 'REST' ? 'day__options--optional' : ''}`}>
      {day.options.map((session) => (
        <SessionCard
          key={session.template.id}
          session={session}
          date={day.date}
          recommended={day.recommended === session.sport}
        />
      ))}
    </div>
  </section>
)
