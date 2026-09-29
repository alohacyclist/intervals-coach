import { afterEach, describe, expect, it, vi } from 'vitest'
import { garminAttribution, garminDevice } from '../src/coach/attribution.ts'
import { summaryOf } from '../src/coach/strava-summary.ts'
import { garminText } from '../src/ui/components/GarminAttribution.tsx'
import { fetchActivities } from '../server/intervals.ts'
import type { Activity, DestinationState, Execution, Wellness } from '../src/coach/types.ts'

const activity = (overrides: Partial<Activity>): Activity => ({
  id: 'i1',
  source: 'UPLOAD',
  date: '2026-09-24',
  startedAt: null,
  sport: 'Ride',
  name: 'Ride',
  load: 50,
  intensity: 70,
  movingTimeSec: 3600,
  distanceM: 30000,
  elevationM: 100,
  isStrength: false,
  pairedEventId: null,
  compliance: null,
  averageHr: null,
  zoneSeconds: {},
  ...overrides,
})

const wellness = (overrides: Partial<Wellness>): Wellness => ({
  date: '2026-09-24',
  eftpBySport: {},
  hrv: null,
  restingHr: null,
  sleepSecs: null,
  fatigue: null,
  soreness: null,
  ...overrides,
})

const garminLinked: DestinationState = { destination: 'garmin', label: 'Garmin Connect', enabled: false, connected: true }

afterEach(() => vi.unstubAllGlobals())

describe('naming Garmin as the source', () => {
  it('names the device of a session recorded on a Garmin', () => {
    expect(garminDevice(activity({ source: 'GARMIN_CONNECT', device: 'Garmin Edge 530' }))).toBe('Garmin Edge 530')
    expect(garminDevice(activity({ source: 'GARMIN_CONNECT', device: 'Forerunner 965' }))).toBe('Garmin Forerunner 965')
    expect(garminDevice(activity({ source: 'GARMIN_CONNECT', device: null }))).toBe('Garmin')
    expect(garminDevice(activity({ source: 'UPLOAD', device: 'Garmin Fenix 8' }))).toBe('Garmin Fenix 8')
  })

  it('says nothing about sessions from other devices', () => {
    expect(garminDevice(activity({ source: 'ZWIFT', device: 'Zwift' }))).toBeNull()
    expect(garminDevice(activity({ source: 'UPLOAD', device: 'Wahoo ELEMNT BOLT' }))).toBeNull()
    expect(garminAttribution([activity({ source: 'ZWIFT' })])).toBeNull()
  })

  it('lists each Garmin device once for a view over many sessions', () => {
    const activities = [
      activity({ source: 'GARMIN_CONNECT', device: 'Garmin Edge 530' }),
      activity({ source: 'GARMIN_CONNECT', device: 'Garmin Edge 530' }),
      activity({ source: 'GARMIN_CONNECT', device: 'Garmin Forerunner 965' }),
      activity({ source: 'STRAVA' }),
    ]
    expect(garminAttribution(activities)).toEqual({ devices: ['Garmin Edge 530', 'Garmin Forerunner 965'] })
  })

  it('counts recovery values as Garmin data when Garmin is connected', () => {
    const recovery = [wellness({ hrv: 60 })]
    expect(garminAttribution([], recovery, [garminLinked])).toEqual({ devices: [] })
    expect(garminAttribution([], recovery, [])).toBeNull()
    expect(garminAttribution([], [wellness({})], [garminLinked])).toBeNull()
  })

  it('reads the device from intervals.icu', async () => {
    vi.stubGlobal('fetch', async () =>
      new Response(JSON.stringify([{ id: 'i1', start_date_local: '2026-09-24T10:00:00', source: 'GARMIN_CONNECT', device_name: 'Garmin Edge 1050' }])),
    )
    const [read] = await fetchActivities({ kind: 'apiKey', apiKey: 'k', athleteId: 'i1' }, '2026-09-24', '2026-09-24')
    expect(read?.device).toBe('Garmin Edge 1050')
    expect(read && garminDevice(read)).toBe('Garmin Edge 1050')
  })

  it('reads as German text, with the device names as Garmin writes them', () => {
    expect(garminText({ devices: ['Garmin Edge 530'] })).toBe('Teilweise abgeleitet aus Daten von Garmin-Geräten: Garmin Edge 530')
    expect(garminText({ devices: [] })).toBe('Teilweise abgeleitet aus Daten von Garmin-Geräten')
  })

  it('travels with the summary written to Strava', () => {
    const execution: Execution = {
      activityId: 'i1',
      templateName: 'Schwelle 3×12',
      sport: 'Ride',
      metric: 'power',
      steps: [],
      segments: [],
      workPlannedSeconds: 0,
      workDoneSeconds: 0,
      inTargetSeconds: 0,
      duration: { planned: 3600, actual: 3600 },
      load: { planned: 80, actual: 82 },
      compliance: null,
      unavailable: null,
      trace: null,
    }
    expect(summaryOf({ ...execution, garmin: 'Garmin Edge 530' }, null)).toContain('Daten: Garmin Edge 530')
    expect(summaryOf(execution, null)).not.toContain('Garmin')
  })
})
