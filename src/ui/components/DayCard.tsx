import type { PlannedDay, PlannedSession, ScheduledWorkout } from '../../coach/types.ts'
import { SPORT_LABELS } from '../../coach/types.ts'
import { PHASE_LABELS } from '../../coach/phase.ts'
import { SessionCard } from './SessionCard.tsx'
import { StrengthCard } from './StrengthCard.tsx'
import { DoneStrip } from './DoneStrip.tsx'

const DAY_TYPE_LABEL: Record<PlannedDay['dayType'], string> = {
  KEY: 'Qualitätstag',
  EASY: 'Locker',
  RECOVERY: 'Regeneration',
  REST: 'Ruhetag',
}

type Props = {
  readonly day: PlannedDay
  readonly index: number
  readonly strengthDone: boolean
  readonly onStrengthLogged: () => void
  readonly destinations: Readonly<Record<string, readonly string[]>>
  readonly scheduled: readonly ScheduledWorkout[]
}

/** The version shown first, mirroring the preference SessionCard applies. */
const usualVariant = (session: PlannedSession) =>
  session.variants.find((variant) => variant.tier === 'normal') ??
  session.variants[session.variants.length - 1]

/** What a preview day is actually asked for: sport, name, size — not the intervals. */
const summaryOf = (
  day: PlannedDay,
  pick: PlannedSession | undefined,
): { readonly name: string; readonly meta: string } => {
  if (day.completed.length > 0) {
    const minutes = day.completed.reduce((sum, entry) => sum + entry.minutes, 0)
    const load = day.completed.reduce((sum, entry) => sum + entry.load, 0)
    return {
      name: day.completed.map((entry) => entry.name || 'Einheit ohne Namen').join(' · '),
      meta: `${Math.round(minutes)} min · ${Math.round(load)} TSS`,
    }
  }
  if (day.recommended === 'REST') return { name: 'Ruhetag', meta: '—' }
  if (!pick) return { name: 'Kein Vorschlag', meta: '—' }
  const variant = usualVariant(pick)
  return {
    name: `${SPORT_LABELS[pick.sport]} · ${pick.template.name}`,
    meta: `${variant?.minutes ?? pick.template.minutes} min · ${variant?.load ?? pick.template.load} TSS`,
  }
}

export const DayCard = ({
  day,
  index,
  strengthDone,
  onStrengthLogged,
  destinations,
  scheduled,
}: Props) => {
  const trained = day.completed.length > 0
  const dimmed = trained || day.recommended === 'REST'
  // Two options can share a sport — a race and its alternative — but only one is the pick.
  const picked = day.options.find((option) => option.sport === day.recommended)
  const pick = picked?.template.id
  // Today is the instrument; a preview day and a rest day are one line until asked for.
  const folded = index > 0 || day.recommended === 'REST'

  const label = index === 0 ? 'Heute' : index === 1 ? 'Morgen' : `${day.weekday}.`
  const date = `${day.date.slice(8, 10)}.${day.date.slice(5, 7)}.`

  const tags = (
    <div className="day__tags">
      {day.optional && <span className="badge badge--optional">freiwillig</span>}
      <span className={`badge badge--${day.dayType.toLowerCase()}`}>
        {DAY_TYPE_LABEL[day.dayType]}
      </span>
      <span className="badge">{PHASE_LABELS[day.phase]}</span>
    </div>
  )

  // A folded day already names itself in its row; opening it must not repeat that.
  const head = (
    <div className={`day__head ${folded ? 'day__head--tags' : ''}`}>
      {!folded && (
        <h2>
          {label} <span className="day__date">{date}</span>
        </h2>
      )}
      {tags}
    </div>
  )

  const body = (
    <>
      <ul className="notes">
        {day.notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>

      {trained && <DoneStrip sessions={day.completed} />}

      {day.optional && !trained && (
        <p className="rest-hint">
          <span>
            <strong>Über deinem Wochenpensum.</strong> Eingeplant ist heute nichts mehr — nach zwei
            Ruhetagen bist du aber erholt und dein Budget für harte Einheiten ist noch nicht
            ausgeschöpft. Nimm es, wenn du Lust hast; lass es aus, ohne dass der Plan darunter
            leidet.
          </span>
        </p>
      )}

      {day.recommended === 'REST' && !trained && (
        <p className="rest-hint">
          <span>
            <strong>Heute ist Pause vorgesehen.</strong> Ruhetage sind Teil des Plans, nicht das
            Ausbleiben davon — die Anpassung passiert dazwischen. Falls du dich trotzdem bewegen
            willst, stehen unten die lockersten Varianten.
          </span>
        </p>
      )}

      <div className={`day__options ${dimmed ? 'day__options--optional' : ''}`}>
        {day.options.map((session) => (
          <SessionCard
            key={session.template.id}
            session={session}
            date={day.date}
            recommended={session.template.id === pick}
            done={day.completed.some((entry) => entry.templateId === session.template.id)}
            scheduledMinutes={scheduled
              .filter((entry) => entry.templateId === session.template.id)
              .map((entry) => entry.minutes)}
            destinations={destinations[session.sport] ?? []}
          />
        ))}
      </div>

      {day.strength && (
        <StrengthCard
          strength={day.strength}
          date={day.date}
          done={strengthDone}
          onLogged={onStrengthLogged}
        />
      )}
    </>
  )

  if (!folded) {
    return (
      <section className="day">
        {head}
        {body}
      </section>
    )
  }

  const summary = summaryOf(day, picked)

  return (
    <details className={`disclose day day--folded ${trained ? 'day--trained' : ''}`}>
      <summary className="fold">
        <span className="fold__date">
          {index === 0 ? label : `${day.weekday} ${date}`}
        </span>
        <span className={`fold__name ${day.recommended === 'REST' && !trained ? 'fold__name--rest' : ''}`}>
          {summary.name}
        </span>
        <span className="fold__meta">{summary.meta}</span>
      </summary>
      {head}
      {body}
    </details>
  )
}
