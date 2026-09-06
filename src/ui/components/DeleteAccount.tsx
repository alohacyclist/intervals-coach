import { useState } from 'react'
import { deleteAccount } from '../api.ts'

/**
 * Art. 17 without writing an email. Two clicks rather than a browser dialog, so
 * the consequence is spelled out in the app's own words before it happens.
 */
export const DeleteAccount = () => {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const remove = async () => {
    setBusy(true)
    setError(null)
    try {
      await deleteAccount()
      window.location.href = '/'
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Löschen fehlgeschlagen')
      setBusy(false)
    }
  }

  return (
    <div className="danger">
      <h3>Konto</h3>
      {confirming ? (
        <>
          <p className="hint">
            Gelöscht werden dein Zugangs-Token, deine Ziele und Einstellungen sowie das Protokoll
            deiner Krafteinheiten. Deine Daten bei intervals.icu bleiben unberührt — auch bereits in
            den Kalender geschriebene Einheiten. Das lässt sich nicht rückgängig machen.
          </p>
          <div className="settings__actions">
            <button type="button" className="danger__go" disabled={busy} onClick={() => void remove()}>
              {busy ? 'Löscht…' : 'Endgültig löschen'}
            </button>
            <button type="button" disabled={busy} onClick={() => setConfirming(false)}>
              Abbrechen
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="hint">
            Löscht alles, was diese App über dich gespeichert hat, und widerruft damit deine
            Einwilligung. Ohne Löschung geschieht das automatisch zwölf Monate nach deinem letzten
            Besuch.
          </p>
          <button type="button" onClick={() => setConfirming(true)}>
            Konto und Daten löschen
          </button>
        </>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  )
}
