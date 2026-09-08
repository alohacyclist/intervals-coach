import { useCallback, useEffect, useRef, useState } from 'react'
import type { CoachConfig, Plan } from '../coach/types.ts'
import { ApiError, getConfig, getPlan } from './api.ts'
import type { Me } from './api.ts'
import { DataIssueBanner } from './components/DataIssueBanner.tsx'
import { HistoryStrip } from './components/HistoryStrip.tsx'
import { ThresholdCard } from './components/ThresholdCard.tsx'
import { BenchmarkCard } from './components/BenchmarkCard.tsx'
import { DestinationBar } from './components/DestinationBar.tsx'
import { StateHeader } from './components/StateHeader.tsx'
import { DayCard } from './components/DayCard.tsx'
import { GoalsPanel } from './components/GoalsPanel.tsx'
import { SettingsPanel } from './components/SettingsPanel.tsx'
import { BreakBar } from './components/BreakBar.tsx'

const PLAN_DAYS = 3

type Props = {
  readonly me: Me
  readonly onNeedsOnboarding: () => void
}

const INTENTS = [
  { key: undefined, label: 'Wie geplant' },
  { key: 'hard', label: 'Heute hart' },
  { key: 'easy', label: 'Heute locker' },
  { key: 'rest', label: 'Heute Pause' },
] as const

export const PlanView = ({ me, onNeedsOnboarding }: Props) => {
  const [intent, setIntent] = useState<'hard' | 'easy' | 'rest' | undefined>(undefined)
  const [plan, setPlan] = useState<Plan | null>(null)
  const [config, setConfig] = useState<CoachConfig | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const settingsRef = useRef<HTMLDivElement | null>(null)

  // On a phone the panel opens below the fold, which looks like nothing happened.
  useEffect(() => {
    if (showSettings) settingsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [showSettings])

  const load = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const [nextPlan, nextConfig] = await Promise.all([getPlan(PLAN_DAYS, intent), getConfig()])
      setPlan(nextPlan)
      setConfig(nextConfig)
    } catch (caught) {
      if (caught instanceof ApiError && caught.needsOnboarding) {
        onNeedsOnboarding()
        return
      }
      if (caught instanceof ApiError && caught.needsLogin) {
        window.location.href = '/'
        return
      }
      setError(caught instanceof Error ? caught.message : 'Unbekannter Fehler')
    } finally {
      setBusy(false)
    }
  }, [onNeedsOnboarding, intent])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <>
      {me.mode === 'multi' && (
        <div className="account">
          <span>
            Angemeldet als {me.name}
            {me.consentAt &&
              ` · Einwilligung ${new Date(me.consentAt).toLocaleDateString('de-DE')}`}
          </span>
          <a href="/auth/logout">Abmelden</a>
        </div>
      )}

      {plan && (
        <StateHeader
          state={plan.state}
          busy={busy}
          onRefresh={() => void load()}
          onSettings={() => setShowSettings((open) => !open)}
        />
      )}

      {plan?.state.dataIssue && <DataIssueBanner issue={plan.state.dataIssue} />}

      {plan && plan.thresholdSuggestions.length > 0 && (
        <ThresholdCard
          suggestions={plan.thresholdSuggestions}
          date={plan.days[0]?.date ?? ''}
          onAdopted={() => void load()}
        />
      )}

      {plan && plan.history.length > 0 && <HistoryStrip history={plan.history} />}

      {plan && config && (
        <BreakBar config={config} today={plan.days[0]?.date ?? ''} onChanged={() => void load()} />
      )}

      {plan && (
        <div className="intent">
          <span className="intent__label">Heute</span>
          {INTENTS.map((option) => (
            <button
              key={option.label}
              type="button"
              className={intent === option.key ? 'intent__on' : ''}
              onClick={() => setIntent(option.key)}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}

      {error && (
        <p className="error error--block">
          {error}
          <button type="button" onClick={() => void load()}>
            Erneut versuchen
          </button>
        </p>
      )}

      {showSettings && config && (
        <div ref={settingsRef}>
          <SettingsPanel
            config={config}
            canDelete={me.mode === 'multi'}
            onClose={() => setShowSettings(false)}
            onSaved={(saved) => {
              setConfig(saved)
              setShowSettings(false)
              void load()
            }}
          />
        </div>
      )}

      {!plan && !error && <p className="loading">Lade Daten von intervals.icu…</p>}

      {plan?.days.map((day, index) => (
        <DayCard
          key={day.date}
          day={day}
          index={index}
          strengthDone={config?.strengthLog.includes(day.date) ?? false}
          onStrengthLogged={() => void load()}
          destinations={(plan?.destinations ?? []).filter((d) => d.enabled).map((d) => d.label)}
        />
      ))}

      {plan && (plan.benchmark.due || plan.benchmark.results.length > 0) && (
        <BenchmarkCard status={plan.benchmark} />
      )}

      {plan && plan.destinations.length > 0 && (
        <DestinationBar destinations={plan.destinations} onChanged={() => void load()} />
      )}

      {plan && config && <GoalsPanel goals={config.goals} feasibility={plan.feasibility} />}

      {plan && (
        <footer className="footer">
          Stand: {new Date(plan.generatedAt).toLocaleString('de-DE')} ·{' '}
          <a href="/datenschutz">Datenschutz</a> · <a href="/impressum">Impressum</a>
        </footer>
      )}
    </>
  )
}
