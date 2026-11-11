import { useCallback, useEffect, useState } from 'react'
import type { CoachConfig, Progress, Sport } from '../coach/types.ts'
import { ApiError, EXPIRED_SESSION_URL, chooseLevel, getConfig, getProgress } from './api.ts'
import { FitnessCurve } from './components/FitnessCurve.tsx'
import { WeekBars } from './components/WeekBars.tsx'
import { SeasonBand } from './components/SeasonBand.tsx'
import { LevelLadder } from './components/LevelLadder.tsx'
import { BenchmarkCard } from './components/BenchmarkCard.tsx'
import { GoalsPanel } from './components/GoalsPanel.tsx'
import { SPORT_LABELS } from '../coach/types.ts'
import { DEFAULT_PROGRESS_SPAN, EARLY_DAYS, isProgressSpan, PROGRESS_SPANS, trackedDays } from '../coach/progress.ts'
import type { ProgressSpan } from '../coach/progress.ts'
import { GarminAttribution } from './components/GarminAttribution.tsx'
import { SportIcon } from './components/SportIcon.tsx'
import { t } from '../coach/lang.ts'

const SPAN_KEY = 'progress-span'
const SPAN_LABELS: Readonly<Record<ProgressSpan, string>> = {
  30: t('30 Tage'),
  90: t('90 Tage'),
  180: t('180 Tage'),
  365: t('1 Jahr'),
}

/** Private browsing modes throw on storage access; the page then opens on the default. */
const readSpan = (): ProgressSpan => {
  try {
    const stored = Number(window.localStorage.getItem(SPAN_KEY))
    return isProgressSpan(stored) ? stored : DEFAULT_PROGRESS_SPAN
  } catch {
    return DEFAULT_PROGRESS_SPAN
  }
}

const keepSpan = (span: ProgressSpan): void => {
  try {
    window.localStorage.setItem(SPAN_KEY, String(span))
  } catch {
    // Holds for this visit, not the next.
  }
}

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
  const [span, setSpan] = useState<ProgressSpan>(readSpan)
  const [busy, setBusy] = useState(false)
  const [savingLevel, setSavingLevel] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    setBusy(true)
    try {
      const [next, stored] = await Promise.all([getProgress(span), getConfig()])
      setProgress(next)
      setConfig(stored)
    } catch (caught) {
      if (caught instanceof ApiError && caught.needsOnboarding) {
        onNeedsOnboarding()
        return
      }
      if (caught instanceof ApiError && caught.needsLogin) {
        window.location.href = EXPIRED_SESSION_URL
        return
      }
      setError(caught instanceof Error ? caught.message : t('Unbekannter Fehler'))
    } finally {
      setBusy(false)
    }
  }, [onNeedsOnboarding, span])

  const choose = (next: ProgressSpan) => {
    keepSpan(next)
    setSpan(next)
  }

  useEffect(() => {
    void load()
  }, [load])

  const pickLevel = async (family: string, level: number | null) => {
    setSavingLevel(family)
    try {
      setConfig(await chooseLevel(family, level))
      setProgress(await getProgress(span))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('Stufe nicht gespeichert'))
    } finally {
      setSavingLevel(null)
    }
  }

  if (error) {
    return (
      <p className="error error--block" role="alert">
        {error}
        <button type="button" onClick={() => void load()}>
          {t('Erneut versuchen')}
        </button>
      </p>
    )
  }

  if (!progress) return <p className="loading" role="status">{t('Lade Verlauf von intervals.icu…')}</p>

  const { totals } = progress
  // A new athlete would otherwise meet zeros and empty charts, which read as broken.
  const early = trackedDays(progress.fitness) < EARLY_DAYS
  const sports = Object.entries(totals.sessionsBySport)
    .filter(([sport]) => sport in SPORT_LABELS)
    .map(([sport, count]) => ({ sport: sport as Sport, count }))
    .sort((left, right) => right.count - left.count)
  const mostSessions = sports[0]?.count ?? 1

  return (
    <>
      <div className="span-switch">
        <h1 className="span-switch__title">{t('Verlauf')}</h1>
        {/* The page stays on the last span while the next one loads, so it does not jump to empty. */}
        <div className="mode" role="group" aria-label={t('Zeitraum')} aria-busy={busy}>
          {PROGRESS_SPANS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={span === option}
              disabled={busy && span !== option}
              onClick={() => choose(option)}
            >
              {SPAN_LABELS[option]}
            </button>
          ))}
        </div>
      </div>
      <GarminAttribution attribution={progress.garmin} />

      {early && (
        <section className="totals early">
          <div className="totals__head">
            <h2>{t('Noch am Anfang')}</h2>
          </div>
          <p className="early__text">
            {t('Nach etwa zwei Wochen Training siehst du hier, wie sich deine Fitness entwickelt, wie viel du pro Woche trainierst und auf welcher Stufe du je Trainingsart stehst. Bis dahin reicht der Plan: einfach die Einheit des Tages machen.')}
          </p>
        </section>
      )}

      {(!early || totals.sessions > 0) && (
        <section className={busy ? 'totals totals--stale' : 'totals'}>
          <div className="totals__head">
            <h2>{t('Erreicht')}</h2>
            <span className="totals__span readout">{t`letzte ${progress.historyDays} Tage`}</span>
          </div>
          <dl className="metrics">
            <div>
              <dt>{t('Einheiten')}</dt>
              <dd>{totals.sessions}</dd>
            </div>
            <div>
              <dt>{t('Stunden')}</dt>
              <dd>{totals.hours}</dd>
            </div>
            <div>
              <dt>{t('Load gesamt')}</dt>
              <dd>{totals.load}</dd>
            </div>
            <div>
              <dt>{t('Tage trainiert')}</dt>
              <dd>{totals.days}</dd>
            </div>
            <div>
              <dt>{t('Längste Pause')}</dt>
              <dd>{totals.longestBreak}</dd>
            </div>
            <div>
              <dt>{t('Ø pro Woche')}</dt>
              <dd>{Math.round((totals.sessions / progress.historyDays) * 7 * 10) / 10}</dd>
            </div>
          </dl>
          {sports.length > 0 && (
            <ul className="sport-bars">
              {sports.map(({ sport, count }) => (
                <li key={sport}>
                  <SportIcon sport={sport} />
                  <i style={{ width: `${(count / mostSessions) * 100}%` }} />
                  <span>{count}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {!early && <FitnessCurve points={progress.fitness} />}

      <SeasonBand season={progress.season} />

      {!early && <WeekBars weeks={progress.weeks} />}

      <LevelLadder levels={progress.levels} onChoose={(family, level) => void pickLevel(family, level)} saving={savingLevel} />

      {(progress.benchmark.due || progress.benchmark.results.length > 0) && (
        <BenchmarkCard status={progress.benchmark} />
      )}

      {config && <GoalsPanel goals={config.goals} feasibility={progress.feasibility} />}
    </>
  )
}
