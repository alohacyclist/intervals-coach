import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { analyzeSteady, BLOCK_BATCH } from '../../coach/dashboard.ts'
import type { BlockReading, DashboardSummary, RideTrace, SteadyAnalysis } from '../../coach/dashboard.ts'
import { ApiError, EXPIRED_SESSION_URL, getDashboard, getDashboardBlocks, getRideTrace } from '../api.ts'
import { t } from '../../coach/lang.ts'

export type DashboardState = {
  readonly summary: DashboardSummary | null
  readonly analysis: SteadyAnalysis | null
  readonly readings: ReadonlyMap<string, BlockReading>
  /** Blocks read so far against all candidates, for the progress line. */
  readonly read: number
  readonly total: number
  readonly error: string | null
  /** Reading the blocks failed part way; the page keeps what it has and says so. */
  readonly blockError: string | null
  readonly busy: boolean
  readonly retry: () => void
}

const messageOf = (caught: unknown): string => (caught instanceof Error ? caught.message : t('Unbekannter Fehler'))

/** The batches still to read: rides already read for another range are not asked for again. */
export const pendingBatches = (
  summary: DashboardSummary,
  readings: ReadonlyMap<string, BlockReading>,
): readonly (readonly string[])[] => {
  const ids = summary.candidates.map((c) => c.id).filter((id) => !readings.has(id))
  return Array.from({ length: Math.ceil(ids.length / BLOCK_BATCH) }, (_unused, i) =>
    ids.slice(i * BLOCK_BATCH, (i + 1) * BLOCK_BATCH),
  )
}

/** The API allows 60 requests a minute per athlete; a long range waits for the window instead of stopping. */
export const RATE_WAIT_MS = 20_000
const RATE_TRIES = 4

export const retryWhenThrottled = async <T>(
  call: () => Promise<T>,
  wait: (ms: number) => Promise<void>,
  tries = RATE_TRIES,
): Promise<T> => {
  try {
    return await call()
  } catch (caught) {
    if (!(caught instanceof ApiError) || caught.status !== 429 || tries <= 1) throw caught
    await wait(RATE_WAIT_MS)
    return retryWhenThrottled(call, wait, tries - 1)
  }
}

const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms))

/**
 * Summary first, then the steady blocks batch by batch, newest first. The rules
 * run again on every batch, so the page fills in while it reads and a ride whose
 * baseline is not read yet shows as pending, not as calm.
 */
export const useDashboard = (weeks: number, onNeedsOnboarding: () => void): DashboardState => {
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [readings, setReadings] = useState<ReadonlyMap<string, BlockReading>>(new Map())
  const [error, setError] = useState<string | null>(null)
  const [blockError, setBlockError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [attempt, setAttempt] = useState(0)
  // One load per range; a retry asks again for the same range.
  const request = useMemo(() => ({ weeks, attempt }), [weeks, attempt])
  // The effect reads the latest map without restarting whenever a batch lands.
  const readingsRef = useRef(readings)
  readingsRef.current = readings

  const fail = useCallback(
    (caught: unknown): boolean => {
      if (caught instanceof ApiError && caught.needsOnboarding) {
        onNeedsOnboarding()
        return true
      }
      if (caught instanceof ApiError && caught.needsLogin) {
        window.location.href = EXPIRED_SESSION_URL
        return true
      }
      return false
    },
    [onNeedsOnboarding],
  )

  useEffect(() => {
    let cancelled = false
    let loaded = false
    const run = async () => {
      setError(null)
      setBlockError(null)
      setBusy(true)
      try {
        const next = await getDashboard(request.weeks)
        if (cancelled) return
        setSummary(next)
        loaded = true
        for (const batch of pendingBatches(next, readingsRef.current)) {
          const answers = await retryWhenThrottled(() => getDashboardBlocks(batch), sleep)
          if (cancelled) return
          setReadings((prev) => new Map([...prev, ...answers.map((r): [string, BlockReading] => [r.id, r])]))
        }
      } catch (caught) {
        if (cancelled || fail(caught)) return
        if (loaded) setBlockError(messageOf(caught))
        else setError(messageOf(caught))
      } finally {
        if (!cancelled) setBusy(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [request, fail])

  const analysis = useMemo(() => (summary ? analyzeSteady(summary, readings) : null), [summary, readings])
  const read = summary ? summary.candidates.filter((c) => readings.has(c.id)).length : 0

  return {
    summary,
    analysis,
    readings,
    read,
    total: summary?.candidates.length ?? 0,
    error,
    blockError,
    busy,
    retry: () => setAttempt((n) => n + 1),
  }
}

export type TraceState = {
  readonly trace: RideTrace | null
  readonly error: string | null
}

/** One ride per minute, read when it is selected and kept for this visit. */
export const useRideTrace = (activityId: string | null): TraceState => {
  const cache = useRef(new Map<string, RideTrace>())
  const [state, setState] = useState<TraceState & { readonly id: string | null }>({ id: null, trace: null, error: null })

  useEffect(() => {
    if (!activityId) return
    const known = cache.current.get(activityId)
    if (known) {
      setState({ id: activityId, trace: known, error: null })
      return
    }
    let cancelled = false
    setState({ id: activityId, trace: null, error: null })
    getRideTrace(activityId).then(
      (trace) => {
        cache.current.set(activityId, trace)
        if (!cancelled) setState({ id: activityId, trace, error: null })
      },
      (caught: unknown) => {
        if (!cancelled) setState({ id: activityId, trace: null, error: messageOf(caught) })
      },
    )
    return () => {
      cancelled = true
    }
  }, [activityId])

  return state.id === activityId ? state : { trace: null, error: null }
}

/** Follows a media query, so the page can swap the cockpit for the phone layout. */
export const useMediaQuery = (query: string): boolean => {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const list = window.matchMedia(query)
    const onChange = () => setMatches(list.matches)
    onChange()
    list.addEventListener('change', onChange)
    return () => list.removeEventListener('change', onChange)
  }, [query])
  return matches
}
