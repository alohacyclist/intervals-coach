import { OPERATOR } from './operator.ts'

export const Imprint = () => (
  <article className="legal">
    <h1>Impressum</h1>

    <h2>Angaben gemäß § 5 DDG</h2>
    <p>
      {OPERATOR.name}
      <br />
      {OPERATOR.street}
      <br />
      {OPERATOR.city}
      <br />
      {OPERATOR.country}
    </p>

    <h2>Kontakt</h2>
    <p>
      E-Mail: <a href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a>
    </p>

    <h2>Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV</h2>
    <p>
      {OPERATOR.name}, {OPERATOR.street}, {OPERATOR.city}
    </p>

    <h2>Art des Angebots</h2>
    <p>
      Intervals Coach ist ein privates, nicht kommerzielles Projekt. Die Nutzung ist kostenlos, es
      werden keine Verträge über entgeltliche Leistungen geschlossen und keine Werbung ausgespielt.
    </p>

    <h2>Haftung für Trainingsinhalte</h2>
    <p>
      Die Trainingsvorschläge werden automatisch aus den Daten des jeweiligen intervals.icu-Kontos
      erzeugt. Sie sind keine sportmedizinische, ärztliche oder trainingswissenschaftliche Beratung
      und ersetzen eine solche nicht. Ob eine vorgeschlagene Einheit für dich geeignet ist,
      entscheidest du selbst; die Nutzung erfolgt auf eigene Verantwortung und eigenes Risiko. Bei
      gesundheitlichen Beschwerden, Vorerkrankungen oder nach längeren Pausen halte vor
      Trainingsbeginn ärztliche Rücksprache.
    </p>

    <h2>Haftung für Links</h2>
    <p>
      Dieses Angebot verweist auf externe Websites, auf deren Inhalte kein Einfluss besteht. Für
      diese Inhalte ist stets der jeweilige Anbieter verantwortlich. Zum Zeitpunkt der Verlinkung
      waren keine Rechtsverstöße erkennbar; bei Bekanntwerden werden entsprechende Links entfernt.
    </p>

    <h2>Urheberrecht</h2>
    <p>
      Die auf dieser Website erstellten Inhalte und der zugrunde liegende Quellcode unterliegen dem
      deutschen Urheberrecht. Alle Rechte vorbehalten.
    </p>

    <h2>Verbraucherstreitbeilegung</h2>
    <p>
      Zur Teilnahme an einem Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle sind
      wir nicht verpflichtet und nicht bereit.
    </p>

    <p className="legal__back">
      <a href="/">Zurück</a>
    </p>
  </article>
)
