import { useEffect, useState } from 'react'
import type { StravaStatus } from '../api.ts'
import { disconnectStrava, getStrava } from '../api.ts'

/**
 * Connecting Strava. The device keeps uploading there; the app only writes the
 * planned-against-done summary into each recognised session's description.
 * Hidden entirely where the operator has not set up a Strava app.
 */

/** What the return from Strava's consent page says, by the word it put in the address. */
const RESULTS: Readonly<Record<string, string>> = {
  verbunden: 'Strava ist verbunden.',
  abgelehnt: 'Auf Strava abgebrochen — nichts verbunden.',
  rechte:
    'Ohne das Recht, Aktivitäten zu bearbeiten, kann die App auf Strava nichts ergänzen. Beim Verbinden bitte alle Häkchen gesetzt lassen.',
  fehler: 'Die Verbindung mit Strava ist fehlgeschlagen. Bitte noch einmal versuchen.',
}

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
      setError(caught instanceof Error ? caught.message : 'Trennen fehlgeschlagen')
    } finally {
      setBusy(false)
    }
  }

  if (!status?.available) return null

  return (
    <div className="strava">
      <h3>Strava</h3>
      {result && RESULTS[result] && <p className="strava__result">{RESULTS[result]}</p>}
      {status.connected ? (
        <>
          <p className="hint">
            Verbunden als {status.name}. Nach jeder erkannten Einheit steht der Soll-Ist-Vergleich in ihrer
            Beschreibung auf Strava; dein eigener Text bleibt stehen. Hochladen tut weiter dein Gerät.
          </p>
          <button type="button" disabled={busy} onClick={() => void disconnect()}>
            {busy ? 'Trennt…' : 'Strava trennen'}
          </button>
        </>
      ) : (
        <>
          <p className="hint">
            Schreibt nach jeder erkannten Einheit den Soll-Ist-Vergleich in die Beschreibung der Aktivität auf
            Strava. Bilder nimmt Strava von anderen Apps nicht an — dafür gibt es unter jeder Einheit „Bild
            teilen“.
          </p>
          <a className="cta cta--button" href="/auth/strava/login">
            Mit Strava verbinden
          </a>
        </>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  )
}
