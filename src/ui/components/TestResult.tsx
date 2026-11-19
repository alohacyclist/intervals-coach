import { useState } from 'react'
import type { TestOutcome } from '../../coach/types.ts'
import { formatSeconds } from '../../coach/dates.ts'
import { adoptThreshold } from '../api.ts'
import { t } from '../../coach/lang.ts'

/**
 * Under a finished threshold test: what it measured and what follows. Adopting
 * is offered right here, where the athlete has just read the number.
 */

type State = 'idle' | 'busy' | 'adopted' | 'failed'

const render = (outcome: TestOutcome, value: number): string =>
  outcome.metric === 'power'
    ? `${Math.round(value)} W`
    : `${formatSeconds(value)}${outcome.metric === 'swimPace' ? '/100m' : '/km'}`

export const TestResult = ({ outcome }: { readonly outcome: TestOutcome }) => {
  const [state, setState] = useState<State>('idle')
  const measured = outcome.measured

  const adopt = async (value: number) => {
    setState('busy')
    try {
      await adoptThreshold(outcome.sport, value)
      setState('adopted')
    } catch {
      setState('failed')
    }
  }

  return (
    <div className="exec__test">
      <p className="exec__benchmark">
        <strong>{t('Ergebnis:')}</strong> {outcome.message}
      </p>
      {measured !== null && outcome.adoptable && state !== 'adopted' && (
        <div className="exec__actions">
          <button type="button" disabled={state === 'busy'} onClick={() => void adopt(measured)}>
            {state === 'busy' ? t('Übernimmt…') : t`${render(outcome, measured)} übernehmen`}
          </button>
        </div>
      )}
      {state === 'adopted' && measured !== null && (
        <p className="exec__note exec__note--action">
          {t`✓ Übernommen: deine Vorgaben stehen ab jetzt auf ${render(outcome, measured)}, auch in intervals.icu.`}
        </p>
      )}
      {state === 'failed' && (
        <p className="exec__note exec__note--action" role="alert">
          {t('Übernehmen fehlgeschlagen')}
        </p>
      )}
    </div>
  )
}
