import type { DataIssue } from '../../coach/types.ts'

const STRAVA_HELP = 'https://intervals.icu/settings'

export const DataIssueBanner = ({ issue }: { readonly issue: DataIssue }) => {
  if (issue.kind === 'strava-blocked') {
    return (
      <aside className="issue">
        <h2>Deine Aktivitäten kommen bei diesem Plan nicht an</h2>
        <p>
          {issue.affected} von {issue.total} Einheiten der letzten 180 Tage stammen aus Strava.
          Strava untersagt intervals.icu, diese Daten über die API weiterzugeben — sie kommen hier
          als leere Hülle an, ohne Sportart und ohne Trainingsbelastung. Deshalb stehen Fitness,
          Ermüdung und Form auf 0, obwohl in intervals.icu selbst alles korrekt steht.
        </p>
        <p>
          <strong>So behebst du es:</strong> verbinde deine Uhr direkt mit intervals.icu, statt den
          Umweg über Strava zu nehmen — in den{' '}
          <a href={STRAVA_HELP} target="_blank" rel="noreferrer">
            intervals.icu-Einstellungen
          </a>{' '}
          unter Garmin Connect, Wahoo, Polar oder Suunto. Direkt importierte Aktivitäten unterliegen
          der Sperre nicht. Deine Strava-Verbindung kannst du daneben bestehen lassen.
        </p>
      </aside>
    )
  }

  return (
    <aside className="issue">
      <h2>Keine Trainingsbelastung in deinen Einheiten</h2>
      <p>
        Alle {issue.total} Einheiten der letzten 180 Tage kommen ohne Trainingsbelastung an.
        intervals.icu berechnet diese nur, wenn eine Einheit Herzfrequenz- oder Leistungsdaten
        enthält. Ohne sie kann der Plan Fitness und Ermüdung nicht bestimmen.
      </p>
    </aside>
  )
}
