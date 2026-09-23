import { useEffect, useState } from 'react'
import type { CoachConfig, ZrlSettings, ZwiftRoute } from '../../coach/types.ts'
import { ZRL_FORMATS, ZRL_FORMAT_LABELS } from '../../coach/types.ts'
import { weekdayDe } from '../../coach/dates.ts'
import { fetchZwiftRoutes, putZrlRaces, putZrlSettings } from '../api.ts'
import type { ZrlRow } from '../zrl-rows.ts'
import { inputOf, nextTuesday, racesFrom, routeLabel, rowOf, withRound } from '../zrl-rows.ts'

type Props = {
  readonly config: CoachConfig
  readonly today: string
  readonly onSaved: (config: CoachConfig) => void
}

const ROUND_WEEKS = 6

export const ZrlPanel = ({ config, today, onSaved }: Props) => {
  const [routes, setRoutes] = useState<readonly ZwiftRoute[]>([])
  const [rows, setRows] = useState<readonly ZrlRow[]>(() =>
    config.zrlRaces.filter((race) => race.date >= today).map(rowOf),
  )
  const [start, setStart] = useState(() => nextTuesday(today))
  const [weeks, setWeeks] = useState(ROUND_WEEKS)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [league, setLeague] = useState<ZrlSettings>(config.zrl)
  const [switching, setSwitching] = useState(false)

  useEffect(() => setLeague(config.zrl), [config.zrl])

  // A switch applies on the spot, like every other per-item action in the app.
  const switchLeague = async (next: ZrlSettings) => {
    setLeague(next)
    setSwitching(true)
    setError(null)
    try {
      onSaved(await putZrlSettings(next))
    } catch (caught) {
      setLeague(config.zrl)
      setError(caught instanceof Error ? caught.message : 'Speichern fehlgeschlagen')
    } finally {
      setSwitching(false)
    }
  }

  useEffect(() => {
    fetchZwiftRoutes().then(setRoutes, () =>
      setError('Routenliste nicht erreichbar — Routen lassen sich gerade nicht eintragen.'),
    )
  }, [])

  // Follows the stored round while nothing is being edited, so a stale copy is never saved back.
  useEffect(() => {
    if (!dirty) setRows(config.zrlRaces.filter((race) => race.date >= today).map(rowOf))
  }, [config.zrlRaces, today, dirty])

  const edit = (next: readonly ZrlRow[]) => {
    setRows(next)
    setSaved(false)
    setDirty(true)
  }
  const patch = (date: string, change: Partial<ZrlRow>) =>
    edit(rows.map((row) => (row.date === date ? { ...row, ...change } : row)))

  const save = async () => {
    const result = racesFrom(rows, routes)
    if ('error' in result) {
      setError(result.error)
      return
    }
    setBusy(true)
    setError(null)
    try {
      // Past races stay on record: they tell the estimate which format was ridden.
      const past = config.zrlRaces.filter((race) => race.date < today).map(inputOf)
      onSaved(await putZrlRaces([...past, ...result.races]))
      setSaved(true)
      setDirty(false)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Speichern fehlgeschlagen')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="settings zrl">
      <div className="settings__head">
        <h2>Zwift Racing League</h2>
      </div>
      <div className="zrl__switches">
        <label className="zrl__toggle">
          <input
            type="checkbox"
            checked={league.enabled}
            disabled={switching}
            onChange={() => void switchLeague({ ...league, enabled: !league.enabled })}
          />
          ZRL-Termine im Trainingsplan berücksichtigen
        </label>
        <label className="zrl__toggle">
          <input
            type="checkbox"
            checked={league.taper}
            disabled={switching || !league.enabled}
            onChange={() => void switchLeague({ ...league, taper: !league.taper })}
          />
          Taper: Tag vor dem Rennen locker mit kurzen Antritten
        </label>
      </div>
      <p className="zrl__hint">
        Eingeschaltet wird jeder Dienstag ein Renntag — ein Qualitätstag, die Alternative steht
        immer daneben, ob du fährst, entscheidest du am Tag selbst. Ohne Eintrag ist die Schätzung
        grob; Format und Route stehen bei WTRL oder Zwift Insider. Zwischen zwei Runden ausschalten.
      </p>

      <div className="grid">
        <label>
          Erstes Rennen
          <input type="date" value={start} onChange={(event) => setStart(event.target.value)} />
        </label>
        <label>
          Wochen
          <input
            type="number"
            min={1}
            max={12}
            value={weeks}
            onChange={(event) => setWeeks(Number(event.target.value))}
          />
        </label>
      </div>
      <div className="settings__actions">
        <button type="button" onClick={() => edit(withRound(rows, start, weeks))}>
          Termine anlegen
        </button>
      </div>

      {rows.length > 0 && (
        <ol className="zrl__races">
          {rows.map((row) => (
            <li key={row.date} className="zrl__race">
              <span className="zrl__date readout">
                {weekdayDe(row.date)} {row.date.slice(8, 10)}.{row.date.slice(5, 7)}.
              </span>
              <label>
                Format
                <select
                  value={row.format}
                  onChange={(event) =>
                    patch(row.date, { format: event.target.value as ZrlRow['format'] })
                  }
                >
                  <option value="">wählen…</option>
                  {ZRL_FORMATS.map((format) => (
                    <option key={format} value={format}>
                      {ZRL_FORMAT_LABELS[format]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="zrl__route">
                Route
                <input
                  list="zwift-routes"
                  value={row.route}
                  placeholder="noch offen"
                  onChange={(event) => patch(row.date, { route: event.target.value })}
                />
              </label>
              <label>
                Runden
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={row.laps}
                  onChange={(event) => patch(row.date, { laps: Number(event.target.value) })}
                />
              </label>
              <button
                type="button"
                aria-label="Rennen entfernen"
                onClick={() => edit(rows.filter((entry) => entry.date !== row.date))}
              >
                ×
              </button>
            </li>
          ))}
        </ol>
      )}

      <datalist id="zwift-routes">
        {routes.map((route) => (
          <option key={route.id} value={routeLabel(route)}>
            {`${route.distanceKm.toFixed(1)} km · ${route.elevationM} hm`}
          </option>
        ))}
      </datalist>

      {error && <p className="error">{error}</p>}
      <div className="settings__actions">
        <button type="button" disabled={busy} onClick={() => void save()}>
          {busy ? 'Speichert…' : saved ? '✓ Gespeichert' : 'Runde speichern'}
        </button>
      </div>
    </section>
  )
}
