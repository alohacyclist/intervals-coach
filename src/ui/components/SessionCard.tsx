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

  const onPush = async () => {
    setPush({ status: 'busy' })
    try {
      await pushWorkout(date, session.template.id)
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
        <span className="session__meta">
          {session.template.minutes} min · {session.template.load} TSS
        </span>
      </div>

      <h3>{session.template.name}</h3>
      <p className="session__reason">{session.reason}</p>

      <ol className="steps">
        {session.humanSteps.map((step, index) => (
          <li key={`${session.template.id}-${index}`}>{step}</li>
        ))}
      </ol>

      <p className="session__note">{session.template.coachNote}</p>

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
