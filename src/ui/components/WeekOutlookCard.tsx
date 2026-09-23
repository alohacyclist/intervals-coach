import type { WeekOutlook } from '../../coach/types.ts'
import { PHASE_LABELS } from '../../coach/phase.ts'

/**
 * The week as a shape, not as days. It answers "does this week still add up"
 * without claiming to know which day anything lands on — so training on a
 * different day than expected moves a tick, never the whole picture.
 */

type Props = {
  readonly week: WeekOutlook
}

const STIMULUS_LABELS: Readonly<Record<string, string>> = {
  VO2: 'VO2max',
  THRESHOLD: 'Schwelle',
  SWEETSPOT: 'Sweetspot',
  LONG: 'Lange Einheit',
}

const SPORT_LABELS: Readonly<Record<string, string>> = {
  Ride: 'Rad',
  Run: 'Lauf',
  Swim: 'Schwimmen',
}

const ticks = (done: number, total: number): readonly boolean[] =>
  Array.from({ length: Math.max(done, total) }, (_unused, index) => index < done)

const days = (count: number): string => (count === 1 ? 'noch heute' : `noch ${count} Tage`)

export const WeekOutlookCard = ({ week }: Props) => {
  const qualityLeft = Math.max(0, week.quality.budget - week.quality.done)
  const sessionsLeft = Math.max(0, week.sessions.planned - week.sessions.done)

  return (
    <section className="outlook">
      <header className="outlook__head">
        <span className="outlook__title">Diese Woche</span>
        <span className="outlook__span readout">
          {PHASE_LABELS[week.phase]}
          {week.recoveryWeek && week.phase !== 'RECOVERY' ? ' · reduziert' : ''} · {days(week.daysLeft)}
        </span>
      </header>

      <dl className="outlook__counts">
        <div>
          <dt>Qualität</dt>
          <dd>
            <span className="outlook__ticks" aria-hidden="true">
              {ticks(week.quality.done, week.quality.budget).map((filled, index) => (
                <i key={index} className={filled ? 'tick tick--done' : 'tick'} />
              ))}
            </span>
            <span className="readout">
              {week.quality.done} von {week.quality.budget}
            </span>
          </dd>
        </div>
        <div>
          <dt>Einheiten</dt>
          <dd>
            <span className="outlook__ticks" aria-hidden="true">
              {ticks(week.sessions.done, week.sessions.planned).map((filled, index) => (
                <i key={index} className={filled ? 'tick tick--done' : 'tick'} />
              ))}
            </span>
            <span className="readout">
              {week.sessions.done} von {week.sessions.planned}
              {week.sessions.max > week.sessions.planned ? ` (bis ${week.sessions.max})` : ''}
            </span>
          </dd>
        </div>
      </dl>

      <p className="outlook__line">
        {qualityLeft > 0
          ? `Offen: ${qualityLeft} Qualitätstag${qualityLeft === 1 ? '' : 'e'}`
          : 'Qualität für diese Woche erledigt'}
        {sessionsLeft > 0 ? ` · ${sessionsLeft} Einheit${sessionsLeft === 1 ? '' : 'en'} bis zum Pensum` : ''}
        {week.longDone ? ' · lange Einheit steht' : ''}
      </p>

      {week.openStimuli.length > 0 && (
        <ul className="outlook__gaps">
          {week.openStimuli.map((entry) => (
            <li key={`${entry.sport}-${entry.stimulus}`}>
              <span>
                {STIMULUS_LABELS[entry.stimulus] ?? entry.stimulus} ·{' '}
                {SPORT_LABELS[entry.sport] ?? entry.sport}
              </span>
              <span className="readout">
                {entry.daysAgo >= 99 ? 'bisher nicht' : `seit ${entry.daysAgo} Tagen`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
