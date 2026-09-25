import type { StravaCandidate } from '../src/coach/strava-summary.ts'

/**
 * The few Strava calls this app makes: sign in, find a session by its start,
 * read and write its description. Nothing is read beyond that — the Strava API
 * agreement allows showing an athlete's data only to that athlete, and this app
 * has no reason to show any of it.
 */

const AUTHORIZE_URL = 'https://www.strava.com/oauth/authorize'
const TOKEN_URL = 'https://www.strava.com/oauth/token'
const DEAUTHORIZE_URL = 'https://www.strava.com/oauth/deauthorize'
const API_URL = 'https://www.strava.com/api/v3'

/** Private sessions have to be found too; writing the description needs write access. */
export const STRAVA_SCOPES = 'activity:read_all,activity:write'

export type StravaApp = {
  readonly clientId: string
  readonly clientSecret: string
  readonly redirectUri: string
}

export type StravaTokens = {
  readonly accessToken: string
  readonly refreshToken: string
  /** Unix seconds. */
  readonly expiresAt: number
}

export type StravaAthlete = { readonly id: string; readonly name: string }

export class StravaError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'StravaError'
  }
}

export const authorizeUrl = (app: StravaApp, state: string): string => {
  const url = new URL(AUTHORIZE_URL)
  url.searchParams.set('client_id', app.clientId)
  url.searchParams.set('redirect_uri', app.redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('approval_prompt', 'auto')
  url.searchParams.set('scope', STRAVA_SCOPES)
  url.searchParams.set('state', state)
  return url.toString()
}

/** Strava lets the athlete untick scopes on its consent page; without write access there is nothing to do. */
export const grantedEnough = (scope: string | null | undefined): boolean => {
  const granted = new Set((scope ?? '').split(','))
  return granted.has('activity:write') && (granted.has('activity:read_all') || granted.has('activity:read'))
}

type TokenResponse = {
  access_token?: string
  refresh_token?: string
  expires_at?: number
  athlete?: { id?: number | string; firstname?: string; lastname?: string }
}

const postToken = async (app: StravaApp, body: Record<string, string>): Promise<TokenResponse> => {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: app.clientId, client_secret: app.clientSecret, ...body }),
  })
  if (!response.ok) throw new StravaError(`Strava-Anmeldung fehlgeschlagen (${response.status})`, response.status)
  return (await response.json()) as TokenResponse
}

const tokensFrom = (payload: TokenResponse): StravaTokens => {
  if (!payload.access_token || !payload.refresh_token || typeof payload.expires_at !== 'number') {
    throw new StravaError('Strava hat kein vollständiges Token geschickt', 502)
  }
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresAt: payload.expires_at,
  }
}

export const exchangeCode = async (
  app: StravaApp,
  code: string,
): Promise<{ readonly tokens: StravaTokens; readonly athlete: StravaAthlete }> => {
  const payload = await postToken(app, { code, grant_type: 'authorization_code' })
  const athlete = payload.athlete
  if (athlete?.id === undefined) throw new StravaError('Strava hat kein Athletenprofil geschickt', 502)
  return {
    tokens: tokensFrom(payload),
    athlete: {
      id: String(athlete.id),
      name: [athlete.firstname, athlete.lastname].filter(Boolean).join(' ') || 'Strava-Athlet',
    },
  }
}

/** Strava access tokens live six hours; the refresh token may change with every refresh. */
export const refreshTokens = async (app: StravaApp, refreshToken: string): Promise<StravaTokens> =>
  tokensFrom(await postToken(app, { grant_type: 'refresh_token', refresh_token: refreshToken }))

const deauthorize = async (accessToken: string): Promise<void> => {
  await fetch(DEAUTHORIZE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ access_token: accessToken }),
  })
}

/**
 * Withdraws this app's access on Strava's side. An expired token is refreshed
 * first — Strava ignores a deauthorisation made with one. Best effort: the link
 * is deleted here whatever Strava answers.
 */
export const withdraw = async (app: StravaApp, tokens: StravaTokens): Promise<void> => {
  try {
    const current =
      tokens.expiresAt > Math.floor(Date.now() / 1000) + 60 ? tokens : await refreshTokens(app, tokens.refreshToken)
    await deauthorize(current.accessToken)
  } catch (error) {
    console.error('Strava-Zugriff nicht entzogen', error)
  }
}

const api = async <T>(accessToken: string, path: string, init: RequestInit = {}): Promise<T> => {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, ...init.headers },
  })
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new StravaError(`Strava ${response.status}: ${body.slice(0, 200)}`, response.status)
  }
  return (await response.json()) as T
}

/** Sessions that started between the two instants, as candidates for the same session. */
export const listActivities = async (
  accessToken: string,
  after: Date,
  before: Date,
): Promise<readonly StravaCandidate[]> => {
  const query = new URLSearchParams({
    after: String(Math.floor(after.getTime() / 1000)),
    before: String(Math.floor(before.getTime() / 1000)),
    per_page: '30',
  })
  const raw = await api<unknown>(accessToken, `/athlete/activities?${query.toString()}`)
  return (Array.isArray(raw) ? raw : [])
    .map((entry) => entry as Record<string, unknown>)
    .filter((entry) => entry['id'] !== undefined && typeof entry['start_date'] === 'string')
    .map((entry) => ({
      id: String(entry['id']),
      sportType: String(entry['sport_type'] ?? entry['type'] ?? ''),
      startDate: String(entry['start_date']),
    }))
}

export const readDescription = async (accessToken: string, stravaId: string): Promise<string | null> => {
  const raw = await api<Record<string, unknown>>(accessToken, `/activities/${stravaId}`)
  return typeof raw['description'] === 'string' ? raw['description'] : null
}

export const writeDescription = async (accessToken: string, stravaId: string, description: string): Promise<void> => {
  await api(accessToken, `/activities/${stravaId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ description }),
  })
}
