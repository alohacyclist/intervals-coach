import { useState } from 'react'
import { login } from './api.ts'

/**
 * Single user sign in. One password, then a session that lasts thirty days —
 * the browser's own password dialog could not remember anything past a restart.
 */
export const PasswordLogin = ({ onDone }: { readonly onDone: () => void }) => {
  const [passwort, setPasswort] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await login(passwort)
      setPasswort('')
      onDone()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Anmeldung fehlgeschlagen')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="login" onSubmit={(event) => void submit(event)}>
      <h1>Intervals Coach</h1>
      <p className="login__lead">
        Angemeldet bleibst du 30 Tage. Jeder Besuch verlängert das wieder — nach einem Monat
        ohne Nutzung fragt der Coach erneut.
      </p>

      {error && <p className="error error--block">{error}</p>}

      <label className="login__field">
        <span>Passwort</span>
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          value={passwort}
          onChange={(event) => setPasswort(event.target.value)}
          disabled={busy}
          required
          autoFocus
        />
      </label>

      <button type="submit" className="cta cta--button" disabled={busy || passwort.length === 0}>
        {busy ? 'Einen Moment…' : 'Anmelden'}
      </button>

      <p className="login__legal">
        <a href="/datenschutz">Datenschutz</a> · <a href="/impressum">Impressum</a>
      </p>
    </form>
  )
}
