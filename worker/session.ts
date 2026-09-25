import { sign, verify } from './crypto.ts'

const COOKIE_NAME = 'coach_session'
/** One per flow: a sign-in in one tab must not overwrite the state a Strava connection waits for. */
export const STATE_COOKIES = { intervals: 'coach_oauth_state', strava: 'coach_strava_state' } as const
export type OAuthFlow = keyof typeof STATE_COOKIES

/**
 * Thirty days. Long enough that a training rhythm with a week off never meets a
 * login screen, short enough that a forgotten phone stops being a key next month.
 */
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30

/** A session older than this gets a fresh cookie, so regular use never expires. */
const RENEW_AFTER_SECONDS = 60 * 60 * 24

export type Session = {
  readonly athleteId: string
  readonly exp: number
}

const encode = (session: Session): string => btoa(JSON.stringify(session))

const decode = (payload: string): Session | null => {
  try {
    const parsed = JSON.parse(atob(payload)) as Partial<Session>
    return typeof parsed.athleteId === 'string' && typeof parsed.exp === 'number'
      ? { athleteId: parsed.athleteId, exp: parsed.exp }
      : null
  } catch {
    return null
  }
}

const readCookie = (header: string | null, name: string): string | null => {
  const match = (header ?? '')
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null
}

/**
 * `Secure` is dropped only for plain http, which in practice is `wrangler dev`
 * on localhost — without that the cookie would silently never be stored there.
 */
const cookie = (name: string, value: string, maxAge: number, secure = true): string =>
  `${name}=${encodeURIComponent(value)}; HttpOnly;${secure ? ' Secure;' : ''} SameSite=Lax; Path=/; Max-Age=${maxAge}`

export const createSessionCookie = async (
  athleteId: string,
  secret: string,
  secure = true,
): Promise<string> => {
  const session: Session = { athleteId, exp: Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS }
  const payload = encode(session)
  return cookie(COOKIE_NAME, `${payload}.${await sign(payload, secret)}`, MAX_AGE_SECONDS, secure)
}

export const clearSessionCookie = (): string => cookie(COOKIE_NAME, '', 0)

export const readSession = async (header: string | null, secret: string): Promise<Session | null> => {
  const raw = readCookie(header, COOKIE_NAME)
  if (!raw) return null
  const [payload, signature] = raw.split('.')
  if (!payload || !signature || !(await verify(payload, signature, secret))) return null
  const session = decode(payload)
  return session && session.exp > Math.floor(Date.now() / 1000) ? session : null
}

/**
 * True once the cookie has aged a day. Rewriting it then turns the fixed thirty
 * days into a sliding window: whoever keeps using the app stays signed in, and
 * a session left alone for a month still ends.
 */
export const shouldRenew = (session: Session, now: number = Math.floor(Date.now() / 1000)): boolean =>
  session.exp - now < MAX_AGE_SECONDS - RENEW_AFTER_SECONDS

/** The OAuth state parameter, mirrored into a short lived cookie to stop CSRF. */
export const createStateCookie = (state: string, secure = true, flow: OAuthFlow = 'intervals'): string =>
  cookie(STATE_COOKIES[flow], state, 600, secure)

export const readState = (header: string | null, flow: OAuthFlow = 'intervals'): string | null =>
  readCookie(header, STATE_COOKIES[flow])

export const clearStateCookie = (flow: OAuthFlow = 'intervals'): string => cookie(STATE_COOKIES[flow], '', 0)
