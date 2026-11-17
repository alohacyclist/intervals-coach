import { useState } from 'react'
import type {
  DistanceForecast,
  Goal,
  GoalOption,
  RacePacing,
  SportStanding,
  StandingForecast,
  StandingInfluence,
  StandingQuality,
  StandingVerdict,
} from '../../coach/types.ts'
import { SPORT_LABELS } from '../../coach/types.ts'
import { addDays, diffDays, formatClock, formatSeconds } from '../../coach/dates.ts'
import { formatDistance } from '../../coach/format.ts'
import { locale, t } from '../../coach/lang.ts'
import { pushRacePlan } from '../api.ts'
import { SportIcon } from './SportIcon.tsx'
import { GoalAdjust } from './GoalAdjust.tsx'

/**
 * What the athlete could do today if it counted, per sport: the number first,
 * how far it can be leaned on, where it can be on race day as a range, and —
 * a tap away — what it rests on and what bends it. Estimates from training,
 * said as such on the card.
 */

const dayMonth = (date: string): string => `${date.slice(8, 10)}.${date.slice(5, 7)}.`
const fullDate = (date: string): string => `${dayMonth(date)}${date.slice(0, 4)}`
const decimal = (value: number, digits = 1): string =>
  value.toLocaleString(locale(), { maximumFractionDigits: digits })

const valueText = (standing: SportStanding, value: number): string =>
  standing.measure === 'ftp' ? `${Math.round(value)} W` : formatClock(value)

/** A step on the way to the forecast: signed, in the measure's unit. */
const deltaText = (standing: SportStanding, delta: number): string => {
  const sign = delta > 0 ? '+' : delta < 0 ? '−' : '±'
  return standing.measure === 'ftp'
    ? `${sign}${Math.abs(Math.round(delta))} W`
    : `${sign}${formatClock(Math.abs(Math.round(delta)))}`
}

/** Watts up is better; seconds down is better, and both read as a signed change. */
const changeText = (standing: SportStanding): string | null => {
  if (standing.change === null) return null
  if (standing.measure === 'ftp') {
    const watts = Math.round(standing.change)
    return t`${watts > 0 ? '+' : watts < 0 ? '−' : '±'}${Math.abs(watts)} W in 4 Wochen`
  }
  // A plus on a race time means slower, which a sign alone does not say.
  const seconds = Math.round(standing.change)
  if (seconds === 0) return t('Gleich wie vor 4 Wochen')
  return seconds < 0
    ? t`${formatClock(-seconds)} schneller als vor 4 Wochen`
    : t`${formatClock(seconds)} langsamer als vor 4 Wochen`
}

const VERDICT_MARK: Readonly<Record<StandingVerdict, string>> = {
  reached: '✓',
  'on-track': '↗',
  late: '!',
  stalled: '→',
}

const verdictText = (standing: SportStanding): string | null => {
  switch (standing.verdict) {
    case 'reached':
      return t('Ziel erreicht')
    case 'on-track':
      return standing.reachBy ? t`Bei diesem Trend ungefähr am ${fullDate(standing.reachBy)}` : null
    case 'late':
      return standing.reachBy ? t`Bei diesem Trend erst ungefähr am ${fullDate(standing.reachBy)}` : null
    case 'stalled':
      return t('Der Trend der letzten acht Wochen zeigt nicht zum Ziel')
    default:
      return null
  }
}

const QUALITY_TEXT = (quality: StandingQuality): string =>
  quality === 'solid'
    ? t('Aussagekraft: belastbar')
    : quality === 'limited'
      ? t('Aussagekraft: eingeschränkt')
      : t('Aussagekraft: noch kein Trend messbar')

const sourceText = (standing: SportStanding): string => {
  if (standing.source === 'eftp') return t('Geschätzte FTP (eFTP) von intervals.icu')
  if (standing.source === 'runs') return t('Aus Tempo und Puls deiner Läufe der letzten sechs Wochen')
  return standing.measure === 'ftp'
    ? t('Deine eingetragene FTP — für eine Schätzung fehlt die eFTP')
    : t('Aus deiner eingetragenen Schwellenpace — für eine Schätzung fehlen Läufe mit Puls')
}

const basisText = (standing: SportStanding): string | null => {
  const { used, considered, trendPoints } = standing.basis
  if (standing.source === 'runs' || (standing.measure === 'race' && considered > 0)) {
    return t`${used} von ${considered} Läufen der letzten 6 Wochen ausgewertet, ${trendPoints} Wochenwerte im Trend.`
  }
  if (standing.source === 'eftp') return t`${trendPoints} Wochenwerte der eFTP in den letzten 8 Wochen.`
  return null
}

const influenceText = (influence: StandingInfluence): string => {
  const amount = influence.amount ?? 0
  switch (influence.kind) {
    case 'no-resting-hr':
      return t('Kein Ruhepuls in intervals.icu (Wellness): ohne ihn lässt sich kein Lauf über den Puls lesen.')
    case 'no-max-hr':
      return t('Weder Maximalpuls noch Schwellen-HF hinterlegt: ohne sie lässt sich kein Lauf über den Puls lesen.')
    case 'max-hr-from-lthr':
      return t('Maximalpuls aus der Schwellen-HF geschätzt. Ein Maximalpuls im Lauf-Profil auf intervals.icu macht die Schätzung genauer.')
    case 'hilly-runs':
      return t`${amount} Läufe zu hügelig (über 20 Hm/km) — bleiben außen vor, der Anstieg würde sie langsamer aussehen lassen.`
    case 'runs-without-hr':
      return t`${amount} Läufe ohne Puls.`
    case 'short-runs':
      return t`${amount} Läufe kürzer als 20 min oder 3 km.`
    case 'easy-runs':
      return t`${amount} Läufe so locker (unter 50 % der Pulsreserve), dass der Puls wenig über die Form sagt.`
    case 'no-hard-rides':
      return influence.amount === undefined
        ? t('Keine harte Einheit auf dem Rad in den letzten Wochen: ohne harte Anstrengungen kann die eFTP nur stehen bleiben oder sinken. Das ist kein Formverlust.')
        : t`Seit ${amount} Tagen keine harte Einheit auf dem Rad: ohne harte Anstrengungen kann die eFTP nur stehen bleiben oder sinken. Das ist kein Formverlust.`
    case 'load-rising':
      return t`Deine Fitness (CTL) ist in 8 Wochen um ${amount} gestiegen. Die Schätzung folgt dem mit Verzögerung.`
    case 'load-falling':
      return t`Deine Fitness (CTL) ist in 8 Wochen um ${amount} gesunken — weniger Training oder eine Pause.`
    case 'bike-aerobic-up':
      return t`Am Rad bringst du auf ruhigen Fahrten ${decimal(amount)} % mehr Watt pro Herzschlag als vor vier Wochen: die Ausdauer wächst. Wo Läufe fehlen, stützt das die Prognose.`
    case 'bike-aerobic-down':
      return t`Am Rad ${decimal(amount)} % weniger Watt pro Herzschlag als vor vier Wochen — Müdigkeit, Hitze oder weniger Grundlage.`
  }
}

const trainingText = (standing: SportStanding): string => {
  const { ctl, ctlChange, weeklyHours, weeklyKm, longestKm, hardSessions } = standing.training
  const change = `${ctlChange > 0 ? '+' : ctlChange < 0 ? '−' : '±'}${Math.abs(ctlChange)}`
  return standing.sport === 'Run'
    ? t`Fitness (CTL) ${ctl} (${change} in 8 Wochen) · ${decimal(weeklyKm ?? 0)} km und ${decimal(weeklyHours)} h pro Woche · längster Lauf ${decimal(longestKm ?? 0)} km · ${hardSessions} harte Einheiten in 4 Wochen`
    : t`Fitness (CTL) ${ctl} (${change} in 8 Wochen) · ${decimal(weeklyHours)} h pro Woche · ${hardSessions} harte Einheiten in 4 Wochen`
}

const meaningText = (standing: SportStanding): string =>
  standing.measure === 'ftp'
    ? t('Die eFTP schätzt intervals.icu aus deinen härtesten Anstrengungen. Sie steigt nur mit harten Einheiten oder Tests; in einer ruhigen Phase bleibt sie stehen oder sinkt, auch wenn die Ausdauer wächst. Belastbar mit einer harten Einheit in den letzten vier Wochen und sechs Wochenwerten.')
    : t('Belastbar ab sechs ausgewerteten Läufen in sechs Wochen und sechs Wochenwerten. Jeder Wert liest die Läufe der sechs Wochen davor, deshalb zeigt er Fortschritt erst mit Verzögerung. Hitze, Pulsanstieg im Lauf und müde Beine lassen einen Lauf langsamer aussehen — darum zählt das obere Viertel der Läufe, nicht der Durchschnitt.')

const rangeText = (standing: SportStanding, forecast: StandingForecast): string =>
  standing.measure === 'ftp'
    ? `${Math.round(forecast.worst)}–${Math.round(forecast.best)} W`
    : `${formatClock(forecast.best)}–${formatClock(forecast.worst)}`

const forecastTitle = (standing: SportStanding, forecast: StandingForecast): string => {
  if (standing.measure === 'ftp') return t`Prognose für den ${fullDate(forecast.date)}`
  if (standing.goal?.date === forecast.date) {
    return forecast.tapered
      ? t`Prognose Renntag ${fullDate(forecast.date)}, mit Taper`
      : t`Prognose Renntag ${fullDate(forecast.date)}, ohne Taper`
  }
  return t`Mit Taper ab heute, am ${fullDate(forecast.date)}`
}

const CHANCE_MARK: Readonly<Record<NonNullable<StandingForecast['goalChance']>, string>> = {
  likely: '✓',
  possible: '↗',
  'out-of-reach': '!',
}

const chanceText = (chance: NonNullable<StandingForecast['goalChance']>): string =>
  chance === 'likely'
    ? t('Dein Ziel liegt im wahrscheinlichen Bereich.')
    : chance === 'possible'
      ? t('Dein Ziel ist möglich — mit einem Block, der anschlägt, und einem guten Tag.')
      : t('Dein Ziel liegt jenseits des besten Falls.')

const rangeMethod = (standing: SportStanding): string =>
  standing.measure === 'ftp'
    ? t('Bester Fall: ein Block, der anschlägt. Wahrscheinlich: dein Trend, höchstens so schnell wie üblich (etwa 2,5 % im Monat); ohne belastbaren Trend weniger. Schlechtester Fall: ein fallender Trend läuft halb so steil weiter. Dazu die Unsicherheit der heutigen Schätzung.')
    : t('Bester Fall: ein Block, der anschlägt, und 3 % durch den Taper. Wahrscheinlich: dein Trend, höchstens so schnell wie üblich (etwa ein VDOT-Punkt in sechs Wochen), und 2 % durch den Taper. Schlechtester Fall: ein fallender Trend läuft halb so steil weiter, 1 % durch den Taper. Dazu die Unsicherheit der heutigen Schätzung (1,5–4 % je nach Aussagekraft). Für Halbmarathon und Marathon zählen Wochenkilometer und der längste Lauf: fehlen sie, kostet das bis zu 2 bzw. 10 %.')

// -------------------------------------------------------------------- chart

type Point = { readonly date: string; readonly value: number }
type HoverPoint = Point & { readonly range?: { readonly best: number; readonly worst: number } }

/**
 * The weeks behind as a line, the weeks ahead as a corridor from worst to best
 * case with the likely way through it, and the goal across both.
 */
const Trend = ({ standing }: { readonly standing: SportStanding }) => {
  const [hover, setHover] = useState<HoverPoint | null>(null)
  const { series, goal, forecast } = standing
  const corridor = forecast?.corridor ?? []
  const today = series.at(-1)?.date ?? corridor[0]?.date
  if (today === undefined || (series.length < 2 && corridor.length < 2)) return null

  const first = series[0]?.date ?? today
  const end = corridor.at(-1)?.date ?? today
  const total = Math.max(1, diffDays(first, end))
  const ahead = diffDays(today, end)

  const values = [
    ...series.map((point) => point.value),
    ...corridor.flatMap((point) => [point.best, point.worst]),
    ...(goal ? [goal.value] : []),
  ]
  const low = Math.min(...values)
  const high = Math.max(...values)
  const pad = Math.max((high - low) * 0.12, standing.measure === 'ftp' ? 3 : 15)
  const [bottom, top] = [low - pad, high + pad]
  // Faster is better: a run's chart puts the shorter time higher, so up means better in both.
  const better = standing.measure === 'ftp' ? 1 : -1
  const yOf = (value: number) => {
    const share = (value - bottom) / (top - bottom)
    return Math.round((better === 1 ? 1 - share : share) * 1000) / 10
  }
  const xOf = (date: string) => Math.round((diffDays(first, date) / total) * 10000) / 10
  const line = (points: readonly Point[]) => points.map((point) => `${xOf(point.date)},${yOf(point.value)}`).join(' ')
  const band = [
    ...corridor.map((point) => `${xOf(point.date)},${yOf(point.best)}`),
    ...[...corridor].reverse().map((point) => `${xOf(point.date)},${yOf(point.worst)}`),
  ].join(' ')
  const likely = corridor.map((point) => ({ date: point.date, value: point.likely }))
  const last = series.at(-1) ?? likely[0]!

  const candidates: readonly HoverPoint[] = [
    ...series,
    ...corridor.slice(series.length > 0 ? 1 : 0).map((point) => ({
      date: point.date,
      value: point.likely,
      range: { best: point.best, worst: point.worst },
    })),
  ]
  const pick = (fraction: number) => {
    const date = addDays(first, Math.round(fraction * total))
    const nearest = candidates.reduce((best, point) =>
      Math.abs(diffDays(point.date, date)) < Math.abs(diffDays(best.date, date)) ? point : best,
    )
    setHover(nearest)
  }
  const hoverText = (point: HoverPoint): string =>
    point.range
      ? t`${valueText(standing, point.value)} (${valueText(standing, better === 1 ? point.range.worst : point.range.best)}–${valueText(standing, better === 1 ? point.range.best : point.range.worst)})`
      : valueText(standing, point.value)

  return (
    <>
      <div
        className="plot standing__plot"
        onPointerMove={(event) => {
          const box = event.currentTarget.getBoundingClientRect()
          pick(Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)))
        }}
        onPointerLeave={() => setHover(null)}
      >
        {goal && (
          <span className="plot__tick readout standing__goal-tick" style={{ top: `${yOf(goal.value)}%` }}>
            {t('Ziel')}
          </span>
        )}
        <svg
          className="plot__svg"
          viewBox="0 0 1000 100"
          preserveAspectRatio="none"
          role="img"
          aria-label={
            forecast
              ? t`${SPORT_LABELS[standing.sport]}: heute ${valueText(standing, last.value)}, am ${dayMonth(forecast.date)} wahrscheinlich ${valueText(standing, forecast.likely)}, zwischen ${rangeText(standing, forecast)}.`
              : t`${SPORT_LABELS[standing.sport]}: von ${valueText(standing, series[0]!.value)} am ${dayMonth(first)} auf ${valueText(standing, last.value)} heute.`
          }
        >
          {corridor.length > 1 && <polygon className="standing__corridor" points={band} />}
          {goal && (
            <line
              x1="0"
              y1={yOf(goal.value)}
              x2="1000"
              y2={yOf(goal.value)}
              stroke="var(--faint)"
              strokeWidth="1"
              strokeDasharray="6 5"
              vectorEffect="non-scaling-stroke"
            />
          )}
          {ahead > 0 && (
            <line
              x1={xOf(today)}
              y1="0"
              x2={xOf(today)}
              y2="100"
              stroke="var(--rule-soft)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          )}
          {likely.length > 1 && (
            <polyline
              points={line(likely)}
              fill="none"
              stroke="var(--data)"
              strokeWidth="2"
              strokeDasharray="2 5"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          )}
          {series.length > 1 && (
            <polyline
              points={line(series)}
              fill="none"
              stroke="var(--data)"
              strokeWidth="2"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          )}
          {hover && (
            <line
              x1={xOf(hover.date)}
              y1="0"
              x2={xOf(hover.date)}
              y2="100"
              stroke="var(--faint)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
        {/* Markers stay round however the plot is stretched, so they are HTML, not SVG. */}
        <i className="standing__dot" style={{ left: `${xOf(today) / 10}%`, top: `${yOf(last.value)}%` }} />
        {hover && (
          <>
            <i
              className="standing__dot standing__dot--hover"
              style={{ left: `${xOf(hover.date) / 10}%`, top: `${yOf(hover.value)}%` }}
            />
            <span
              className="standing__tip readout"
              style={{ left: `${Math.min(70, Math.max(0, xOf(hover.date) / 10 - 10))}%` }}
            >
              <span>{dayMonth(hover.date)}</span>
              <span>{hoverText(hover)}</span>
            </span>
          </>
        )}
      </div>
      <div className="chart__axis readout standing__axis">
        <span>{dayMonth(first)}</span>
        <span>{t('heute')}</span>
        {ahead > 0 && <span>{dayMonth(end)}</span>}
      </div>
    </>
  )
}

// ----------------------------------------------------------------- forecast

const Forecast = ({ standing, forecast }: { readonly standing: SportStanding; readonly forecast: StandingForecast }) => {
  const { parts } = forecast
  return (
    <div className="standing__forecast">
      <p className="standing__forecast-title">{forecastTitle(standing, forecast)}</p>
      <p className="standing__forecast-range readout">
        {rangeText(standing, forecast)}
        <span>{t`wahrscheinlich ${valueText(standing, forecast.likely)}`}</span>
      </p>
      {forecast.goalChance && standing.goal && (
        <p className={`standing__verdict standing__chance--${forecast.goalChance}`}>
          <span aria-hidden="true">{CHANCE_MARK[forecast.goalChance]}</span> {chanceText(forecast.goalChance)}
        </p>
      )}
      <details className="disclose standing__more">
        <summary>{t('So kommt die Prognose zustande')}</summary>
        <dl className="standing__parts readout">
          <dt>{t('Stand heute')}</dt>
          <dd>{valueText(standing, parts.today)}</dd>
          <dt>{t('Trend bis dahin')}</dt>
          <dd>{deltaText(standing, parts.trend)}</dd>
          {forecast.tapered && (
            <>
              <dt>{t('Taper')}</dt>
              <dd>{deltaText(standing, parts.taper)}</dd>
            </>
          )}
          {parts.endurance !== 0 && (
            <>
              <dt>{t('Ausdauer (Wochenkilometer, langer Lauf)')}</dt>
              <dd>{deltaText(standing, parts.endurance)}</dd>
            </>
          )}
          <dt>{t('Wahrscheinlich')}</dt>
          <dd>{valueText(standing, forecast.likely)}</dd>
        </dl>
        <p className="standing__explain">{rangeMethod(standing)}</p>
      </details>
    </div>
  )
}

const DISTANCE_NAME = (km: number): string =>
  km > 40 ? t('Marathon') : km > 20 ? t('Halbmarathon') : formatDistance('Run', km)

const Distances = ({ distances }: { readonly distances: readonly DistanceForecast[] }) => (
  <details className="disclose standing__more">
    <summary>{t('Alle Distanzen, mit Taper ab heute')}</summary>
    <table className="standing__distances readout">
      <tbody>
        {distances.map((entry) => (
          <tr key={entry.km}>
            <th scope="row">{DISTANCE_NAME(entry.km)}</th>
            <td>{formatClock(entry.likely)}</td>
            <td>{`${formatClock(entry.best)}–${formatClock(entry.worst)}`}</td>
          </tr>
        ))}
      </tbody>
    </table>
    <p className="standing__explain">
      {t('Dieselbe Form über jede Distanz. Halbmarathon und Marathon tragen den Abzug für fehlende Wochenkilometer und lange Läufe — der Marathon fällt deshalb oft langsamer aus, als die kurzen Zeiten versprechen.')}
    </p>
  </details>
)

// ------------------------------------------------------------------- pacing

const kmText = (km: number): string => decimal(km)

const pacingBasisText = (pacing: RacePacing, goal: Goal | undefined): string =>
  pacing.basis === 'forecast-goal-out-of-reach'
    ? t`Gepaced auf die wahrscheinliche Zeit statt auf dein Ziel${goal ? ` ${formatClock(goal.targetValue)}` : ''}: zu schnell angegangen, kostet es hinten mehr, als es vorne bringt.`
    : pacing.basis === 'forecast-goal-safe'
      ? t`Gepaced auf die wahrscheinliche Zeit — dein Ziel${goal ? ` ${formatClock(goal.targetValue)}` : ''} ist damit sicher drin.`
      : t('Gepaced auf dein Ziel.')

const SEGMENT_TEXT = (kind: RacePacing['segments'][number]['kind']): string =>
  kind === 'start' ? t('Start kontrolliert') : kind === 'finish' ? t('Finish: was übrig ist') : t('Gleichmäßig')

const Pacing = ({ pacing, goal }: { readonly pacing: RacePacing; readonly goal: Goal | undefined }) => {
  const [state, setState] = useState<'idle' | 'busy' | 'sent' | 'already' | 'failed'>('idle')
  const [error, setError] = useState<string | null>(null)
  const send = async () => {
    if (!goal) return
    setState('busy')
    setError(null)
    try {
      const result = await pushRacePlan(goal.id)
      setState(result.alreadyScheduled ? 'already' : 'sent')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('Nicht gesendet'))
      setState('failed')
    }
  }
  return (
    <details className="disclose standing__more">
      <summary>{t`Pacing-Plan · ${formatClock(pacing.targetSeconds)}`}</summary>
      <p className="standing__explain">{pacingBasisText(pacing, goal)}</p>
      <table className="standing__distances readout">
        <tbody>
          {pacing.segments.map((segment) => (
            <tr key={segment.fromKm}>
              <th scope="row">{t`km ${kmText(segment.fromKm)}–${kmText(segment.toKm)}`}</th>
              <td>{`${formatSeconds(segment.secPerKm)}/km`}</td>
              <td>{SEGMENT_TEXT(segment.kind)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {goal?.targetDate && (
        <div className="standing__send">
          <button type="button" disabled={state === 'busy'} onClick={() => void send()}>
            {t('Auf die Uhr schicken')}
          </button>
          <span className="standing__explain">
            {state === 'sent'
              ? t`Steht am ${fullDate(goal.targetDate)} im Kalender auf intervals.icu, von dort geht es mit der Garmin-Verbindung auf die Uhr.`
              : state === 'already'
                ? t('Dieser Plan steht schon im Kalender.')
                : state === 'failed'
                  ? error
                  : t('Als Einheit am Renntag: jeder Abschnitt mit seiner Pace-Spanne, die Uhr zählt die Kilometer.')}
          </span>
        </div>
      )}
    </details>
  )
}

// -------------------------------------------------------------------- panel

const Basis = ({ standing }: { readonly standing: SportStanding }) => {
  const basis = basisText(standing)
  return (
    <details className="disclose standing__more">
      <summary>{t('Worauf beruht das?')}</summary>
      <p className="standing__explain">{sourceText(standing)}</p>
      {basis && <p className="standing__explain">{basis}</p>}
      {standing.influences.length > 0 && (
        <ul className="standing__influences">
          {standing.influences.map((influence) => (
            <li key={influence.kind}>{influenceText(influence)}</li>
          ))}
        </ul>
      )}
      <p className="standing__explain">
        <strong>{t('Training: ')}</strong>
        {trainingText(standing)}
      </p>
      <p className="standing__explain">
        <strong>{t('Wann ist das aussagekräftig? ')}</strong>
        {meaningText(standing)}
      </p>
    </details>
  )
}

type PanelProps = {
  readonly standing: SportStanding
  /** The goal shown, with its ways out where it will not happen as set. */
  readonly goal: Goal | undefined
  readonly option: GoalOption | undefined
  readonly onAdjusted: () => void
}

const SportPanel = ({ standing, goal, option, onAdjusted }: PanelProps) => {
  const change = changeText(standing)
  // A goal with a date is judged by the range on its day; one without, by the trend.
  const verdict = standing.goal?.date && standing.forecast?.goalChance ? null : verdictText(standing)
  const measure =
    standing.measure === 'ftp' ? 'FTP' : formatDistance(standing.sport, standing.distanceKm ?? 10)
  return (
    <article className="standing__sport">
      <div className="standing__label">
        <SportIcon sport={standing.sport} />
        <span>{SPORT_LABELS[standing.sport]}</span>
        <span aria-hidden="true">·</span>
        <span>{measure}</span>
      </div>
      <p className="standing__value readout">
        {standing.source === 'setting' ? '' : '≈ '}
        {valueText(standing, standing.current)}
        {standing.goal && (
          <span className="standing__target">
            {t`Ziel ${valueText(standing, standing.goal.value)}`}
            {standing.goal.date ? t` bis ${fullDate(standing.goal.date)}` : ''}
          </span>
        )}
      </p>
      <p className={`standing__quality standing__quality--${standing.quality}`}>{QUALITY_TEXT(standing.quality)}</p>
      {change && <p className="standing__change readout">{change}</p>}
      <Trend standing={standing} />
      {verdict && standing.verdict && (
        <p className={`standing__verdict standing__verdict--${standing.verdict}`}>
          <span aria-hidden="true">{VERDICT_MARK[standing.verdict]}</span> {verdict}
        </p>
      )}
      {standing.forecast && <Forecast standing={standing} forecast={standing.forecast} />}
      {goal && option && <GoalAdjust goal={goal} option={option} onAdjusted={onAdjusted} />}
      {standing.pacing && <Pacing pacing={standing.pacing} goal={goal} />}
      {standing.distances.length > 0 && <Distances distances={standing.distances} />}
      <Basis standing={standing} />
    </article>
  )
}

type Props = {
  readonly standing: readonly SportStanding[]
  readonly goals: readonly Goal[]
  readonly options: readonly GoalOption[]
  readonly onAdjusted: () => void
}

export const StandingCard = ({ standing, goals, options, onAdjusted }: Props) => {
  if (standing.length === 0) return null
  return (
    <section className="standing">
      <div className="totals__head">
        <h2>{t('Leistungsstand')}</h2>
        <span className="totals__span readout">{t('geschätzt, nicht getestet')}</span>
      </div>
      <div className="standing__grid">
        {standing.map((entry) => (
          <SportPanel
            key={entry.sport}
            standing={entry}
            goal={goals.find((goal) => goal.id === entry.goal?.id)}
            option={options.find((option) => option.goalId === entry.goal?.id)}
            onAdjusted={onAdjusted}
          />
        ))}
      </div>
      <p className="standing__note">
        {t('Ein Test oder ein Rennen misst genauer als jede Schätzung.')}
      </p>
    </section>
  )
}
