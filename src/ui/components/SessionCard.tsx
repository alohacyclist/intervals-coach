import { useState } from 'react'
import type { PlannedSession } from '../../coach/types.ts'
import { SPORT_LABELS } from '../../coach/types.ts'
import { pushWorkout } from '../api.ts'

type Props = {
  readonly session: PlannedSession
  readonly date: string
  readonly recommended: boolean
  /** Named so the button says where the workout actually ends up. */
  readonly destinations: readonly string[]
}

type PushState = { readonly status: 'idle' | 'busy' | 'done' | 'error'; readonly message?: string }

export const SessionCard = ({ session, date, recommended, destinations }: Props) => {
  const [push, setPush] = useState<PushState>({ status: 'idle' })
  const [variant, setVariant] = useState<'full' | 'short'>('full')

  const short = session.short
  const active = variant === 'short' ? short : null
  const minutes = active?.minutes ?? session.template.minutes
  const load = active?.load ?? session.template.load
  const steps = active?.humanSteps ?? session.humanSteps

  // A pushed workout belongs to one version, so switching starts the choice over.
  const choose = (next: 'full' | 'short') => {
    setVariant(next)
    setPush({ status: 'idle' })
  }

  const onPush = async () => {
    setPush({ status: 'busy' })
    try {
      await pushWorkout(date, session.template.id, variant)
      setPush({ status: 'done', message: 'Im Kalender' })
    } catch (error) {
      setPush({ status: 'error', message: error instanceof Error ? error.message : 'Fehler' })
    }
  }

  return (
    <article className={`session ${recommended ? 'session--recommended' : ''}`}>
      <div className="session__head">
        <span className={`badge badge--${session.sport.toLowerCase()}`}>{SPORT_LABELS[session.sport]}</span>
        {recommended && <span className="badge badge--pick">Empfehlung</span>}
        <span className="session__meta">{load} TSS</span>
      </div>

      <h3>{session.template.name}</h3>
      <p className="session__reason">{session.reason}</p>

      {short ? (
        <div className="variants" role="group" aria-label="Dauer wählen">
          <button
            type="button"
            className={variant === 'full' ? 'variants__pick variants__pick--on' : 'variants__pick'}
            onClick={() => choose('full')}
          >
            {session.template.minutes} min <span>komplett</span>
          </button>
          <button
            type="button"
            className={variant === 'short' ? 'variants__pick variants__pick--on' : 'variants__pick'}
            onClick={() => choose('short')}
          >
            {short.minutes} min <span>kurz</span>
          </button>
        </div>
      ) : (
        <p className="session__duration readout">{minutes} min</p>
      )}

      <ol className="steps">
        {steps.map((step, index) => {
          // "12min @ 276-291 W" reads as a table, so the duration keeps its own column.
          const [duration, ...target] = step.split(' @ ')
          return (
            <li key={`${session.template.id}-${variant}-${index}`}>
              <span>{duration}</span>
              {target.length > 0 && <em>{target.join(' @ ')}</em>}
            </li>
          )
        })}
      </ol>

      {active ? (
        <p className="session__note">
          {active.cuts.join(' · ')}. Intervalllänge und Zielwerte bleiben unverändert — nur das
          Volumen sinkt. Zählt nicht für die Progression zur nächsten Stufe.
        </p>
      ) : (
        <p className="session__note">{session.template.coachNote}</p>
      )}

      <button type="button" onClick={onPush} disabled={push.status === 'busy' || push.status === 'done'}>
        {push.status === 'busy'
          ? 'Sende…'
          : push.status === 'done'
            ? '✓ Übertragen'
            : destinations.length > 0
              ? `→ Kalender + ${destinations.join(', ')}`
              : '→ intervals.icu Kalender'}
      </button>
      {push.status === 'error' && <p className="error">{push.message}</p>}
    </article>
  )
}
