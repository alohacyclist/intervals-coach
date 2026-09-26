import type { BenchmarkStatus } from '../../coach/types.ts'
import { SPORT_LABELS } from '../../coach/types.ts'

const VERDICT_CLASS: Readonly<Record<string, string>> = {
  better: 'history__ok',
  worse: 'history__miss',
  unchanged: '',
  first: '',
  unknown: '',
}

/**
 * Results only. The session itself is planned like any other quality session,
 * so there is nothing here to decide — which is the point of a reference.
 */
export const BenchmarkCard = ({ status }: { readonly status: BenchmarkStatus }) => (
  <section className="benchmark">
    <div className="benchmark__head">
      <h2>Formkontrolle</h2>
      <span className="benchmark__meta">
        {status.weeksSinceLast === null
          ? 'noch nie durchgeführt'
          : `zuletzt vor ${status.weeksSinceLast} Wochen`}
      </span>
    </div>

    <p className="benchmark__meta">
      Alle {status.intervalWeeks} Wochen dieselbe Einheit. Verglichen wird Tempo bzw. Leistung pro
      Herzschlag in den Arbeitsintervallen — mehr Arbeit für denselben Puls ist der Fortschritt.
    </p>

    {status.results.map((result) => (
      <p key={result.sport} className={`benchmark__result ${VERDICT_CLASS[result.verdict] ?? ''}`}>
        <strong>{SPORT_LABELS[result.sport]}</strong> · {result.date}: {result.message}
      </p>
    ))}

    <p className="benchmark__meta">
      {status.due
        ? 'Fällig — steht am nächsten Qualitätstag im Plan.'
        : `Wieder fällig in ${Math.max(0, status.intervalWeeks - (status.weeksSinceLast ?? 0))} Wochen.`}
    </p>
  </section>
)
