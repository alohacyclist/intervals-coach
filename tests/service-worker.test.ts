import { describe, expect, it } from 'vitest'
import { cacheVersion, isPrivate, precacheList, strategyFor } from '../src/sw/strategy.ts'

const origin = 'https://etmal.coach'
const get = (path: string, mode = 'cors') => strategyFor({ method: 'GET', url: `${origin}${path}`, mode, origin })

describe('service worker strategy', () => {
  it('never answers for data, sign-in or the health check', () => {
    for (const path of ['/api/plan?days=3', '/api/me', '/api/config', '/auth/login', '/auth/callback?code=1', '/auth/logout', '/healthz']) {
      expect(get(path), path).toBe('network')
      expect(get(path, 'navigate'), path).toBe('network')
    }
  })

  it('does not mistake a page for a private path that merely starts alike', () => {
    expect(isPrivate('/apiary')).toBe(false)
    expect(isPrivate('/api/')).toBe(true)
    expect(get('/app', 'navigate')).toBe('shell')
  })

  it('answers page views with the shell, whatever the path', () => {
    for (const path of ['/', '/app', '/verlauf', '/login', '/datenschutz']) expect(get(path, 'navigate')).toBe('shell')
  })

  it('keeps hashed program files and nothing else', () => {
    expect(get('/assets/index-abc123.js')).toBe('cache-first')
    expect(get('/logo.svg')).toBe('network')
    expect(get('/manifest.webmanifest')).toBe('network')
  })

  it('leaves writes and other origins alone', () => {
    expect(strategyFor({ method: 'POST', url: `${origin}/assets/x.js`, mode: 'cors', origin })).toBe('network')
    expect(strategyFor({ method: 'GET', url: 'https://intervals.icu/assets/x.js', mode: 'cors', origin })).toBe('network')
  })
})

describe('precache list', () => {
  const files = ['index.html', 'assets/index-a.js', 'assets/index-b.css', 'assets/font-c.woff2', 'assets/font-d.woff', 'logo.svg']

  it('holds script, styles and current fonts', () => {
    expect(precacheList(files)).toEqual(['/assets/font-c.woff2', '/assets/index-a.js', '/assets/index-b.css'])
  })

  it('versions the cache by its content, not by the order the build lists it in', () => {
    expect(cacheVersion(files)).toBe(cacheVersion([...files].reverse()))
    expect(cacheVersion(files)).not.toBe(cacheVersion([...files, 'assets/index-e.js']))
  })
})
