const MS_PER_DAY = 86_400_000

const WEEKDAYS_DE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'] as const

/** Parses YYYY-MM-DD (or an ISO timestamp) into a UTC-anchored date. */
export const parseIso = (iso: string): Date => {
  const datePart = iso.slice(0, 10)
  const parsed = new Date(`${datePart}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid ISO date: ${iso}`)
  return parsed
}

export const toIso = (date: Date): string => date.toISOString().slice(0, 10)

export const addDays = (iso: string, days: number): string =>
  toIso(new Date(parseIso(iso).getTime() + days * MS_PER_DAY))

export const diffDays = (from: string, to: string): number =>
  Math.round((parseIso(to).getTime() - parseIso(from).getTime()) / MS_PER_DAY)

export const weekdayDe = (iso: string): string => WEEKDAYS_DE[parseIso(iso).getUTCDay()] ?? '??'

/** Monday-based start of the week containing `iso`. */
export const startOfWeek = (iso: string): string => {
  const day = parseIso(iso).getUTCDay()
  return addDays(iso, -((day + 6) % 7))
}

/** Whole weeks elapsed between two dates, floored at 0. */
export const weeksBetween = (from: string, to: string): number =>
  Math.max(0, Math.floor(diffDays(from, to) / 7))

export const formatSeconds = (totalSeconds: number): string => {
  const rounded = Math.round(totalSeconds)
  const minutes = Math.floor(rounded / 60)
  const seconds = rounded % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export const formatDuration = (totalSeconds: number): string => {
  const rounded = Math.round(totalSeconds)
  const hours = Math.floor(rounded / 3600)
  const minutes = Math.round((rounded % 3600) / 60)
  return hours > 0 ? `${hours}h${String(minutes).padStart(2, '0')}` : `${minutes}min`
}
