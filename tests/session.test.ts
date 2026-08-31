import { describe, expect, it } from 'vitest'
import { decryptJson, encryptJson, randomToken, sign, verify } from '../worker/crypto.ts'
import { createSessionCookie, clearSessionCookie, readSession } from '../worker/session.ts'

const SECRET = 'test-secret-value'

const cookieHeader = (setCookie: string): string => setCookie.split(';')[0] ?? ''

describe('crypto', () => {
  it('verifies its own signature and rejects a tampered one', async () => {
    const signature = await sign('payload', SECRET)
    expect(await verify('payload', signature, SECRET)).toBe(true)
    expect(await verify('payload-x', signature, SECRET)).toBe(false)
    expect(await verify('payload', signature, 'other-secret')).toBe(false)
  })

  it('round trips encrypted values', async () => {
    const encrypted = await encryptJson({ token: 'abc', n: 1 }, SECRET)
    expect(encrypted).not.toContain('abc')
    expect(await decryptJson<{ token: string }>(encrypted, SECRET)).toEqual({ token: 'abc', n: 1 })
  })

  it('returns null instead of throwing for a wrong key or garbage', async () => {
    const encrypted = await encryptJson({ token: 'abc' }, SECRET)
    expect(await decryptJson(encrypted, 'wrong-secret')).toBeNull()
    expect(await decryptJson('not-a-payload', SECRET)).toBeNull()
  })

  it('produces distinct random tokens', () => {
    expect(randomToken()).not.toBe(randomToken())
  })
})

describe('session cookies', () => {
  it('round trips the athlete id', async () => {
    const cookie = cookieHeader(await createSessionCookie('i123', SECRET))
    const session = await readSession(cookie, SECRET)
    expect(session?.athleteId).toBe('i123')
  })

  it('is HttpOnly, Secure and SameSite=Lax', async () => {
    const cookie = await createSessionCookie('i123', SECRET)
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('Secure')
    expect(cookie).toContain('SameSite=Lax')
  })

  it('rejects a forged payload', async () => {
    const forged = `coach_session=${btoa(JSON.stringify({ athleteId: 'i999', exp: 9e9 }))}.deadbeef`
    expect(await readSession(forged, SECRET)).toBeNull()
  })

  it('rejects a cookie signed with a different secret', async () => {
    const cookie = cookieHeader(await createSessionCookie('i123', 'other-secret'))
    expect(await readSession(cookie, SECRET)).toBeNull()
  })

  it('rejects an expired session', async () => {
    const payload = btoa(JSON.stringify({ athleteId: 'i123', exp: 1 }))
    const signature = await sign(payload, SECRET)
    expect(await readSession(`coach_session=${payload}.${signature}`, SECRET)).toBeNull()
  })

  it('returns null when no cookie is present', async () => {
    expect(await readSession(null, SECRET)).toBeNull()
    expect(await readSession('other=1', SECRET)).toBeNull()
  })

  it('clears the cookie with a zero max age', () => {
    expect(clearSessionCookie()).toContain('Max-Age=0')
  })
})
