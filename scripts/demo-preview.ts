/** Prints what the demo account shows today, straight through the API routes. */
import { createApiRoutes, localToday } from '../server/routes.ts'
import { demoData, fixtureSource } from '../server/demo/source.ts'
import type { CoachConfig } from '../src/coach/types.ts'

// Another day than today: the clock is moved too, as the routes read "today" from it.
const requested = process.argv[2]
if (requested) {
  const RealDate = Date
  const noon = new RealDate(`${requested}T10:00:00Z`).getTime()
  globalThis.Date = class extends RealDate {
    constructor(...args: unknown[]) {
      super(...((args.length > 0 ? args : [noon]) as [number]))
    }
    static override now(): number {
      return noon
    }
  } as DateConstructor
}
const today = localToday()
const data = demoData(today)
let stored: CoachConfig = data.config
const app = createApiRoutes(async () => ({
  source: fixtureSource(data),
  store: { load: async () => stored, save: async (config) => (stored = config) },
}))
const get = async (path: string) => (await app.request(path)).json() as Promise<any>

const plan = await get('/api/plan')
console.log(`heute ${today} · Form ${plan.state.overall.tsb} · CTL ${plan.state.overall.ctl} · Readiness ${plan.state.readiness.score}`)
console.log('Verlauf:', plan.history.map((day: any) => `${day.weekday} ${day.status}${day.planned.length ? ` (${day.planned.join(', ')})` : ''}`).join(' | '))
console.log('Woche:', JSON.stringify(plan.week.quality), JSON.stringify(plan.week.sessions), plan.week.phase)
console.log('Schwellen:', JSON.stringify(plan.thresholdSuggestions.map((entry: any) => [entry.sport, entry.observed ?? entry.value])))
for (const day of plan.days) {
  console.log(`=== ${day.weekday} ${day.date} · ${day.dayType} · ${day.phase} · Empfehlung ${day.recommended}`)
  for (const note of day.notes) console.log(`   · ${note}`)
  for (const option of day.options) console.log(`   ${option.sport === day.recommended ? '>>' : '  '} ${option.template.name}${option.voluntary ? ' (freiwillig)' : ''}`)
}
const progress = await get('/api/progress')
console.log('Wochen:', progress.weeks.map((week: any) => `${week.start.slice(5)}:${week.load}`).join(' '))
console.log('Stufen:', progress.levels.map((level: any) => `${level.family}=${level.level ?? level.current}`).join(' '))
console.log('Benchmark:', JSON.stringify(progress.benchmark).slice(0, 200))
