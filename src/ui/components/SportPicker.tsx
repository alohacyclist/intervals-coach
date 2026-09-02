import type { Sport, SportSetting, SportThreshold } from '../../coach/types.ts'
import { ALL_SPORTS, SPORT_LABELS } from '../../coach/types.ts'
import { defaultThreshold } from '../../coach/thresholds.ts'
import { formatSeconds, parseMmSs } from '../format-input.ts'

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

const thresholdFromInput = (sport: Sport, value: string): SportThreshold => {
  if (sport === 'Ride') return { metric: 'power', ftp: Number(value) }
  if (sport === 'Run') return { metric: 'pace', thresholdSecPerKm: parseMmSs(value) }
  return { metric: 'swimPace', cssSecPer100m: parseMmSs(value) }
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

  const setThreshold = (sport: Sport, value: string) =>
    onChange(
      sports.map((setting) =>
        setting.sport === sport
          ? { ...setting, threshold: thresholdFromInput(sport, value) }
          : setting,
      ),
    )

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
