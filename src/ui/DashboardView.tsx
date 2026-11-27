import { useState } from 'react'
import { DEFAULT_DASHBOARD_WEEKS, isDashboardWeeks } from '../coach/dashboard.ts'
import type { DashboardWeeks } from '../coach/dashboard.ts'
import { Cockpit } from './dashboard/Cockpit.tsx'
import { MobileDashboard } from './dashboard/MobileDashboard.tsx'
import { useDashboard, useMediaQuery } from './dashboard/useDashboard.ts'
import { t } from '../coach/lang.ts'

const WEEKS_KEY = 'dashboard-weeks'
const CALM_KEY = 'dashboard-calm'
/** Below this the three cockpit columns no longer fit side by side. */
export const COCKPIT_QUERY = '(min-width: 1100px)'

/** Private browsing modes throw on storage access; the page then opens on the default. */
const readStored = <T,>(key: string, parse: (raw: string | null) => T): T => {
  try {
    return parse(window.localStorage.getItem(key))
  } catch {
    return parse(null)
  }
}

const store = (key: string, value: string): void => {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Holds for this visit, not the next.
  }
}

type Props = {
  readonly onNeedsOnboarding: () => void
}

/**
 * Rides only: weekly load and efficiency from the activity summaries, and the two
 * steady block rules from each ride's streams. A wide screen gets the cockpit, a
 * phone a plain list of the same numbers.
 */
export const DashboardView = ({ onNeedsOnboarding }: Props) => {
  const [weeks, setWeeks] = useState<DashboardWeeks>(() =>
    readStored(WEEKS_KEY, (raw) => {
      const value = Number(raw)
      return isDashboardWeeks(value) ? value : DEFAULT_DASHBOARD_WEEKS
    }),
  )
  const [calm, setCalm] = useState(() => readStored(CALM_KEY, (raw) => raw === '1'))
  const wide = useMediaQuery(COCKPIT_QUERY)
  const still = useMediaQuery('(prefers-reduced-motion: reduce)')
  const state = useDashboard(weeks, onNeedsOnboarding)

  const chooseWeeks = (next: DashboardWeeks) => {
    store(WEEKS_KEY, String(next))
    setWeeks(next)
  }
  const toggleCalm = () => {
    store(CALM_KEY, calm ? '0' : '1')
    setCalm(!calm)
  }

  if (state.error) {
    return (
      <p className="error error--block" role="alert">
        {state.error}
        <button type="button" onClick={state.retry}>
          {t('Erneut versuchen')}
        </button>
      </p>
    )
  }
  const { summary, analysis } = state
  if (!summary || !analysis) return <p className="loading" role="status">{t('Lade Fahrten von intervals.icu…')}</p>
  const ready = { ...state, summary, analysis }

  return wide ? (
    <Cockpit state={ready} weeks={weeks} onWeeks={chooseWeeks} calm={calm} onCalm={toggleCalm} still={still} />
  ) : (
    <MobileDashboard state={ready} weeks={weeks} onWeeks={chooseWeeks} />
  )
}
