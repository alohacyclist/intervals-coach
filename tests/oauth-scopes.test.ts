import { describe, expect, it } from 'vitest'
import { authorizeUrl } from '../worker/oauth.ts'

const app = { clientId: 'id', clientSecret: 'secret', redirectUri: 'https://formkurve.org/auth/callback' }

describe('the intervals.icu consent request', () => {
  const scope = new URL(authorizeUrl(app, 'state')).searchParams.get('scope')

  it('separates scopes with commas, as intervals.icu parses them', () => {
    expect(scope).not.toContain(' ')
    expect(scope?.split(',')).toContain('ACTIVITY:READ')
  })

  it('asks for exactly what the app calls: activities, wellness, calendar and settings', () => {
    expect(scope).toBe('ACTIVITY:READ,WELLNESS:READ,CALENDAR:WRITE,SETTINGS:WRITE')
  })
})
