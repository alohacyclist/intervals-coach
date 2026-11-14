import { useEffect, useState } from 'react'
import type { StravaStatus } from '../api.ts'
import { disconnectStrava, getStrava } from '../api.ts'
import { t } from '../../coach/lang.ts'

/**
 * Connecting Strava. The device keeps uploading there; the app only writes the
 * planned-against-done summary into each recognised session's description.
 * Hidden entirely where the operator has not set up a Strava app.
 */

/** What the return from Strava's consent page says, by the word it put in the address. */
const RESULTS: Readonly<Record<string, string>> = {
  verbunden: t('Strava ist verbunden.'),
  abgelehnt: t('Auf Strava abgebrochen — nichts verbunden.'),
  rechte:
    t('Ohne das Recht, Aktivitäten zu bearbeiten, kann die App auf Strava nichts ergänzen. Beim Verbinden bitte alle Häkchen gesetzt lassen.'),
  fehler: t('Die Verbindung mit Strava ist fehlgeschlagen. Bitte noch einmal versuchen.'),
}

/** Official assets from developers.strava.com/guidelines, served unmodified from public/strava. */
const CONNECT_BUTTON = '/strava/btn_strava_connect_with_orange.svg'
const COMPATIBLE_LOGO = '/strava/api_logo_cptblWith_strava_horiz_orange.svg'
/** The orange logo's lettering is black and would vanish on the dark theme; Strava ships a white one for that. */
const COMPATIBLE_LOGO_DARK = '/strava/api_logo_cptblWith_strava_horiz_white.svg'

/** Set when Strava sent the athlete back; the plan opens the settings for it. */
export const stravaResult = (): string | null => new URLSearchParams(window.location.search).get('strava')

export const StravaPanel = () => {
  const [status, setStatus] = useState<StravaStatus | null>(null)
  const [result] = useState(stravaResult)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let current = true
    void getStrava(true).then((fresh) => current && setStatus(fresh))
    // Read once; a reload should not announce the connection again.
    if (result) window.history.replaceState(null, '', window.location.pathname)
    return () => {
      current = false
    }
  }, [result])

  const disconnect = async () => {
    setBusy(true)
    setError(null)
    try {
      setStatus(await disconnectStrava())
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('Trennen fehlgeschlagen'))
    } finally {
      setBusy(false)
    }
  }

  if (!status?.available) return null

  return (
    <div className="strava">
      <h3>{t('Strava')}</h3>
      {result && RESULTS[result] && <p className="strava__result" role="status">{RESULTS[result]}</p>}
      {status.connected ? (
        <>
          <p className="hint">
            {t('Verbunden als ')}{status.name}{t('. Nach jeder erkannten Einheit steht der Soll-Ist-Vergleich in ihrer Beschreibung auf Strava; dein eigener Text bleibt stehen. Hochladen tut weiter dein Gerät.')}
          </p>
          <button type="button" disabled={busy} onClick={() => void disconnect()}>
            {busy ? t('Trennt…') : t('Strava trennen')}
          </button>
        </>
      ) : (
        <>
          <p className="hint">
            {t('Schreibt nach jeder erkannten Einheit den Soll-Ist-Vergleich in die Beschreibung der Aktivität auf Strava. Bilder nimmt Strava von anderen Apps nicht an — dafür gibt es unter jeder Einheit „Bild teilen“.')}
          </p>
          {/* Strava's own button, unaltered, as its brand guidelines require. */}
          <a className="strava__connect" href="/auth/strava/login">
            <img src={CONNECT_BUTTON} alt={t('Connect with Strava')} width={237} height={48} />
          </a>
        </>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      <p className="strava__compatible">
        <img className="light-only" src={COMPATIBLE_LOGO} alt={t('Compatible with Strava')} width={213} height={18} />
        <img className="dark-only" src={COMPATIBLE_LOGO_DARK} alt={t('Compatible with Strava')} width={213} height={18} />
      </p>
    </div>
  )
}
