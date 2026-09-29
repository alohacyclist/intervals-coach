import { afterEach, describe, expect, it, vi } from 'vitest'
import { OFFLINE, humanError } from '../src/ui/error-message.ts'
import { getConfig } from '../src/ui/api.ts'
import { createApiRoutes } from '../server/routes.ts'
import { IntervalsError } from '../server/intervals.ts'

const MISSING_SCOPE = 'intervals.icu 403: Zugriff verweigert. Abmelden und neu anmelden erteilt die nötigen Rechte.'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('humanError', () => {
  it('never shows a bare status code', () => {
    for (const status of [OFFLINE, 400, 401, 403, 404, 409, 429, 500, 502, 503, 504]) {
      expect(humanError(status)).not.toMatch(/\d{3}/)
    }
  })

  it('hides what a crash says about the code', () => {
    expect(humanError(500, 'TypeError: x is undefined')).toBe(
      'Da ist bei uns etwas schiefgelaufen. Bitte versuch es gleich noch einmal.',
    )
  })

  it('blames the service that failed upstream, not the athlete', () => {
    expect(humanError(502, 'intervals.icu 429 Too Many Requests')).toContain('antwortet gerade nicht')
  })

  it('keeps what the server wrote for people', () => {
    expect(humanError(400, 'Höchstens 12 Rennen')).toBe('Höchstens 12 Rennen')
    expect(humanError(429, 'Zu viele Fehlversuche. Bitte in 15 Minuten erneut versuchen.')).toContain('Fehlversuche')
  })

  it('passes on what the server wrote for the athlete about a refusal upstream', () => {
    expect(humanError(502, MISSING_SCOPE, true)).toBe(MISSING_SCOPE)
  })

  it('names being offline', () => {
    expect(humanError(OFFLINE)).toContain('Keine Verbindung')
  })
})

describe('an intervals.icu refusal on its way to the athlete', () => {
  it('is marked by the server as written for the athlete', async () => {
    const app = createApiRoutes(async () => {
      throw new IntervalsError(MISSING_SCOPE, 403)
    })
    const response = await app.request('/api/config')
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ error: MISSING_SCOPE, forAthlete: true })
  })

  it('reaches the athlete in the server’s words', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ error: MISSING_SCOPE, forAthlete: true }), { status: 502 }))
    await expect(getConfig()).rejects.toThrow(MISSING_SCOPE)
  })

  it('is replaced when a proxy answered instead of the server', async () => {
    vi.stubGlobal('fetch', async () => new Response('<html>Bad gateway</html>', { status: 502 }))
    await expect(getConfig()).rejects.toThrow('antwortet gerade nicht')
  })
})
