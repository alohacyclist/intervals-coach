import type { DayProposal, PlannedDay } from './types.ts'

/** Progression looks back this far; older proposals can no longer matter. */
export const MAX_PROPOSAL_DAYS = 120

const sameIds = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && left.every((id, index) => id === right[index])

/**
 * Adds what the day offers to what it has offered before. Every option ever
 * shown counts, because a wish for a harder or easier day changes the options
 * and the athlete may train either. The recommendation follows the latest plan
 * until training starts, then stays what it was.
 */
export const withProposal = (
  proposals: readonly DayProposal[],
  day: PlannedDay,
): readonly DayProposal[] => {
  const existing = proposals.find((entry) => entry.date === day.date)
  const offered = day.options.map((option) => option.template.id)
  const templateIds = [...new Set([...(existing?.templateIds ?? []), ...offered])]
  const latest = day.options.find((option) => option.sport === day.recommended)?.template.id ?? null
  const recommended = existing && day.completed.length > 0 ? existing.recommended : latest

  if (
    existing &&
    existing.recommended === recommended &&
    sameIds(existing.templateIds, templateIds)
  ) {
    return proposals
  }
  return [
    ...proposals.filter((entry) => entry.date !== day.date),
    { date: day.date, recommended, templateIds },
  ]
    .sort((left, right) => left.date.localeCompare(right.date))
    .slice(-MAX_PROPOSAL_DAYS)
}
