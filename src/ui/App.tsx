import { useCallback, useEffect, useState } from 'react'
import { getMe } from './api.ts'
import type { Me } from './api.ts'
import { Landing } from './Landing.tsx'
import { Onboarding } from './Onboarding.tsx'
import { PlanView } from './PlanView.tsx'
import { Imprint, Privacy } from './Legal.tsx'

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
  if (path === '/datenschutz') return <main className="app"><Privacy /></main>
  if (path === '/impressum') return <main className="app"><Imprint /></main>

  if (error) return <main className="app"><p className="error error--block">{error}</p></main>
  if (!me) return <main className="app"><p className="loading">Einen Moment…</p></main>

  if (!me.authenticated) {
    return (
      <main className="app">
        <Landing error={new URLSearchParams(window.location.search).get('fehler')} />
      </main>
    )
  }

  if (!me.onboarded) {
    return (
      <main className="app">
        <Onboarding
          onDone={() => {
            window.history.replaceState(null, '', '/app')
            setMe({ ...me, onboarded: true })
          }}
        />
      </main>
    )
  }

  return (
    <main className="app">
      <PlanView me={me} onNeedsOnboarding={() => setMe({ ...me, onboarded: false })} />
    </main>
  )
}
