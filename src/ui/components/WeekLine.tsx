import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import type { AdherenceDay, PlannedDay } from '../../coach/types.ts'
import { isoWeek } from '../../coach/dates.ts'
import type { LineRow } from '../week-line.ts'
import { pastRows, planRow } from '../week-line.ts'
import { SportIcon } from './SportIcon.tsx'

type Props = {
  readonly history: readonly AdherenceDay[]
  readonly days: readonly PlannedDay[]
  readonly selected: string
  readonly onSelect: (date: string) => void
  readonly panel: (day: PlannedDay, index: number) => ReactNode
}

const RowBody = ({ row, nextWeek }: { readonly row: LineRow; readonly nextWeek: number | null }) => (
  <>
    <span className="line__day">{row.day}</span>
    <span className="line__rail">
      {row.mark === 'rest' ? (
        <i className="line__stop" />
      ) : (
        <i className={`mark mark--${row.mark}`}>
          {row.sport ? <SportIcon sport={row.sport} /> : row.mark === 'missed' ? '✕' : '✓'}
        </i>
      )}
    </span>
    <span className={row.mark === 'rest' ? 'line__title line__title--rest' : 'line__title'}>
      {row.title}
      {nextWeek !== null && `, KW ${nextWeek}`}
    </span>
    <span className="line__side">
      {row.load !== null && <b>{row.load}</b>} {row.note}
    </span>
  </>
)

/**
 * The week as a line of stops. Every planned day stays mounted, hidden until it is chosen,
 * so a chosen duration or a sent workout is still there on the way back.
 */
export const WeekLine = ({ history, days, selected, onSelect, panel }: Props) => {
  const today = days[0]?.date ?? ''
  const panelRef = useRef<HTMLDivElement | null>(null)
  const focused = useRef(selected)

  // The tapped row is replaced by its panel, so focus has to move along or it is lost.
  useEffect(() => {
    if (focused.current === selected) return
    focused.current = selected
    panelRef.current?.focus()
  }, [selected])

  return (
    <ol className="line">
      {pastRows(history, today).map((row) => (
        <li key={row.date} className="line__row">
          <RowBody row={row} nextWeek={null} />
        </li>
      ))}
      {days.map((day, index) => {
        const open = day.date === selected
        const week = isoWeek(day.date)
        return (
          <li key={day.date} className={index === 0 ? 'line__stop-item' : 'line__stop-item line__stop-item--future'}>
            <button type="button" className="line__row" hidden={open} onClick={() => onSelect(day.date)}>
              <RowBody row={planRow(day)} nextWeek={week !== isoWeek(today) ? week : null} />
            </button>
            <div ref={open ? panelRef : null} tabIndex={-1} hidden={!open} className="line__panel">
              {panel(day, index)}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
