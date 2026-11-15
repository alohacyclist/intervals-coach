import { useEffect, useState } from 'react'
import type { CoachConfig, Equipment, SportSetting } from '../coach/types.ts'
import { EQUIPMENT_LABELS } from '../coach/types.ts'
import { localIsoDate } from '../coach/dates.ts'
import type { SportSettings } from './api.ts'
import { getSportSettings, putConfig } from './api.ts'
import { SportPicker } from './components/SportPicker.tsx'
import { GoalEditor } from './components/GoalEditor.tsx'
import type { GoalDraft } from './goal-draft.ts'
import { emptyGoalDraft, goalErrors, goalFromDraft, hasErrors } from './goal-draft.ts'
import type { ThresholdSources } from './threshold-input.ts'
import { prefillSports, prefilledThreshold } from './threshold-input.ts'
import { t } from '../coach/lang.ts'

type GoalChoice = 'none' | 'ftp' | 'raceTime'

const GOAL_CHOICES: readonly { readonly value: GoalChoice; readonly label: string }[] = [
  { value: 'none', label: t('Kein konkretes Ziel – fit bleiben') },
  { value: 'raceTime', label: t('Wettkampf – eine Zielzeit') },
  { value: 'ftp', label: t('FTP steigern') },
]

type Draft = {
  sports: readonly SportSetting[]
  sources: ThresholdSources
  equipment: Equipment
  weightKg: string
  goalChoice: GoalChoice
  goals: Readonly<Record<Exclude<GoalChoice, 'none'>, GoalDraft>>
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
  goalChoice: 'none',
  goals: { ftp: emptyGoalDraft('ftp', 'ftp', 'Ride'), raceTime: emptyGoalDraft('race', 'raceTime', 'Run') },
  sessionsMin: '2',
  sessionsMax: '4',
  minMinutes: '45',
  normalMinutes: '60',
  maxMinutes: '90',
}

export const Onboarding = ({ onDone }: { readonly onDone: () => void }) => {
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [thresholdsValid, setThresholdsValid] = useState(true)
  const [intervals, setIntervals] = useState<SportSettings | null>(null)
  const [attempted, setAttempted] = useState(false)

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
  const today = localIsoDate()
  const choices = GOAL_CHOICES.filter((choice) => choice.value !== 'ftp' || ridesBike)
  // FTP disappears with the bike; the choice then falls back to no goal rather than a hidden one.
  const choice = choices.some((entry) => entry.value === draft.goalChoice) ? draft.goalChoice : 'none'
  const goalDraft = choice === 'none' ? null : draft.goals[choice]
  // A race in a sport no longer trained falls back to the first one that is.
  const activeDraft =
    goalDraft?.kind === 'raceTime' && !draft.sports.some((setting) => setting.sport === goalDraft.sport)
      ? { ...goalDraft, sport: draft.sports[0]?.sport ?? goalDraft.sport }
      : goalDraft
  const errors = activeDraft === null ? {} : goalErrors(activeDraft, profile, today)

  const setGoal = (next: GoalDraft) =>
    setDraft((current) => ({ ...current, goals: { ...current.goals, [next.kind]: next } }))

  const submit = async () => {
    setAttempted(true)
    const goal = activeDraft === null ? null : goalFromDraft(activeDraft, profile, today)
    if (!thresholdsValid || hasErrors(errors) || (activeDraft !== null && goal === null)) {
      setError(t('Bitte die markierten Felder prüfen.'))
      return
    }
    const config: CoachConfig = {
      profile,
      goals: goal === null ? [] : [goal],
      strengthLog: [],
      breaks: [],
      proposals: [],
      zrlRaces: [],
      zrl: { enabled: false, taper: true },
      destinations: {},
      planStart: today,
    }
    if (config.profile.sports.length === 0) {
      setError(t('Wähl mindestens eine Sportart.'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      await putConfig(config)
      onDone()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('Speichern fehlgeschlagen'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="onboarding">
      <h1>{t('Kurz einrichten')}</h1>
      <p className="onboarding__lead">{t('Zwei Minuten. Alles lässt sich später ändern.')}</p>

      <fieldset>
        <legend>{t('Was trainierst du')}</legend>
        <p className="hint">
          {t('Der Plan zeigt für jeden Tag zu jeder gewählten Sportart eine Einheit — du nimmst die, für die du Zeit hast. FTP, Laufpace und CSS holt er, wenn möglich, aus deinen intervals.icu-Einstellungen.')}
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
            {t('Gewicht (kg)')}
            <input type="number" value={draft.weightKg} onChange={set('weightKg')} />
          </label>
          <label>
            {t('Krafttraining mit')}
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
        <legend>{t('Was willst du erreichen')}</legend>
        <div className="choices" role="radiogroup" aria-label={t('Ziel')}>
          {choices.map((entry) => (
            <label key={entry.value} className="sports__toggle">
              <input
                type="radio"
                name="goal-choice"
                checked={choice === entry.value}
                onChange={() => setDraft((current) => ({ ...current, goalChoice: entry.value }))}
              />
              {entry.label}
            </label>
          ))}
        </div>
        {activeDraft === null ? (
          <p className="hint">
            {t('Der Plan wechselt Grundlage und Aufbau in Vier-Wochen-Blöcken und setzt ab und zu eine Standortbestimmung. Ein Ziel kannst du jederzeit in den Einstellungen anlegen.')}
          </p>
        ) : (
          <GoalEditor
            draft={activeDraft}
            onChange={setGoal}
            errors={errors}
            showMissing={attempted}
            profile={profile}
          />
        )}
      </fieldset>

      <fieldset>
        <legend>{t('Wie viel Zeit hast du')}</legend>
        <p className="hint">
          {t('Das Minimum ist dein Vorsatz — der Plan sagt dir, wenn du drunter liegst. Das Maximum steuert, wie viele harte Einheiten pro Woche eingeplant werden.')}
        </p>
        <div className="grid">
          <label>
            {t('Einheiten / Woche mindestens')}
            <input type="number" min={1} max={14} value={draft.sessionsMin} onChange={set('sessionsMin')} />
          </label>
          <label>
            {t('Einheiten / Woche höchstens')}
            <input type="number" min={1} max={14} value={draft.sessionsMax} onChange={set('sessionsMax')} />
          </label>
          <label>
            {t('Minuten — schaffe ich immer')}
            <input type="number" value={draft.minMinutes} onChange={set('minMinutes')} />
          </label>
          <label>
            {t('Minuten — normalerweise')}
            <input type="number" value={draft.normalMinutes} onChange={set('normalMinutes')} />
          </label>
          <label>
            {t('Minuten — wenn viel Zeit ist')}
            <input type="number" value={draft.maxMinutes} onChange={set('maxMinutes')} />
          </label>
        </div>
      </fieldset>

      {error && <p className="error" role="alert">{error}</p>}

      <button type="button" className="cta cta--button" disabled={busy} onClick={() => void submit()}>
        {busy ? t('Speichert…') : t('Plan erstellen')}
      </button>
    </section>
  )
}
