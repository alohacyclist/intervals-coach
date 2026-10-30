import type {
  CoachConfig,
  PlannedSession,
  SessionMinutes,
  SessionTier,
  SessionVariant,
  SportThreshold,
  WorkoutTemplate,
} from './types.ts'
import { describeBlocks, describeWorkout, toHumanSteps } from './format.ts'
import { defaultThreshold, thresholdFor } from './thresholds.ts'
import { profileOf } from './profile.ts'
import { MIN_SAVING_MINUTES, lengthen, renameShortened, shorten, totalSeconds } from './variant.ts'
import { goalForSport } from './phase.ts'

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
      name: template.name,
      minutes: template.minutes,
      load: template.load,
      blocks: template.blocks,
      description: describeWorkout(template, reason),
      humanSteps: toHumanSteps(template.blocks, threshold),
      profile: profileOf(template.blocks, threshold),
      cuts: [],
    }
  }

  const { blocks, cuts } = shorten(template.blocks, threshold, targetMinutes / template.minutes)
  const shortSec = totalSeconds(blocks, threshold)
  // The authored duration stays authoritative; the trimmed one scales off it.
  return {
    tier,
    name: renameShortened(template.name, template.blocks, blocks, threshold),
    minutes: Math.round((template.minutes * shortSec) / fullSec),
    load: Math.round((template.load * shortSec) / fullSec),
    blocks,
    description: describeBlocks(blocks, `${template.coachNote}\n\n${SHORT_NOTE}`, reason),
    humanSteps: toHumanSteps(blocks, threshold),
    profile: profileOf(blocks, threshold),
    cuts,
  }
}

const STRETCH_NOTE =
  'Verlängerte Fassung: Intervalle und Zielwerte bleiben, wie sie sind — die zusätzliche Zeit ist lockere Grundlage, kein zweiter Reiz.'

/** The longest version on a day with more time than usual, where the session allows it. */
const stretchedFor = (
  template: WorkoutTemplate,
  threshold: SportThreshold,
  reason: string,
  targetMinutes: number,
): SessionVariant | null => {
  const stretch = lengthen(template, threshold, targetMinutes - template.minutes)
  if (!stretch) return null
  return {
    tier: 'extra',
    name: stretch.name,
    minutes: stretch.minutes,
    load: stretch.load,
    blocks: stretch.blocks,
    description: describeBlocks(stretch.blocks, `${template.coachNote}\n\n${STRETCH_NOTE}`, reason),
    humanSteps: toHumanSteps(stretch.blocks, threshold),
    profile: profileOf(stretch.blocks, threshold),
    cuts: [],
    added: stretch.added,
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
  stretchTo: number | undefined,
): readonly SessionVariant[] => {
  // A reference session exists to be compared with itself, and a race is as long
  // as the race. Trimmed, either would be a different session, so both come whole.
  if (template.benchmark === true || template.occasion === 'race') {
    const whole = variantFor('max', template.minutes, template, threshold, reason)
    return whole ? [whole] : []
  }

  const tiers: readonly (keyof SessionMinutes)[] = ['min', 'normal', 'max']
  // Past every configured budget, so it comes last and the full session stays on offer below it.
  // A session picked for the longer day may already fill it, and is then offered whole.
  const beyond = (variant: SessionVariant | null) => (variant && variant.minutes > minutes.max ? variant : null)
  const extra =
    stretchTo === undefined
      ? null
      : ((stretchTo > template.minutes ? stretchedFor(template, threshold, reason, stretchTo) : null) ??
        beyond(variantFor('extra', stretchTo, template, threshold, reason)))
  const built = [...tiers.map((tier) => variantFor(tier, minutes[tier], template, threshold, reason)), extra]
    .filter((variant): variant is SessionVariant => variant !== null)

  return built.filter((variant, index) => {
    const next = built[index + 1]
    return next === undefined || next.minutes - variant.minutes >= MIN_SAVING_MINUTES
  })
}

/** Where a note names the athlete's own goal: the FTP they are working towards. */
const FTP_GOAL = '{ftp-ziel}'

/**
 * A note in the athlete's terms. "Brot-und-Butter für FTP 300" is right for the
 * athlete aiming at 300 W and wrong for everyone else, so the library leaves
 * the goal open and it is filled here — with the threshold itself where no
 * watt goal is set.
 */
export const personalNote = (note: string, config: CoachConfig, date: string): string => {
  if (!note.includes(FTP_GOAL)) return note
  const goal = goalForSport(
    config.goals.filter((entry) => entry.kind === 'ftp'),
    'Ride',
    date,
  )
  return note.replaceAll(FTP_GOAL, goal ? `FTP ${Math.round(goal.targetValue)}` : 'die Schwelle')
}

export const buildSession = (
  generic: WorkoutTemplate,
  config: CoachConfig,
  reason: string,
  date: string,
  /** Minutes the athlete has today beyond the usual, already capped to what they can take. */
  stretchTo?: number,
): PlannedSession => {
  const template = { ...generic, coachNote: personalNote(generic.coachNote, config, date) }
  const threshold = thresholdFor(config.profile, template.sport) ?? defaultThreshold(template.sport)
  return {
    sport: template.sport,
    template,
    reason,
    description: describeWorkout(template, reason),
    humanSteps: toHumanSteps(template.blocks, threshold),
    variants: buildVariants(template, threshold, reason, config.profile.sessionMinutes, stretchTo),
  }
}
