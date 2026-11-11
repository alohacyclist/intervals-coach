import type { CompletedSession } from '../../coach/types.ts'
import { SportIcon } from './SportIcon.tsx'
import { ExecutionCard, comparable } from './ExecutionCard.tsx'
import { t } from '../../coach/lang.ts'

type Props = { readonly sessions: readonly CompletedSession[]; readonly date: string }

export const DoneStrip = ({ sessions, date }: Props) => (
  <div className="done">
    {sessions.map((session) => (
      <div key={session.activityId} className="done__entry">
        <p className="done__item">
          <span className="badge badge--done">{t('✓ Erledigt')}</span>
          {session.sport !== 'Other' && (
            <SportIcon sport={session.sport} />
          )}
          <strong>{session.name}</strong>
          <span className="done__meta readout">
            {session.minutes}{t(' min · ')}{session.estimate ? t`~${session.load} TSS geschätzt` : `${session.load} TSS`}
            {session.compliance !== null && t` · ${session.compliance} % Übereinstimmung`}
            {session.estimate &&
              session.estimate.blocksTotal > 0 &&
              t` · ${session.estimate.blocksFound} von ${session.estimate.blocksTotal} Sätzen erkannt`}
          </span>
        </p>
        {comparable(session.templateId) && (
          <ExecutionCard activityId={session.activityId} templateId={session.templateId} date={date} />
        )}
      </div>
    ))}
    <p className="done__note">
      {t('Die Vorschläge unten stehen so, wie sie heute vor der Einheit geplant waren. Was du trainiert hast, zählt ab morgen.')}
    </p>
  </div>
)
