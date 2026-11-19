import type { ExecutedStep, Execution, SportThreshold, WorkoutTemplate } from './types.ts'
import { SPORT_DONE } from './types.ts'
import { heldEveryInterval } from './execution.ts'
import { workReading } from './efficiency.ts'
import { LIBRARY, intensityClass } from './library.ts'
import { EXECUTION_DRIFT_POINTS } from './threshold-drift.ts'
import { formatSeconds } from './dates.ts'
import { t } from './lang.ts'

/**
 * What a finished session means, in a few sentences under it: whether the
 * intervals held and what that unlocks, whether easy stayed easy, whether a long
 * one held together, and what a shortened one costs. Each sentence rests on a
 * number the card already shows, or on a rule the plan really follows — nothing
 * here promises a reaction the plan does not have.
 */

export type SessionInput = {
  readonly execution: Execution
  readonly template: WorkoutTemplate
  readonly threshold: SportThreshold
  readonly maxHr: number | null
  /** Sent shorter than the template: the levels judge only the full session. */
  readonly shortened: boolean
}

/**
 * Where easy ends, in percent of threshold: the top of zone 2. Pace in percent is
 * not power in percent — an easy run at 80 % would be tempo on the bike.
 */
const EASY_CEILING = { power: 76, pace: 86 } as const
/** Less than this above easy is a hill or a bridge, not a session run too hard. */
const TOO_HARD_MIN_SECONDS = 10 * 60
const TOO_HARD_MIN_SHARE = 0.15
/** A heart rate this close to the maximum before an interval broke says why it broke. */
const HIGH_HEART_SHARE = 0.92
/** From this long on, an aerobic session says whether heart rate and work stayed together. */
const DECOUPLING_FROM_SECONDS = 60 * 60
/** The warm-up drifts on its own and is left out. */
const DECOUPLING_SKIP_SECONDS = 10 * 60
/** Above this the base does not yet carry the duration — the usual rule of thumb. */
const DECOUPLING_LIMIT = 5
/** Below this share of the session moving with heart rate, two halves compare nothing. */
const DECOUPLING_MIN_COVER = 0.75
/** Below this the recording is a stop or a coast, not work. */
const MOVING_PERCENT = 40
/** Under this share of the planned time the session was a shorter one. */
const SHORT_SHARE = 0.8

const listOf = (indexes: readonly number[]): string =>
  indexes.length <= 1
    ? String(indexes[0] ?? '')
    : `${indexes.slice(0, -1).join(', ')}${t(' und ')}${indexes[indexes.length - 1]}`

const oneDecimal = (value: number): string => (Math.round(value * 10) / 10).toFixed(1)

/** The next rung of the session's family, or null at the top or outside any family. */
const nextLevel = (template: WorkoutTemplate): WorkoutTemplate | null =>
  template.family === undefined
    ? null
    : (LIBRARY.filter(
        (candidate) => candidate.family === template.family && (candidate.level ?? 1) > (template.level ?? 1),
      ).sort((left, right) => (left.level ?? 1) - (right.level ?? 1))[0] ?? null)

/** An interval session: where it broke and why, or what holding it unlocks. */
const intervals = ({ execution, template, maxHr, shortened }: SessionInput): readonly string[] => {
  if (template.measures === 'threshold') return []
  const held = heldEveryInterval(execution)
  if (held === null) return []
  const { steps } = execution
  const reading = workReading(execution)
  const deviation = reading?.deviation ?? 0

  if (!held) {
    const missing = steps.filter((step) => step.actualSeconds === null)
    const cut = steps.filter((step) => step.actualSeconds !== null && step.cutShort)
    const under = steps.filter((step) => step.actualSeconds !== null && !step.cutShort && step.verdict === 'under')
    const lines: string[] = []
    const [onlyCut] = cut
    if (cut.length === 1 && onlyCut) {
      lines.push(
        t`Intervall ${onlyCut.index} nach ${formatSeconds(onlyCut.actualSeconds ?? 0)} von ${formatSeconds(onlyCut.plannedSeconds)} min beendet.`,
      )
    } else if (cut.length > 1) {
      lines.push(t`Intervall ${listOf(cut.map((step) => step.index))} vorzeitig beendet.`)
    }
    if (missing.length > 0) {
      lines.push(t`Intervall ${listOf(missing.map((step) => step.index))} nicht ${SPORT_DONE[execution.sport]}.`)
    }
    if (under.length > 0) lines.push(t`Intervall ${listOf(under.map((step) => step.index))} unter dem Korridor.`)

    // The heart rate before the first interval that broke, when it was already near the top.
    const broke = Math.min(...[...missing, ...cut, ...under].map((step) => step.index))
    const strained =
      maxHr !== null && maxHr > 0
        ? steps.find(
            (step: ExecutedStep) =>
              step.index < broke && step.heartRate !== null && step.heartRate >= maxHr * HIGH_HEART_SHARE,
          )
        : undefined
    if (strained && strained.heartRate !== null && maxHr !== null) {
      lines.push(
        t`Der Puls lag schon in Intervall ${strained.index} bei ${Math.round((strained.heartRate / maxHr) * 100)} % deiner HFmax.`,
      )
    }
    if (template.family !== undefined) {
      lines.push(t('Die Stufe bleibt: aufgestiegen wird erst, wenn alle Intervalle halten.'))
    }
    if (deviation <= -EXECUTION_DRIFT_POINTS) {
      lines.push(
        t('Liegt auch die nächste Intervalleinheit so weit darunter, schlägt der Plan vor, deine Schwelle mit der Standortbestimmung zu prüfen.'),
      )
    }
    return [lines.join(' ')]
  }

  const over = steps.filter((step) => step.verdict === 'over')
  const lines: string[] = []
  if (deviation >= EXECUTION_DRIFT_POINTS) {
    lines.push(
      t`Die Intervalle lagen im Schnitt ${oneDecimal(deviation)} Punkte über dem Korridor. Liegt auch die nächste Intervalleinheit so weit darüber, schlägt der Plan dir eine höhere Schwelle vor.`,
    )
  } else if (over.length > 0) {
    lines.push(t`Intervall ${listOf(over.map((step) => step.index))} etwas über dem Korridor, das passt.`)
  } else {
    lines.push(t('Alle Intervalle im Korridor.'))
  }
  const next = nextLevel(template)
  if (shortened) {
    lines.push(t('Für die nächste Stufe zählt nur die volle Fassung der Einheit.'))
  } else if (next) {
    lines.push(t`Als Nächstes in dieser Reihe: ${next.name}.`)
  } else if (template.family !== undefined) {
    lines.push(t('Das ist die höchste Stufe dieser Reihe.'))
  }
  return [lines.join(' ')]
}

/** Every planned stretch below the top of easy: a session meant to be aerobic throughout. */
const aerobic = ({ execution, threshold }: SessionInput): number | null => {
  if (threshold.metric === 'swimPace') return null
  const ceiling = EASY_CEILING[threshold.metric]
  return execution.segments.every((segment) => segment.percent < ceiling) ? ceiling : null
}

/** An easy session: did it stay easy. */
const easy = (input: SessionInput): readonly string[] => {
  const { execution, template, threshold } = input
  const trace = execution.trace
  const ceiling = aerobic(input)
  if (intensityClass(template.stimulus) !== 'easy' || !trace || ceiling === null) return []
  const above = trace.points.filter((point) => point.percent !== null && point.percent >= ceiling).length * trace.step
  const minutes = Math.round(above / 60)
  if (above < TOO_HARD_MIN_SECONDS || above < execution.duration.actual * TOO_HARD_MIN_SHARE) {
    return [t('Locker geblieben, wie geplant.')]
  }
  if (threshold.metric === 'power') {
    const watts = `${Math.round((threshold.ftp * ceiling) / 100)} W`
    return [
      t`Locker geplant, aber ${minutes} min über ${watts}. Das kostet Erholung für die nächste harte Einheit; nächstes Mal unter ${watts} bleiben.`,
    ]
  }
  if (threshold.metric === 'pace') {
    const pace = `${formatSeconds(threshold.thresholdSecPerKm / (ceiling / 100))}/km`
    return [
      t`Locker geplant, aber ${minutes} min schneller als ${pace}. Das kostet Erholung für die nächste harte Einheit; nächstes Mal langsamer als ${pace} bleiben.`,
    ]
  }
  return []
}

/**
 * Pace or power per beat in the second half against the first: when the heart
 * has to work harder for the same output late on, the base does not carry the
 * duration yet. Only for sessions meant to be aerobic all the way.
 */
export const decouplingOf = (execution: Execution): number | null => {
  const trace = execution.trace
  if (!trace || execution.heart || execution.duration.actual < DECOUPLING_FROM_SECONDS) return null
  if (trace.points.some((point) => point.heartEstimated)) return null
  const after = trace.points.filter((point) => point.seconds >= DECOUPLING_SKIP_SECONDS)
  const usable = after.filter(
    (point) =>
      point.value !== null &&
      point.value > 0 &&
      point.heartRate !== null &&
      point.heartRate > 0 &&
      point.percent !== null &&
      point.percent >= MOVING_PERCENT,
  )
  if (after.length === 0 || usable.length < after.length * DECOUPLING_MIN_COVER) return null
  const middle = (usable[0]!.seconds + usable[usable.length - 1]!.seconds) / 2
  const efficiency = (points: typeof usable): number | null => {
    if (points.length === 0) return null
    const work = points.reduce((sum, point) => sum + point.value!, 0)
    const beats = points.reduce((sum, point) => sum + point.heartRate!, 0)
    return beats > 0 ? work / beats : null
  }
  const first = efficiency(usable.filter((point) => point.seconds < middle))
  const second = efficiency(usable.filter((point) => point.seconds >= middle))
  if (first === null || second === null || first <= 0) return null
  return ((first - second) / first) * 100
}

const decoupling = (input: SessionInput): readonly string[] => {
  const { execution, template, threshold } = input
  if (template.stimulus !== 'ENDURANCE' && template.stimulus !== 'LONG') return []
  if (aerobic(input) === null) return []
  const value = decouplingOf(execution)
  if (value === null) return []
  const shown = oneDecimal(value)
  const power = threshold.metric === 'power'
  if (value > DECOUPLING_LIMIT) {
    return [
      power
        ? t`Entkopplung ${shown} %: In der zweiten Hälfte kostete dieselbe Leistung mehr Puls. Über 5 % trägt die Grundlage diese Dauer noch nicht ganz; bleib bei dieser Länge, bis es darunter liegt.`
        : t`Entkopplung ${shown} %: In der zweiten Hälfte kostete dasselbe Tempo mehr Puls. Über 5 % trägt die Grundlage diese Dauer noch nicht ganz; bleib bei dieser Länge, bis es darunter liegt.`,
    ]
  }
  return [
    power
      ? t`Entkopplung ${shown} %: Puls und Leistung blieben beieinander. Die Grundlage trägt diese Dauer.`
      : t`Entkopplung ${shown} %: Puls und Tempo blieben beieinander. Die Grundlage trägt diese Dauer.`,
  ]
}

/** A session cut well short: what was done, and that the plan does not chase the rest. */
const shorter = ({ execution }: SessionInput): readonly string[] => {
  const { duration, load } = execution
  if (duration.planned <= 0 || duration.actual >= duration.planned * SHORT_SHARE) return []
  const minutes = Math.round(duration.actual / 60)
  const planned = Math.round(duration.planned / 60)
  const done =
    load.planned > 0 && load.actual > 0
      ? t`${minutes} statt ${planned} min, ${load.actual} statt ${load.planned} TSS.`
      : t`${minutes} statt ${planned} min.`
  return [`${done} ${t('Die fehlende Zeit holt der Plan nicht nach; ab morgen rechnet er mit dem, was du wirklich gemacht hast.')}`]
}

/** The sentences under a finished session, most telling first; empty when there is nothing worth saying. */
export const sessionFeedback = (input: SessionInput): readonly string[] => [
  ...intervals(input),
  ...easy(input),
  ...decoupling(input),
  ...shorter(input),
]
