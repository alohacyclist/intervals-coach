import { describe, expect, it } from 'vitest'
import { validateConfig, ValidationError, DEFAULT_CONFIG } from '../src/coach/config-schema.ts'

describe('config validation', () => {
  it('accepts the default configuration', () => {
    expect(validateConfig(DEFAULT_CONFIG).profile.ftp).toBe(280)
  })

  it('rejects a missing FTP', () => {
    const broken = { ...DEFAULT_CONFIG, profile: { ...DEFAULT_CONFIG.profile, ftp: 0 } }
    expect(() => validateConfig(broken)).toThrow(ValidationError)
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
