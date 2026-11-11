import { useState } from 'react'
import type { ReactNode } from 'react'
import type { PlannedDay, PlannedSession, ScheduledWorkout, SessionTier } from '../../coach/types.ts'
import { PHASE_LABELS } from '../../coach/phase.ts'
import { dayState, usualVariant } from '../week-line.ts'
import { SessionCard } from './SessionCard.tsx'
import { SportIcon } from './SportIcon.tsx'
import { StrengthCard } from './StrengthCard.tsx'
import { DoneStrip } from './DoneStrip.tsx'
import { t } from '../../coach/lang.ts'

const DAY_TYPE_LABEL: Record<PlannedDay['dayType'], string> = {
  KEY: t('Qualitätstag'),
  EASY: t('Locker'),
  RECOVERY: t('Regeneration'),
  REST: t('Ruhetag'),
}

type Props = {
  readonly day: PlannedDay
  readonly index: number
  /** Beyond the three days the plan stands for: shown as what is likely, not what is set. */
  readonly outlook?: boolean
  readonly strengthDone: boolean
  readonly onStrengthLogged: () => void
  readonly destinations: Readonly<Record<string, readonly string[]>>
  readonly scheduled: readonly ScheduledWorkout[]
  /** Today's wish, so a push finds the plan that was on screen. */
  readonly intent?: string
  /** Today's time, for the same reason. */
  readonly minutesToday?: number
  /** Where today's lengthened work begins, for the same reason. */
  readonly coreAt?: number
  /** Today's controls; another day has no wish to change. */
  readonly children?: ReactNode
}

/** A new length today brings a new choice of version, so the card starts over. */
const cardKey = (session: PlannedSession): string =>
  `${session.template.id}-${session.variants.map((variant) => variant.minutes).join('-')}`

export const DayCard = ({
  day,
  index,
  outlook = false,
  strengthDone,
  onStrengthLogged,
  destinations,
  scheduled,
  intent,
  minutesToday,
  coreAt,
  children,
}: Props) => {
  const trained = day.completed.length > 0
  // Two options can share a sport — a race and its alternative — but only one is the pick.
  const picked = day.options.find((option) => option.sport === day.recommended)
  const pick = picked?.template.id
  // A choice answers one recommendation: a new wish for today brings a new one to look at.
  const [choice, setChoice] = useState<{ readonly forPick?: string; readonly id: string } | null>(null)
  const [tiers, setTiers] = useState<Readonly<Record<string, SessionTier>>>({})
  const chosenId = choice && choice.forPick === pick ? choice.id : pick
  const chosen = day.options.find((option) => option.template.id === chosenId)

  const shownVariant = (session: PlannedSession) =>
    session.variants.find((variant) => variant.tier === tiers[cardKey(session)]) ?? usualVariant(session)

  const label = index === 0 ? t('Heute') : index === 1 ? t('Morgen') : day.weekday
  const date = `${day.date.slice(8, 10)}.${day.date.slice(5, 7)}.`
  const facts = [
    date,
    DAY_TYPE_LABEL[day.dayType],
    PHASE_LABELS[day.phase],
    ...(day.optional ? ['freiwillig'] : []),
  ].join(' · ')
  const title = trained
    ? day.completed.map((entry) => entry.name || t('Einheit ohne Namen')).join(' · ')
    : chosen
      ? (shownVariant(chosen)?.name ?? chosen.template.name)
      : day.recommended === 'REST'
        ? t('Ruhetag')
        : t('Kein Vorschlag')

  return (
    <section className="panel" data-state={dayState(day.dayType)}>
      <div className="panel__head">
        <span className="panel__tag">{label}</span>
        <span className="panel__facts">{facts}</span>
        <h2>{title}</h2>
        {/* The reason for the day reads first; the numbers behind it wait for a tap. */}
        {day.notes.length > 0 && <p className="panel__facts">{day.notes[0]}</p>}
        {/* Asked for on screen, answered on screen in a few words; the why waits in the background. */}
        {day.moreTime.length > 0 && <p className="day__more-time">{day.moreTime.join(' · ')}</p>}
        {/* Every day until then moves this one, and the plan says so rather than promise it. */}
        {outlook && (
          <p className="panel__outlook">
            {t('Ausblick: so sieht der Tag aus, wenn bis dahin alles wie geplant läuft. Was du vorher trainierst oder auslässt, verschiebt ihn.')}
          </p>
        )}
      </div>

      {day.notes.length > 1 && (
        <details className="disclose day__why">
          <summary>{t('Hintergrund')}</summary>
          <ul className="notes">
            {day.notes.slice(1).map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </details>
      )}

      {trained && <DoneStrip sessions={day.completed} date={day.date} />}

      {day.options.length > 0 && (
        <div className="picks" role="group" aria-label={t('Einheit wählen')}>
          {day.options.map((session) => {
            const variant = shownVariant(session)
            return (
              <button
                key={session.template.id}
                type="button"
                aria-pressed={session.template.id === chosenId}
                onClick={() => setChoice({ forPick: pick, id: session.template.id })}
              >
                <SportIcon sport={session.sport} />
                <b>{variant?.minutes ?? session.template.minutes}{t(' min')}</b>
                <span>{variant?.load ?? session.template.load}{t(' TSS')}</span>
                {session.template.id === pick && (
                  <span className="picks__star" role="img" aria-label={t('empfohlen')}>
                    ★
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {day.recommended === 'REST' && !trained && !chosen && (
        <p className="panel__facts">
          <strong>{index === 0 ? t('Heute ist Pause.') : 'Ruhetag.'}</strong>{t(' Tippe eine Sportart an, wenn du trotzdem los willst.')}
        </p>
      )}

      {/* All stay mounted, so a version chosen or sent survives looking at another sport. */}
      {day.options.map((session) => (
        <div key={cardKey(session)} hidden={session.template.id !== chosenId}>
          <SessionCard
            session={session}
            date={day.date}
            recommended={session.template.id === pick}
            done={day.completed.some((entry) => entry.templateId === session.template.id)}
            scheduledMinutes={scheduled
              .filter((entry) => entry.templateId === session.template.id)
              .map((entry) => entry.minutes)}
            destinations={destinations[session.sport] ?? []}
            intent={intent}
            minutesToday={minutesToday}
            coreAt={coreAt}
            titled={trained}
            onTier={(tier) => setTiers((previous) => ({ ...previous, [cardKey(session)]: tier }))}
          />
        </div>
      ))}

      {day.strength && (
        <StrengthCard
          strength={day.strength}
          date={day.date}
          done={strengthDone}
          onLogged={onStrengthLogged}
        />
      )}

      {children}
    </section>
  )
}
