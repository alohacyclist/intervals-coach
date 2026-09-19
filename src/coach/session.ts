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
import { MIN_SAVING_MINUTES, shorten, totalSeconds } from './variant.ts'

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
      profile: profileOf(template.blocks, threshold),
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
    profile: profileOf(blocks, threshold),
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
  // A reference session exists to be compared with itself, and a race is as long
  // as the race. Trimmed, either would be a different session, so both come whole.
  if (template.benchmark === true || template.occasion === 'race') {
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

export const buildSession = (
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
