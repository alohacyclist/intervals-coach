import type { AthleteProfile, Sport, SportThreshold } from './types.ts'

export const thresholdFor = (profile: AthleteProfile, sport: Sport): SportThreshold | undefined =>
  profile.sports.find((setting) => setting.sport === sport)?.threshold

export const trains = (profile: AthleteProfile, sport: Sport): boolean =>
  profile.sports.some((setting) => setting.sport === sport)

export const selectedSports = (profile: AthleteProfile): readonly Sport[] =>
  profile.sports.map((setting) => setting.sport)

/** Cycling FTP, where the athlete rides. Goals and watt targets need it. */
export const ftpOf = (profile: AthleteProfile): number | null => {
  const threshold = thresholdFor(profile, 'Ride')
  return threshold?.metric === 'power' ? threshold.ftp : null
}

export const defaultThreshold = (sport: Sport): SportThreshold => {
  if (sport === 'Ride') return { metric: 'power', ftp: 250 }
  if (sport === 'Run') return { metric: 'pace', thresholdSecPerKm: 270 }
  return { metric: 'swimPace', cssSecPer100m: 110 }
}
