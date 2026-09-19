import { useState } from 'react'
import type { PlannedSession, RaceDetails, SessionTier } from '../../coach/types.ts'
import { SPORT_LABELS, TIER_LABELS } from '../../coach/types.ts'
import { pushWorkout } from '../api.ts'

type Props = {
  readonly session: PlannedSession
  readonly date: string
  readonly recommended: boolean
  /** Trained today from this very proposal. */
  readonly done: boolean
  /** Durations of the versions already on the calendar. */
  readonly scheduledMinutes: readonly number[]
  /** Named so the button says where the workout actually ends up. */
  readonly destinations: readonly string[]
}

type PushState = { readonly status: 'idle' | 'busy' | 'error'; readonly message?: string }

const decimal = (value: number): string =>
  value.toLocaleString('de-DE', { maximumFractionDigits: 1 })

/** A race has no push button: it happens on Zwift, not from the calendar. */
const raceFacts = (race: RaceDetails): string =>
  [
    race.distanceKm === null ? 'Route noch offen' : `${decimal(race.distanceKm)} km`,
    race.elevationM === null ? null : `${race.elevationM} hm`,
    race.race.route ? `${race.race.laps} ${race.race.laps === 1 ? 'Runde' : 'Runden'}` : null,
    race.rough ? 'grobe Schätzung' : `geschätzt aus ${race.basedOn} Rennen`,
  ]
    .filter(Boolean)
    .join(' · ')

/** The usual day is what the athlete sees first; the others are one tap away. */
const preferredTier = (session: PlannedSession): SessionTier => {
  const variants = session.variants
  const normal = variants.find((variant) => variant.tier === 'normal')
  return normal?.tier ?? variants[variants.length - 1]?.tier ?? 'max'
}

export const SessionCard = ({
  session,
  date,
  recommended,
  done,
  scheduledMinutes,
  destinations,
}: Props) => {
  const [push, setPush] = useState<PushState>({ status: 'idle' })
  const [sent, setSent] = useState<readonly number[]>([])
  const [tier, setTier] = useState<SessionTier>(() => preferredTier(session))

  const variants = session.variants
  const active = variants.find((variant) => variant.tier === tier) ?? variants[variants.length - 1]
  const steps = active?.humanSteps ?? session.humanSteps
  const trimmed = active !== undefined && active.cuts.length > 0
  const minutes = active?.minutes ?? session.template.minutes
  // Per version: sending all of them is how an athlete keeps the day open.
  const onCalendar = (length: number) => [...scheduledMinutes, ...sent].includes(length)

  const choose = (next: SessionTier) => {
    setTier(next)
    setPush({ status: 'idle' })
  }

  const onPush = async () => {
    setPush({ status: 'busy' })
    try {
      await pushWorkout(date, session.template.id, tier)
      setSent((previous) => [...previous, minutes])
      setPush({ status: 'idle' })
    } catch (error) {
      setPush({ status: 'error', message: error instanceof Error ? error.message : 'Fehler' })
    }
  }

  return (
    <article
      className={`session ${recommended ? 'session--recommended' : ''} ${done ? 'session--done' : ''}`}
    >
      <div className="session__head">
        <span className={`badge badge--${session.sport.toLowerCase()}`}>
          {SPORT_LABELS[session.sport]}
        </span>
        {recommended && <span className="badge badge--pick">Empfehlung</span>}
        {done && <span className="badge badge--done">✓ Erledigt</span>}
        <span className="session__meta">{active?.load ?? session.template.load} TSS</span>
      </div>

      <h3>{session.template.name}</h3>
      <p className="session__reason">{session.reason}</p>
      {session.race && <p className="session__race readout">{raceFacts(session.race)}</p>}

      {variants.length > 1 ? (
        <div className="variants" role="group" aria-label="Dauer wählen">
          {variants.map((variant) => (
            <button
              key={variant.tier}
              type="button"
              className={
                variant.tier === tier ? 'variants__pick variants__pick--on' : 'variants__pick'
              }
              onClick={() => choose(variant.tier)}
            >
              {variant.minutes} min{' '}
              <span>
                {TIER_LABELS[variant.tier]}
                {onCalendar(variant.minutes) && ' ✓'}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <p className="session__duration readout">
          {active?.minutes ?? session.template.minutes} min
        </p>
      )}

      <ol className="steps">
        {steps.map((step, index) => {
          // "12min @ 276-291 W" reads as a table, so the duration keeps its own column.
          const [duration, ...target] = step.split(' @ ')
          return (
            <li key={`${session.template.id}-${tier}-${index}`}>
              <span>{duration}</span>
              {target.length > 0 && <em>{target.join(' @ ')}</em>}
            </li>
          )
        })}
      </ol>

      {/* The one sentence why stays above; the coaching prose is a tap away. */}
      <details className="disclose session__why">
        <summary>Warum diese Einheit</summary>
        {trimmed && (
          <p className="session__note">
            {active?.cuts.join(' · ')}. Intervalllänge und Zielwerte bleiben unverändert — nur das
            Volumen sinkt. Zählt nicht für die Progression zur nächsten Stufe.
          </p>
        )}
        <p className="session__note">{session.template.coachNote}</p>
      </details>

      {done || session.race ? null : onCalendar(minutes) ? (
        <p className="session__sent readout">✓ Diese Fassung ist im Kalender</p>
      ) : (
        <button type="button" onClick={onPush} disabled={push.status === 'busy'}>
          {push.status === 'busy'
            ? 'Sende…'
            : destinations.length > 0
              ? `→ Kalender + ${destinations.join(', ')}`
              : '→ intervals.icu Kalender'}
        </button>
      )}
      {push.status === 'error' && <p className="error">{push.message}</p>}
    </article>
  )
}
