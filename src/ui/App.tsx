import { useCallback, useEffect, useState } from 'react'
import type { CoachConfig, Plan } from '../coach/types.ts'
import { getConfig, getPlan } from './api.ts'
import { StateHeader } from './components/StateHeader.tsx'
import { DayCard } from './components/DayCard.tsx'
import { GoalsPanel } from './components/GoalsPanel.tsx'
import { SettingsPanel } from './components/SettingsPanel.tsx'

const PLAN_DAYS = 3

export const App = () => {
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
      setError(caught instanceof Error ? caught.message : 'Unbekannter Fehler')
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <main className="app">
      {plan && (
        <StateHeader
          state={plan.state}
          busy={busy}
          onRefresh={() => void load()}
          onSettings={() => setShowSettings((open) => !open)}
        />
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
        <DayCard key={day.date} day={day} index={index} />
      ))}

      {plan && config && <GoalsPanel goals={config.goals} feasibility={plan.feasibility} />}

      {plan && (
        <footer className="footer">
          Stand: {new Date(plan.generatedAt).toLocaleString('de-DE')}
        </footer>
      )}
    </main>
  )
}
