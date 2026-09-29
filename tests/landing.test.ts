import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Landing } from '../src/ui/Landing.tsx'

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

  it('keeps sign-in locked until consent is given', () => {
    expect(html).toContain('cta cta--locked')
    expect(html).toContain('aria-disabled="true"')
  })
})
