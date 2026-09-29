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

  it('holds CSS for about half an hour, so a swim projection is not an hour pace', () => {
    // CSS 1:45/100 m: the 400 m a few seconds per 100 m quicker, 1500 m close to CSS.
    const profile = {
      ...config.profile,
      sports: [{ sport: 'Swim' as const, threshold: { metric: 'swimPace' as const, cssSecPer100m: 105 } }],
    }
    const swim = (distanceKm: number, target: number) => ({
      id: `swim-${distanceKm}`,
      sport: 'Swim' as const,
      kind: 'raceTime' as const,
      label: 'Schwimmen',
      targetValue: target,
      currentValue: target + 60,
      distanceKm,
      priority: 'A' as const,
    })
    const [short, olympic] = assessGoals([swim(0.4, 380), swim(1.5, 1500)], profile, TODAY)
    expect(short?.currentValue).toBe(402)
    expect(olympic?.currentValue).toBe(1569)
    expect(olympic?.message).toContain('1500 m')
    expect(olympic?.message).toContain('1:45/100m')
    expect(olympic?.message).toContain('CSS')
  })

  it('does not invent 10 km when a race goal has no distance', () => {
    const [run] = assessGoals([{ ...runGoal, distanceKm: undefined }], config.profile, TODAY)
    expect(run?.currentValue).toBe(runGoal.currentValue)
    expect(run?.message).not.toContain('10 km')
    expect(run?.message).toContain('ohne Distanz')
  })

  it('writes a half marathon time with hours', () => {
    const half = { ...runGoal, distanceKm: 21.1, targetValue: 6300 }
    const [run] = assessGoals([half], config.profile, TODAY)
    expect(run?.message).toContain('→ 1:45:00 auf 21,1 km')
  })
})
