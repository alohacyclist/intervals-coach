import { describe, expect, it } from 'vitest'
import { assessGoals } from '../src/coach/feasibility.ts'
import { config, TODAY } from './fixtures.ts'

const ftpGoal = config.goals[0]!
const runGoal = config.goals[1]!
const withFtp = (ftp: number) => ({
  ...config.profile,
  sports: [
    { sport: 'Ride' as const, threshold: { metric: 'power' as const, ftp } },
    ...config.profile.sports.slice(1),
  ],
})

describe('how far the goal still is', () => {
  it('starts from the FTP measured now, not from the value entered at plan start', () => {
    const [ftp] = assessGoals([ftpGoal], withFtp(289), TODAY)
    expect(ftp?.currentValue).toBe(289)
    expect(ftp?.message).toContain('289 W → 300 W')
  })

  it('counts the weeks left and what they demand per week', () => {
    const [ftp] = assessGoals([ftpGoal], withFtp(289), TODAY)
    expect(ftp?.weeksLeft).toBeGreaterThan(11)
    expect(ftp?.weeksLeft).toBeLessThan(13)
    expect(ftp?.message).toMatch(/\+0,9 W\/Woche/)
    expect(ftp?.verdict).toBe('on-track')
  })

  it('calls a doubled FTP unrealistic', () => {
    expect(assessGoals([{ ...ftpGoal, targetValue: 560 }], config.profile, TODAY)[0]?.verdict).toBe(
      'unrealistic',
    )
  })

  it('says so when the goal is already reached', () => {
    const [ftp] = assessGoals([ftpGoal], withFtp(305), TODAY)
    expect(ftp?.message).toContain('erreicht')
    expect(ftp?.verdict).toBe('on-track')
  })

  it('estimates a timeline for open ended goals', () => {
    const goal = { ...ftpGoal, targetDate: undefined }
    const [ftp] = assessGoals([goal], withFtp(289), TODAY)
    expect(ftp?.weeksLeft).toBeNull()
    expect(ftp?.message).toContain('Monate')
  })

  it('projects the current race time from the threshold pace', () => {
    // 236 s/km threshold is an hour at 15.25 km, which Riegel scales to 38:21 over 10 km.
    const [run] = assessGoals([runGoal], config.profile, TODAY)
    expect(run?.currentValue).toBe(2301)
    expect(run?.message).toContain('38:21 → 36:00')
    expect(run?.message).toContain('Schwellenpace')
    expect(run?.message).toMatch(/s\/Woche/)
  })

  it('flags run frequency as the bottleneck for a 10k goal', () => {
    const [run] = assessGoals([runGoal], config.profile, TODAY)
    expect(run?.verdict).toBe('ambitious')
    expect(run?.message).toContain('Laufhäufigkeit')
  })

  it('drops the frequency warning when enough sessions are planned', () => {
    const profile = { ...config.profile, weeklySessions: { min: 3, max: 5 } }
    expect(assessGoals([runGoal], profile, TODAY)[0]?.verdict).toBe('on-track')
  })
})
