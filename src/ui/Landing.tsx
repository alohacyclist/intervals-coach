import { useState } from 'react'
import { joinWaitlist } from './api.ts'
import { lang, pick, t } from '../coach/lang.ts'
import type { Sport } from '../coach/types.ts'
import { SPORT_LABELS } from '../coach/types.ts'
import { SportIcon } from './components/SportIcon.tsx'
import { LanguageSwitch } from './components/LanguageSwitch.tsx'
import { ThemeSwitch } from './components/ThemeSwitch.tsx'

/**
 * The page an ad or a shared picture leads to. It names the product in the first
 * line, shows it working before it asks for anything, and asks for one thing:
 * sign in once intervals.icu has opened the app to everyone, or leave an address
 * until then. The same action stands in the header, the hero and the close.
 */

type Mode = 'waitlist' | 'signup'

type Props = {
  /** Before the app is open to everyone, a waitlist stands where the sign-in will be. */
  readonly mode: Mode
  readonly error: string | null
  /** Back from the confirmation link in Brevo's mail. */
  readonly confirmed?: boolean
  /** The query string the visitor arrived with; an ad's code picks the headline. */
  readonly search?: string
}

/**
 * Which promise the visitor clicked on. An ad's link carries a code such as
 * `rd-b-de`; a `b` among its parts is the ad about short sessions, everything else
 * (no code included) the ad about choosing a sport each day. The headline then
 * says what the ad said, so nobody lands on a page that seems to be about
 * something else.
 */
export type Pitch = 'choice' | 'time'

export const pitchOf = (search: string): Pitch => {
  const code = new URLSearchParams(search).get('c') ?? ''
  return code.toLowerCase().split('-').includes('b') ? 'time' : 'choice'
}

const Hero = ({ pitch }: { readonly pitch: Pitch }) =>
  pitch === 'time' ? (
    <>
      <h1 id="lp-title" className="lp-reveal">{t('Der Trainingsplan für Wochen mit wenig Zeit.')}</h1>
      <p className="lp-lead lp-reveal">
        {t('Jede Einheit gibt es auch als Kurzfassung, die den Trainingsreiz hält. Fällt ein Tag aus, rechnet Etmal am nächsten Morgen mit dem, was wirklich passiert ist.')}
      </p>
    </>
  ) : (
    <>
      <h1 id="lp-title" className="lp-reveal">{t('Der Trainingsplan, bei dem du jeden Tag wählst.')}</h1>
      <p className="lp-lead lp-reveal">
        {t('Etmal liest deine Einheiten und Erholungswerte aus intervals.icu und schlägt jeden Morgen eine Einheit für jede deiner Sportarten vor: Rad, Laufen, Schwimmen, jeweils komplett und als Kurzfassung.')}
      </p>
    </>
  )

/** The app's mark, drawn inline so the page loads no picture before its words. */
const Mark = () => (
  <svg className="lp-mark" viewBox="0 0 512 512" aria-hidden="true">
    <rect width="512" height="512" rx="112" fill="#12151b" />
    <rect x="96" y="306" width="44" height="110" rx="14" fill="#3d4657" />
    <rect x="165" y="126" width="44" height="290" rx="14" fill="#4da3ff" />
    <rect x="234" y="256" width="44" height="160" rx="14" fill="#3d4657" />
    <rect x="303" y="126" width="44" height="290" rx="14" fill="#4da3ff" />
    <rect x="372" y="306" width="44" height="110" rx="14" fill="#3d4657" />
  </svg>
)

type Block = { readonly minutes: number; readonly level: 'base' | 'work' | 'rest' }

/** A session as the app draws it: warm-up, the sets with their recoveries, cool-down. */
const blocks = (warm: number, sets: number, work: number, rest: number, cool: number): readonly Block[] => [
  { minutes: warm, level: 'base' },
  ...Array.from({ length: sets }, (_, index) => [
    { minutes: work, level: 'work' as const },
    ...(index < sets - 1 || cool === 0 ? [{ minutes: rest, level: 'rest' as const }] : []),
  ]).flat(),
  ...(cool > 0 ? [{ minutes: cool, level: 'base' as const }] : []),
]

const HEIGHT: Readonly<Record<Block['level'], number>> = { base: 9, rest: 7, work: 22 }

/** The profile is as long as the session, measured against the longest of the morning. */
const Profile = ({ parts, longest }: { readonly parts: readonly Block[]; readonly longest: number }) => {
  const total = parts.reduce((sum, part) => sum + part.minutes, 0)
  let at = 0
  return (
    <svg className="lp-profile" viewBox={`0 0 ${longest} 24`} preserveAspectRatio="none" aria-hidden="true">
      {parts.map((part) => {
        const x = at
        at += part.minutes
        return (
          <rect
            key={x}
            className={`lp-profile__${part.level}`}
            x={x + 0.25}
            y={24 - HEIGHT[part.level]}
            width={Math.max(part.minutes - 0.5, 0.5)}
            height={HEIGHT[part.level]}
            rx="0.6"
          />
        )
      })}
      <title>{`${total}′`}</title>
    </svg>
  )
}

type Option = { readonly sport: Sport; readonly name: string; readonly minutes: number; readonly parts: readonly Block[] }

/** A made-up morning, so the page shows the product before asking for anything. */
const options = (): readonly Option[] => [
  { sport: 'Ride', name: 'Sweetspot 3 × 12′', minutes: 60, parts: blocks(10, 3, 12, 5, 9) },
  { sport: 'Run', name: t('Schwelle 4 × 6′'), minutes: 45, parts: blocks(10, 4, 6, 2, 3) },
  { sport: 'Ride', name: t('Sweetspot 2 × 10′ · Kurzfassung'), minutes: 30, parts: blocks(4, 2, 10, 3, 3) },
]

const ExampleDay = () => (
  <figure className="example" aria-label={t('Beispiel: so sieht ein Tag in Etmal aus')}>
    <div className="example__head">
      <span>{t('Heute · Beispiel')}</span>
      <span className="example__badge">{t('Qualitätstag')}</span>
    </div>
    <p className="example__reason">{t('Du bist erholt – heute darf es hart sein.')}</p>
    <ul className="example__options">
      {options().map((option, index) => (
        <li key={option.name}>
          {index > 0 && <span className="example__or">{t('oder')}</span>}
          <div className="example__option">
            <span className="example__sport">
              <SportIcon sport={option.sport} />
              {SPORT_LABELS[option.sport]}
            </span>
            <span className="example__name">{option.name}</span>
            <strong className="example__minutes">{option.minutes}′</strong>
            <Profile parts={option.parts} longest={60} />
          </div>
        </li>
      ))}
    </ul>
    <p className="example__note">{t('Derselbe Reiz, egal welche du nimmst.')}</p>
  </figure>
)

type Shot = { readonly file: string; readonly alt: string; readonly title: string; readonly body: string; readonly fit: 'top' | 'whole' }

const shots = (): readonly Shot[] => [
  {
    file: 'heute.jpg',
    alt: t('Der Tagesplan: die Woche bisher, darunter die Einheiten für heute zur Wahl'),
    title: t('Jeden Morgen neu geplant'),
    body: t('Die nächsten drei Tage, jede deiner Sportarten als Wahl, komplett oder kurz.'),
    fit: 'top',
  },
  {
    file: 'soll-ist.png',
    alt: t('Eine Radeinheit mit drei Intervallen über den Zielkorridoren, je Intervall die gehaltene Prozentzahl'),
    title: t('Soll und Ist, Intervall für Intervall'),
    body: t('Nach der Einheit siehst du, ob du im Ziel warst, und teilst den Vergleich als Bild.'),
    fit: 'whole',
  },
  {
    file: 'verlauf.jpg',
    alt: t('Der Verlauf: Fitnesskurve, Saisonphasen und Wochenlast'),
    title: t('Fortschritt über Wochen'),
    body: t('Fitness, Ermüdung, Saisonphasen und Wochenlast zeigen, ob du vorankommst.'),
    fit: 'top',
  },
]

const factors = (): readonly { readonly title: string; readonly body: string }[] => [
  { title: t('Fitness, Ermüdung und Form'), body: t('Aus all deinen Einheiten, Rad, Laufen und Schwimmen.') },
  { title: t('HRV, Ruhepuls und Schlaf'), body: t('Im Vergleich zu deiner eigenen Baseline der letzten 30 Tage.') },
  { title: t('48 Stunden Abstand'), body: t('Mindestens so viel Zeit liegt zwischen zwei harten Einheiten.') },
  { title: t('Periodisierung auf dein Ziel'), body: t('Auf dein Zieldatum, sonst in Blöcken; jede vierte Woche ist leichter.') },
  { title: t('Dein Zeitbudget'), body: t('Keine 90-Minuten-Einheit, wenn du 45 Minuten hast.') },
  {
    title: t('Watt, Pace und 100 m'),
    body: t('Vorgaben fürs Rad in Watt, mit Wattmesser oder Smart-Trainer; fürs Laufen als Pace, fürs Schwimmen pro 100 m.'),
  },
]

const steps = (): readonly { readonly title: string; readonly body: string }[] => [
  { title: t('Anmelden'), body: t('Ein Klick über intervals.icu. Kein neues Passwort, keine API-Schlüssel zum Kopieren.') },
  {
    title: t('Einrichten'),
    body: t('Sportarten wählen, dazu wie oft und wie lange du realistisch trainierst. Ein Ziel ist optional: Wettkampf, FTP oder einfach fit bleiben.'),
  },
  {
    title: t('Loslegen'),
    body: t('Jeden Morgen stehen die nächsten drei Tage bereit. Einheit wählen, per Klick auf Uhr, Radcomputer oder Rolle.'),
  },
]

const permissions = (): readonly { readonly title: string; readonly body: string }[] => [
  { title: t('Aktivitäten lesen'), body: t('Deine Einheiten, um Fitness und Ermüdung zu berechnen.') },
  { title: t('Erholungswerte lesen'), body: t('HRV, Ruhepuls und Schlaf für deine Tagesform.') },
  { title: t('Einheiten in deinen Kalender schreiben'), body: t('Damit die gewählte Einheit auf Uhr, Radcomputer oder Rolle landet.') },
  { title: t('Einstellungen ändern'), body: t('Schwellen und Geräte liest Etmal; ändern tut es sie nur, wenn du es anklickst.') },
]

const ERRORS: Readonly<Record<string, string>> = {
  abgelehnt: t('Zugriff wurde abgelehnt. Ohne Freigabe kann der Plan deine Daten nicht lesen.'),
  einwilligung: t('Ohne Einwilligung in die Verarbeitung deiner Gesundheitsdaten ist keine Anmeldung möglich.'),
  abgelaufen: t('Deine Anmeldung ist abgelaufen. Bitte melde dich neu an.'),
}

export const landingError = (code: string): string =>
  ERRORS[code] ?? t('Die Anmeldung ist fehlgeschlagen. Bitte noch einmal versuchen.')

const Waitlist = ({ place }: { readonly place: string }) => {
  const [email, setEmail] = useState('')
  // Hidden from people, filled by bots; the server answers it like a success and sends nothing.
  const [website, setWebsite] = useState('')
  const [state, setState] = useState<'idle' | 'busy' | 'sent'>('idle')
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setState('busy')
    setError(null)
    try {
      await joinWaitlist(email, website)
      setState('sent')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('Das hat nicht geklappt.'))
      setState('idle')
    }
  }

  if (state === 'sent') {
    return (
      <p className="lp-notice" role="status">
        <strong>{t('Fast geschafft.')}</strong>{t(' Wir haben dir eine Mail geschickt — erst mit dem Klick darin stehst du auf der Liste.')}
      </p>
    )
  }

  const field = `waitlist-${place}`
  return (
    <form className="lp-form" onSubmit={(event) => void submit(event)}>
      <label className="lp-form__label" htmlFor={field}>
        {t('Sag mir Bescheid, wenn Etmal offen ist')}
      </label>
      <div className="lp-form__row">
        <input
          id={field}
          type="email"
          required
          autoComplete="email"
          placeholder={t('deine@mail.de')}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <button type="submit" className="lp-button" disabled={state === 'busy'}>
          {state === 'busy' ? t('Sende…') : pick('Eintragen', 'Sign up')}
        </button>
      </div>
      <label className="waitlist__trap" aria-hidden="true">
        {t('Website')}
        <input tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} />
      </label>
      {error && <p className="error">{error}</p>}
      <p className="lp-fine">
        {t('Eine Mail zum Start, sonst nichts. Du bestätigst per Link, abmelden geht jederzeit. Mehr in der ')}<a href="/datenschutz">{t('Datenschutzerklärung')}</a>.
      </p>
    </form>
  )
}

const SignUp = ({ error }: { readonly error: string | null }) => {
  const [consented, setConsented] = useState(false)

  return (
    <div className="lp-form">
      {error && (
        <p className="error error--block" role="alert">
          {landingError(error)}
        </p>
      )}

      <label className="consent">
        <input
          type="checkbox"
          checked={consented}
          onChange={(event) => setConsented(event.target.checked)}
        />
        <span>
          {t('Ich willige ein, dass meine Trainings- und Gesundheitsdaten aus intervals.icu — Herzfrequenz, Herzratenvariabilität, Ruhepuls und Schlaf — zur Berechnung meines Trainingsplans verarbeitet werden (Art. 9 Abs. 2 lit. a DSGVO). Widerruf jederzeit möglich. Näheres in der ')}<a href="/datenschutz">{t('Datenschutzerklärung')}</a>.
        </span>
      </label>

      <a
        className={consented ? 'cta lp-button' : 'cta cta--locked lp-button'}
        href="/auth/login?einwilligung=ja"
        aria-disabled={!consented}
        onClick={(event) => {
          if (!consented) event.preventDefault()
        }}
      >
        {t('Mit intervals.icu anmelden')}
      </a>
    </div>
  )
}

/** The page's one action, in the same words wherever it stands. */
const Action = ({ mode, error, place }: { readonly mode: Mode; readonly error: string | null; readonly place: string }) =>
  mode === 'waitlist' ? <Waitlist place={place} /> : <SignUp error={error} />

export const Landing = ({ mode, error, confirmed = false, search = '' }: Props) => {
  const pitch = pitchOf(search)
  const primary = mode === 'waitlist' ? t('Auf die Warteliste') : t('Mit intervals.icu anmelden')

  return (
    <div className="lp">
      <header className="lp-nav">
        <div className="lp-wrap lp-nav__inner">
          <a className="lp-brand" href="/" aria-label={t('Etmal, zur Startseite')}>
            <Mark />
            <span>Etmal</span>
          </a>
          <div className="lp-nav__end">
            <LanguageSwitch />
            {!confirmed && (
              <a className="lp-button lp-button--small" href="#start">
                {primary}
              </a>
            )}
          </div>
        </div>
      </header>

      <main>
        <section className="lp-hero" aria-labelledby="lp-title">
          <div className="lp-wrap lp-hero__grid">
            <div className="lp-hero__text" id="start">
              <p className="lp-eyebrow lp-reveal">
                <span className="lp-eyebrow__dot" aria-hidden="true" />
                {t('Wahl statt Plan')}
              </p>
              <Hero pitch={pitch} />
              <div className="lp-hero__action lp-reveal">
                {confirmed ? (
                  <p className="lp-notice" role="status">
                    <strong>{t('Bestätigt.')}</strong>{t(' Du stehst auf der Liste und hörst von uns, sobald Etmal offen ist.')}
                  </p>
                ) : (
                  <Action mode={mode} error={error} place="hero" />
                )}
                <p className="lp-requirements">
                  {t('Kostenlos in der Beta. Du brauchst ein intervals.icu-Konto, fürs Rad einen Wattmesser.')}
                </p>
              </div>
            </div>
            <div className="lp-hero__visual lp-reveal">
              <ExampleDay />
            </div>
          </div>
        </section>

        <section className="lp-section lp-section--band" aria-labelledby="lp-views">
          <div className="lp-wrap">
            <header className="lp-head">
              <h2 id="lp-views">{t('Plan, Soll-Ist und Verlauf in einer App')}</h2>
              <p>{t('Etmal zeigt, was heute dran ist, wie die Einheit lief und ob die Wochen dich weiterbringen.')}</p>
            </header>
            <div className="lp-shots">
              {shots().map((shot) => (
                <article key={shot.file} className="lp-shot">
                  <div className={`lp-shot__frame lp-shot__frame--${shot.fit}`}>
                    <img src={`/landing/${lang()}/${shot.file}`} alt={shot.alt} loading="lazy" decoding="async" />
                  </div>
                  <h3>{shot.title}</h3>
                  <p>{shot.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="lp-section" aria-labelledby="lp-factors">
          <div className="lp-wrap">
            <header className="lp-head">
              <h2 id="lp-factors">{t('Eine Einheit pro Sportart, derselbe Trainingsreiz')}</h2>
              <p>
                {t('Zeit ist der eigentliche Engpass. Welche Sportart und welche Länge du wählst, ändert den Weg, nicht den Plan. Dafür rechnet Etmal jeden Morgen mit diesen Werten:')}
              </p>
            </header>
            <ol className="lp-cards">
              {factors().map((factor, index) => (
                <li key={factor.title} className="lp-card">
                  <span className="lp-card__index" aria-hidden="true">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <h3>{factor.title}</h3>
                  <p>{factor.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="lp-section lp-section--lift" aria-labelledby="lp-steps">
          <div className="lp-wrap">
            <header className="lp-head">
              <h2 id="lp-steps">{t('In drei Schritten zum ersten Plan')}</h2>
            </header>
            <ol className="lp-steps">
              {steps().map((step, index) => (
                <li key={step.title}>
                  <span className="lp-steps__number" aria-hidden="true">
                    {index + 1}
                  </span>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="lp-section" aria-labelledby="lp-data">
          <div className="lp-wrap lp-split">
            <header className="lp-head lp-head--side">
              <h2 id="lp-data">{t('Deine Daten und was Etmal damit darf')}</h2>
              <p>
                {t('Die Anmeldung läuft über intervals.icu. Etmal fragt vier Berechtigungen an, nicht mehr. Trainings- und Gesundheitsdaten holt Etmal bei jedem Aufruf frisch und speichert sie nicht.')}
              </p>
              <p className="lp-quiet">
                {t('Kein Zugriff auf dein Passwort, und Etmal löscht nichts. Du kannst die Freigabe jederzeit in deinen intervals.icu-Einstellungen widerrufen.')}
              </p>
            </header>
            <ul className="lp-permissions">
              {permissions().map((permission) => (
                <li key={permission.title}>
                  <svg className="lp-check" viewBox="0 0 20 20" aria-hidden="true">
                    <path d="M4.5 10.5l3.5 3.5 7.5-8" />
                  </svg>
                  <div>
                    <h3>{permission.title}</h3>
                    <p>{permission.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <footer className="lp-close">
        <div className="lp-wrap">
          {!confirmed && (
            <div className="lp-close__action">
              <h2>{t('Etmal ist in der Beta kostenlos.')}</h2>
              <p>
                {mode === 'waitlist'
                  ? t('Trag dich ein, dann bekommst du eine Mail, sobald Etmal für alle offen ist.')
                  : t('Melde dich mit intervals.icu an und richte deine Sportarten ein.')}
              </p>
              <Action mode={mode} error={null} place="close" />
            </div>
          )}
          <div className="lp-footer">
            <a className="lp-brand" href="/" aria-label={t('Etmal, zur Startseite')}>
              <Mark />
              <span>Etmal</span>
            </a>
            <nav className="lp-footer__links" aria-label={t('Rechtliches')}>
              <a href="/datenschutz">{t('Datenschutz')}</a>
              <a href="/impressum">{t('Impressum')}</a>
              {mode === 'waitlist' && <a href="/login">{t('Anmelden')}</a>}
            </nav>
            <ThemeSwitch />
          </div>
        </div>
      </footer>
    </div>
  )
}
