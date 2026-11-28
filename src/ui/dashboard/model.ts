import type { BlockReading, DashboardRide, DashboardSummary, SteadyAnalysis, SteadyStatus } from '../../coach/dashboard.ts'
import type { EfficiencyTrend } from '../../coach/dashboard-trend.ts'
import { TREND_MIN_RIDES, TREND_WEEKS } from '../../coach/dashboard-trend.ts'
import type { SteadyBlock, SteadyFinding, SteadyRule, SteadyThresholds } from '../../coach/steady-block.ts'
import { weekdayLabel } from '../../coach/dates.ts'
import { lang, locale, perLang, t } from '../../coach/lang.ts'

/** Decimals in the athlete's locale with a fixed number of digits: 1,45 or 1.45. */
export const num = (value: number, digits = 0): string =>
  value.toLocaleString(locale(), { minimumFractionDigits: digits, maximumFractionDigits: digits })

/** A signed share as percent: +5,5 %. */
export const pct = (share: number): string => `${share >= 0 ? '+' : '−'}${num(Math.abs(share) * 100, 1)} %`

/** "12.11." or "12/11" from an ISO day. */
export const dayMonth = (date: string): string => {
  const [day, month] = [date.slice(8, 10), date.slice(5, 7)]
  return lang() === 'en' ? `${day}/${month}` : `${day}.${month}.`
}

/** "Do 12.11." or "Thu 12/11" from an ISO day. */
export const shortDate = (date: string): string => `${weekdayLabel(date)} ${dayMonth(date)}`

export const clock = (minute: number): string =>
  `${String(Math.floor(minute / 60)).padStart(1, '0')}:${String(minute % 60).padStart(2, '0')}`

export const RULE_NAMES: Readonly<Record<SteadyRule, string>> = perLang(() => ({
  hrDrift: t('Puls-Drift'),
  elevatedHr: t('Puls über Basis'),
}))

export const where = (indoor: boolean): string => (indoor ? t('Indoor') : t('Draußen'))

/** HR per watt of the second block half against the first. */
export const driftOf = (block: SteadyBlock): number => block.secondHalfHrPerW / block.firstHalfHrPerW - 1

/** What a ride's status reads as in the table; a finding outranks every status. */
export const statusLabel = (status: SteadyStatus | undefined, warned: boolean): string => {
  if (warned) return t('Warnung')
  switch (status) {
    case 'checked':
      return t('Ruhig')
    case 'noBaseline':
      return t('Ohne Basis')
    case 'noBlock':
      return t('Kein Block')
    case 'pending':
      return t('Lädt')
    case 'unreadable':
      return t('Nicht lesbar')
    default:
      return t('Ausgelassen')
  }
}

export type Tone = 'warn' | 'calm' | 'muted'

/** A finding outranks every status; only a fully checked ride reads as calm. */
export const toneOf = (status: SteadyStatus | undefined, warned: boolean): Tone =>
  warned ? 'warn' : status === 'checked' ? 'calm' : 'muted'

export type FindingItem = {
  readonly rideId: string
  readonly code: string
  readonly date: string
  readonly title: string
  readonly line: string
  readonly tone: Tone
}

const findingTitle = (findings: readonly SteadyFinding[]): string =>
  findings.map((f) => (f.rule === 'hrDrift' ? t('Puls stieg im Block') : t('Puls über deiner Basis'))).join(' · ')

const findingLine = (f: SteadyFinding): string =>
  f.rule === 'hrDrift'
    ? t`${pct(f.deviation)} zweite Blockhälfte`
    : t`${pct(f.deviation)} über ${f.referenceRides} vergleichbare Fahrten`

/** The findings of one ride, grouped: a ride may trip both rules at once. */
export const byRide = (findings: readonly SteadyFinding[]): ReadonlyMap<string, readonly SteadyFinding[]> =>
  findings.reduce(
    (map, f) => new Map([...map, [f.activityId, [...(map.get(f.activityId) ?? []), f]]]),
    new Map<string, readonly SteadyFinding[]>(),
  )

const SHOWN_DISMISSED = 2

/**
 * The list on the right: every ride with a finding, then the newest rides the
 * rules skipped for want of a steady block, so the athlete sees why an interval
 * day stays quiet. Without findings the newest calm ride stands in.
 */
export const findingItems = (summary: DashboardSummary, analysis: SteadyAnalysis): readonly FindingItem[] => {
  const rideOf = new Map(summary.rides.map((r) => [r.id, r]))
  const warned = [...byRide(analysis.findings).entries()].flatMap(([rideId, findings], i): FindingItem[] => {
    const ride = rideOf.get(rideId)
    if (!ride) return []
    return [
      {
        rideId,
        code: t`Warnung ${String(i + 1).padStart(2, '0')} · ${findings.map((f) => RULE_NAMES[f.rule]).join(' + ')}`,
        date: shortDate(ride.date),
        title: findingTitle(findings),
        line: findings.map(findingLine).join(' · '),
        tone: 'warn',
      },
    ]
  })
  const withStatus = (status: SteadyStatus) => summary.rides.filter((r) => analysis.status[r.id] === status)
  const dismissed = withStatus('noBlock')
    .slice(0, SHOWN_DISMISSED)
    .map(
      (ride): FindingItem => ({
        rideId: ride.id,
        code: t('Prüfung · verworfen'),
        date: shortDate(ride.date),
        title: t('Kein ruhiger Block, Regeln greifen nicht'),
        line: ride.variabilityIndex === null ? t('wechselnde Leistung') : t`VI ${num(ride.variabilityIndex, 2)} · wechselnde Leistung`,
        tone: 'muted',
      }),
    )
  const calmRide = summary.rides.find((r) => analysis.status[r.id] === 'checked' || analysis.status[r.id] === 'noBaseline')
  const calm: FindingItem[] =
    warned.length > 0 || !calmRide
      ? []
      : [
          {
            rideId: calmRide.id,
            code: t('Prüfung · ruhig'),
            date: shortDate(calmRide.date),
            title: t('Puls pro Watt stabil'),
            line: analysis.status[calmRide.id] === 'checked' ? t('beide Regeln geprüft, kein Treffer') : t('Drift geprüft, Basis fehlt noch'),
            tone: 'calm',
          },
        ]
  return [...warned, ...calm, ...dismissed]
}

/** One plain sentence on why the selected ride got its verdict. */
export const verdictSentence = (
  status: SteadyStatus | undefined,
  findings: readonly SteadyFinding[],
  block: SteadyBlock | null,
  th: SteadyThresholds,
): string => {
  const drift = findings.find((f) => f.rule === 'hrDrift')
  const elevated = findings.find((f) => f.rule === 'elevatedHr')
  if (drift && elevated)
    return t`Doppelt auffällig: Der Puls pro Watt lag schon zu Beginn ${pct(elevated.deviation)} über deiner Basis und stieg im Block weiter um ${pct(drift.deviation)}.`
  if (drift)
    return t`Bei gleicher Leistung stieg der Puls pro Watt in der zweiten Blockhälfte um ${pct(drift.deviation)}, das Aufwärmen ist ausgelassen. Die Linie bei ${num(th.hrDrift * 100)} % ist eine Konvention aus der Trainingspraxis, kein geprüfter Grenzwert.`
  if (elevated)
    return t`Schon die erste Blockhälfte lag ${pct(elevated.deviation)} über dem Mittel von ${elevated.referenceRides} vergleichbaren Fahrten der letzten ${th.baselineDays} Tage (gleiche Umgebung, Leistung ±${num(th.comparablePowerBand * 100)} %). Das spricht für einen anderen Tag, nicht für eine ermüdende Fahrt.`
  switch (status) {
    case 'checked':
      return t`Beide Regeln geprüft, kein Treffer: Drift ${block ? pct(driftOf(block)) : '–'}, und der Puls pro Watt liegt im Rahmen deiner vergleichbaren Fahrten.`
    case 'noBaseline':
      return t`Drift geprüft: ${block ? pct(driftOf(block)) : '–'}. Für den Vergleich mit früheren Fahrten fehlen noch ${th.baselineMinRides} vergleichbare Fahrten in derselben Umgebung.`
    case 'noBlock':
      return t`Nach dem Aufwärmen gibt es keine ${num(th.minDurationS / 60)} Minuten mit gleichmäßiger Leistung. Bei wechselnder Last schwankt der Puls pro Watt mit der Last, nicht mit dem Körper: keine Aussage.`
    case 'unreadable':
      return t('Die Messreihe dieser Fahrt ließ sich nicht lesen. Die Regeln haben sie ausgelassen.')
    case 'pending':
      return t('Die Messreihe wird noch gelesen.')
    default:
      return t`Kürzer als ${num((th.warmupS + th.minDurationS) / 60)} Minuten oder ohne Leistung und Puls: zu wenig für einen ruhigen Block.`
  }
}

export type RideRow = {
  readonly ride: DashboardRide
  readonly date: string
  readonly where: string
  readonly np: string
  readonly vi: string
  readonly ef: string
  readonly steady: string
  readonly status: string
  readonly tone: Tone
}

/** The ride table: block length and drift come from the blocks read so far. */
export const rideRows = (
  summary: DashboardSummary,
  analysis: SteadyAnalysis,
  readings: ReadonlyMap<string, BlockReading>,
): readonly RideRow[] => {
  const warned = new Set(analysis.findings.map((f) => f.activityId))
  return summary.rides.map((ride) => {
    const block = readings.get(ride.id)?.block ?? null
    const isWarned = warned.has(ride.id)
    const status = analysis.status[ride.id]
    return {
      ride,
      date: shortDate(ride.date),
      where: where(ride.indoor),
      np: ride.normalizedWatts === null ? '–' : num(ride.normalizedWatts),
      vi: ride.variabilityIndex === null ? '–' : num(ride.variabilityIndex, 2),
      ef: ride.efficiencyFactor === null ? '–' : num(ride.efficiencyFactor, 2),
      steady: block ? `${num(block.durationS / 60)} min · ${pct(driftOf(block))}` : '–',
      status: statusLabel(status, isWarned),
      tone: toneOf(status, isWarned),
    }
  })
}

const COVERAGE_TEXT: Readonly<Record<SteadyStatus, string>> = perLang(() => ({
  checked: t('voll geprüft'),
  noBaseline: t('ohne Basis'),
  noBlock: t('ohne Block'),
  skipped: t('zu kurz'),
  pending: t('lädt'),
  unreadable: t('nicht lesbar'),
}))

export const COVERAGE_ORDER: readonly SteadyStatus[] = ['checked', 'noBaseline', 'noBlock', 'skipped', 'pending', 'unreadable']

/** "12 voll geprüft · 4 ohne Block": only the statuses that occur. */
export const coverageLine = (coverage: Readonly<Record<SteadyStatus, number>>): string =>
  COVERAGE_ORDER.filter((s) => coverage[s] > 0)
    .map((s) => `${coverage[s]} ${COVERAGE_TEXT[s]}`)
    .join(' · ')

export const coverageLabel = (status: SteadyStatus): string => COVERAGE_TEXT[status]

export const disclaimer = (): string =>
  t('Hinweis, keine Diagnose. Hitze, Trinken, Schlaf und Koffein misst niemand. Indoor und draußen werden nie miteinander verglichen.')

/** Per shown week: does a ride of that week carry a finding. */
export const warnedWeeks = (summary: DashboardSummary, findings: readonly SteadyFinding[]): readonly boolean[] => {
  const dateOf = new Map(summary.rides.map((r) => [r.id, r.date]))
  const days = findings.flatMap((f) => {
    const date = dateOf.get(f.activityId)
    return date ? [date] : []
  })
  return summary.weeks.map((w, i) => {
    const next = summary.weeks[i + 1]?.weekStart ?? '9999-12-31'
    return days.some((d) => d >= w.weekStart && d < next)
  })
}

/** The cockpit's tiles in reading order; each opens as a focus view. */
export const TILES = ['findings', 'ride', 'load', 'efficiency', 'coverage', 'rides'] as const
export type TileKey = (typeof TILES)[number]

export const tileTitle = (key: TileKey): string => {
  switch (key) {
    case 'findings':
      return t('Befunde')
    case 'ride':
      return t('Fahrtverlauf')
    case 'load':
      return t('Belastung')
    case 'efficiency':
      return t('Effizienz')
    case 'coverage':
      return t('Abdeckung')
    default:
      return t('Fahrten')
  }
}

export const warningsLabel = (count: number): string =>
  count === 0 ? t('Keine Warnung') : count === 1 ? t('1 Warnung') : t`${count} Warnungen`

/** How many shown rides both rules could judge: silence must not read as health. */
export const checkedLabel = (coverage: Readonly<Record<SteadyStatus, number>>): string => {
  const all = COVERAGE_ORDER.reduce((sum, s) => sum + coverage[s], 0)
  return t`${coverage.checked} von ${all} Fahrten voll geprüft`
}

/** What a rule's threshold means; each rule names its own, the drift line must not explain the baseline. */
export const ruleHint = (rule: SteadyRule, thresholds: SteadyThresholds): string =>
  rule === 'hrDrift'
    ? t`Unter ${num(thresholds.hrDrift * 100)} % hält deine Ausdauer diese Dauer bei dieser Leistung. Darüber: an der Grenze, oder Hitze, zu wenig getrunken, Müdigkeit.`
    : t`Bis ${num(thresholds.elevatedHr * 100)} % über deiner Basis ist normale Tagesform. Darüber: Müdigkeit, Hitze, wenig Schlaf oder Stress.`

/** The trend in one sentence, or why there is none yet. */
export const trendSentence = (trend: EfficiencyTrend): string =>
  trend.change === null
    ? t`${where(trend.indoor)}: zu wenig gleichmäßige Fahrten für einen Trend. Nötig sind je ${TREND_MIN_RIDES} in den letzten ${TREND_WEEKS} Wochen und den ${TREND_WEEKS} davor, da sind ${trend.recentRides} und ${trend.earlierRides}.`
    : t`${where(trend.indoor)}: EF der letzten ${TREND_WEEKS} Wochen ${pct(trend.change)} gegenüber den ${TREND_WEEKS} Wochen davor, aus ${trend.recentRides} und ${trend.earlierRides} Fahrten.`

/** One steady block in the drift chart: the drift and what makes two blocks comparable. */
export type DriftPoint = {
  readonly rideId: string
  readonly date: string
  readonly indoor: boolean
  readonly drift: number
  readonly minutes: number
  readonly watts: number
  readonly warned: boolean
}

/** Every shown ride with a steady block read so far, oldest first. */
export const driftPoints = (
  summary: DashboardSummary,
  readings: ReadonlyMap<string, BlockReading>,
  findings: readonly SteadyFinding[],
): readonly DriftPoint[] => {
  const drifted = new Set(findings.filter((f) => f.rule === 'hrDrift').map((f) => f.activityId))
  return summary.rides
    .flatMap((ride): DriftPoint[] => {
      const block = readings.get(ride.id)?.block
      if (!block) return []
      return [
        {
          rideId: ride.id,
          date: ride.date,
          indoor: ride.indoor,
          drift: driftOf(block),
          minutes: Math.round(block.durationS / 60),
          watts: Math.round(block.avgWatts),
          warned: drifted.has(ride.id),
        },
      ]
    })
    .reverse()
}

export const driftPointLabel = (p: DriftPoint): string =>
  t`${shortDate(p.date)} · ${where(p.indoor)} · ${p.minutes} min bei ${p.watts} W · Drift ${pct(p.drift)}`
