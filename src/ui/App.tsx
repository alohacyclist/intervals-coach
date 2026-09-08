import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { getMe } from './api.ts'
import type { Me } from './api.ts'
import { Landing } from './Landing.tsx'
import { Onboarding } from './Onboarding.tsx'
import { PlanView } from './PlanView.tsx'
import { Imprint } from './legal/Imprint.tsx'
import { Privacy } from './legal/Privacy.tsx'
import { ThemeSwitch } from './components/ThemeSwitch.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'

/** Every view carries the mode switch, so the choice is never buried in settings. */
const Shell = ({ children }: { readonly children: ReactNode }) => (
  <main className="app">
    <div className="topbar">
      <ThemeSwitch />
    </div>
    <ErrorBoundary>{children}</ErrorBoundary>
  </main>
)

/** The signed-in state decides what is shown; the path only carries the legal pages. */
export const App = () => {
  const [me, setMe] = useState<Me | null>(null)
  const [error, setError] = useState<string | null>(null)

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

  const path = window.location.pathname
  if (path === '/datenschutz') return <Shell><Privacy /></Shell>
  if (path === '/impressum') return <Shell><Imprint /></Shell>

  if (error) return <Shell><p className="error error--block">{error}</p></Shell>
  if (!me) return <Shell><p className="loading">Einen Moment…</p></Shell>

  if (!me.authenticated) {
    return (
      <Shell>
        <Landing error={new URLSearchParams(window.location.search).get('fehler')} />
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

  return (
    <Shell>
      <PlanView me={me} onNeedsOnboarding={() => setMe({ ...me, onboarded: false })} />
    </Shell>
  )
}
