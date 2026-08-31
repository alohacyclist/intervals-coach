const AUTHORIZE_URL = 'https://intervals.icu/oauth/authorize'
const TOKEN_URL = 'https://intervals.icu/api/v1/oauth/token'

/** Read training and wellness data, write planned workouts. Nothing else. */
export const SCOPES = 'ACTIVITY:READ WELLNESS:READ CALENDAR:WRITE'

export type OAuthApp = {
  readonly clientId: string
  readonly clientSecret: string
  readonly redirectUri: string
}

export type TokenSet = {
  readonly accessToken: string
  readonly refreshToken: string | null
  /** Unix seconds. */
  readonly expiresAt: number
}

export class OAuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OAuthError'
  }
}

export const authorizeUrl = (app: OAuthApp, state: string): string => {
  const url = new URL(AUTHORIZE_URL)
  url.searchParams.set('client_id', app.clientId)
  url.searchParams.set('redirect_uri', app.redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', SCOPES)
  url.searchParams.set('state', state)
  return url.toString()
}

type TokenResponse = {
  access_token?: string
  refresh_token?: string
  expires_in?: number
}

const postToken = async (app: OAuthApp, body: Record<string, string>): Promise<TokenSet> => {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: app.clientId,
      client_secret: app.clientSecret,
      ...body,
    }),
  })

  if (!response.ok) {
    throw new OAuthError(`Token-Austausch fehlgeschlagen (${response.status})`)
  }

  const payload = (await response.json()) as TokenResponse
  if (!payload.access_token) throw new OAuthError('Antwort enthielt kein access_token')

  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? null,
    // Tokens without an expiry are treated as long lived; refresh handles the rest.
    expiresAt: Math.floor(Date.now() / 1000) + (payload.expires_in ?? 60 * 60 * 24 * 365),
  }
}

export const exchangeCode = (app: OAuthApp, code: string): Promise<TokenSet> =>
  postToken(app, { grant_type: 'authorization_code', code, redirect_uri: app.redirectUri })

export const refreshTokens = (app: OAuthApp, refreshToken: string): Promise<TokenSet> =>
  postToken(app, { grant_type: 'refresh_token', refresh_token: refreshToken })

type AthleteResponse = { id?: string | number; name?: string }

/** Athlete id 0 resolves to the authenticated user when using bearer tokens. */
export const fetchAthlete = async (accessToken: string): Promise<{ id: string; name: string }> => {
  const response = await fetch('https://intervals.icu/api/v1/athlete/0', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!response.ok) throw new OAuthError(`Athletenprofil nicht lesbar (${response.status})`)
  const athlete = (await response.json()) as AthleteResponse
  if (athlete.id === undefined) throw new OAuthError('Athletenprofil ohne id')
  return { id: String(athlete.id), name: athlete.name ?? 'Athlet' }
}
