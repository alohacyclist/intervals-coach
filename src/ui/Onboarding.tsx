import { useEffect, useState } from 'react'
import type { CoachConfig, Goal } from '../coach/types.ts'
import { formatSeconds } from '../coach/dates.ts'
import { getSportSettings, putConfig } from './api.ts'

const parseMmSs = (value: string): number => {
  const [minutes = '0', seconds = '0'] = value.split(':')
  return Number(minutes) * 60 + Number(seconds)
}

type Draft = {
  ftp: string
  ftpTarget: string
  ftpDate: string
  thresholdPace: string
  weightKg: string
  raceDistanceKm: string
  raceCurrent: string
  raceTarget: string
  raceDate: string
  sessionsMin: string
  sessionsMax: string
  maxMinutes: string
}

const EMPTY: Draft = {
  ftp: '250',
  ftpTarget: '',
  ftpDate: '',
  thresholdPace: '4:30',
  weightKg: '75',
  raceDistanceKm: '10',
  raceCurrent: '',
  raceTarget: '',
  raceDate: '',
  sessionsMin: '2',
  sessionsMax: '4',
  maxMinutes: '75',
}

const buildGoals = (draft: Draft): readonly Goal[] => {
  const goals: Goal[] = []
  if (Number(draft.ftpTarget) > 0) {
    goals.push({
      id: 'ftp',
      sport: 'Ride',
      kind: 'ftp',
      label: `FTP ${draft.ftpTarget}W`,
      currentValue: Number(draft.ftp),
      targetValue: Number(draft.ftpTarget),
      priority: 'A',
      ...(draft.ftpDate ? { targetDate: draft.ftpDate } : {}),
    })
  }
  if (draft.raceTarget && draft.raceCurrent) {
    const distance = Number(draft.raceDistanceKm)
    goals.push({
      id: 'race',
      sport: 'Run',
      kind: 'raceTime',
      label: `${distance} km in ${draft.raceTarget}`,
      currentValue: parseMmSs(draft.raceCurrent),
      targetValue: parseMmSs(draft.raceTarget),
      distanceKm: distance,
      priority: 'A',
      ...(draft.raceDate ? { targetDate: draft.raceDate } : {}),
    })
  }
  return goals
}

const buildConfig = (draft: Draft): CoachConfig => ({
  profile: {
    ftp: Number(draft.ftp),
    thresholdPaceSecPerKm: parseMmSs(draft.thresholdPace),
    weightKg: Number(draft.weightKg),
    maxHr: null,
    lthr: null,
    weeklySessions: { min: Number(draft.sessionsMin), max: Number(draft.sessionsMax) },
    maxSessionMinutes: Number(draft.maxMinutes),
  },
  goals: buildGoals(draft),
  planStart: new Date().toISOString().slice(0, 10),
})

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
          ftp: settings.ftp ? String(settings.ftp) : current.ftp,
          thresholdPace: settings.thresholdPaceSecPerKm
            ? formatSeconds(settings.thresholdPaceSecPerKm)
            : current.thresholdPace,
        })),
      )
      .catch(() => undefined)
  }, [])

  const set = (key: keyof Draft) => (event: { target: { value: string } }) =>
    setDraft((current) => ({ ...current, [key]: event.target.value }))

  const submit = async () => {
    const config = buildConfig(draft)
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
      <p className="onboarding__lead">
        Zwei Minuten. Alles lässt sich später in den Einstellungen ändern.
      </p>

      <fieldset>
        <legend>Wo stehst du</legend>
        <div className="grid">
          <label>
            FTP aktuell (W)
            <input type="number" value={draft.ftp} onChange={set('ftp')} />
          </label>
          <label>
            Schwellenpace Laufen (min/km)
            <input type="text" value={draft.thresholdPace} onChange={set('thresholdPace')} />
          </label>
          <label>
            Gewicht (kg)
            <input type="number" value={draft.weightKg} onChange={set('weightKg')} />
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend>Was willst du erreichen</legend>
        <p className="hint">Mindestens eines von beiden. Zieldatum ist optional.</p>
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
        <div className="grid">
          <label>
            Laufdistanz (km)
            <input type="number" value={draft.raceDistanceKm} onChange={set('raceDistanceKm')} />
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
          Das Minimum ist dein Vorsatz — der Plan sagt dir, wenn du drunter liegst. Das Maximum steuert,
          wie viele harte Einheiten pro Woche eingeplant werden.
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
