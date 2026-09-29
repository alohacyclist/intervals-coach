import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { SportPicker } from '../src/ui/components/SportPicker.tsx'
import type { SportSetting } from '../src/coach/types.ts'

const sports: readonly SportSetting[] = [
  { sport: 'Ride', threshold: { metric: 'power', ftp: 250 } },
  { sport: 'Run', threshold: { metric: 'pace', thresholdSecPerKm: 270 } },
  { sport: 'Swim', threshold: { metric: 'swimPace', cssSecPer100m: 110 } },
]

const html = renderToStaticMarkup(createElement(SportPicker, { sports, sources: {}, onChange: () => undefined }))

describe('the threshold fields', () => {
  it('explain FTP, threshold pace and CSS on tap', () => {
    expect(html.match(/class="term"/g)).toHaveLength(3)
    expect(html).toMatch(/class="term"[^>]*>FTP</)
    expect(html).toMatch(/class="term"[^>]*>Schwellenpace</)
    expect(html).toMatch(/class="term"[^>]*>CSS</)
  })

  it('keep a plain name for each input, since a label may not hold the explaining button', () => {
    expect(html).toContain('aria-label="FTP (Watt)"')
    expect(html).toContain('aria-label="Schwellenpace (min/km)"')
    expect(html).toContain('aria-label="CSS (min/100 m)"')
    for (const label of html.match(/<label[\s\S]*?<\/label>/g) ?? []) expect(label).not.toContain('<button')
  })
})
