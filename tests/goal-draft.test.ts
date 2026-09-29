import { describe, expect, it } from 'vitest'
import type { AthleteProfile } from '../src/coach/types.ts'
import { draftFromGoal, emptyGoalDraft, goalErrors, goalFromDraft } from '../src/ui/goal-draft.ts'
import { config, TODAY } from './fixtures.ts'

const tri: AthleteProfile = {
  ...config.profile,
  sports: [
    ...config.profile.sports,
    { sport: 'Swim', threshold: { metric: 'swimPace', cssSecPer100m: 105 } },
  ],
}
const runOnly: AthleteProfile = { ...config.profile, sports: [config.profile.sports[1]!] }

const race = (patch: Partial<ReturnType<typeof emptyGoalDraft>>) => ({
  ...emptyGoalDraft('race', 'raceTime', 'Run'),
  ...patch,
})

describe('a race goal typed into the form', () => {
  it('reads a half marathon with hours', () => {
    const goal = goalFromDraft(race({ distance: '21,1', current: '1:52:00', target: '1:45:00' }), tri, TODAY)
    expect(goal).toMatchObject({ distanceKm: 21.1, currentValue: 6720, targetValue: 6300, sport: 'Run' })
    expect(goal?.label).toBe('21,1 km Laufen in 1:45:00')
  })

  it('takes swim distances in metres', () => {
    const goal = goalFromDraft(race({ sport: 'Swim', distance: '1500', target: '25:00' }), tri, TODAY)
    expect(goal?.distanceKm).toBe(1.5)
    expect(goal?.label).toBe('1500 m Schwimmen in 25:00')
  })

  it('infers the current time from the threshold when left blank', () => {
    const goal = goalFromDraft(race({ distance: '10', target: '36:00' }), tri, TODAY)
    expect(goal?.currentValue).toBe(2301)
  })

  it('asks for the current time where no pace can predict it', () => {
    const ride = race({ sport: 'Ride', distance: '40', target: '1:05:00' })
    expect(goalErrors(ride, tri, TODAY).current).toBeDefined()
    expect(goalFromDraft({ ...ride, current: '1:10:00' }, tri, TODAY)?.currentValue).toBe(4200)
  })

  it('requires a distance instead of assuming 10 km', () => {
    const errors = goalErrors(race({ target: '36:00' }), tri, TODAY)
    expect(errors.distance).toContain('km')
    expect(goalErrors(race({ sport: 'Swim', target: '25:00' }), tri, TODAY).distance).toContain(' m ')
    expect(goalFromDraft(race({ target: '36:00' }), tri, TODAY)).toBeNull()
  })

  it('flags an unreadable time and an empty target', () => {
    const errors = goalErrors(race({ distance: '10', current: '38', target: '' }), tri, TODAY)
    expect(errors.current).toContain('h:mm:ss')
    expect(errors.target).toBeDefined()
  })

  it('rejects a target date that has already passed', () => {
    const errors = goalErrors(race({ distance: '10', target: '36:00', targetDate: '2020-01-01' }), tri, TODAY)
    expect(errors.targetDate).toContain('Vergangenheit')
  })
})

describe('an FTP goal typed into the form', () => {
  it('starts from the FTP in the profile', () => {
    const goal = goalFromDraft({ ...emptyGoalDraft('ftp', 'ftp', 'Ride'), target: '300' }, tri, TODAY)
    expect(goal).toMatchObject({ sport: 'Ride', currentValue: 280, targetValue: 300, label: 'FTP 300 W' })
  })

  it('cannot be set without a bike to measure it on', () => {
    const draft = { ...emptyGoalDraft('ftp', 'ftp', 'Ride'), target: '300' }
    expect(goalErrors(draft, runOnly, TODAY).target).toContain('Rad')
  })
})

describe('an existing goal in the settings', () => {
  it('comes back unchanged when nothing is edited', () => {
    for (const goal of config.goals) {
      expect(goalFromDraft(draftFromGoal(goal), config.profile, TODAY)).toEqual({
        ...goal,
        currentValue: goal.kind === 'ftp' ? 280 : goal.currentValue,
      })
    }
  })

  it('keeps priority B', () => {
    const draft = { ...draftFromGoal(config.goals[1]!), priority: 'B' as const }
    expect(goalFromDraft(draft, config.profile, TODAY)?.priority).toBe('B')
  })
})
