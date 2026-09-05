import { useCallback, useEffect, useState } from 'react'
import type { CoachConfig, Plan } from '../coach/types.ts'
import { ApiError, getConfig, getPlan } from './api.ts'
import type { Me } from './api.ts'
import { DataIssueBanner } from './components/DataIssueBanner.tsx'
import { HistoryStrip } from './components/HistoryStrip.tsx'
import { ThresholdCard } from './components/ThresholdCard.tsx'
import { BenchmarkCard } from './components/BenchmarkCard.tsx'
import { StateHeader } from './components/StateHeader.tsx'
import { DayCard } from './components/DayCard.tsx'
import { GoalsPanel } from './components/GoalsPanel.tsx'
import { SettingsPanel } from './components/SettingsPanel.tsx'

const PLAN_DAYS = 3

type Props = {
  readonly me: Me
  readonly onNeedsOnboarding: () => void
}

export const PlanView = ({ me, onNeedsOnboarding }: Props) => {
  const [plan, setPlan] = useState<Plan | null>(null)
  const [config, setConfig] = useState<CoachConfig | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  const load = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const [nextPlan, nextConfig] = await Promise.all([getPlan(PLAN_DAYS), getConfig()])
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
  }, [onNeedsOnboarding])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <>
      {me.mode === 'multi' && (
        <div className="account">
          <span>Angemeldet als {me.name}</span>
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
        <ThresholdCard suggestions={plan.thresholdSuggestions} onAdopted={() => void load()} />
      )}

      {plan && plan.history.length > 0 && <HistoryStrip history={plan.history} />}

      {error && (
        <p className="error error--block">
          {error}
          <button type="button" onClick={() => void load()}>
            Erneut versuchen
          </button>
        </p>
      )}

      {showSettings && config && (
        <SettingsPanel
          config={config}
          onClose={() => setShowSettings(false)}
          onSaved={(saved) => {
            setConfig(saved)
            setShowSettings(false)
            void load()
          }}
        />
      )}

      {!plan && !error && <p className="loading">Lade Daten von intervals.icu…</p>}

      {plan?.days.map((day, index) => (
        <DayCard
          key={day.date}
          day={day}
          index={index}
          strengthDone={config?.strengthLog.includes(day.date) ?? false}
          onStrengthLogged={() => void load()}
        />
      ))}

      {plan && (plan.benchmark.due || plan.benchmark.results.length > 0) && (
        <BenchmarkCard status={plan.benchmark} />
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
