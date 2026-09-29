import { formatClock, formatSeconds } from '../coach/dates.ts'

const LEADING = /^\d+$/
const TRAILING = /^\d{1,2}$/

/**
 * A typed time in seconds: "38:30" is minutes and seconds, "1:45:00" hours,
 * minutes and seconds. Anything else is no time at all rather than a silent
 * zero — a bare "38" could be minutes or seconds, and a guess would move a goal.
 */
export const parseTime = (value: string): number | null => {
  const parts = value.trim().split(':')
  if (parts.length < 2 || parts.length > 3) return null
  const [first = '', ...rest] = parts
  if (!LEADING.test(first) || !rest.every((part) => TRAILING.test(part))) return null
  if (rest.some((part) => Number(part) >= 60)) return null
  const seconds = parts.reduce((total, part) => total * 60 + Number(part), 0)
  return seconds > 0 ? seconds : null
}

export const TIME_FORMAT_HINT = 'Zeit als mm:ss oder h:mm:ss, z. B. 38:30 oder 1:45:00'

/** The message for a time field, or null when it holds a valid time or may stay empty. */
export const timeError = (value: string, required: boolean): string | null => {
  if (value.trim() === '') return required ? 'Bitte eine Zeit eintragen' : null
  return parseTime(value) === null ? TIME_FORMAT_HINT : null
}

export { formatClock, formatSeconds }
