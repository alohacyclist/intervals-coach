import type { Fitness } from './types.ts'

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
