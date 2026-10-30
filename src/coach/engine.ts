import type {
  Activity,
  CoachConfig,
  Intent,
  StrengthSuggestion,
  DayType,
  Fitness,
  GoalKind,
  IntensityClass,
  Phase,
  PlannedDay,
  PlannedSession,
  RecentWorkout,
  Sport,
  Stimulus,
  TrainingState,
  WorkoutTemplate,
} from './types.ts'
import { ALL_SPORTS, SPORT_LABELS, STIMULUS_LABELS } from './types.ts'
import { formNote } from './wording.ts'
import { addDays, diffDays, startOfWeek, weekdayDe } from './dates.ts'
import { HARD_ON_LOAD_ALONE, projectFitness } from './fitness.ts'
import { PHASE_LABELS, goalForSport, phaseForSport, primaryGoal, weeklyHardBudget } from './phase.ts'
import { selectedSports } from './thresholds.ts'
import { breakLimit, returnWindow } from './breaks.ts'
import { thresholdTestDue } from './threshold-test.ts'
import { benchmarkDue } from './benchmark.ts'
import { levelCeilings } from './progression.ts'
import { completedFrom, effortsFrom } from './done.ts'
import type { Effort } from './done.ts'
import type { Completion } from './progression.ts'
import { findTemplate, flattenBlocks, intensityClass, isPreferredSport, strengthSession, templatesFor } from './library.ts'
import { buildSession } from './session.ts'
import { aroundRace, raceSession, racesAround, withRace } from './race-day.ts'

/** Minimum days between two hard sessions, regardless of sport. */
const HARD_SPACING_DAYS = 2
/**
 * Minimum days between two hard runs. Heart and metabolism are ready again after
 * 48 hours, which is what the general spacing guards; tendons and bones take the
 * impact of every stride and need longer. A ride costs them next to nothing, so
 * in between the quality goes to the bike and the run stays light.
 */
const RUN_HARD_SPACING_DAYS = 3
/**
 * The smallest load this app itself ever proposes as a hard session. A hard effort
 * below it — fifteen minutes of racing at 30, say — still blocks the next hard day,
 * but it has not earned a whole rest day: the stimulus was real and small. Anything
 * the plan prescribed itself sits at or above this, so its own days are unaffected.
 */
const FULL_HARD_LOAD = 48
const STALE_STIMULUS_DAYS = 28
/** A gap this long means the body has detrained; VO2max is the wrong way back in. */
const LAYOFF_DAYS = 10
/** Beyond this, rest stops being recovery and starts being detraining. */
const MAX_CONSECUTIVE_REST = 2
/** CTL gained per week past which the plan warns, and stops adding length on top. */
const FAST_RAMP = 6
/**
 * How far past the longest session of the last six weeks a day with more time
 * may go. A ride can grow by a quarter; a run carries every stride through
 * tendons and bones and grows by a tenth, as the usual rule for long runs says.
 */
const LONGEST_GROWTH: Readonly<Record<Sport, number>> = { Ride: 1.25, Run: 1.1, Swim: 1 }

type Simulation = {
  readonly fitness: Fitness
  readonly daysSinceHard: Readonly<Record<Sport, number>>
  readonly lastHardLoad: Readonly<Record<Sport, number>>
  readonly hardThisWeek: number
  readonly sessionsThisWeek: number
  readonly hardThisWeekBySport: Readonly<Record<Sport, number>>
  readonly stimulusAge: Readonly<Record<string, number>>
  readonly usedTemplateIds: readonly string[]
  readonly strengthThisWeek: number
  /** One maximal test a week at most — the second would measure the first. */
  readonly testedThisWeek: boolean
  readonly consecutiveRest: number
  readonly weekStart: string
}

const ALLOWED_CLASSES: Readonly<Record<DayType, readonly IntensityClass[]>> = {
  KEY: ['hard'],
  EASY: ['easy', 'moderate'],
  RECOVERY: ['easy'],
  REST: ['easy'],
}

/**
 * What a day may fall back to when everything it would normally offer is the
 * session the athlete has just done. Repeating a workout two days later is worse
 * than dropping one notch in intensity, which is what a coach would say too.
 */
const FALLBACK_CLASSES: Readonly<Record<DayType, readonly IntensityClass[]>> = {
  KEY: ['hard', 'moderate'],
  EASY: ['easy', 'moderate'],
  RECOVERY: ['easy', 'moderate'],
  REST: ['easy'],
}

/** Strength is counted from both sources, whichever knows more about the week. */
const strengthThisWeekFrom = (state: TrainingState, config: CoachConfig): number => {
  const weekStart = startOfWeek(state.today)
  const logged = config.strengthLog.filter((date) => date >= weekStart && date <= state.today).length
  return Math.max(state.strengthSessionsThisWeek, logged)
}

const initSimulation = (state: TrainingState, config: CoachConfig): Simulation => ({
  fitness: state.overall,
  daysSinceHard: state.daysSinceHard,
  lastHardLoad: state.lastHardLoad,
  hardThisWeek: state.hardSessionsThisWeek,
  sessionsThisWeek: state.sessionsThisWeek,
  hardThisWeekBySport: state.hardThisWeekBySport,
  stimulusAge: Object.fromEntries(
    state.recency.map((entry) => [`${entry.sport}:${entry.stimulus}`, entry.daysAgo]),
  ),
  usedTemplateIds: [],
  strengthThisWeek: strengthThisWeekFrom(state, config),
  testedThisWeek: false,
  consecutiveRest: state.consecutiveRestDays,
  weekStart: startOfWeek(state.today),
})

const stimulusAge = (simulation: Simulation, sport: Sport, stimulus: Stimulus): number =>
  simulation.stimulusAge[`${sport}:${stimulus}`] ?? STALE_STIMULUS_DAYS

const minDaysSinceHard = (simulation: Simulation, sports: readonly Sport[]): number =>
  Math.min(...sports.map((sport) => simulation.daysSinceHard[sport]))

/** Whether the legs are still carrying the last hard run, whatever else has recovered. */
const legsRecovering = (simulation: Simulation, sport: Sport): boolean =>
  sport === 'Run' && simulation.daysSinceHard.Run < RUN_HARD_SPACING_DAYS

const legsNote = (simulation: Simulation): string =>
  `Harter Lauf vor ${simulation.daysSinceHard.Run} Tagen — Sehnen und Knochen brauchen 72h, Kreislauf ist bereit`

/** The load of the session that is holding the next hard day back. */
const blockingHardLoad = (simulation: Simulation, sports: readonly Sport[]): number => {
  const spacing = minDaysSinceHard(simulation, sports)
  const loads = sports
    .filter((sport) => simulation.daysSinceHard[sport] === spacing)
    .map((sport) => simulation.lastHardLoad[sport] ?? 0)
  return loads.length === 0 ? 0 : Math.max(...loads)
}

type DayDecision = {
  readonly dayType: DayType
  readonly reason: string
  readonly optional: boolean
  /** An easy day the body asked for: tempo there would contradict the reason given for it. */
  readonly easyOnly?: boolean
}

const plan = (dayType: DayType, reason: string): DayDecision => ({ dayType, reason, optional: false })

const backOff = (reason: string): DayDecision => ({ ...plan('EASY', reason), easyOnly: true })

/** How far the plan is willing to follow the athlete down from what they promised. */
const MAX_FREQUENCY_CONCESSION = 2
/**
 * Below this there is no pattern to learn, only an empty window: a new account, a
 * long layoff, a holiday. Conceding there would meet a returning athlete with a
 * lowered plan, which is the opposite of what a return needs — and the layoff and
 * break rules already own that case.
 */
const MIN_SESSIONS_FOR_A_PATTERN = 4

/**
 * The weekly minimum the plan actually works with. Someone who signed up for five
 * sessions and has managed two and a half for a month is not going to be argued
 * into five by a rest day that keeps getting postponed — planning against a number
 * that never happens only produces a fictitious shortfall every week.
 *
 * The concession is capped, and the ceiling the athlete stated is untouched: on a
 * week that does work out, nothing stands in the way of five.
 */
export const effectiveWeeklyMin = (config: CoachConfig, state: TrainingState): number => {
  const { min } = config.profile.weeklySessions
  const managed = Math.round(state.sessionsPerWeekRecent)
  if (state.sessionsPerWeekRecent * 4 < MIN_SESSIONS_FOR_A_PATTERN) return min
  return Math.max(1, Math.min(min, Math.max(managed, min - MAX_FREQUENCY_CONCESSION)))
}

/** Past what the athlete signed up for, but supported by how they have recovered. */
const beyondPlan = (dayType: DayType, reason: string): DayDecision => ({
  dayType,
  reason: `${reason} Freiwillig, nicht eingeplant.`,
  optional: true,
})

/**
 * Rest days come out of the weekly session budget, not only out of fatigue.
 * An athlete training three times a week rests four days, and the plan has to
 * say so instead of proposing something every single day.
 */
/**
 * The weekly ceiling says how much fits into a week, not that everything past it
 * is forbidden. Applied last, so what the athlete is actually ready for is
 * decided first: once two rest days have passed, the session that breaks the run
 * is whatever the recovery state calls for — often a hard one — offered as a
 * suggestion rather than as plan.
 */
const applyWeeklyCapacity = (
  decision: DayDecision,
  simulation: Simulation,
  state: TrainingState,
  config: CoachConfig,
): DayDecision => {
  const { max } = config.profile.weeklySessions
  if (simulation.sessionsThisWeek < max) return decision
  if (decision.dayType === 'REST') return decision

  if (decision.optional) return decision
  const restedEnough = simulation.consecutiveRest >= MAX_CONSECUTIVE_REST
  if (!restedEnough || state.readiness.score === 'red') {
    return plan(
      'REST',
      `Wochenpensum erfüllt (${Math.min(simulation.sessionsThisWeek, max)} von ${max}) — heute ist Pause eingeplant`,
    )
  }

  return {
    ...decision,
    optional: true,
    reason: `${simulation.consecutiveRest} Ruhetage in Folge, Wochenpensum bereits erfüllt — freiwillig, nicht eingeplant. ${decision.reason}`,
  }
}

const INTENT_TYPE: Readonly<Record<Intent, DayType>> = {
  hard: 'KEY',
  easy: 'EASY',
  rest: 'REST',
}

/**
 * The athlete knows things the model cannot see — how the legs feel, what the
 * week ahead looks like. An explicit wish wins, but the plan says plainly what
 * it would have done and what the wish costs.
 */
const applyIntent = (
  decision: DayDecision,
  intent: Intent | undefined,
  simulation: Simulation,
  sports: readonly Sport[],
  onBreak: boolean,
): DayDecision => {
  if (intent === undefined) return decision
  const wanted = INTENT_TYPE[intent]
  if (wanted === decision.dayType) return decision

  // Overriding a declared break from the day view would defeat its purpose. The
  // athlete entered it and can end it; that is the deliberate way back.
  if (onBreak && intent === 'hard') {
    return {
      ...decision,
      reason: `${decision.reason} Solange die Pause eingetragen ist, gibt es keine harte Einheit — beende sie oben, wenn du wieder fit bist.`,
    }
  }

  const spacing = minDaysSinceHard(simulation, sports)
  const warning =
    intent !== 'hard'
      ? ''
      : spacing < HARD_SPACING_DAYS
        ? ` Achtung: erst ${spacing === 0 ? 'heute' : `vor ${spacing} Tag${spacing === 1 ? '' : 'en'}`} eine harte Einheit — zwei harte Tage hintereinander kosten mehr, als sie bringen.`
        : sports.every((sport) => legsRecovering(simulation, sport))
          ? ` Achtung: ${legsNote(simulation)}.`
          : ''

  return {
    dayType: wanted,
    optional: true,
    reason: `Von dir gewählt: ${intent === 'hard' ? 'harte Einheit' : intent === 'easy' ? 'lockere Einheit' : 'Pause'}. Der Plan hätte vorgesehen: ${decision.reason}${warning}`,
  }
}

/** Days left in the Monday-based week, including the given day. */
const daysLeftInWeek = (date: string): number => 7 - diffDays(startOfWeek(date), date)

const decideDay = (
  simulation: Simulation,
  state: TrainingState,
  config: CoachConfig,
  budget: number,
  dayIndex: number,
  date: string,
  sports: readonly Sport[],
): DayDecision => {
  const { max } = config.profile.weeklySessions
  const min = effectiveWeeklyMin(config, state)
  const readinessRed = state.readiness.score === 'red'
  const planned = simulation.sessionsThisWeek

  // A break the athlete declared beats every measurement, because it knows
  // something no measurement does yet.
  const limit = breakLimit(config.breaks, date)
  if (limit) {
    return { dayType: limit.dayType, reason: limit.reason, optional: limit.dayType !== 'REST', easyOnly: true }
  }

  if (readinessRed && dayIndex === 0) {
    return simulation.fitness.tsb < -25
      ? plan('REST', 'Erholungssignale und tiefe Form — heute gar nichts')
      : plan('RECOVERY', 'Erholungssignale sprechen gegen Belastung')
  }
  if (simulation.fitness.tsb < -30) {
    return plan('RECOVERY', 'Form deutlich im Minus — nur Regeneration')
  }
  if (minDaysSinceHard(simulation, sports) < HARD_SPACING_DAYS) {
    const blocking = blockingHardLoad(simulation, sports)
    // A small hard effort still rules out a second hard day, but a rest day would
    // cost more than the effort did.
    if (blocking > 0 && blocking < FULL_HARD_LOAD) {
      return plan(
        'EASY',
        `Die letzte harte Einheit war kurz (Load ${blocking}) — locker statt Pause`,
      )
    }
    // A hard day is followed by rest. The weekly minimum is reached by spreading
    // the remaining sessions over the remaining days, never by stacking one onto
    // a recovery day — unless the week has run out of room to space them out.
    const needed = min - planned
    const room = daysLeftInWeek(date)
    if (needed < room) {
      return plan(
        'REST',
        planned >= min
          ? 'Mindestpensum erfüllt und keine 48h seit der letzten harten Einheit'
          : `Pause nach harter Einheit — für die fehlende${needed === 1 ? '' : 'n'} ${needed} Einheit${needed === 1 ? '' : 'en'} bleiben noch ${room - 1} Tage`,
      )
    }
    return plan('EASY', 'Keine 48h seit der letzten harten Einheit, aber die Woche läuft aus — locker statt Pause')
  }
  // Only a runner gets here: anyone with a second sport takes the quality day there.
  if (sports.every((sport) => legsRecovering(simulation, sport))) {
    return plan('EASY', `${legsNote(simulation)} — heute locker`)
  }
  if (simulation.hardThisWeek >= budget) {
    const spent = `Wochenbudget harter Einheiten erreicht (${simulation.hardThisWeek}/${budget})`
    // The budget is a weekly count and knows nothing about recovery. Once the
    // athlete has plainly recovered, another quality session is defensible and
    // should be offered rather than waited out until the calendar rolls over.
    const restedOut =
      simulation.consecutiveRest >= MAX_CONSECUTIVE_REST ||
      minDaysSinceHard(simulation, sports) >= 4
    const fresh = simulation.fitness.tsb > -12 && !readinessRed
    return restedOut && fresh
      ? beyondPlan(
          'KEY',
          `${spent}, aber nach ${simulation.consecutiveRest} Ruhetagen und mit Form ${simulation.fitness.tsb} ist eine weitere Qualitätseinheit vertretbar.`,
        )
      : plan('EASY', spent)
  }
  if (simulation.fitness.tsb < -18) return backOff('Hohe Ermüdung — locker halten')
  if (readinessRed || (state.readiness.score === 'amber' && dayIndex === 0)) {
    return backOff('Erholungswerte unter deiner Baseline')
  }
  return plan('KEY', 'Erholt und im Wochenbudget — heute darf es wehtun')
}

/** Words worth comparing: real terms and rep patterns, not units or filler. */
const SIGNIFICANT = /[a-zäöüß]{4,}|\d+x\d+/g

const signature = (name: string): readonly string[] => name.toLowerCase().match(SIGNIFICANT) ?? []

/**
 * A session done outside the app carries the device's own name: "Cologne —
 * Schwelle kompakt 3x1@3:50/km" is what this library calls "Schwelle kompakt
 * 3x1km". A substring test misses that and offers the same workout two days
 * later, so two shared terms count as a repeat — one common word like
 * "Schwelle" does not, or every threshold session would block the next.
 */
const looksLikeRepeat = (
  template: WorkoutTemplate,
  recent: readonly RecentWorkout[],
): boolean => {
  const wanted = signature(template.name)
  return recent
    // Only within one sport: "Schwelle kompakt" means a different session on a
    // bike than in running shoes, and the words alone cannot tell them apart.
    .filter((workout) => workout.sport === template.sport)
    .some((workout) => {
      const seen = new Set(signature(workout.name))
      return wanted.filter((term) => seen.has(term)).length >= 2
    })
}

/** How well a stimulus serves the current phase — keeps the block focused. */
const phaseAffinity = (phase: Phase, stimulus: Stimulus): number => {
  const affinities: Readonly<Record<Phase, Partial<Record<Stimulus, number>>>> = {
    BASE: { SWEETSPOT: 1.5, TEMPO: 1.2, THRESHOLD: 1, LONG: 1.2, NEURO: 0.8, ENDURANCE: 0.8 },
    BUILD: { VO2: 1.5, THRESHOLD: 1.3, SWEETSPOT: 0.8, LONG: 0.8 },
    SPECIFIC: { THRESHOLD: 1.5, VO2: 1.2, TEMPO: 0.8, LONG: 0.6 },
    TAPER: { VO2: 1, THRESHOLD: 0.8, NEURO: 0.8, RECOVERY: 1 },
    RECOVERY: { RECOVERY: 1.5, ENDURANCE: 1.2, NEURO: 0.6 },
  }
  return affinities[phase][stimulus] ?? 0
}

const scoreTemplate = (
  template: WorkoutTemplate,
  simulation: Simulation,
  state: TrainingState,
  phase: Phase,
  budgetMinutes: number,
  returning: boolean,
  goalKind: GoalKind | undefined,
): number => {
  const dueness = Math.min(stimulusAge(simulation, template.sport, template.stimulus), STALE_STIMULUS_DAYS) / STALE_STIMULUS_DAYS
  const fit = template.minutes <= budgetMinutes ? 1 : -5
  const usesBudget = template.minutes / budgetMinutes
  // The sport that normally carries this stimulus gets the nod, all else equal.
  const roleBonus = isPreferredSport(template.stimulus, template.sport) ? 1 : 0
  // Coming back, the first hard session is threshold, not VO2max — whether the
  // gap was measured or declared.
  const layoffPenalty =
    (state.daysSinceAnySession >= LAYOFF_DAYS || returning) && template.stimulus === 'VO2' ? -4 : 0
  const alreadyOffered = simulation.usedTemplateIds.includes(template.id) ? -2.5 : 0
  // Doing the same workout again days later is a different matter from seeing it
  // twice in the three day view, and needs to lose against anything else on offer.
  const alreadyDone = looksLikeRepeat(template, state.recentWorkouts) ? -5 : 0
  // Written for this athlete's kind of goal — decisive in the specific phase,
  // a nudge while the block is still general.
  const goalBonus =
    template.goalKind !== undefined && template.goalKind === goalKind
      ? phase === 'SPECIFIC'
        ? 1.5
        : 0.7
      : 0
  return (
    3 * dueness +
    phaseAffinity(phase, template.stimulus) +
    goalBonus +
    roleBonus +
    layoffPenalty +
    fit +
    0.5 * usesBudget +
    alreadyOffered +
    alreadyDone
  )
}

/** A level is a ceiling, not an exact match, so the short version stays available. */
const withinLevel = (
  template: WorkoutTemplate,
  ceilings: Readonly<Record<string, number>>,
): boolean =>
  template.family === undefined || (template.level ?? 1) <= (ceilings[template.family] ?? 1)

const candidatesFor = (
  sport: Sport,
  dayType: DayType,
  phase: Phase,
  budgetMinutes: number,
  ceilings: Readonly<Record<string, number>>,
  recent: readonly RecentWorkout[],
  goalKind: GoalKind | undefined,
  easyOnly: boolean,
): readonly WorkoutTemplate[] => {
  const available = templatesFor(sport)
    // Benchmarks are scheduled deliberately, never offered as ordinary work; nor is anything made for a race.
    .filter((template) => template.benchmark !== true && template.occasion === undefined)
    // Race pace belongs to whoever is racing; a watt goal has no use for it.
    .filter((template) => template.goalKind === undefined || template.goalKind === goalKind)
    .filter((template) => withinLevel(template, ceilings))

  const byClass = (classes: readonly IntensityClass[]) =>
    available.filter((template) => classes.includes(intensityClass(template.stimulus)))
  const inPhase = (list: readonly WorkoutTemplate[]) =>
    list.filter((template) => template.phases.includes(phase))
  const fitting = (list: readonly WorkoutTemplate[]) =>
    list.filter((template) => template.minutes <= budgetMinutes)
  const fresh = (list: readonly WorkoutTemplate[]) =>
    list.filter((template) => !looksLikeRepeat(template, recent))

  // An easy day that exists because yesterday was hard, or because fatigue,
  // recovery values or a break call for it, is a recovery day in all but name.
  // Tempo would turn the week into one long middle, which is the most common way
  // an amateur plan fails.
  const restricted = dayType === 'EASY' && easyOnly
  const pool = byClass(restricted ? ['easy'] : ALLOWED_CLASSES[dayType])
  // Nor does running out of fresh easy sessions bring tempo back on such a day.
  const wider = restricted ? pool : byClass(FALLBACK_CLASSES[dayType])

  return (
    [
      fresh(fitting(inPhase(pool))),
      fresh(fitting(inPhase(wider))),
      fresh(fitting(pool)),
      fitting(inPhase(pool)),
      fitting(pool),
      inPhase(pool),
      pool,
    ].find((list) => list.length > 0) ?? pool
  )
}

/** Where the session sits on its ladder, and on the top offered rung what opens the next one. */
const levelNote = (template: WorkoutTemplate, ceilings: Readonly<Record<string, number>>): string => {
  if (template.family === undefined) return ''
  const own = template.level ?? 1
  const level = ceilings[template.family] ?? 1
  if (own < level) return ` · Stufe ${own} von ${level} verfügbar`
  const next = templatesFor(template.sport).some(
    (candidate) => candidate.family === template.family && (candidate.level ?? 1) === own + 1,
  )
  return next
    ? ` · Stufe ${own} — Stufe ${own + 1} kommt, sobald jedes Intervall voll und mindestens im Zielbereich gefahren ist`
    : ` · Stufe ${own}`
}

const reasonFor = (
  template: WorkoutTemplate,
  dayType: DayType,
  phase: Phase,
  simulation: Simulation,
  ceilings: Readonly<Record<string, number>>,
): string => {
  const age = stimulusAge(simulation, template.sport, template.stimulus)
  const ageText =
    age >= STALE_STIMULUS_DAYS
      ? 'dieser Reiz fehlt seit über vier Wochen'
      : `${STIMULUS_LABELS[template.stimulus]} zuletzt vor ${age} Tagen`
  if (dayType === 'KEY') return `${PHASE_LABELS[phase]}, Qualitätstag — ${ageText}${levelNote(template, ceilings)}`
  if (dayType === 'EASY') return `Lockerer Tag zwischen zwei harten Einheiten (${PHASE_LABELS[phase]})`
  return `Regeneration hat Vorrang (${PHASE_LABELS[phase]})`
}

const chooseRecommended = (
  dayType: DayType,
  simulation: Simulation,
  config: CoachConfig,
  date: string,
  sports: readonly Sport[],
): Sport | 'REST' => {
  if (dayType === 'REST') return 'REST'
  const fallback = sports[0] ?? 'Ride'
  const goalSport = primaryGoal(config.goals, date)?.sport
  const primarySport = goalSport && sports.includes(goalSport) ? goalSport : fallback

  const mostRested = [...sports].sort(
    (left, right) => simulation.daysSinceHard[right] - simulation.daysSinceHard[left],
  )

  if (dayType === 'KEY') {
    // Legs still carrying a hard run hand the quality to another sport, unless
    // there is none — then the athlete asked for it.
    const ready = mostRested.filter((sport) => !legsRecovering(simulation, sport))
    const candidates = ready.length > 0 ? ready : mostRested
    const preferred = candidates.includes(primarySport) ? primarySport : (candidates[0] ?? primarySport)
    // A sport with no quality work this week comes first; among several, the
    // one that has waited longest.
    const neglected = candidates.filter((sport) => simulation.hardThisWeekBySport[sport] === 0)
    if (neglected.length > 0 && !neglected.includes(preferred)) return neglected[0] ?? preferred
    return preferred
  }
  return mostRested[0] ?? primarySport
}

const notesFor = (
  decision: DayDecision,
  state: TrainingState,
  simulation: Simulation,
  config: CoachConfig,
  dayIndex: number,
  date: string,
): readonly string[] => {
  const notes: string[] = [decision.reason]
  if (dayIndex === 0 && state.readiness.reasons[0] !== 'Keine Warnsignale') {
    notes.push(...state.readiness.reasons)
  }
  notes.push(formNote(simulation.fitness))
  if (state.daysSinceAnySession >= LAYOFF_DAYS && state.daysSinceAnySession < 99) {
    notes.push(
      `${state.daysSinceAnySession} Tage ohne Training — Wiedereinstieg über die Schwelle, VO₂max erst danach`,
    )
  }
  const coming = returnWindow(config.breaks, date)
  if (coming) notes.push(coming.note)

  const promised = config.profile.weeklySessions.min
  const min = effectiveWeeklyMin(config, state)
  // A break is not a shortfall, so the weekly count stays quiet during and just after one.
  if (simulation.sessionsThisWeek < min && !breakLimit(config.breaks, date) && !coming) {
    notes.push(`Diese Woche ${simulation.sessionsThisWeek} von mindestens ${min} Einheiten`)
  }
  if (min < promised) {
    notes.push(
      `Vorgenommen ${promised} Einheiten/Woche, zuletzt ${state.sessionsPerWeekRecent.toLocaleString('de-DE')} — geplant wird mit ${min}`,
    )
  }
  if (state.rampRate > FAST_RAMP) notes.push(`Fitness steigt schnell (+${state.rampRate}/Woche) — Verletzungsrisiko beachten`)
  return notes
}

/** Strength rides along with a hard day, which keeps it off the day before one. */
const strengthFor = (
  dayType: DayType,
  simulation: Simulation,
  config: CoachConfig,
): StrengthSuggestion | null => {
  if (dayType !== 'KEY') return null
  const session = strengthSession(config.strengthLog.length, config.profile.equipment)
  return simulation.strengthThisWeek < session.perWeek ? session : null
}

/**
 * The session of a quality day is that day's quality, whatever its stimulus. A
 * recovery week has no hard templates, so its quality day offers tempo: counted
 * as moderate, it spent neither the week's budget nor the spacing, and the same
 * day came back the next day and the one after.
 */
const plannedEffort = (session: PlannedSession, dayType: DayType): Effort => {
  // With more time today, the longer version is the one the athlete set out to ride.
  const load = session.variants.find((variant) => variant.tier === 'extra')?.load ?? session.template.load
  return {
    sport: session.sport,
    load,
    hard: dayType === 'KEY' || intensityClass(session.template.stimulus) === 'hard' || load >= HARD_ON_LOAD_ALONE,
    stimuli: [session.template.stimulus],
  }
}

const advance = (
  simulation: Simulation,
  efforts: readonly Effort[],
  offered: readonly PlannedSession[],
  strengthAdded: boolean,
  nextDate: string,
  tested: boolean,
): Simulation => {
  const sameWeek = startOfWeek(nextDate) === simulation.weekStart
  const sessions = efforts.filter((effort) => effort.sport !== 'Other')
  const hardIn = (sport: Sport) =>
    efforts.filter((effort) => effort.hard && effort.sport === sport).length
  const hardLoadIn = (sport: Sport): number => {
    const loads = efforts.filter((effort) => effort.hard && effort.sport === sport).map((effort) => effort.load)
    return loads.length === 0 ? 0 : Math.max(...loads)
  }
  const bumpedAges = Object.fromEntries(
    Object.entries(simulation.stimulusAge).map(([key, age]) => [key, age + 1]),
  )
  const freshAges = Object.fromEntries(
    sessions.flatMap((effort) => effort.stimuli.map((stimulus) => [`${effort.sport}:${stimulus}`, 1])),
  )

  return {
    fitness: projectFitness(simulation.fitness, efforts.reduce((sum, effort) => sum + effort.load, 0)),
    daysSinceHard: Object.fromEntries(
      ALL_SPORTS.map((sport) => [sport, hardIn(sport) > 0 ? 1 : simulation.daysSinceHard[sport] + 1]),
    ) as Record<Sport, number>,
    lastHardLoad: Object.fromEntries(
      ALL_SPORTS.map((sport) => [
        sport,
        hardIn(sport) > 0 ? hardLoadIn(sport) : simulation.lastHardLoad[sport],
      ]),
    ) as Record<Sport, number>,
    hardThisWeek: sameWeek
      ? simulation.hardThisWeek + efforts.filter((effort) => effort.hard).length
      : 0,
    sessionsThisWeek: (sameWeek ? simulation.sessionsThisWeek : 0) + sessions.length,
    hardThisWeekBySport: Object.fromEntries(
      ALL_SPORTS.map((sport) => {
        const carried = sameWeek ? simulation.hardThisWeekBySport[sport] : 0
        return [sport, carried + hardIn(sport)]
      }),
    ) as Record<Sport, number>,
    stimulusAge: { ...bumpedAges, ...freshAges },
    // Every option shown counts as used, so the next day offers different work.
    usedTemplateIds: [
      ...simulation.usedTemplateIds,
      ...offered.map((option) => option.template.id),
    ],
    strengthThisWeek: (sameWeek ? simulation.strengthThisWeek : 0) + (strengthAdded ? 1 : 0),
    testedThisWeek: (sameWeek && simulation.testedThisWeek) || tested,
    consecutiveRest: efforts.length > 0 ? 0 : simulation.consecutiveRest + 1,
    weekStart: sameWeek ? simulation.weekStart : startOfWeek(nextDate),
  }
}

/**
 * A day with more time than usual. Whether it is used, and how far, is still
 * the plan's call: a recovery day stays short however much time there is, and
 * the length grows from what the athlete has recently managed, not from the clock.
 */
type ExtraTime = {
  /** Minutes a sport may run to today; absent where it is not lengthened. */
  readonly ceilings: Partial<Record<Sport, number>>
  /** What the extra time is used for — said only where a session actually got longer. */
  readonly lead: string | null
  readonly notes: readonly string[]
}

const NO_EXTRA: ExtraTime = { ceilings: {}, lead: null, notes: [] }

const roundDownToFive = (minutes: number): number => Math.floor(minutes / 5) * 5

const extraTimeFor = (
  wanted: number | undefined,
  decision: DayDecision,
  state: TrainingState,
  config: CoachConfig,
  sports: readonly Sport[],
  raceAround: boolean,
): ExtraTime => {
  const usual = config.profile.sessionMinutes.max
  if (wanted === undefined || wanted <= usual) return NO_EXTRA
  const unchanged = (why: string): ExtraTime => ({ ceilings: {}, lead: null, notes: [`Mehr Zeit ändert heute nichts: ${why}`] })
  if (raceAround) return unchanged('das Rennen bestimmt den Tag.')
  if (decision.dayType === 'REST') return unchanged('heute ist Pause.')
  if (decision.dayType === 'RECOVERY' || decision.easyOnly === true) {
    return unchanged('Erholung hat Vorrang — die zusätzliche Zeit wäre Belastung, keine Grundlage.')
  }

  const fast = state.rampRate > FAST_RAMP
  // Swimming is planned in metres and keeps its length.
  const lengthened = sports.filter((sport) => sport !== 'Swim').map((sport) => {
    const longest = state.longestRecentMinutes[sport]
    const growth = fast ? 1 : LONGEST_GROWTH[sport]
    const ceiling = Math.min(wanted, roundDownToFive(longest * growth))
    const capped =
      ceiling >= wanted
        ? null
        : longest === 0
          ? `${SPORT_LABELS[sport]} wird nicht verlängert: in den letzten sechs Wochen keine Einheit, an der sich mehr messen ließe.`
          : `${SPORT_LABELS[sport]} höchstens ${ceiling} min: deine längste Einheit der letzten sechs Wochen waren ${longest} min${fast ? ', und die Fitness steigt gerade schnell' : ''}.`
    return { sport, ceiling, capped }
  })
  return {
    ceilings: Object.fromEntries(lengthened.filter((entry) => entry.ceiling > 0).map((entry) => [entry.sport, entry.ceiling])),
    lead:
      decision.dayType === 'KEY'
        ? 'Mehr Zeit an einem Qualitätstag: die Intervalle bleiben, wie sie sind — die zusätzliche Zeit ist lockere Grundlage danach.'
        : 'Mehr Zeit an einem lockeren Tag: mehr Grundlage, nicht mehr Tempo.',
    notes: lengthened.flatMap((entry) => (entry.capped ? [entry.capped] : [])),
  }
}

/** What the day says about its extra time, once it is known which sessions took it. */
const extraTimeNotes = (extra: ExtraTime, options: readonly PlannedSession[]): readonly string[] => {
  if (Object.keys(extra.ceilings).length === 0) return extra.notes
  if (options.some((option) => option.variants.some((variant) => variant.tier === 'extra'))) {
    return extra.lead ? [extra.lead, ...extra.notes] : extra.notes
  }
  const measuring = options.some((option) => option.template.benchmark === true || option.template.measures !== undefined)
  return measuring
    ? ['Mehr Zeit ändert heute nichts: ein Test bleibt, wie er ist — verlängert misst er etwas anderes.', ...extra.notes]
    : extra.notes
}

export const planDays = (
  state: TrainingState,
  config: CoachConfig,
  days = 3,
  completions: readonly Completion[] = [],
  intent?: Intent,
  /** Trained on the first day: it shapes the days after, never the first day itself. */
  doneToday: readonly Activity[] = [],
  /** Minutes the athlete has today, when that is more than usual. */
  minutesToday?: number,
): readonly PlannedDay[] => {
  const budgetMinutes = config.profile.sessionMinutes.max
  const sports = selectedSports(config.profile)
  const trainedToday = effortsFrom(doneToday)
  const morningCompletions = completions.filter((completion) => completion.date < state.today)
  const morningConfig: CoachConfig = {
    ...config,
    strengthLog: config.strengthLog.filter((date) => date < state.today),
  }
  const laterState: TrainingState = {
    ...state,
    recentWorkouts: [
      ...state.recentWorkouts,
      ...doneToday.flatMap((activity) =>
        activity.sport === 'Other' || activity.load <= 0 ? [] : [{ sport: activity.sport, name: activity.name }],
      ),
    ],
  }

  const { plan } = Array.from({ length: days }).reduce<{
    simulation: Simulation
    plan: readonly PlannedDay[]
  }>(
    ({ simulation, plan }, _unused, dayIndex) => {
      const date = addDays(state.today, dayIndex)
      const isToday = dayIndex === 0
      const known = isToday ? morningCompletions : completions
      const view = isToday ? state : laterState
      const ceilings = levelCeilings(known)
      const phases = Object.fromEntries(
        sports.map((sport) => [sport, phaseForSport(config, sport, date)]),
      ) as Record<Sport, Phase>
      // Without a goal the first sport sets the phase; 'Ride' alone left a runner with no budget at all.
      const primarySport = primaryGoal(config.goals, date)?.sport ?? sports[0] ?? 'Ride'
      const phase = phases[primarySport]
      const budget = weeklyHardBudget(phase, config.profile)
      const around = racesAround(config, sports, date)
      const exhausted =
        (state.readiness.score === 'red' && isToday) || simulation.fitness.tsb < -30
      const decision = applyIntent(
        aroundRace(
          applyWeeklyCapacity(
            decideDay(simulation, state, config, budget, dayIndex, date, sports),
            simulation,
            state,
            config,
          ),
          around,
          phases.Ride === 'RECOVERY',
          exhausted,
          minDaysSinceHard(simulation, sports) < HARD_SPACING_DAYS,
        ),
        // A wish applies to today only; the days after follow from what it costs.
        dayIndex === 0 ? intent : undefined,
        simulation,
        sports,
        breakLimit(config.breaks, date) !== null,
      )
      const { dayType } = decision
      const extra = isToday
        ? extraTimeFor(minutesToday, decision, state, config, sports, around.race !== null || around.raceTomorrow !== null)
        : NO_EXTRA

      const returning = returnWindow(config.breaks, date) !== null
      const openers =
        around.raceTomorrow && dayType === 'EASY' ? findTemplate('bike-zrl-openers') : undefined
      // On race day the race is the plan; the day before, the openers are.
      const recommended =
        (around.race && dayType === 'KEY') || openers
          ? 'Ride'
          : chooseRecommended(dayType, simulation, config, date, sports)

      // A quality day is the only slot a maximal test can have, and the plan
      // takes it rather than waiting for the athlete to volunteer. Every sport
      // that is due gets its own, because which one to test is the athlete's
      // choice exactly as which one to train is.
      const testable =
        dayType === 'KEY' && !simulation.testedThisWeek && !around.race && !around.raceTomorrow

      // While the legs recover, a quality day's run is a light one — unless running
      // is all there is, which on a quality day means the athlete asked for it.
      const held = (sport: Sport): boolean =>
        dayType === 'KEY' &&
        legsRecovering(simulation, sport) &&
        sports.some((other) => !legsRecovering(simulation, other))

      const regular = sports.map((sport) => {
        const sportPhase = phases[sport]
        const sportDayType = held(sport) ? 'EASY' : dayType
        const test = testable && !held(sport)
          ? thresholdTestDue(
              sport,
              known,
              date,
              simulation.fitness,
              sportPhase,
              returning,
              budgetMinutes,
              state.daysSinceAnySession,
            )
          : null
        if (test) {
          const template = findTemplate(test.templateId)
          if (template) return buildSession(template, config, test.reason, date)
        }
        // Setting the numbers comes first; comparing against the last time comes after.
        const reference = testable && !held(sport)
          ? benchmarkDue(sport, known, date, config.planStart, sportPhase, returning, budgetMinutes)
          : null
        if (reference) {
          const template = findTemplate(reference.templateId)
          if (template) return buildSession(template, config, reference.reason, date)
        }
        if (openers && sport === 'Ride') return buildSession(openers, config, decision.reason, date)
        const goalKind = goalForSport(config.goals, sport, date)?.kind
        // Legs held back from a hard run are not sent on a long one either.
        const stretchTo = held(sport) ? undefined : extra.ceilings[sport]
        // A quality day keeps the session it would have had; the time goes to base around it.
        // An easy day may reach for a long session in the library.
        const sportBudget =
          stretchTo !== undefined && sportDayType !== 'KEY' ? Math.max(stretchTo, budgetMinutes) : budgetMinutes
        const candidates = candidatesFor(
          sport,
          sportDayType,
          sportPhase,
          sportBudget,
          ceilings,
          view.recentWorkouts,
          goalKind,
          minDaysSinceHard(simulation, sports) < HARD_SPACING_DAYS || decision.easyOnly === true,
        )
        const best = [...candidates].sort(
          (left, right) =>
            scoreTemplate(right, simulation, view, sportPhase, sportBudget, returning, goalKind) -
            scoreTemplate(left, simulation, view, sportPhase, sportBudget, returning, goalKind),
        )[0]
        if (!best) return null
        const reason = held(sport)
          ? `${legsNote(simulation)} — die Qualität heute in der anderen Sportart, der Lauf bleibt leicht`
          : reasonFor(best, dayType, sportPhase, simulation, ceilings)
        return buildSession(best, config, reason, date, stretchTo)
      }).filter((session): session is PlannedSession => session !== null)
      const options = withRace(
        regular,
        around.race ? raceSession(around.race, state, config, dayType) : null,
        dayType,
      )
      // The race is the one session of its day.
      const strength = around.race ? null : strengthFor(dayType, simulation, isToday ? morningConfig : config)
      const chosen = options.find((session) => session.sport === recommended) ?? null

      const day: PlannedDay = {
        date,
        weekday: weekdayDe(date),
        dayType,
        phase,
        recommended,
        options,
        notes: [...notesFor(decision, state, simulation, config, dayIndex, date), ...extraTimeNotes(extra, options)],
        optional: decision.optional,
        strength,
        completed: isToday ? completedFrom(doneToday, completions) : [],
      }

      // What was actually trained replaces the proposal; a test only offered measured nothing.
      // An easy session on a quality day leaves the quality session open until the day is
      // over, so tomorrow is planned as if it still happens — otherwise the same hard
      // session is offered today and tomorrow, and doing both is two hard days in a row.
      const actual = isToday ? trainedToday : []
      const planned = chosen ? [plannedEffort(chosen, dayType)] : []
      const stillOpen = dayType === 'KEY' && !actual.some((effort) => effort.hard)
      const efforts = actual.length === 0 ? planned : stillOpen ? [...actual, ...planned] : actual
      const tested =
        (actual.length === 0 || stillOpen) && options.some((option) => option.template.measures === 'threshold')

      return {
        simulation: advance(
          simulation,
          efforts,
          options,
          strength !== null,
          addDays(state.today, dayIndex + 1),
          tested,
        ),
        plan: [...plan, day],
      }
    },
    { simulation: initSimulation(state, morningConfig), plan: [] },
  )

  return plan
}

/** Total step count, used by the UI to show a compact workout summary. */
export const stepCount = (template: WorkoutTemplate): number => flattenBlocks(template.blocks).length
