import { formatSeconds } from '../coach/dates.ts'

export const parseMmSs = (value: string): number => {
  const [minutes = '0', seconds = '0'] = value.split(':')
  return Number(minutes) * 60 + Number(seconds)
}

export { formatSeconds }
