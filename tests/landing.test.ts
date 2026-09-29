import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Landing, landingError } from '../src/ui/Landing.tsx'
import { EXPIRED_SESSION_URL } from '../src/ui/api.ts'

describe('landing copy', () => {
  const html = renderToStaticMarkup(createElement(Landing, { error: null }))

  it('speaks of every chosen sport, swimming included, not of two', () => {
    expect(html).not.toMatch(/zwei Vorschläge/i)
    expect(html).not.toContain('getrennt für Rad und Lauf')
    expect(html).toContain('Schwimmen')
  })

  it('promises free use only for the beta', () => {
    expect(html).toContain('Kostenlos in der Beta')
    expect(html).not.toMatch(/Kostenlos\.\s/)
  })

  it('does not make a goal a condition for signing up', () => {
    expect(html).toContain('Ein Ziel ist optional')
    expect(html).not.toContain('Ziel festlegen')
  })

  it('says bike targets need a power meter', () => {
    expect(html).toContain('Wattmesser')
  })

  it('shows an example day with a choice of sport and length', () => {
    expect(html).toContain('Heute · Beispiel')
    expect(html.match(/example__or/g)).toHaveLength(2)
  })

  it('lists the four permissions the sign-in asks for, settings included', () => {
    expect(html).toContain('vier Berechtigungen')
    expect(html).toContain('Einstellungen ändern')
    expect(html).not.toContain('genau drei')
  })

  it('keeps sign-in locked until consent is given', () => {
    expect(html).toContain('cta cta--locked')
    expect(html).toContain('aria-disabled="true"')
  })
})

describe('the reason a sign-in page gives', () => {
  it('says the session ran out when a view sent the athlete back after a 401', () => {
    const reason = new URL(EXPIRED_SESSION_URL, 'https://formkurve.org').searchParams.get('fehler')
    expect(reason).toBe('abgelaufen')
    expect(landingError('abgelaufen')).toBe('Deine Anmeldung ist abgelaufen. Bitte melde dich neu an.')
    expect(renderToStaticMarkup(createElement(Landing, { error: 'abgelaufen' }))).toContain(
      'Deine Anmeldung ist abgelaufen.',
    )
  })

  it('keeps the known refusals and falls back to a failed sign-in for anything else', () => {
    expect(landingError('abgelehnt')).toContain('Zugriff wurde abgelehnt')
    expect(landingError('einwilligung')).toContain('Ohne Einwilligung')
    expect(landingError('state')).toBe('Die Anmeldung ist fehlgeschlagen. Bitte noch einmal versuchen.')
  })
})
