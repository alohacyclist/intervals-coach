import type { Sport, SportSetting, SportThreshold } from '../../coach/types.ts'
import { ALL_SPORTS, SPORT_LABELS } from '../../coach/types.ts'
import { defaultThreshold } from '../../coach/thresholds.ts'
import { formatSeconds, parseTime } from '../format-input.ts'

const THRESHOLD_LABEL: Readonly<Record<Sport, string>> = {
  Ride: 'FTP (Watt)',
  Run: 'Schwellenpace (min/km)',
  Swim: 'CSS (min/100 m)',
}

const thresholdValue = (threshold: SportThreshold): string => {
  if (threshold.metric === 'power') return String(threshold.ftp)
  if (threshold.metric === 'pace') return formatSeconds(threshold.thresholdSecPerKm)
  return formatSeconds(threshold.cssSecPer100m)
}

const thresholdFromInput = (sport: Sport, value: string): SportThreshold | null => {
  if (sport === 'Ride') {
    const ftp = Number(value)
    return Number.isFinite(ftp) && ftp > 0 ? { metric: 'power', ftp } : null
  }
  const seconds = parseTime(value)
  if (seconds === null) return null
  return sport === 'Run'
    ? { metric: 'pace', thresholdSecPerKm: seconds }
    : { metric: 'swimPace', cssSecPer100m: seconds }
}

type Props = {
  readonly sports: readonly SportSetting[]
  readonly onChange: (sports: readonly SportSetting[]) => void
}

export const SportPicker = ({ sports, onChange }: Props) => {
  const toggle = (sport: Sport) =>
    onChange(
      sports.some((setting) => setting.sport === sport)
        ? sports.filter((setting) => setting.sport !== sport)
        : // Keep the canonical order rather than the order they were clicked in.
          ALL_SPORTS.filter(
            (candidate) => candidate === sport || sports.some((s) => s.sport === candidate),
          ).map(
            (candidate) =>
              sports.find((setting) => setting.sport === candidate) ?? {
                sport: candidate,
                threshold: defaultThreshold(candidate),
              },
          ),
    )

  const setThreshold = (sport: Sport, value: string) => {
    const threshold = thresholdFromInput(sport, value)
    if (threshold === null) return
    onChange(sports.map((setting) => (setting.sport === sport ? { ...setting, threshold } : setting)))
  }

  return (
    <div className="sports">
      {ALL_SPORTS.map((sport) => {
        const setting = sports.find((entry) => entry.sport === sport)
        return (
          <div key={sport} className={`sports__row ${setting ? 'sports__row--on' : ''}`}>
            <label className="sports__toggle">
              <input type="checkbox" checked={Boolean(setting)} onChange={() => toggle(sport)} />
              {SPORT_LABELS[sport]}
            </label>
            {setting && (
              <label className="sports__threshold">
                {THRESHOLD_LABEL[sport]}
                <input
                  type="text"
                  defaultValue={thresholdValue(setting.threshold)}
                  key={`${sport}-${setting.threshold.metric}`}
                  onBlur={(event) => setThreshold(sport, event.target.value)}
                />
              </label>
            )}
          </div>
        )
      })}
    </div>
  )
}
