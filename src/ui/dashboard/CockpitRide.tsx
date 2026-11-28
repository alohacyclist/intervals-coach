import type { DashboardRide, RideTrace, SteadyStatus } from '../../coach/dashboard.ts'
import type { SteadyBlock, SteadyFinding, SteadyThresholds } from '../../coach/steady-block.ts'
import { t } from '../../coach/lang.ts'
import { CockpitTrace } from './CockpitTrace.tsx'
import { Better, Fact } from './Plot.tsx'
import { driftOf, num, pct, ruleHint, shortDate, statusLabel, toneOf, verdictSentence, where } from './model.ts'

const Meter = ({ label, value, share, tone }: { readonly label: string; readonly value: string; readonly share: number; readonly tone: 'ref' | 'warn' | 'calm' }) => (
  <div className="hud-stack hud-gap-s">
    <div className="hud-kv">
      <span className={tone === 'ref' ? 'hud-dim' : undefined}>{label}</span>
      <span className={`hud-mono hud-tone-${tone}`}>{value}</span>
    </div>
    <div className="hud-meter">
      <div className={`hud-fill-${tone}`} style={{ width: `${Math.min(100, share * 100).toFixed(1)}%` }} />
    </div>
  </div>
)

/** The rule as it is built: the two HR/W numbers it compares, side by side. */
const RuleMeters = ({ findings, block, thresholds }: { readonly findings: readonly SteadyFinding[]; readonly block: SteadyBlock | null; readonly thresholds: SteadyThresholds }) => {
  const pairs = findings.length > 0
    ? findings.map((f) => ({
        rule: f.rule,
        refLabel: f.rule === 'hrDrift' ? t('Erste Blockhälfte') : t`Basis aus ${f.referenceRides} Fahrten`,
        obsLabel: f.rule === 'hrDrift' ? t('Zweite Blockhälfte') : t('Diese Fahrt, erste Hälfte'),
        ref: f.referenceHrPerW,
        obs: f.observedHrPerW,
        dev: f.deviation,
        warn: true,
      }))
    : block
      ? [{ rule: 'hrDrift' as const, refLabel: t('Erste Blockhälfte'), obsLabel: t('Zweite Blockhälfte'), ref: block.firstHalfHrPerW, obs: block.secondHalfHrPerW, dev: driftOf(block), warn: false }]
      : []
  if (pairs.length === 0) return null
  const top = Math.max(...pairs.flatMap((p) => [p.ref, p.obs])) * 1.12
  return (
    <div className="hud-stack hud-gap">
      <span className="hud-cap">
        {t('Die Regel rechnet mit Puls pro Watt, bpm/W')}
        <Better way="down" />
      </span>
      {pairs.map((p) => (
        <div key={p.rule} className="hud-stack hud-gap-s">
          <Meter label={p.refLabel} value={num(p.ref, 3)} share={p.ref / top} tone="ref" />
          <Meter label={p.obsLabel} value={`${num(p.obs, 3)} · ${pct(p.dev)}`} share={p.obs / top} tone={p.warn ? 'warn' : 'calm'} />
          <span className="hud-fact__hint">{ruleHint(p.rule, thresholds)}</span>
        </div>
      ))}
    </div>
  )
}

type Props = {
  readonly ride: DashboardRide | null
  readonly trace: RideTrace | null
  readonly error: string | null
  readonly status: SteadyStatus | undefined
  readonly findings: readonly SteadyFinding[]
  readonly block: SteadyBlock | null
  readonly thresholds: SteadyThresholds
}

/** One ride in full: the verdict first, then the numbers behind it and the trace to check them against. */
export const RideFocus = ({ ride, trace, error, status, findings, block, thresholds }: Props) => {
  if (!ride) return <p className="hud-note">{t('Keine Fahrt gewählt')}</p>
  const warned = findings.length > 0
  const drawable = trace !== null && trace.minutes.length > 1
  return (
    <div className="hud-ride">
      <div className="hud-ride__main hud-stack hud-gap">
        <div className="hud-kv">
          <div className="hud-stack hud-gap-s">
            <span className="hud-title">{ride.name}</span>
            <span className="hud-cap">
              {shortDate(ride.date)} · {where(ride.indoor)}
              {ride.garminDevice ? ` · ${ride.garminDevice}` : ''}
            </span>
          </div>
          <span className={`hud-badge hud-badge--${toneOf(status, warned)}`}>{statusLabel(status, warned)}</span>
        </div>
        {drawable ? (
          <CockpitTrace rideId={ride.id} trace={trace} findings={findings} />
        ) : (
          <p className="hud-note" role="status">
            {error ?? (trace ? t('Keine Leistungs- und Pulsdaten in dieser Fahrt.') : t('Lese Messreihe…'))}
          </p>
        )}
      </div>
      <aside className="hud-ride__side hud-stack hud-gap-l">
        <p className="hud-sentence">{verdictSentence(status, findings, block, thresholds)}</p>
        <RuleMeters findings={findings} block={block} thresholds={thresholds} />
        <div className="hud-facts">
          <Fact label="NP W" value={ride.normalizedWatts === null ? '–' : num(ride.normalizedWatts)} hint={t('Wie hart die Fahrt war, Spitzen zählen stärker.')} />
          <Fact label="VI" value={ride.variabilityIndex === null ? '–' : num(ride.variabilityIndex, 2)} hint={t('Bis 1,05 gleichmäßig, nur dann vergleichbar.')} />
          <Fact
            label="EF"
            value={ride.efficiencyFactor === null ? '–' : num(ride.efficiencyFactor, 2)}
            better="up"
            hint={ride.efficiencyFactor === null ? t('Nur bei gleichmäßigen Fahrten.') : ride.indoor ? t('Vergleiche nur mit anderen Fahrten drinnen.') : t('Vergleiche nur mit anderen Fahrten draußen.')}
          />
        </div>
      </aside>
    </div>
  )
}
