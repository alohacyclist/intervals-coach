import type { WeekOutlook } from '../../coach/types.ts'
import { STIMULUS_LABELS } from '../../coach/types.ts'
import { SportIcon } from './SportIcon.tsx'

/** Stimuli that have gone missing for a while, and whether the long session has happened. */
export const StillOpen = ({ week }: { readonly week: WeekOutlook }) => {
  if (week.openStimuli.length === 0 && !week.longDone) return null
  return (
    <section className="still-open">
      {week.openStimuli.length > 0 && <h2>Noch offen</h2>}
      {week.openStimuli.length > 0 && (
        <ul>
          {week.openStimuli.map((entry) => (
            <li key={`${entry.sport}-${entry.stimulus}`}>
              <i className="mark"><SportIcon sport={entry.sport} /></i>
              <span>{STIMULUS_LABELS[entry.stimulus]}</span>
              <span className="still-open__since">
                {entry.daysAgo >= 99 ? 'bisher nicht' : `seit ${entry.daysAgo} Tagen`}
              </span>
            </li>
          ))}
        </ul>
      )}
      {week.longDone && <p className="still-open__since">Lange Einheit steht.</p>}
    </section>
  )
}
