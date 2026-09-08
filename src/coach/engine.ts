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
  RecentWorkout,
  SessionMinutes,
  SessionTier,
  SessionVariant,
  Sport,
  SportThreshold,
  Stimulus,
  TrainingState,
  WorkoutTemplate,
} from './types.ts'
import { ALL_SPORTS } from './types.ts'
import { addDays, diffDays, startOfWeek, weekdayDe } from './dates.ts'
import { projectFitness } from './fitness.ts'
import { PHASE_LABELS, phaseForSport, primaryGoal, weeklyHardBudget } from './phase.ts'
import { defaultThreshold, selectedSports, thresholdFor } from './thresholds.ts'
import { breakLimit, returnWindow } from './breaks.ts'
import { thresholdTestDue } from './threshold-test.ts'
import { levelCeilings } from './progression.ts'
import type { Completion } from './progression.ts'
import { findTemplate, flattenBlocks, intensityClass, isPreferredSport, strengthSession, templatesFor } from './library.ts'
import { describeBlocks, describeWorkout, toHumanSteps } from './format.ts'
import { MIN_SAVING_MINUTES, shorten, totalSeconds } from './variant.ts'

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

type DayDecision = {
  readonly dayType: DayType
  readonly reason: string
  readonly optional: boolean
}

const plan = (dayType: DayType, reason: string): DayDecision => ({ dayType, reason, optional: false })

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

  // A break the athlete declared beats every measurement, because it knows
  // something no measurement does yet.
  const limit = breakLimit(config.breaks, date)
  if (limit) {
    return { dayType: limit.dayType, reason: limit.reason, optional: limit.dayType !== 'REST' }
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
  if (simulation.fitness.tsb < -18) return plan('EASY', 'Hohe Ermüdung — locker halten')
  if (readinessRed || (state.readiness.score === 'amber' && dayIndex === 0)) {
    return plan('EASY', 'Erholungswerte unter deiner Baseline')
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
  returning: boolean,
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
  return (
    3 * dueness +
    phaseAffinity(phase, template.stimulus) +
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
): readonly WorkoutTemplate[] => {
  const available = templatesFor(sport)
    // Benchmarks are scheduled deliberately, never offered as ordinary work.
    .filter((template) => template.benchmark !== true)
    .filter((template) => withinLevel(template, ceilings))

  const byClass = (classes: readonly IntensityClass[]) =>
    available.filter((template) => classes.includes(intensityClass(template.stimulus)))
  const inPhase = (list: readonly WorkoutTemplate[]) =>
    list.filter((template) => template.phases.includes(phase))
  const fitting = (list: readonly WorkoutTemplate[]) =>
    list.filter((template) => template.minutes <= budgetMinutes)
  const fresh = (list: readonly WorkoutTemplate[]) =>
    list.filter((template) => !looksLikeRepeat(template, recent))

  const pool = byClass(ALLOWED_CLASSES[dayType])
  const wider = byClass(FALLBACK_CLASSES[dayType])

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

const SHORT_NOTE =
  'Gekürzte Fassung: gleiche Intervalllänge, gleiche Zielwerte, weniger Volumen. Der Reiz bleibt, die Zeit nicht.'

/**
 * One tier's version of a session. The full template is the top of what is
 * offered — a workout is never stretched, only trimmed, because adding
 * intervals to a session designed with three of them makes it another session.
 */
const variantFor = (
  tier: SessionTier,
  targetMinutes: number,
  template: WorkoutTemplate,
  threshold: SportThreshold,
  reason: string,
): SessionVariant | null => {
  const fullSec = totalSeconds(template.blocks, threshold)
  if (fullSec === 0) return null

  if (targetMinutes >= template.minutes) {
    return {
      tier,
      minutes: template.minutes,
      load: template.load,
      blocks: template.blocks,
      description: describeWorkout(template, reason),
      humanSteps: toHumanSteps(template.blocks, threshold),
      cuts: [],
    }
  }

  const { blocks, cuts } = shorten(template.blocks, threshold, targetMinutes / template.minutes)
  const shortSec = totalSeconds(blocks, threshold)
  // The authored duration stays authoritative; the trimmed one scales off it.
  return {
    tier,
    minutes: Math.round((template.minutes * shortSec) / fullSec),
    load: Math.round((template.load * shortSec) / fullSec),
    blocks,
    description: describeBlocks(blocks, `${template.coachNote}\n\n${SHORT_NOTE}`, reason),
    humanSteps: toHumanSteps(blocks, threshold),
    cuts,
  }
}

/**
 * One variant per configured time budget, shortest first. Two tiers that land
 * within a few minutes of each other are the same session twice, so only the
 * longer of them is kept — a choice between 58 and 60 minutes is not a choice.
 */
const buildVariants = (
  template: WorkoutTemplate,
  threshold: SportThreshold,
  reason: string,
  minutes: SessionMinutes,
): readonly SessionVariant[] => {
  // A reference session exists to be compared with itself. Trimmed, it would
  // measure a different workout, so it is offered whole or not at all.
  if (template.benchmark === true) {
    const whole = variantFor('max', template.minutes, template, threshold, reason)
    return whole ? [whole] : []
  }

  const tiers: readonly SessionTier[] = ['min', 'normal', 'max']
  const built = tiers
    .map((tier) => variantFor(tier, minutes[tier], template, threshold, reason))
    .filter((variant): variant is SessionVariant => variant !== null)

  return built.filter((variant, index) => {
    const next = built[index + 1]
    return next === undefined || next.minutes - variant.minutes >= MIN_SAVING_MINUTES
  })
}

const buildSession = (
  template: WorkoutTemplate,
  config: CoachConfig,
  reason: string,
): PlannedSession => {
  const threshold = thresholdFor(config.profile, template.sport) ?? defaultThreshold(template.sport)
  return {
    sport: template.sport,
    template,
    reason,
    description: describeWorkout(template, reason),
    humanSteps: toHumanSteps(template.blocks, threshold),
    variants: buildVariants(template, threshold, reason, config.profile.sessionMinutes),
  }
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
  date: string,
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
  const coming = returnWindow(config.breaks, date)
  if (coming) notes.push(coming.note)

  const { min } = config.profile.weeklySessions
  // A break is not a shortfall, so the weekly count stays quiet during and just after one.
  if (simulation.sessionsThisWeek < min && !breakLimit(config.breaks, date) && !coming) {
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
  const session = strengthSession(config.strengthLog.length, config.profile.equipment)
  return simulation.strengthThisWeek < session.perWeek ? session : null
}

const advance = (
  simulation: Simulation,
  session: PlannedSession | null,
  offered: readonly PlannedSession[],
  strengthAdded: boolean,
  nextDate: string,
  tested: boolean,
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
    testedThisWeek: (sameWeek && simulation.testedThisWeek) || tested,
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
  const budgetMinutes = config.profile.sessionMinutes.max
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
        breakLimit(config.breaks, date) !== null,
      )
      const { dayType } = decision

      const returning = returnWindow(config.breaks, date) !== null
      const recommended = chooseRecommended(dayType, simulation, config, date, sports)

      // A quality day is the only slot a maximal test can have, and the plan
      // takes it rather than waiting for the athlete to volunteer. Every sport
      // that is due gets its own, because which one to test is the athlete's
      // choice exactly as which one to train is.
      const testable = dayType === 'KEY' && !simulation.testedThisWeek

      const options = sports.map((sport) => {
        const sportPhase = phases[sport]
        const test = testable
          ? thresholdTestDue(
              sport,
              completions,
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
          if (template) return buildSession(template, config, test.reason)
        }
        const candidates = candidatesFor(
          sport,
          dayType,
          sportPhase,
          budgetMinutes,
          ceilings,
          state.recentWorkouts,
        )
        const best = [...candidates].sort(
          (left, right) =>
            scoreTemplate(right, simulation, state, sportPhase, budgetMinutes, returning) -
            scoreTemplate(left, simulation, state, sportPhase, budgetMinutes, returning),
        )[0]
        if (!best) return null
        return buildSession(best, config, reasonFor(best, dayType, sportPhase, simulation, ceilings))
      }).filter((session): session is PlannedSession => session !== null)
      const strength = strengthFor(dayType, simulation, config)
      const chosen = options.find((session) => session.sport === recommended) ?? null

      const day: PlannedDay = {
        date,
        weekday: weekdayDe(date),
        dayType,
        phase,
        recommended,
        options,
        notes: notesFor(decision, state, simulation, config, dayIndex, date),
        optional: decision.optional,
        strength,
      }

      return {
        simulation: advance(
          simulation,
          chosen,
          options,
          strength !== null,
          addDays(state.today, dayIndex + 1),
          options.some((option) => option.template.measures === 'threshold'),
        ),
        plan: [...plan, day],
      }
    },
    { simulation: initSimulation(state, config), plan: [] },
  )

  return plan
}

/** Total step count, used by the UI to show a compact workout summary. */
export const stepCount = (template: WorkoutTemplate): number => flattenBlocks(template.blocks).length
