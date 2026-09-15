import type { CompletedSession } from '../../coach/types.ts'
import { SPORT_LABELS } from '../../coach/types.ts'

type Props = { readonly sessions: readonly CompletedSession[] }

export const DoneStrip = ({ sessions }: Props) => (
  <div className="done">
    {sessions.map((session) => (
      <p key={session.activityId} className="done__item">
        <span className="badge badge--done">✓ Erledigt</span>
        {session.sport !== 'Other' && (
          <span className={`badge badge--${session.sport.toLowerCase()}`}>
            {SPORT_LABELS[session.sport]}
          </span>
        )}
        <strong>{session.name}</strong>
        <span className="done__meta readout">
          {session.minutes} min · {session.load} TSS
          {session.compliance !== null && ` · ${session.compliance} % Übereinstimmung`}
        </span>
      </p>
    ))}
    <p className="done__note">
      Die Vorschläge unten stehen so, wie sie heute vor der Einheit geplant waren. Was du trainiert
      hast, zählt ab morgen.
    </p>
  </div>
)
