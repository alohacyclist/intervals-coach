import { useState } from 'react'
import type { BenchmarkStatus } from '../../coach/types.ts'
import { SPORT_LABELS } from '../../coach/types.ts'
import { pushWorkout } from '../api.ts'

const VERDICT_CLASS: Readonly<Record<string, string>> = {
  better: 'history__ok',
  worse: 'history__miss',
  unchanged: '',
  first: '',
  unknown: '',
}

export const BenchmarkCard = ({ status }: { readonly status: BenchmarkStatus }) => {
  const [pushed, setPushed] = useState<readonly string[]>([])
  const [error, setError] = useState<string | null>(null)
  const today = new Date().toLocaleDateString('sv-SE')

  const schedule = async (templateId: string) => {
    setError(null)
    try {
      await pushWorkout(today, templateId)
      setPushed((current) => [...current, templateId])
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Fehler')
    }
  }

  return (
    <section className="benchmark">
      <div className="benchmark__head">
        <h2>Standortbestimmung</h2>
        <span className="benchmark__meta">
          {status.weeksSinceLast === null
            ? 'noch nie durchgeführt'
            : `zuletzt vor ${status.weeksSinceLast} Wochen`}
        </span>
      </div>

      {status.results.map((result) => (
        <p key={result.sport} className={`benchmark__result ${VERDICT_CLASS[result.verdict] ?? ''}`}>
          <strong>{SPORT_LABELS[result.sport]}</strong> · {result.date}: {result.message}
        </p>
      ))}

      {status.due ? (
        <>
          <p className="benchmark__due">
            Fällig. Dieselbe Einheit wie beim letzten Mal, identische Vorgaben — nicht schneller
            fahren oder laufen. Gemessen wird die Herzfrequenz, die du dafür brauchst, nicht die
            Zeit. Das ist verlässlicher als ein neuer Schwellentest und kostet keinen Testtag.
          </p>
          <div className="benchmark__actions">
            {status.sessions.map((session) => (
              <button
                key={session.templateId}
                type="button"
                disabled={pushed.includes(session.templateId)}
                onClick={() => void schedule(session.templateId)}
              >
                {pushed.includes(session.templateId) ? '✓ ' : '→ '}
                {session.name}
              </button>
            ))}
          </div>
        </>
      ) : (
        <p className="benchmark__meta">
          Nächste Standortbestimmung in{' '}
          {Math.max(0, status.intervalWeeks - (status.weeksSinceLast ?? 0))} Wochen.
        </p>
      )}

      {error && <p className="error">{error}</p>}
    </section>
  )
}
