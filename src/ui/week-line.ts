import type { AdherenceDay, DayType, PlannedDay, PlannedSession, Sport } from '../coach/types.ts'
import { startOfWeek } from '../coach/dates.ts'
import { HARD_STIMULI } from '../coach/fitness.ts'
import { findTemplate } from '../coach/library.ts'

/** What a stop on the line shows: `neutral` is training whose intensity is not known. */
export type LineMark = 'key' | 'easy' | 'neutral' | 'missed' | 'rest'

export type LineRow = {
  readonly date: string
  readonly day: string
  readonly mark: LineMark
  readonly sport: Sport | null
  readonly title: string
  /** Load in TSS, the number the side of a row leads with; null when there is none. */
  readonly load: number | null
  readonly note: string
}

/** Colour stands for intensity alone, so a recovery day shares the easy day's colour. */
export const dayState = (dayType: DayType): 'key' | 'easy' | 'rest' =>
  dayType === 'KEY' ? 'key' : dayType === 'REST' ? 'rest' : 'easy'

const label = (weekday: string, date: string): string => `${weekday} ${date.slice(8, 10)}.`

/** The version shown first, mirroring the preference SessionCard applies. */
export const usualVariant = (session: PlannedSession) =>
  session.variants.find((variant) => variant.tier === 'extra') ??
  session.variants.find((variant) => variant.tier === 'normal') ??
  session.variants[session.variants.length - 1]

const PAST_NOTE: Readonly<Record<AdherenceDay['status'], string>> = {
  done: '✓',
  race: '⚑ Rennen',
  switched: '↔ anders',
  missed: '✕ nicht absolviert',
  open: '',
  unplanned: '+ spontan',
  rest: '',
}

const trainedMark = (templateId: string | null): LineMark => {
  const template = templateId ? findTemplate(templateId) : undefined
  if (!template) return 'neutral'
  return HARD_STIMULI.includes(template.stimulus) ? 'key' : 'easy'
}

const pastRow = (day: AdherenceDay): LineRow => {
  const base = { date: day.date, day: label(day.weekday, day.date), note: PAST_NOTE[day.status] }
  if (day.status === 'rest') {
    return { ...base, mark: 'rest', sport: null, title: 'Ruhetag', load: null }
  }
  if (day.status === 'missed') {
    const title = day.planned.join(' oder ')
    return { ...base, mark: 'missed', sport: null, title, load: null }
  }
  const sport = day.completedSport && day.completedSport !== 'Other' ? day.completedSport : null
  const title = day.completed ?? day.planned.join(' oder ')
  return { ...base, mark: trainedMark(day.templateId), sport, title, load: day.load }
}

/** What already happened this week. Today is left out: it is a stop on the plan. */
export const pastRows = (history: readonly AdherenceDay[], today: string): readonly LineRow[] => {
  const monday = startOfWeek(today)
  return history.filter((day) => day.date >= monday && day.date < today).map(pastRow)
}

/** What a planned day is asked for: sport, name, size — not the intervals. */
export const planRow = (day: PlannedDay): LineRow => {
  const base = { date: day.date, day: label(day.weekday, day.date) }
  if (day.completed.length > 0) {
    const minutes = day.completed.reduce((sum, entry) => sum + entry.minutes, 0)
    const load = day.completed.reduce((sum, entry) => sum + entry.load, 0)
    const state = dayState(day.dayType)
    const sport = day.completed[0]?.sport
    return {
      ...base,
      mark: state === 'rest' ? 'neutral' : state,
      sport: sport && sport !== 'Other' ? sport : null,
      title: day.completed.map((entry) => entry.name || 'Einheit ohne Namen').join(' · '),
      load: Math.round(load),
      note: `✓ ${Math.round(minutes)} min`,
    }
  }
  if (day.recommended === 'REST') {
    return { ...base, mark: 'rest', sport: null, title: 'Ruhetag', load: null, note: '' }
  }
  const pick = day.options.find((option) => option.sport === day.recommended)
  if (!pick) return { ...base, mark: 'rest', sport: null, title: 'Kein Vorschlag', load: null, note: '' }
  const variant = usualVariant(pick)
  const state = dayState(day.dayType)
  return {
    ...base,
    mark: state === 'rest' ? 'easy' : state,
    sport: pick.sport,
    title: variant?.name ?? pick.template.name,
    load: variant?.load ?? pick.template.load,
    note: `${variant?.minutes ?? pick.template.minutes} min`,
  }
}
