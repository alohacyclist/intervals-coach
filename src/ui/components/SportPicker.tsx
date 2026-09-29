import { useEffect, useId, useState } from 'react'
import type { Sport, SportSetting } from '../../coach/types.ts'
import { ALL_SPORTS, SPORT_LABELS } from '../../coach/types.ts'
import { defaultThreshold } from '../../coach/thresholds.ts'
import type { Prefilled, ThresholdEdit, ThresholdSources } from '../threshold-input.ts'
import { SOURCE_NOTES, shownText, thresholdFromText } from '../threshold-input.ts'

const THRESHOLD_LABEL: Readonly<Record<Sport, string>> = {
  Ride: 'FTP (Watt)',
  Run: 'Schwellenpace (min/km)',
  Swim: 'CSS (min/100 m)',
}

const INVALID: Readonly<Record<Sport, string>> = {
  Ride: 'FTP in Watt, z. B. 250',
  Run: 'Pace als m:ss pro km, z. B. 4:30',
  Swim: 'CSS als m:ss pro 100 m, z. B. 1:50',
}

const estimate = (sport: Sport): Prefilled => ({ threshold: defaultThreshold(sport), source: 'estimate' })

type Props = {
  readonly sports: readonly SportSetting[]
  readonly sources: ThresholdSources
  readonly onChange: (sports: readonly SportSetting[], sources: ThresholdSources) => void
  /** Reports whether every field holds a usable value, so the form can hold back saving. */
  readonly onValidity?: (valid: boolean) => void
  /** Where a sport switched on gets its first value; without one it is a marked estimate. */
  readonly prefill?: (sport: Sport) => Prefilled
}

export const SportPicker = ({ sports, sources, onChange, onValidity, prefill = estimate }: Props) => {
  const [edits, setEdits] = useState<Partial<Readonly<Record<Sport, ThresholdEdit>>>>({})
  const baseId = useId()

  const invalidSports = (next: typeof edits): readonly Sport[] =>
    sports
      .filter((setting) => {
        const edit = next[setting.sport]
        return edit !== undefined && edit.basis === setting.threshold && thresholdFromText(setting.sport, edit.text) === null
      })
      .map((setting) => setting.sport)

  const withoutSource = (sport: Sport): ThresholdSources =>
    Object.fromEntries(Object.entries(sources).filter(([key]) => key !== sport))

  const toggle = (sport: Sport) => {
    if (sports.some((setting) => setting.sport === sport)) {
      onChange(
        sports.filter((setting) => setting.sport !== sport),
        withoutSource(sport),
      )
      return
    }
    const added = prefill(sport)
    onChange(
      // Keep the canonical order rather than the order they were clicked in.
      ALL_SPORTS.filter((candidate) => candidate === sport || sports.some((s) => s.sport === candidate)).map(
        (candidate) =>
          sports.find((setting) => setting.sport === candidate) ?? { sport: candidate, threshold: added.threshold },
      ),
      { ...sources, [sport]: added.source },
    )
  }

  const type = (setting: SportSetting, text: string) => {
    const parsed = thresholdFromText(setting.sport, text)
    const threshold = parsed ?? setting.threshold
    const next = { ...edits, [setting.sport]: { text, basis: threshold } }
    setEdits(next)
    if (parsed !== null) {
      onChange(
        sports.map((entry) => (entry.sport === setting.sport ? { ...entry, threshold: parsed } : entry)),
        { ...sources, [setting.sport]: 'own' },
      )
    }
  }

  const invalid = invalidSports(edits)
  const valid = invalid.length === 0
  useEffect(() => onValidity?.(valid), [valid, onValidity])

  return (
    <div className="sports">
      {ALL_SPORTS.map((sport) => {
        const setting = sports.find((entry) => entry.sport === sport)
        const source = sources[sport]
        const messageId = `${baseId}-${sport}`
        const wrong = invalid.includes(sport)
        const note = wrong ? INVALID[sport] : source !== undefined && source !== 'own' ? SOURCE_NOTES[source] : null
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
                  value={shownText(edits[sport], setting.threshold)}
                  onChange={(event) => type(setting, event.target.value)}
                  aria-invalid={wrong}
                  aria-describedby={note === null ? undefined : messageId}
                />
                {note !== null && (
                  <small id={messageId} className={wrong ? 'error' : 'hint'}>
                    {note}
                  </small>
                )}
              </label>
            )}
          </div>
        )
      })}
    </div>
  )
}
