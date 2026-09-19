import { useCallback, useEffect, useState } from 'react'
import type { CoachConfig, Progress } from '../coach/types.ts'
import { ApiError, getConfig, getProgress } from './api.ts'
import { FitnessCurve } from './components/FitnessCurve.tsx'
import { WeekBars } from './components/WeekBars.tsx'
import { LevelLadder } from './components/LevelLadder.tsx'
import { BenchmarkCard } from './components/BenchmarkCard.tsx'
import { GoalsPanel } from './components/GoalsPanel.tsx'
import { SPORT_LABELS } from '../coach/types.ts'

type Props = {
  readonly onNeedsOnboarding: () => void
}

/**
 * The development view. It answers a question asked monthly — am I getting
 * anywhere — which is why it is a page of its own: putting it under the plan
 * meant scrolling past a season to find out what to do today.
 */
export const ProgressView = ({ onNeedsOnboarding }: Props) => {
  const [progress, setProgress] = useState<Progress | null>(null)
  const [config, setConfig] = useState<CoachConfig | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const [next, stored] = await Promise.all([getProgress(), getConfig()])
      setProgress(next)
      setConfig(stored)
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
    }
  }, [onNeedsOnboarding])

  useEffect(() => {
    void load()
  }, [load])

  if (error) {
    return (
      <p className="error error--block">
        {error}
        <button type="button" onClick={() => void load()}>
          Erneut versuchen
        </button>
      </p>
    )
  }

  if (!progress) return <p className="loading">Lade Verlauf von intervals.icu…</p>

  const { totals } = progress
  const sports = Object.entries(totals.sessionsBySport)
    .filter(([sport]) => sport in SPORT_LABELS)
    .map(([sport, count]) => `${SPORT_LABELS[sport as keyof typeof SPORT_LABELS]} ${count}`)

  return (
    <>
      <section className="totals">
        <div className="totals__head">
          <h2>Erreicht</h2>
          <span className="totals__span readout">letzte {progress.historyDays} Tage</span>
        </div>
        <dl className="metrics">
          <div>
            <dt>Einheiten</dt>
            <dd>{totals.sessions}</dd>
          </div>
          <div>
            <dt>Stunden</dt>
            <dd>{totals.hours}</dd>
          </div>
          <div>
            <dt>Load gesamt</dt>
            <dd>{totals.load}</dd>
          </div>
          <div>
            <dt>Tage trainiert</dt>
            <dd>{totals.days}</dd>
          </div>
          <div>
            <dt>Längste Pause</dt>
            <dd>{totals.longestBreak}</dd>
          </div>
          <div>
            <dt>Ø pro Woche</dt>
            <dd>{Math.round((totals.sessions / progress.historyDays) * 7 * 10) / 10}</dd>
          </div>
        </dl>
        {sports.length > 0 && <p className="totals__split readout">{sports.join(' · ')}</p>}
      </section>

      <FitnessCurve points={progress.fitness} />

      <WeekBars weeks={progress.weeks} />

      <LevelLadder levels={progress.levels} />

      {(progress.benchmark.due || progress.benchmark.results.length > 0) && (
        <BenchmarkCard status={progress.benchmark} />
      )}

      {config && <GoalsPanel goals={config.goals} feasibility={progress.feasibility} />}
    </>
  )
}
