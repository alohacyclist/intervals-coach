import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { HistoryStrip, STATUS_MARK } from '../src/ui/components/HistoryStrip.tsx'
import type { AdherenceDay, AdherenceStatus } from '../src/coach/types.ts'

const day = (date: string, status: AdherenceStatus): AdherenceDay => ({
  date,
  weekday: 'Mo',
  status,
  planned: status === 'unplanned' || status === 'rest' ? [] : ['Sweetspot'],
  completed: status === 'missed' || status === 'rest' || status === 'open' ? null : 'Einheit',
  completedSport: 'Ride',
  compliance: null,
  load: status === 'missed' || status === 'rest' ? 0 : 50,
  activityId: null,
  templateId: null,
})

describe('history strip', () => {
  it('gives every status its own mark, so colour is never the only signal', () => {
    const marks = Object.values(STATUS_MARK)
    expect(new Set(marks).size).toBe(marks.length)
  })

  it('shows the mark and says the status in words for each day', () => {
    const history = (['done', 'race', 'switched', 'missed', 'unplanned', 'rest', 'open'] as const).map(
      (status, index) => day(`2026-09-0${index + 1}`, status),
    )
    const html = renderToStaticMarkup(createElement(HistoryStrip, { history }))
    for (const entry of history) {
      expect(html).toContain(`history__day--${entry.status}`)
      expect(html).toContain(`>${STATUS_MARK[entry.status]}<`)
    }
    expect(html).toContain('geplant, nicht absolviert, ')
    expect(html).toContain('<span class="sr-only">Rennen, ')
  })
})
