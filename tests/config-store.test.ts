import { describe, expect, it } from 'vitest'
import { validateConfig, ValidationError, DEFAULT_CONFIG } from '../src/coach/config-schema.ts'
import { config } from './fixtures.ts'

describe('config validation', () => {
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
})
