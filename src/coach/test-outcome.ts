import type { MeasuredEffort } from './test-result.ts'
import type { ActivityStreams } from './trace.ts'
import type { Sport, SportThreshold, TestOutcome } from './types.ts'
import { HELD_PERCENT, cssFromTest, thresholdFromStreams } from './test-result.ts'
import { formatSeconds } from './dates.ts'
import { t } from './lang.ts'

/**
 * What a completed threshold test means, said under the session itself: the
 * athlete just went all out and wants to know what came of it, not find out
 * later from a card further down the plan.
 */

/** Below this the new value moves no target noticeably: a confirmation, not a change. */
const NOTICEABLE_PERCENT = 1

const valueOf = (threshold: SportThreshold): number => {
  if (threshold.metric === 'power') return threshold.ftp
  if (threshold.metric === 'pace') return threshold.thresholdSecPerKm
  return threshold.cssSecPer100m
}

const render = (metric: SportThreshold['metric'], value: number): string =>
  metric === 'power' ? `${Math.round(value)} W` : `${formatSeconds(value)}${metric === 'swimPace' ? '/100m' : '/km'}`

/** Power rises when you improve; pace falls. Both come out as a gain here. */
const gainPercent = (metric: SportThreshold['metric'], configured: number, measured: number): number => {
  const raw = ((measured - configured) / configured) * 100
  return metric === 'power' ? raw : -raw
}

const verdict = (gain: number): string => {
  const amount = Math.abs(gain).toFixed(1)
  if (Math.abs(gain) < NOTICEABLE_PERCENT) {
    return t('Weniger als 1 % Unterschied: deine Vorgaben passen, spürbar ändert sich nichts.')
  }
  return gain > 0
    ? t`${amount} % besser. Übernimm den Wert, sonst sind deine Vorgaben ab jetzt zu leicht.`
    : t`${amount} % schwächer. Ein Test kann an einem schlechten Tag liegen: warst du frisch, übernimm ihn, sonst wiederhole ihn in zwei, drei Wochen.`
}

const outcome = (
  sport: Sport,
  threshold: SportThreshold,
  measured: number,
  reading: string,
): TestOutcome => {
  const configured = valueOf(threshold)
  const gain = gainPercent(threshold.metric, configured, measured)
  return {
    sport,
    metric: threshold.metric,
    configured,
    measured,
    // Adopting rounds, so only a value that differs after rounding is worth a button.
    adoptable: Math.round(measured) !== Math.round(configured),
    message: `${reading} ${verdict(gain)}`,
  }
}

/**
 * The outcome of a threshold test, from its recording — or, for the pool, from
 * the 400 and the 200 intervals.icu detected. Null when there is nothing to read
 * at all; a test that was not held says so instead of yielding a number.
 */
export const testOutcome = (
  sport: Sport,
  threshold: SportThreshold,
  streams: ActivityStreams | null,
  efforts: readonly MeasuredEffort[],
): TestOutcome | null => {
  if (threshold.metric === 'swimPace') {
    const css = cssFromTest(efforts)
    if (css === null) return null
    return outcome(
      sport,
      threshold,
      css,
      t`400 m und 200 m ergeben eine CSS von ${render('swimPace', css)}, eingestellt sind ${render('swimPace', threshold.cssSecPer100m)}.`,
    )
  }

  const test = streams ? thresholdFromStreams(sport, streams, threshold) : null
  if (!test) return null
  if (test.percent < HELD_PERCENT) {
    return {
      sport,
      metric: threshold.metric,
      configured: valueOf(threshold),
      measured: null,
      adoptable: false,
      message: t`Deine besten 20 Minuten lagen bei ${test.percent} % der Schwelle. Das war kein durchgezogener Test, daraus lese ich keinen neuen Wert ab.`,
    }
  }
  const average = render(test.metric, test.average)
  const now = render(test.metric, valueOf(threshold))
  const next = render(test.metric, test.value)
  return outcome(
    sport,
    threshold,
    test.value,
    test.metric === 'power'
      ? t`20 min im Schnitt ${average}, das ergibt eine FTP von ${next}. Eingestellt sind ${now}.`
      : t`20 min im Schnitt ${average}, das ergibt eine Schwellenpace von ${next}. Eingestellt sind ${now}.`,
  )
}
