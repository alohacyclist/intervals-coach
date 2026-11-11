import { describe, expect, it } from 'vitest'
import { createApiRoutes, localToday } from '../server/routes.ts'
import { LANG_HEADER } from '../server/lang.ts'
import { demoData, fixtureSource } from '../server/demo/source.ts'
import type { CoachConfig, Plan, Progress } from '../src/coach/types.ts'
import type { Lang } from '../src/coach/lang.ts'

// The demo account is built around the day it is asked on.
const TODAY = localToday()

/** One athlete, asked in one language: the demo account, through the very routes the app uses. */
const ask = async <T>(path: string, language: Lang): Promise<T> => {
  let stored: CoachConfig | null = null
  // Built inside the request, as the demo does: its activities are named in the asker's language.
  const app = createApiRoutes(async () => {
    const data = demoData(TODAY)
    return {
      source: fixtureSource(data),
      store: { load: async () => stored ?? data.config, save: async (config) => (stored = config) },
    }
  })
  const response = await app.request(path, { headers: { [LANG_HEADER]: language } })
  expect(response.status).toBe(200)
  return (await response.json()) as T
}

/** What the plan decided, without a single word of it. */
const decisions = (plan: Plan) =>
  plan.days.map((day) => ({
    date: day.date,
    dayType: day.dayType,
    recommended: day.recommended,
    optional: day.optional,
    notes: day.notes.length,
    options: day.options.map((option) => ({
      id: option.template.id,
      variants: option.variants.map((variant) => [variant.tier, variant.minutes, variant.load]),
    })),
  }))

const GERMAN = /[äöüß]|\b(und|oder|nicht|heute|Woche|Einheit|Einheiten|Stufe|Schwelle|Grundlage|Ruhetag)\b/

const strings = (value: unknown): readonly string[] =>
  typeof value === 'string'
    ? [value]
    : Array.isArray(value)
      ? value.flatMap(strings)
      : value && typeof value === 'object'
        ? Object.values(value).flatMap(strings)
        : []

describe('the plan in English', () => {
  it('decides exactly what the German plan decides', async () => {
    const [german, english] = await Promise.all([ask<Plan>('/api/plan?days=7', 'de'), ask<Plan>('/api/plan?days=7', 'en')])
    expect(decisions(english)).toEqual(decisions(german))
    expect(english.history.map((day) => [day.date, day.status, day.templateId])).toEqual(
      german.history.map((day) => [day.date, day.status, day.templateId]),
    )
    expect(english.week).toEqual(german.week)
  })

  it('answers two languages at the same moment without mixing them', async () => {
    const [german, english] = await Promise.all([ask<Plan>('/api/plan', 'de'), ask<Plan>('/api/plan', 'en')])
    expect(['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']).toContain(german.days[0]?.weekday)
    expect(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']).toContain(english.days[0]?.weekday)
  })

  it('leaves no German in what the athlete reads', async () => {
    const plan = await ask<Plan>('/api/plan?days=7', 'en')
    const progress = await ask<Progress>('/api/progress', 'en')
    const left = [...strings(plan.days), ...strings(plan.history), ...strings(progress.levels), ...strings(progress.benchmark)].filter(
      (text) => GERMAN.test(text),
    )
    expect([...new Set(left)]).toEqual([])
  })

  it('stays German without the header', async () => {
    const data = demoData(TODAY)
    const app = createApiRoutes(async () => ({
      source: fixtureSource(data),
      store: { load: async () => data.config, save: async (config) => config },
      }))
    const plan = (await (await app.request('/api/plan')).json()) as Plan
    expect(['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']).toContain(plan.days[0]?.weekday)
  })
})
