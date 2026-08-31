/** Prints a plan from synthetic history — useful to sanity check the engine without API access. */
import { addDays } from '../src/coach/dates.ts'
import { buildState } from '../src/coach/state.ts'
import { planDays } from '../src/coach/engine.ts'
import { assessGoals } from '../src/coach/feasibility.ts'
import { toIntervalsText } from '../src/coach/format.ts'
import { DEFAULT_CONFIG } from '../src/coach/config-schema.ts'
import type { Activity, Wellness } from '../src/coach/types.ts'

const today = new Date().toISOString().slice(0, 10)

const history: readonly Activity[] = [
  { daysAgo: 2, sport: 'Ride' as const, load: 78, intensity: 88, minutes: 70, name: 'Sweetspot' },
  { daysAgo: 4, sport: 'Run' as const, load: 62, intensity: 94, minutes: 50, name: 'Schwelle 5x1km' },
  { daysAgo: 7, sport: 'Ride' as const, load: 55, intensity: 68, minutes: 75, name: 'Grundlage' },
  { daysAgo: 9, sport: 'Run' as const, load: 78, intensity: 72, minutes: 80, name: 'Langer Lauf' },
  { daysAgo: 12, sport: 'Ride' as const, load: 85, intensity: 96, minutes: 74, name: 'Schwelle' },
].map((entry, index) => ({
  id: String(index),
  date: addDays(today, -entry.daysAgo),
  sport: entry.sport,
  name: entry.name,
  load: entry.load,
  intensity: entry.intensity,
  movingTimeSec: entry.minutes * 60,
}))

const wellness: readonly Wellness[] = Array.from({ length: 31 }, (_unused, index) => ({
  date: addDays(today, -index),
  hrv: 68 + (index % 5),
  restingHr: 45 + (index % 3),
  sleepSecs: 7.2 * 3600,
  fatigue: 2,
  soreness: 1,
}))

const state = buildState(history, wellness, today)
const days = planDays(state, DEFAULT_CONFIG, 3)

console.log(`Form ${state.overall.tsb} · CTL ${state.overall.ctl} · ATL ${state.overall.atl} · ${state.readiness.score}`)
console.log(`Rad hart vor ${state.daysSinceHard.Ride}d · Lauf hart vor ${state.daysSinceHard.Run}d\n`)

for (const day of days) {
  console.log(`=== ${day.weekday} ${day.date} · ${day.dayType} · ${day.phase} · Empfehlung: ${day.recommended}`)
  for (const note of day.notes) console.log(`   · ${note}`)
  for (const option of day.options) {
    const mark = option.sport === day.recommended ? '>>' : '  '
    console.log(`${mark} [${option.sport}] ${option.template.name} — ${option.template.minutes}min / ${option.template.load} TSS`)
    for (const step of option.humanSteps) console.log(`      ${step}`)
  }
  console.log()
}

console.log('--- intervals.icu Syntax (erste Empfehlung) ---')
const first = days[0]?.options.find((option) => option.sport === days[0]?.recommended)
if (first) console.log(toIntervalsText(first.template.blocks))

console.log('\n--- Ziel-Check ---')
for (const item of assessGoals(DEFAULT_CONFIG.goals, DEFAULT_CONFIG.profile, today)) {
  console.log(`[${item.verdict}] ${item.message}`)
}
