import { useEffect, useState } from 'react'
import type { CoachConfig, Equipment, Goal, Sport, SportSetting } from '../coach/types.ts'
import { EQUIPMENT_LABELS, SPORT_LABELS } from '../coach/types.ts'
import { ftpOf } from '../coach/thresholds.ts'
import type { SportSettings } from './api.ts'
import { getSportSettings, putConfig } from './api.ts'
import { parseTime, timeError } from './format-input.ts'
import { SportPicker } from './components/SportPicker.tsx'
import { TimeField } from './components/TimeField.tsx'
import type { ThresholdSources } from './threshold-input.ts'
import { prefillSports, prefilledThreshold } from './threshold-input.ts'

type Draft = {
  sports: readonly SportSetting[]
  sources: ThresholdSources
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
  minMinutes: string
  normalMinutes: string
  maxMinutes: string
}

const EMPTY: Draft = {
  sports: [
    { sport: 'Ride', threshold: { metric: 'power', ftp: 250 } },
    { sport: 'Run', threshold: { metric: 'pace', thresholdSecPerKm: 270 } },
  ],
  sources: {},
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
  minMinutes: '45',
  normalMinutes: '60',
  maxMinutes: '90',
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
  const current = parseTime(draft.raceCurrent)
  const target = parseTime(draft.raceTarget)
  if (current !== null && target !== null) {
    const distance = Number(draft.raceDistanceKm)
    goals.push({
      id: 'race',
      sport: draft.raceSport,
      kind: 'raceTime',
      label: `${distance} km ${SPORT_LABELS[draft.raceSport]} in ${draft.raceTarget}`,
      currentValue: current,
      targetValue: target,
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
  const [thresholdsValid, setThresholdsValid] = useState(true)
  const [intervals, setIntervals] = useState<SportSettings | null>(null)

  useEffect(() => {
    // Prefill from the athlete's own intervals.icu settings so the numbers match;
    // whatever intervals.icu does not know stays visibly an estimate.
    const apply = (settings: SportSettings | null) => {
      setIntervals(settings)
      setDraft((current) => ({ ...current, ...prefillSports(current.sports, current.sources, settings) }))
    }
    getSportSettings()
      .then(apply)
      .catch(() => apply(null))
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
    sessionMinutes: {
      min: Number(draft.minMinutes),
      normal: Number(draft.normalMinutes),
      max: Number(draft.maxMinutes),
    },
  }
  const ridesBike = draft.sports.some((setting) => setting.sport === 'Ride')

  const raceErrors = {
    current: timeError(draft.raceCurrent, draft.raceTarget.trim() !== ''),
    target: timeError(draft.raceTarget, draft.raceCurrent.trim() !== ''),
  }

  const submit = async () => {
    if (!thresholdsValid || raceErrors.current !== null || raceErrors.target !== null) {
      setError('Bitte die markierten Felder prüfen.')
      return
    }
    const config: CoachConfig = {
      profile,
      goals: buildGoals(draft, ftpOf(profile)),
      strengthLog: [],
      breaks: [],
      proposals: [],
      zrlRaces: [],
      zrl: { enabled: false, taper: true },
      destinations: {},
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
        <SportPicker
          sports={draft.sports}
          sources={draft.sources}
          onChange={(sports, sources) => setDraft((c) => ({ ...c, sports, sources }))}
          onValidity={setThresholdsValid}
          prefill={(sport) => prefilledThreshold(sport, intervals)}
        />
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
          <TimeField
            label="aktuelle Zeit"
            placeholder="38:00 oder 1:45:00"
            value={draft.raceCurrent}
            onChange={(value) => setDraft((current) => ({ ...current, raceCurrent: value }))}
            error={raceErrors.current}
          />
          <TimeField
            label="Zielzeit"
            placeholder="36:00 oder 1:39:00"
            value={draft.raceTarget}
            onChange={(value) => setDraft((current) => ({ ...current, raceTarget: value }))}
            error={raceErrors.target}
          />
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
            Minuten — schaffe ich immer
            <input type="number" value={draft.minMinutes} onChange={set('minMinutes')} />
          </label>
          <label>
            Minuten — normalerweise
            <input type="number" value={draft.normalMinutes} onChange={set('normalMinutes')} />
          </label>
          <label>
            Minuten — wenn viel Zeit ist
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
