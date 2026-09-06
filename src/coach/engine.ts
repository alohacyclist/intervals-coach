import type {
  CoachConfig,
  Intent,
  StrengthSuggestion,
  DayType,
  Fitness,
  IntensityClass,
  Phase,
  PlannedDay,
  PlannedSession,
  Sport,
  Stimulus,
  TrainingState,
  WorkoutTemplate,
} from './types.ts'
import { ALL_SPORTS } from './types.ts'
import { addDays, diffDays, startOfWeek, weekdayDe } from './dates.ts'
import { projectFitness } from './fitness.ts'
import { PHASE_LABELS, phaseForSport, primaryGoal, weeklyHardBudget } from './phase.ts'
import { defaultThreshold, selectedSports, thresholdFor } from './thresholds.ts'
import { levelCeilings } from './progression.ts'
import type { Completion } from './progression.ts'
import { flattenBlocks, intensityClass, isPreferredSport, strengthSession, templatesFor } from './library.ts'
import { describeWorkout, toHumanSteps } from './format.ts'

/** Minimum days between two hard sessions, regardless of sport. */
const HARD_SPACING_DAYS = 2
const STALE_STIMULUS_DAYS = 28
/** A gap this long means the body has detrained; VO2max is the wrong way back in. */
const LAYOFF_DAYS = 10
/** Beyond this, rest stops being recovery and starts being detraining. */
const MAX_CONSECUTIVE_REST = 2

type Simulation = {
  readonly fitness: Fitness
  readonly daysSinceHard: Readonly<Record<Sport, number>>
  readonly hardThisWeek: number
  readonly sessionsThisWeek: number
  readonly hardThisWeekBySport: Readonly<Record<Sport, number>>
  readonly stimulusAge: Readonly<Record<string, number>>
  readonly usedTemplateIds: readonly string[]
  readonly strengthThisWeek: number
  readonly consecutiveRest: number
  readonly weekStart: string
}

const ALLOWED_CLASSES: Readonly<Record<DayType, readonly IntensityClass[]>> = {
  KEY: ['hard'],
  EASY: ['easy', 'moderate'],
  RECOVERY: ['easy'],
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
  hardThisWeek: state.hardSessionsThisWeek,
  sessionsThisWeek: state.sessionsThisWeek,
  hardThisWeekBySport: state.hardThisWeekBySport,
  stimulusAge: Object.fromEntries(
    state.recency.map((entry) => [`${entry.sport}:${entry.stimulus}`, entry.daysAgo]),
  ),
  usedTemplateIds: [],
  strengthThisWeek: strengthThisWeekFrom(state, config),
  consecutiveRest: state.consecutiveRestDays,
  weekStart: startOfWeek(state.today),
})

const stimulusAge = (simulation: Simulation, sport: Sport, stimulus: Stimulus): number =>
  simulation.stimulusAge[`${sport}:${stimulus}`] ?? STALE_STIMULUS_DAYS

const minDaysSinceHard = (simulation: Simulation, sports: readonly Sport[]): number =>
  Math.min(...sports.map((sport) => simulation.daysSinceHard[sport]))

type DayDecision = {
  readonly dayType: DayType
  readonly reason: string
  readonly optional: boolean
}

const plan = (dayType: DayType, reason: string): DayDecision => ({ dayType, reason, optional: false })

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
): DayDecision => {
  if (intent === undefined) return decision
  const wanted = INTENT_TYPE[intent]
  if (wanted === decision.dayType) return decision

  const spacing = minDaysSinceHard(simulation, sports)
  const warning =
    intent === 'hard' && spacing < HARD_SPACING_DAYS
      ? ` Achtung: erst ${spacing === 0 ? 'heute' : `vor ${spacing} Tag${spacing === 1 ? '' : 'en'}`} eine harte Einheit — zwei harte Tage hintereinander kosten mehr, als sie bringen.`
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
  const { min, max } = config.profile.weeklySessions
  const readinessRed = state.readiness.score === 'red'
  const planned = simulation.sessionsThisWeek

  if (readinessRed && dayIndex === 0) {
    return simulation.fitness.tsb < -25
      ? plan('REST', 'Erholungssignale und tiefe Form — heute gar nichts')
      : plan('RECOVERY', 'Erholungssignale sprechen gegen Belastung')
  }
  if (simulation.fitness.tsb < -30) {
    return plan('RECOVERY', 'Form deutlich im Minus — nur Regeneration')
  }
  if (minDaysSinceHard(simulation, sports) < HARD_SPACING_DAYS) {
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
  if (simulation.hardThisWeek >= budget) {
    return plan('EASY', `Wochenbudget harter Einheiten erreicht (${simulation.hardThisWeek}/${budget})`)
  }
  if (simulation.fitness.tsb < -18) return plan('EASY', 'Hohe Ermüdung — locker halten')
  if (readinessRed || (state.readiness.score === 'amber' && dayIndex === 0)) {
    return plan('EASY', 'Erholungswerte unter deiner Baseline')
  }
  return plan('KEY', 'Erholt und im Wochenbudget — heute darf es wehtun')
}

/** How well a stimulus serves the current phase — keeps the block focused. */
const phaseAffinity = (phase: Phase, stimulus: Stimulus): number => {
  const affinities: Readonly<Record<Phase, Partial<Record<Stimulus, number>>>> = {
    BASE: { SWEETSPOT: 1.5, TEMPO: 1.2, THRESHOLD: 1, LONG: 1.2, NEURO: 0.8, ENDURANCE: 0.8 },
    BUILD: { VO2: 1.5, THRESHOLD: 1.3, SWEETSPOT: 0.8, LONG: 0.8 },
    SPECIFIC: { THRESHOLD: 1.5, VO2: 1.2, TEMPO: 0.8 },
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
): number => {
  const dueness = Math.min(stimulusAge(simulation, template.sport, template.stimulus), STALE_STIMULUS_DAYS) / STALE_STIMULUS_DAYS
  const fit = template.minutes <= budgetMinutes ? 1 : -5
  const usesBudget = template.minutes / budgetMinutes
  // The sport that normally carries this stimulus gets the nod, all else equal.
  const roleBonus = isPreferredSport(template.stimulus, template.sport) ? 1 : 0
  // Coming back from a break, the first hard session is threshold, not VO2max.
  const layoffPenalty =
    state.daysSinceAnySession >= LAYOFF_DAYS && template.stimulus === 'VO2' ? -4 : 0
  const repeatPenalty =
    simulation.usedTemplateIds.includes(template.id) ||
    state.recentWorkoutNames.some((name) => name.includes(template.name))
      ? -2.5
      : 0
  return (
    3 * dueness +
    phaseAffinity(phase, template.stimulus) +
    roleBonus +
    layoffPenalty +
    fit +
    0.5 * usesBudget +
    repeatPenalty
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
): readonly WorkoutTemplate[] => {
  const allowed = ALLOWED_CLASSES[dayType]
  const pool = templatesFor(sport)
    // Benchmarks are scheduled deliberately, never offered as ordinary work.
    .filter((template) => template.benchmark !== true)
    .filter((template) => allowed.includes(intensityClass(template.stimulus)))
    .filter((template) => withinLevel(template, ceilings))
  const inPhase = pool.filter((template) => template.phases.includes(phase))
  const fitting = (list: readonly WorkoutTemplate[]) =>
    list.filter((template) => template.minutes <= budgetMinutes)

  return [fitting(inPhase), fitting(pool), inPhase, pool].find((list) => list.length > 0) ?? pool
}

const levelNote = (template: WorkoutTemplate, ceilings: Readonly<Record<string, number>>): string => {
  if (template.family === undefined) return ''
  const level = ceilings[template.family] ?? 1
  return ` · Stufe ${template.level ?? 1}${(template.level ?? 1) < level ? ` von ${level} verfügbar` : ''}`
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
      : `letzter ${template.stimulus}-Reiz vor ${age} Tagen`
  if (dayType === 'KEY') return `${PHASE_LABELS[phase]}, Qualitätstag — ${ageText}${levelNote(template, ceilings)}`
  if (dayType === 'EASY') return `Lockerer Tag zwischen zwei harten Einheiten (${PHASE_LABELS[phase]})`
  return `Regeneration hat Vorrang (${PHASE_LABELS[phase]})`
}

const buildSession = (
  template: WorkoutTemplate,
  config: CoachConfig,
  reason: string,
): PlannedSession => ({
  sport: template.sport,
  template,
  reason,
  description: describeWorkout(template, reason),
  humanSteps: toHumanSteps(
    template.blocks,
    thresholdFor(config.profile, template.sport) ?? defaultThreshold(template.sport),
  ),
})

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
    // A sport with no quality work this week comes first; among several, the
    // one that has waited longest.
    const neglected = mostRested.filter((sport) => simulation.hardThisWeekBySport[sport] === 0)
    if (neglected.length > 0 && !neglected.includes(primarySport)) return neglected[0] ?? primarySport
    return primarySport
  }
  return mostRested[0] ?? primarySport
}

const notesFor = (
  decision: DayDecision,
  state: TrainingState,
  simulation: Simulation,
  config: CoachConfig,
  dayIndex: number,
): readonly string[] => {
  const notes: string[] = [decision.reason]
  if (dayIndex === 0 && state.readiness.reasons[0] !== 'Keine Warnsignale') {
    notes.push(...state.readiness.reasons)
  }
  notes.push(`Form ${simulation.fitness.tsb} · Fitness ${simulation.fitness.ctl} · Ermüdung ${simulation.fitness.atl}`)
  if (state.daysSinceAnySession >= LAYOFF_DAYS && state.daysSinceAnySession < 99) {
    notes.push(
      `${state.daysSinceAnySession} Tage ohne Training — Wiedereinstieg über die Schwelle, VO₂max erst danach`,
    )
  }
  const { min } = config.profile.weeklySessions
  if (simulation.sessionsThisWeek < min) {
    notes.push(`Diese Woche ${simulation.sessionsThisWeek} von mindestens ${min} Einheiten`)
  }
  if (state.rampRate > 6) notes.push(`Fitness steigt schnell (+${state.rampRate}/Woche) — Verletzungsrisiko beachten`)
  return notes
}

/** Strength rides along with a hard day, which keeps it off the day before one. */
const strengthFor = (
  dayType: DayType,
  simulation: Simulation,
  config: CoachConfig,
): StrengthSuggestion | null => {
  if (dayType !== 'KEY') return null
  const session = strengthSession(config.strengthLog.length)
  return simulation.strengthThisWeek < session.perWeek ? session : null
}

const advance = (
  simulation: Simulation,
  session: PlannedSession | null,
  offered: readonly PlannedSession[],
  strengthAdded: boolean,
  nextDate: string,
): Simulation => {
  const isHard = session !== null && intensityClass(session.template.stimulus) === 'hard'
  const sameWeek = startOfWeek(nextDate) === simulation.weekStart
  const bumpedAges = Object.fromEntries(
    Object.entries(simulation.stimulusAge).map(([key, age]) => [key, age + 1]),
  )

  return {
    fitness: projectFitness(simulation.fitness, session?.template.load ?? 0),
    daysSinceHard: Object.fromEntries(
      ALL_SPORTS.map((sport) => [
        sport,
        isHard && session.sport === sport ? 1 : simulation.daysSinceHard[sport] + 1,
      ]),
    ) as Record<Sport, number>,
    hardThisWeek: sameWeek ? simulation.hardThisWeek + (isHard ? 1 : 0) : 0,
    sessionsThisWeek: (sameWeek ? simulation.sessionsThisWeek : 0) + (session ? 1 : 0),
    hardThisWeekBySport: Object.fromEntries(
      ALL_SPORTS.map((sport) => {
        const carried = sameWeek ? simulation.hardThisWeekBySport[sport] : 0
        return [sport, carried + (isHard && session.sport === sport ? 1 : 0)]
      }),
    ) as Record<Sport, number>,
    stimulusAge: session
      ? { ...bumpedAges, [`${session.sport}:${session.template.stimulus}`]: 1 }
      : bumpedAges,
    // Every option shown counts as used, so the next day offers different work.
    usedTemplateIds: [
      ...simulation.usedTemplateIds,
      ...offered.map((option) => option.template.id),
    ],
    strengthThisWeek: (sameWeek ? simulation.strengthThisWeek : 0) + (strengthAdded ? 1 : 0),
    consecutiveRest: session ? 0 : simulation.consecutiveRest + 1,
    weekStart: sameWeek ? simulation.weekStart : startOfWeek(nextDate),
  }
}

export const planDays = (
  state: TrainingState,
  config: CoachConfig,
  days = 3,
  completions: readonly Completion[] = [],
  intent?: Intent,
): readonly PlannedDay[] => {
  const budgetMinutes = config.profile.maxSessionMinutes
  const sports = selectedSports(config.profile)
  const ceilings = levelCeilings(completions)

  const { plan } = Array.from({ length: days }).reduce<{
    simulation: Simulation
    plan: readonly PlannedDay[]
  }>(
    ({ simulation, plan }, _unused, dayIndex) => {
      const date = addDays(state.today, dayIndex)
      const phases = Object.fromEntries(
        sports.map((sport) => [sport, phaseForSport(config, sport, date)]),
      ) as Record<Sport, Phase>
      const primarySport = primaryGoal(config.goals, date)?.sport ?? 'Ride'
      const phase = phases[primarySport]
      const budget = weeklyHardBudget(phase, config.profile)
      const decision = applyIntent(
        applyWeeklyCapacity(
          decideDay(simulation, state, config, budget, dayIndex, date, sports),
          simulation,
          state,
          config,
        ),
        // A wish applies to today only; the days after follow from what it costs.
        dayIndex === 0 ? intent : undefined,
        simulation,
        sports,
      )
      const { dayType } = decision

      const options = sports.map((sport) => {
        const sportPhase = phases[sport]
        const candidates = candidatesFor(sport, dayType, sportPhase, budgetMinutes, ceilings)
        const best = [...candidates].sort(
          (left, right) =>
            scoreTemplate(right, simulation, state, sportPhase, budgetMinutes) -
            scoreTemplate(left, simulation, state, sportPhase, budgetMinutes),
        )[0]
        if (!best) return null
        return buildSession(best, config, reasonFor(best, dayType, sportPhase, simulation, ceilings))
      }).filter((session): session is PlannedSession => session !== null)

      const recommended = chooseRecommended(dayType, simulation, config, date, sports)
      const strength = strengthFor(dayType, simulation, config)
      const chosen = options.find((session) => session.sport === recommended) ?? null

      const day: PlannedDay = {
        date,
        weekday: weekdayDe(date),
        dayType,
        phase,
        recommended,
        options,
        notes: notesFor(decision, state, simulation, config, dayIndex),
        optional: decision.optional,
        strength,
      }

      return {
        simulation: advance(simulation, chosen, options, strength !== null, addDays(state.today, dayIndex + 1)),
        plan: [...plan, day],
      }
    },
    { simulation: initSimulation(state, config), plan: [] },
  )

  return plan
}

/** Total step count, used by the UI to show a compact workout summary. */
export const stepCount = (template: WorkoutTemplate): number => flattenBlocks(template.blocks).length
