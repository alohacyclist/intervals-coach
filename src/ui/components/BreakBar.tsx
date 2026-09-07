import { useState } from 'react'
import type { BreakKind, CoachConfig } from '../../coach/types.ts'
import { ALL_BREAK_KINDS } from '../../coach/types.ts'
import { BREAK_DEFAULT_DAYS, BREAK_LABELS, activeBreak, breakLimit } from '../../coach/breaks.ts'
import { declareBreak, endBreak } from '../api.ts'

type Props = {
  readonly config: CoachConfig
  readonly today: string
  readonly onChanged: () => void
}

export const BreakBar = ({ config, today, onChanged }: Props) => {
  const [kind, setKind] = useState<BreakKind>('illness')
  const [days, setDays] = useState(BREAK_DEFAULT_DAYS.illness)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const running = activeBreak(config.breaks, today)
  const limit = breakLimit(config.breaks, today)

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await action()
      setOpen(false)
      onChanged()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Fehler')
    } finally {
      setBusy(false)
    }
  }

  // Picking a reason should also pick its usual length, without locking it.
  const chooseKind = (next: BreakKind) => {
    setKind(next)
    setDays(BREAK_DEFAULT_DAYS[next])
  }

  if (running && limit) {
    return (
      <section className="pause pause--on">
        <div className="pause__head">
          <span className="badge badge--pause">{BREAK_LABELS[running.kind]}</span>
          <span className="pause__left readout">
            noch {limit.daysLeft} Tag{limit.daysLeft === 1 ? '' : 'e'} · bis{' '}
            {running.until.slice(8, 10)}.{running.until.slice(5, 7)}.
          </span>
          <button type="button" disabled={busy} onClick={() => void run(endBreak)}>
            {busy ? 'Beendet…' : 'Pause beenden'}
          </button>
        </div>
        <p className="pause__note">{limit.reason}</p>
        {error && <p className="error">{error}</p>}
      </section>
    )
  }

  return (
    <section className="pause">
      <div className="pause__head">
        <span className="pause__label">Längere Pause</span>
        {open ? (
          <>
            <select
              aria-label="Grund"
              value={kind}
              onChange={(event) => chooseKind(event.target.value as BreakKind)}
            >
              {ALL_BREAK_KINDS.map((option) => (
                <option key={option} value={option}>
                  {BREAK_LABELS[option]}
                </option>
              ))}
            </select>
            <input
              aria-label="Tage"
              type="number"
              min={1}
              max={120}
              value={days}
              onChange={(event) => setDays(Number(event.target.value))}
            />
            <span className="pause__unit">Tage</span>
            <button type="button" disabled={busy} onClick={() => void run(() => declareBreak(kind, days))}>
              {busy ? 'Trägt ein…' : 'Eintragen'}
            </button>
            <button type="button" onClick={() => setOpen(false)}>
              Abbrechen
            </button>
          </>
        ) : (
          <button type="button" onClick={() => setOpen(true)}>
            Eintragen
          </button>
        )}
      </div>
      {open && (
        <p className="pause__note">
          Solange sie läuft, plant der Coach nichts Hartes und rechnet die Woche nicht als
          verpasst. Danach kommt die Intensität schrittweise zurück, nicht auf einen Schlag.
        </p>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  )
}
