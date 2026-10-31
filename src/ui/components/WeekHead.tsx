import type { WeekOutlook } from '../../coach/types.ts'
import { isoWeek } from '../../coach/dates.ts'
import { PHASE_LABELS } from '../../coach/phase.ts'

const ticks = (done: number, total: number): readonly boolean[] =>
  Array.from({ length: Math.max(done, total) }, (_unused, index) => index < done)

const Meter = ({ done, total, caption }: { readonly done: number; readonly total: number; readonly caption: string }) => (
  <div>
    <div className="meter" aria-hidden="true">
      {ticks(done, total).map((filled, index) => (
        <i key={index} className={filled ? 'meter__on' : ''} />
      ))}
    </div>
    {caption}
  </div>
)

/** Does this week still add up: answered without claiming which day anything lands on. */
export const WeekHead = ({ week, today }: { readonly week: WeekOutlook; readonly today: string }) => (
  <>
    <h1 className="week-title">
      KW {isoWeek(today)}, {PHASE_LABELS[week.phase]}
      {week.recoveryWeek && week.phase !== 'RECOVERY' ? ', reduziert' : ''}{' '}
      <span>{week.daysLeft === 1 ? 'noch heute' : `noch ${week.daysLeft} Tage`}</span>
    </h1>
    <div className="meters">
      <Meter
        done={week.quality.done}
        total={week.quality.budget}
        caption={`${week.quality.done} von ${week.quality.budget} harten Einheiten`}
      />
      <Meter
        done={week.sessions.done}
        total={week.sessions.planned}
        caption={`${week.sessions.done} von ${week.sessions.planned} Einheiten${
          week.sessions.max > week.sessions.planned ? `, bis ${week.sessions.max}` : ''
        }`}
      />
    </div>
  </>
)
