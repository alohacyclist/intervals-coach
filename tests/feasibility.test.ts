import { describe, expect, it } from 'vitest'
import { assessGoals } from '../src/coach/feasibility.ts'
import { config, TODAY } from './fixtures.ts'

describe('goal feasibility', () => {
  it('calls +7% FTP in three months realistic', () => {
    const [ftp] = assessGoals([config.goals[0]!], config.profile, TODAY)
    expect(ftp?.verdict).toBe('on-track')
    expect(ftp?.message).toContain('%/Monat')
  })

  it('calls a doubled FTP unrealistic', () => {
    const goal = { ...config.goals[0]!, targetValue: 560 }
    expect(assessGoals([goal], config.profile, TODAY)[0]?.verdict).toBe('unrealistic')
  })

  it('estimates a timeline for open ended goals', () => {
    const goal = { ...config.goals[0]!, targetDate: undefined }
    expect(assessGoals([goal], config.profile, TODAY)[0]?.message).toContain('Monaten')
  })

  it('flags run frequency as the bottleneck for a 10k goal', () => {
    const [, run] = assessGoals(config.goals, config.profile, TODAY)
    expect(run?.verdict).toBe('ambitious')
    expect(run?.message).toContain('Laufhäufigkeit')
  })

  it('drops the frequency warning when enough sessions are planned', () => {
    const profile = { ...config.profile, weeklySessions: 5 }
    const [, run] = assessGoals(config.goals, profile, TODAY)
    expect(run?.verdict).toBe('on-track')
  })

  it('renders current and target pace', () => {
    const [, run] = assessGoals(config.goals, config.profile, TODAY)
    expect(run?.message).toContain('3:48/km → 3:36/km')
  })
})
