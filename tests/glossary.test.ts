import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { GLOSSARY } from '../src/ui/glossary.ts'
import { Term } from '../src/ui/components/Term.tsx'

describe('glossary', () => {
  it('explains every term in one sentence plus why it matters', () => {
    for (const entry of Object.values(GLOSSARY)) {
      expect(entry.name.length).toBeGreaterThan(0)
      expect(entry.what).toMatch(/^[A-ZÄÖÜ].*\.$/)
      expect(entry.why).toMatch(/^[A-ZÄÖÜ].*\.$/)
      expect(`${entry.what} ${entry.why}`.length).toBeLessThan(220)
    }
  })

  it('covers the terms the plan and settings show', () => {
    expect(Object.keys(GLOSSARY).sort()).toEqual(
      ['atl', 'css', 'ctl', 'ftp', 'hrv', 'ramp', 'thresholdPace', 'tsb', 'tss'].sort(),
    )
  })
})

describe('Term', () => {
  const html = renderToStaticMarkup(createElement(Term, { term: 'tsb', children: 'Form' }))

  it('opens its explanation from a button, not from a hover title', () => {
    const target = html.match(/popovertarget="([^"]+)"/i)?.[1]
    expect(target).toBeTruthy()
    expect(html).toContain(`id="${target}" popover="auto"`)
    expect(html).not.toContain('title=')
    expect(html).toContain('<button type="button" class="term"')
  })

  it('keeps the visible label as the accessible name', () => {
    expect(html).toMatch(/class="term"[^>]*>Form</)
    expect(html).toContain(GLOSSARY.tsb.what)
  })
})
