import type { DayType, Fitness, ReadinessScore } from './types.ts'

/** A number as the athlete reads it on a display: a real minus, and a plus when above zero. */
export const signed = (value: number): string =>
  value > 0 ? `+${value}` : value < 0 ? `−${Math.abs(value)}` : '0'

const formWords = (tsb: number): string => {
  if (tsb >= 10) return 'Du bist ausgeruht'
  if (tsb >= -10) return 'Belastung und Erholung halten sich die Waage'
  if (tsb >= -18) return 'Du trägst etwas Ermüdung mit, das gehört zum Training'
  if (tsb >= -30) return 'Du bist deutlich ermüdet'
  return 'Du bist überlastet'
}

/** The day's form as a sentence first; the three numbers follow for whoever reads them. */
export const formNote = (fitness: Fitness): string => {
  // A projected day carries decimals the athlete's own display never shows.
  const [tsb, ctl, atl] = [fitness.tsb, fitness.ctl, fitness.atl].map(Math.round) as [number, number, number]
  return `${formWords(tsb)} (Form ${signed(tsb)}, Fitness ${ctl}, Ermüdung ${atl}).`
}

export type TodaySummaryInput = {
  readonly readiness: ReadinessScore
  readonly tsb: number
  readonly dayType: DayType
  /** Something already counted for today. */
  readonly trained: boolean
}

// Bands follow the engine's own thresholds, so the sentence never contradicts the day it heads.
const TIRED_TSB = -18
const OVERLOADED_TSB = -30
const FRESH_TSB = 5

/** One sentence above today's session: how the athlete stands and what that means for today. */
export const todaySummary = ({ readiness, tsb, dayType, trained }: TodaySummaryInput): string => {
  if (trained) return 'Heute schon trainiert – der Rest des Tages gehört der Erholung.'
  switch (dayType) {
    case 'REST':
      return readiness === 'red'
        ? 'Dein Körper braucht Erholung – heute ist Pause.'
        : 'Heute ist Pause – Erholung gehört zum Training.'
    case 'RECOVERY':
      if (readiness === 'red') return 'Deine Erholungswerte sind schwach – heute nur ganz locker.'
      return tsb < OVERLOADED_TSB
        ? 'Du bist stark ermüdet – heute nur ganz locker.'
        : 'Heute nur ganz locker – Regeneration hat Vorrang.'
    case 'EASY':
      if (readiness !== 'green') return 'Deine Erholungswerte liegen unter normal – heute locker.'
      return tsb < TIRED_TSB
        ? 'Du bist müde vom Training – heute locker.'
        : 'Heute locker – die nächste harte Einheit kommt bald.'
    case 'KEY':
      if (readiness === 'red') return 'Deine Erholungswerte sind schwach – hart nur, wenn du dich wirklich gut fühlst.'
      if (readiness === 'amber') return 'Kleine Warnsignale – hart nur, wenn es sich gut anfühlt.'
      return tsb >= FRESH_TSB
        ? 'Du bist erholt – heute darf es hart sein.'
        : 'Du bist bereit – heute darf es hart sein.'
  }
}
