import { useEffect, useState } from 'react'
import type { CoachConfig, Equipment, Goal, Sport, SportSetting } from '../coach/types.ts'
import { EQUIPMENT_LABELS, SPORT_LABELS } from '../coach/types.ts'
import { ftpOf } from '../coach/thresholds.ts'
import { getSportSettings, putConfig } from './api.ts'
import { parseMmSs } from './format-input.ts'
import { SportPicker } from './components/SportPicker.tsx'

type Draft = {
  sports: readonly SportSetting[]
  equipment: Equipment
  weightKg: string
  ftpTarget: string
  ftpDate: string
  raceSport: Sport
  raceDistanceKm: string
  raceCurrent: string
  raceTarget: string
  raceDate: string
  sessionsMin: string
  sessionsMax: string
  maxMinutes: string
}

const EMPTY: Draft = {
  sports: [
    { sport: 'Ride', threshold: { metric: 'power', ftp: 250 } },
    { sport: 'Run', threshold: { metric: 'pace', thresholdSecPerKm: 270 } },
  ],
  equipment: 'dumbbells',
  weightKg: '75',
  ftpTarget: '',
  ftpDate: '',
  raceSport: 'Run',
  raceDistanceKm: '10',
  raceCurrent: '',
  raceTarget: '',
  raceDate: '',
  sessionsMin: '2',
  sessionsMax: '4',
  maxMinutes: '75',
}

const buildGoals = (draft: Draft, ftp: number | null): readonly Goal[] => {
  const goals: Goal[] = []
  if (ftp && Number(draft.ftpTarget) > 0) {
    goals.push({
      id: 'ftp',
      sport: 'Ride',
      kind: 'ftp',
      label: `FTP ${draft.ftpTarget}W`,
      currentValue: ftp,
      targetValue: Number(draft.ftpTarget),
      priority: 'A',
      ...(draft.ftpDate ? { targetDate: draft.ftpDate } : {}),
    })
  }
  if (draft.raceTarget && draft.raceCurrent) {
    const distance = Number(draft.raceDistanceKm)
    goals.push({
      id: 'race',
      sport: draft.raceSport,
      kind: 'raceTime',
      label: `${distance} km ${SPORT_LABELS[draft.raceSport]} in ${draft.raceTarget}`,
      currentValue: parseMmSs(draft.raceCurrent),
      targetValue: parseMmSs(draft.raceTarget),
      distanceKm: distance,
      priority: 'A',
      ...(draft.raceDate ? { targetDate: draft.raceDate } : {}),
    })
  }
  return goals
}

export const Onboarding = ({ onDone }: { readonly onDone: () => void }) => {
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    // Prefill from the athlete's own intervals.icu settings so the numbers match.
    getSportSettings()
      .then((settings) =>
        setDraft((current) => ({
          ...current,
          sports: current.sports.map((setting) => {
            if (setting.sport === 'Ride' && settings.ftp) {
              return { ...setting, threshold: { metric: 'power' as const, ftp: settings.ftp } }
            }
            if (setting.sport === 'Run' && settings.thresholdPaceSecPerKm) {
              return {
                ...setting,
                threshold: { metric: 'pace' as const, thresholdSecPerKm: settings.thresholdPaceSecPerKm },
              }
            }
            return setting
          }),
        })),
      )
      .catch(() => undefined)
  }, [])

  const set = (key: keyof Draft) => (event: { target: { value: string } }) =>
    setDraft((current) => ({ ...current, [key]: event.target.value }))

  const profile = {
    sports: draft.sports,
    equipment: draft.equipment,
    weightKg: Number(draft.weightKg),
    maxHr: null,
    lthr: null,
    weeklySessions: { min: Number(draft.sessionsMin), max: Number(draft.sessionsMax) },
    maxSessionMinutes: Number(draft.maxMinutes),
  }
  const ridesBike = draft.sports.some((setting) => setting.sport === 'Ride')

  const submit = async () => {
    const config: CoachConfig = {
      profile,
      goals: buildGoals(draft, ftpOf(profile)),
      strengthLog: [],
      planStart: new Date().toISOString().slice(0, 10),
    }
    if (config.profile.sports.length === 0) {
      setError('Wähl mindestens eine Sportart.')
      return
    }
    if (config.goals.length === 0) {
      setError('Setz mindestens ein Ziel — FTP oder eine Wettkampfzeit.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await putConfig(config)
      onDone()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Speichern fehlgeschlagen')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="onboarding">
      <h1>Kurz einrichten</h1>
      <p className="onboarding__lead">Zwei Minuten. Alles lässt sich später ändern.</p>

      <fieldset>
        <legend>Was trainierst du</legend>
        <p className="hint">
          Der Plan zeigt für jeden Tag zu jeder gewählten Sportart eine Einheit — du nimmst die, für
          die du Zeit hast. Die Schwellenwerte holt er, wenn möglich, aus deinen intervals.icu-Einstellungen.
        </p>
        <SportPicker sports={draft.sports} onChange={(sports) => setDraft((c) => ({ ...c, sports }))} />
        <div className="grid">
          <label>
            Gewicht (kg)
            <input type="number" value={draft.weightKg} onChange={set('weightKg')} />
          </label>
          <label>
            Krafttraining mit
            <select value={draft.equipment} onChange={set('equipment')}>
              {(Object.keys(EQUIPMENT_LABELS) as Equipment[]).map((option) => (
                <option key={option} value={option}>
                  {EQUIPMENT_LABELS[option]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend>Was willst du erreichen</legend>
        <p className="hint">Mindestens eines von beiden. Zieldatum ist optional.</p>
        {ridesBike && (
          <div className="grid">
            <label>
              FTP-Ziel (W)
              <input type="number" placeholder="z. B. 300" value={draft.ftpTarget} onChange={set('ftpTarget')} />
            </label>
            <label>
              bis wann
              <input type="date" value={draft.ftpDate} onChange={set('ftpDate')} />
            </label>
          </div>
        )}
        <div className="grid">
          <label>
            Wettkampf-Sportart
            <select value={draft.raceSport} onChange={set('raceSport')}>
              {draft.sports.map((setting) => (
                <option key={setting.sport} value={setting.sport}>
                  {SPORT_LABELS[setting.sport]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Distanz (km)
            <input type="number" step="0.1" value={draft.raceDistanceKm} onChange={set('raceDistanceKm')} />
          </label>
          <label>
            aktuelle Zeit (mm:ss)
            <input type="text" placeholder="38:00" value={draft.raceCurrent} onChange={set('raceCurrent')} />
          </label>
          <label>
            Zielzeit (mm:ss)
            <input type="text" placeholder="36:00" value={draft.raceTarget} onChange={set('raceTarget')} />
          </label>
          <label>
            bis wann
            <input type="date" value={draft.raceDate} onChange={set('raceDate')} />
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend>Wie viel Zeit hast du</legend>
        <p className="hint">
          Das Minimum ist dein Vorsatz — der Plan sagt dir, wenn du drunter liegst. Das Maximum
          steuert, wie viele harte Einheiten pro Woche eingeplant werden.
        </p>
        <div className="grid">
          <label>
            Einheiten / Woche mindestens
            <input type="number" min={1} max={14} value={draft.sessionsMin} onChange={set('sessionsMin')} />
          </label>
          <label>
            Einheiten / Woche höchstens
            <input type="number" min={1} max={14} value={draft.sessionsMax} onChange={set('sessionsMax')} />
          </label>
          <label>
            Minuten pro Einheit (max.)
            <input type="number" value={draft.maxMinutes} onChange={set('maxMinutes')} />
          </label>
        </div>
      </fieldset>

      {error && <p className="error">{error}</p>}

      <button type="button" className="cta cta--button" disabled={busy} onClick={() => void submit()}>
        {busy ? 'Speichert…' : 'Plan erstellen'}
      </button>
    </section>
  )
}
