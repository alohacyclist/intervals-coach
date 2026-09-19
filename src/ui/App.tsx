import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { getMe } from './api.ts'
import type { Me } from './api.ts'
import { Landing } from './Landing.tsx'
import { PasswordLogin } from './PasswordLogin.tsx'
import { Onboarding } from './Onboarding.tsx'
import { PlanView } from './PlanView.tsx'
import { ProgressView } from './ProgressView.tsx'
import { Imprint } from './legal/Imprint.tsx'
import { Privacy } from './legal/Privacy.tsx'
import { ThemeSwitch } from './components/ThemeSwitch.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'

const PLAN_PATH = '/app'
const PROGRESS_PATH = '/verlauf'

/**
 * Two questions, two pages: what do I do today, and am I getting anywhere. The
 * switch is the same three-position control the theme already uses, so the app
 * gains a page without gaining a new kind of control.
 */
const ViewSwitch = ({
  path,
  onGo,
}: {
  readonly path: string
  readonly onGo: (next: string) => void
}) => (
  <div className="mode" role="group" aria-label="Ansicht">
    <button
      type="button"
      aria-pressed={path !== PROGRESS_PATH}
      onClick={() => onGo(PLAN_PATH)}
    >
      Plan
    </button>
    <button
      type="button"
      aria-pressed={path === PROGRESS_PATH}
      onClick={() => onGo(PROGRESS_PATH)}
    >
      Verlauf
    </button>
  </div>
)

/** Every view carries the mode switch, so the choice is never buried in settings. */
const Shell = ({
  children,
  nav,
}: {
  readonly children: ReactNode
  readonly nav?: ReactNode
}) => (
  <main className="app">
    <div className="topbar">
      {nav}
      <ThemeSwitch />
    </div>
    <ErrorBoundary>{children}</ErrorBoundary>
  </main>
)

/** The signed-in state decides what is shown; the path only carries the legal pages. */
export const App = () => {
  const [me, setMe] = useState<Me | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [path, setPath] = useState(() => window.location.pathname)

  // The browser's own back button has to keep working across the two views.
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const go = (next: string) => {
    window.history.pushState(null, '', next)
    setPath(next)
  }

  const load = useCallback(async () => {
    try {
      setMe(await getMe())
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unbekannter Fehler')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (path === '/datenschutz') return <Shell><Privacy /></Shell>
  if (path === '/impressum') return <Shell><Imprint /></Shell>

  if (error) return <Shell><p className="error error--block">{error}</p></Shell>
  if (!me) return <Shell><p className="loading">Einen Moment…</p></Shell>

  if (!me.authenticated) {
    return (
      <Shell>
        {me.mode === 'single' ? (
          <PasswordLogin onDone={() => void load()} />
        ) : (
          <Landing error={new URLSearchParams(window.location.search).get('fehler')} />
        )}
      </Shell>
    )
  }

  if (!me.onboarded) {
    return (
      <Shell>
        <Onboarding
          onDone={() => {
            window.history.replaceState(null, '', '/app')
            setMe({ ...me, onboarded: true })
          }}
        />
      </Shell>
    )
  }

  const needsOnboarding = () => setMe({ ...me, onboarded: false })

  return (
    <Shell nav={<ViewSwitch path={path} onGo={go} />}>
      {path === PROGRESS_PATH ? (
        <ProgressView onNeedsOnboarding={needsOnboarding} />
      ) : (
        <PlanView me={me} onNeedsOnboarding={needsOnboarding} />
      )}
    </Shell>
  )
}
