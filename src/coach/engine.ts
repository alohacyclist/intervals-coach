import type {
  CoachConfig,
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
import { SPORTS } from './types.ts'
import { addDays, startOfWeek, weekdayDe } from './dates.ts'
import { projectFitness } from './fitness.ts'
import { PHASE_LABELS, phaseForSport, primaryGoal, weeklyHardBudget } from './phase.ts'
import { flattenBlocks, intensityClass, templatesFor } from './library.ts'
import { describeWorkout, toHumanSteps } from './format.ts'

/** Minimum days between two hard sessions, regardless of sport. */
const HARD_SPACING_DAYS = 2
const STALE_STIMULUS_DAYS = 28

type Simulation = {
  readonly fitness: Fitness
  readonly daysSinceHard: Readonly<Record<Sport, number>>
  readonly hardThisWeek: number
  readonly sessionsThisWeek: number
  readonly hardThisWeekBySport: Readonly<Record<Sport, number>>
  readonly stimulusAge: Readonly<Record<string, number>>
  readonly usedTemplateIds: readonly string[]
  readonly weekStart: string
}

const ALLOWED_CLASSES: Readonly<Record<DayType, readonly IntensityClass[]>> = {
  KEY: ['hard'],
  EASY: ['easy', 'moderate'],
  RECOVERY: ['easy'],
  REST: ['easy'],
}

const initSimulation = (state: TrainingState): Simulation => ({
  fitness: state.overall,
  daysSinceHard: state.daysSinceHard,
  hardThisWeek: state.hardSessionsThisWeek,
  sessionsThisWeek: state.sessionsThisWeek,
  hardThisWeekBySport: state.hardThisWeekBySport,
  stimulusAge: Object.fromEntries(
    state.recency.map((entry) => [`${entry.sport}:${entry.stimulus}`, entry.daysAgo]),
  ),
  usedTemplateIds: [],
  weekStart: startOfWeek(state.today),
})

const stimulusAge = (simulation: Simulation, sport: Sport, stimulus: Stimulus): number =>
  simulation.stimulusAge[`${sport}:${stimulus}`] ?? STALE_STIMULUS_DAYS

const minDaysSinceHard = (simulation: Simulation): number =>
  Math.min(...SPORTS.map((sport) => simulation.daysSinceHard[sport]))

const decideDayType = (
  simulation: Simulation,
  state: TrainingState,
  budget: number,
  dayIndex: number,
): DayType => {
  const readinessRed = state.readiness.score === 'red'
  if (readinessRed && dayIndex === 0) {
    return simulation.fitness.tsb < -25 ? 'REST' : 'RECOVERY'
  }
  if (simulation.fitness.tsb < -30) return 'RECOVERY'
  if (minDaysSinceHard(simulation) < HARD_SPACING_DAYS) return 'EASY'
  if (simulation.hardThisWeek >= budget) return 'EASY'
  if (simulation.fitness.tsb < -18) return 'EASY'
  if (readinessRed || (state.readiness.score === 'amber' && dayIndex === 0)) return 'EASY'
  return 'KEY'
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
  const repeatPenalty =
    simulation.usedTemplateIds.includes(template.id) ||
    state.recentWorkoutNames.some((name) => name.includes(template.name))
      ? -2.5
      : 0
  return 3 * dueness + phaseAffinity(phase, template.stimulus) + fit + 0.5 * usesBudget + repeatPenalty
}

const candidatesFor = (
  sport: Sport,
  dayType: DayType,
  phase: Phase,
  budgetMinutes: number,
): readonly WorkoutTemplate[] => {
  const allowed = ALLOWED_CLASSES[dayType]
  const pool = templatesFor(sport).filter((template) => allowed.includes(intensityClass(template.stimulus)))
  const inPhase = pool.filter((template) => template.phases.includes(phase))
  const fitting = (list: readonly WorkoutTemplate[]) =>
    list.filter((template) => template.minutes <= budgetMinutes)

  return [fitting(inPhase), fitting(pool), inPhase, pool].find((list) => list.length > 0) ?? pool
}

const reasonFor = (
  template: WorkoutTemplate,
  dayType: DayType,
  phase: Phase,
  simulation: Simulation,
): string => {
  const age = stimulusAge(simulation, template.sport, template.stimulus)
  const ageText =
    age >= STALE_STIMULUS_DAYS
      ? 'dieser Reiz fehlt seit über vier Wochen'
      : `letzter ${template.stimulus}-Reiz vor ${age} Tagen`
  if (dayType === 'KEY') return `${PHASE_LABELS[phase]}, Qualitätstag — ${ageText}`
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
  humanSteps: toHumanSteps(template.blocks, config.profile),
})

const chooseRecommended = (
  dayType: DayType,
  simulation: Simulation,
  config: CoachConfig,
  date: string,
): Sport | 'REST' => {
  if (dayType === 'REST') return 'REST'
  const primarySport = primaryGoal(config.goals, date)?.sport ?? 'Ride'
  if (dayType === 'KEY') {
    const neglected = SPORTS.filter((sport) => simulation.hardThisWeekBySport[sport] === 0)
    if (neglected.length === 1 && neglected[0]) return neglected[0]
    return primarySport
  }
  const [rested] = [...SPORTS].sort(
    (left, right) => simulation.daysSinceHard[right] - simulation.daysSinceHard[left],
  )
  return rested ?? primarySport
}

const notesFor = (
  dayType: DayType,
  state: TrainingState,
  simulation: Simulation,
  config: CoachConfig,
  budget: number,
  dayIndex: number,
): readonly string[] => {
  const notes: string[] = []
  if (dayIndex === 0) notes.push(...state.readiness.reasons)
  notes.push(`Form ${simulation.fitness.tsb} · Fitness ${simulation.fitness.ctl} · Ermüdung ${simulation.fitness.atl}`)
  if (dayType === 'EASY' && simulation.hardThisWeek >= budget) {
    notes.push(`Wochenbudget harter Einheiten erreicht (${simulation.hardThisWeek}/${budget})`)
  }
  if (dayType === 'EASY' && minDaysSinceHard(simulation) < HARD_SPACING_DAYS) {
    notes.push('Weniger als 48h seit der letzten harten Einheit')
  }
  const { min } = config.profile.weeklySessions
  if (simulation.sessionsThisWeek < min) {
    notes.push(`Diese Woche ${simulation.sessionsThisWeek} von mindestens ${min} Einheiten`)
  }
  if (state.rampRate > 6) notes.push(`Fitness steigt schnell (+${state.rampRate}/Woche) — Verletzungsrisiko beachten`)
  return notes
}

const advance = (
  simulation: Simulation,
  session: PlannedSession | null,
  offered: readonly PlannedSession[],
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
      SPORTS.map((sport) => [
        sport,
        isHard && session.sport === sport ? 1 : simulation.daysSinceHard[sport] + 1,
      ]),
    ) as Record<Sport, number>,
    hardThisWeek: sameWeek ? simulation.hardThisWeek + (isHard ? 1 : 0) : 0,
    sessionsThisWeek: (sameWeek ? simulation.sessionsThisWeek : 0) + (session ? 1 : 0),
    hardThisWeekBySport: Object.fromEntries(
      SPORTS.map((sport) => {
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
    weekStart: sameWeek ? simulation.weekStart : startOfWeek(nextDate),
  }
}

export const planDays = (
  state: TrainingState,
  config: CoachConfig,
  days = 3,
): readonly PlannedDay[] => {
  const budgetMinutes = config.profile.maxSessionMinutes

  const { plan } = Array.from({ length: days }).reduce<{
    simulation: Simulation
    plan: readonly PlannedDay[]
  }>(
    ({ simulation, plan }, _unused, dayIndex) => {
      const date = addDays(state.today, dayIndex)
      const phases = Object.fromEntries(
        SPORTS.map((sport) => [sport, phaseForSport(config, sport, date)]),
      ) as Record<Sport, Phase>
      const primarySport = primaryGoal(config.goals, date)?.sport ?? 'Ride'
      const phase = phases[primarySport]
      const budget = weeklyHardBudget(phase, config.profile)
      const dayType = decideDayType(simulation, state, budget, dayIndex)

      const options = SPORTS.map((sport) => {
        const sportPhase = phases[sport]
        const candidates = candidatesFor(sport, dayType, sportPhase, budgetMinutes)
        const best = [...candidates].sort(
          (left, right) =>
            scoreTemplate(right, simulation, state, sportPhase, budgetMinutes) -
            scoreTemplate(left, simulation, state, sportPhase, budgetMinutes),
        )[0]
        if (!best) return null
        return buildSession(best, config, reasonFor(best, dayType, sportPhase, simulation))
      }).filter((session): session is PlannedSession => session !== null)

      const recommended = chooseRecommended(dayType, simulation, config, date)
      const chosen = options.find((session) => session.sport === recommended) ?? null

      const day: PlannedDay = {
        date,
        weekday: weekdayDe(date),
        dayType,
        phase,
        recommended,
        options,
        notes: notesFor(dayType, state, simulation, config, budget, dayIndex),
      }

      return {
        simulation: advance(simulation, chosen, options, addDays(state.today, dayIndex + 1)),
        plan: [...plan, day],
      }
    },
    { simulation: initSimulation(state), plan: [] },
  )

  return plan
}

/** Total step count, used by the UI to show a compact workout summary. */
export const stepCount = (template: WorkoutTemplate): number => flattenBlocks(template.blocks).length
