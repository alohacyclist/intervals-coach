import { sign, verify } from './crypto.ts'

const COOKIE_NAME = 'coach_session'
const STATE_COOKIE = 'coach_oauth_state'
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30

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

const cookie = (name: string, value: string, maxAge: number): string =>
  `${name}=${encodeURIComponent(value)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`

export const createSessionCookie = async (athleteId: string, secret: string): Promise<string> => {
  const session: Session = { athleteId, exp: Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS }
  const payload = encode(session)
  return cookie(COOKIE_NAME, `${payload}.${await sign(payload, secret)}`, MAX_AGE_SECONDS)
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

/** The OAuth state parameter, mirrored into a short lived cookie to stop CSRF. */
export const createStateCookie = (state: string): string => cookie(STATE_COOKIE, state, 600)

export const readState = (header: string | null): string | null => readCookie(header, STATE_COOKIE)

export const clearStateCookie = (): string => cookie(STATE_COOKIE, '', 0)
