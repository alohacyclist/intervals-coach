import { describe, expect, it } from 'vitest'
import { validateConfig, ValidationError, DEFAULT_CONFIG } from '../src/coach/config-schema.ts'
import { config } from './fixtures.ts'

describe('config validation', () => {
  it('keeps planning around races a config entered before the league switch existed', () => {
    const { zrl: _dropped, ...stored } = config
    const race = { date: '2026-09-08', format: 'scratch', route: null, laps: 1 }
    expect(validateConfig({ ...stored, zrlRaces: [race] }).zrl).toEqual({ enabled: true, taper: true })
    expect(validateConfig(stored).zrl).toEqual({ enabled: false, taper: true })
  })

  it('keeps the league switch and the taper as stored', () => {
    const stored = { ...config, zrl: { enabled: true, taper: false } }
    expect(validateConfig(stored).zrl).toEqual({ enabled: true, taper: false })
  })

  it('accepts the default configuration', () => {
    expect(validateConfig(DEFAULT_CONFIG).profile.sports).toHaveLength(2)
  })

  it('rejects a sport without a usable threshold', () => {
    const broken = {
      ...DEFAULT_CONFIG,
      profile: {
        ...DEFAULT_CONFIG.profile,
        sports: [{ sport: 'Ride', threshold: { metric: 'power', ftp: 0 } }],
      },
    }
    expect(() => validateConfig(broken)).toThrow(ValidationError)
  })

  it('rejects a profile without any sport', () => {
    const broken = { ...DEFAULT_CONFIG, profile: { ...DEFAULT_CONFIG.profile, sports: [] } }
    expect(() => validateConfig(broken)).toThrow(/mindestens eine Sportart/)
  })

  it('rejects the same sport twice', () => {
    const broken = {
      ...DEFAULT_CONFIG,
      profile: {
        ...DEFAULT_CONFIG.profile,
        sports: [
          { sport: 'Run', threshold: { metric: 'pace', thresholdSecPerKm: 240 } },
          { sport: 'Run', threshold: { metric: 'pace', thresholdSecPerKm: 250 } },
        ],
      },
    }
    expect(() => validateConfig(broken)).toThrow(/nur einmal/)
  })

  it('migrates a legacy flat profile into per-sport thresholds', () => {
    const legacy = {
      ...DEFAULT_CONFIG,
      profile: {
        weightKg: 71,
        maxHr: null,
        lthr: null,
        weeklySessions: { min: 2, max: 3 },
        maxSessionMinutes: 75,
        ftp: 280,
        thresholdPaceSecPerKm: 236,
      },
    }
    expect(validateConfig(legacy).profile.sports).toEqual([
      { sport: 'Ride', threshold: { metric: 'power', ftp: 280 } },
      { sport: 'Run', threshold: { metric: 'pace', thresholdSecPerKm: 236 } },
    ])
  })

  it('rejects a configuration without goals', () => {
    expect(() => validateConfig({ ...DEFAULT_CONFIG, goals: [] })).toThrow(/Mindestens ein Ziel/)
  })

  it('rejects a malformed target date', () => {
    const broken = {
      ...DEFAULT_CONFIG,
      goals: [{ ...DEFAULT_CONFIG.goals[0]!, targetDate: '30.11.2026' }],
    }
    expect(() => validateConfig(broken)).toThrow(/YYYY-MM-DD/)
  })

  it('drops an optional target date instead of failing', () => {
    const open = {
      ...DEFAULT_CONFIG,
      goals: [{ ...DEFAULT_CONFIG.goals[0]!, targetDate: undefined }],
    }
    expect(validateConfig(open).goals[0]?.targetDate).toBeUndefined()
  })

  it('rejects a weekly session range with min above max', () => {
    const broken = {
      ...DEFAULT_CONFIG,
      profile: { ...DEFAULT_CONFIG.profile, weeklySessions: { min: 5, max: 3 } },
    }
    expect(() => validateConfig(broken)).toThrow(/min darf nicht über max/)
  })

  it('rejects a missing weekly session range', () => {
    const broken = { ...DEFAULT_CONFIG, profile: { ...DEFAULT_CONFIG.profile, weeklySessions: {} } }
    expect(() => validateConfig(broken)).toThrow(ValidationError)
  })

  it('reports every issue at once', () => {
    try {
      validateConfig({ profile: {}, goals: [{}] })
      expect.unreachable('should have thrown')
    } catch (error) {
      expect((error as ValidationError).issues.length).toBeGreaterThan(3)
    }
  })
})

describe('configuration migration', () => {
  it('migrates a legacy weeklySessions number into a range', () => {
    const legacy = {
      ...DEFAULT_CONFIG,
      profile: { ...DEFAULT_CONFIG.profile, weeklySessions: 3 },
    }
    expect(validateConfig(legacy).profile.weeklySessions).toEqual({ min: 2, max: 3 })
  })

  it('never migrates below one session', () => {
    const legacy = {
      ...DEFAULT_CONFIG,
      profile: { ...DEFAULT_CONFIG.profile, weeklySessions: 1 },
    }
    expect(validateConfig(legacy).profile.weeklySessions).toEqual({ min: 1, max: 1 })
  })

  it('leaves a range untouched', () => {
    const current = {
      ...DEFAULT_CONFIG,
      profile: { ...DEFAULT_CONFIG.profile, weeklySessions: { min: 3, max: 5 } },
    }
    expect(validateConfig(current).profile.weeklySessions).toEqual({ min: 3, max: 5 })
  })

  it('still rejects a zero or negative legacy value', () => {
    const broken = { ...DEFAULT_CONFIG, profile: { ...DEFAULT_CONFIG.profile, weeklySessions: 0 } }
    expect(() => validateConfig(broken)).toThrow(ValidationError)
  })
})

describe('migrating the time budget', () => {
  it('turns one stored session length into three tiers', () => {
    const stored = { ...JSON.parse(JSON.stringify(config)), profile: { ...config.profile } }
    delete (stored.profile as Record<string, unknown>)['sessionMinutes']
    ;(stored.profile as Record<string, unknown>)['maxSessionMinutes'] = 80

    const migrated = validateConfig(stored)
    expect(migrated.profile.sessionMinutes).toEqual({ min: 56, normal: 80, max: 80 })
  })

  it('keeps three tiers that are already stored', () => {
    const migrated = validateConfig({
      ...config,
      profile: { ...config.profile, sessionMinutes: { min: 45, normal: 60, max: 90 } },
    })
    expect(migrated.profile.sessionMinutes).toEqual({ min: 45, normal: 60, max: 90 })
  })

  it('drops a race on a date that does not exist', () => {
    const races = [
      { date: '2026-02-30', format: 'ttt', laps: 1, route: null },
      { date: '2026-09-22', format: 'ttt', laps: 1, route: null },
    ]
    expect(validateConfig({ ...DEFAULT_CONFIG, zrlRaces: races }).zrlRaces.map((race) => race.date)).toEqual([
      '2026-09-22',
    ])
  })
})

describe('FTP goal', () => {
  const withFtp = (ftp: number) => ({
    ...DEFAULT_CONFIG,
    profile: {
      ...DEFAULT_CONFIG.profile,
      sports: DEFAULT_CONFIG.profile.sports.map((setting) =>
        setting.sport === 'Ride' ? { ...setting, threshold: { metric: 'power' as const, ftp } } : setting,
      ),
    },
  })

  it('follows the FTP of the profile, however it changed', () => {
    const goal = validateConfig(withFtp(289)).goals.find((entry) => entry.kind === 'ftp')
    expect(goal?.currentValue).toBe(289)
  })

  it('leaves a race time as the athlete entered it', () => {
    const before = DEFAULT_CONFIG.goals.find((entry) => entry.kind === 'raceTime')
    const after = validateConfig(withFtp(289)).goals.find((entry) => entry.kind === 'raceTime')
    expect(after?.currentValue).toBe(before?.currentValue)
  })
})
