import type {
  Block,
  Equipment,
  StrengthExercise,
  StrengthPhase,
  IntensityClass,
  Repeat,
  Sport,
  Step,
  Stimulus,
  StrengthSuggestion,
  WorkoutTemplate,
} from './types.ts'
import { REST_TARGET } from './format.ts'
import { perLang, t } from './lang.ts'

const step = (duration: string, target: string, extra: Partial<Step> = {}): Step => ({
  kind: 'step',
  duration,
  target,
  ...extra,
})

const repeat = (times: number, steps: readonly Step[]): Repeat => ({ kind: 'repeat', times, steps })

const warmupBike = (duration: string): Step =>
  step(duration, 'ramp 50%-72%', { label: t('Einfahren') })

const cooldownBike = (duration: string, target: string): Step =>
  step(duration, target, { label: t('Ausfahren') })

const cooldownRun = (duration: string, target: string): Step =>
  step(duration, target, { label: t('Auslaufen') })

const cooldownSwim = (duration: string, target: string): Step =>
  step(duration, target, { label: t('Ausschwimmen') })

const BIKE: readonly WorkoutTemplate[] = perLang(() => [
  {
    id: 'bike-zrl-openers',
    sport: 'Ride',
    stimulus: 'ENDURANCE',
    name: t('Vorbelastung vor dem Rennen'),
    minutes: 50,
    load: 40,
    phases: ['BASE', 'BUILD', 'SPECIFIC', 'TAPER', 'RECOVERY'],
    occasion: 'pre-race',
    coachNote:
      t('Beine wach machen, nicht müde: die Antritte kurz und knackig, alles dazwischen wirklich locker.'),
    blocks: [
      warmupBike('10m'),
      step('15m', '60-70%'),
      repeat(3, [step('30s', '110-120%', { cadence: '95-105rpm' }), step('3m', '55-65%')]),
      step('8m', '60-70%'),
      cooldownBike('6m', '55%'),
    ],
  },
  {
    id: 'bike-vo2-5x4',
    family: 'bike-vo2',
    level: 2,
    sport: 'Ride',
    stimulus: 'VO2',
    name: 'VO2max 5x4min',
    minutes: 65,
    load: 82,
    phases: ['BUILD', 'SPECIFIC'],
    coachNote: t('Der stärkste Hebel für die FTP, wenn die Grundlage steht. Letztes Intervall darf hart sein, aber vollständig.'),
    blocks: [
      warmupBike('15m'),
      repeat(5, [step('4m', '110-115%', { cadence: '90-100rpm' }), step('4m', '50%')]),
      cooldownBike('10m', '55%'),
    ],
  },
  {
    id: 'bike-vo2-3040',
    sport: 'Ride',
    stimulus: 'VO2',
    name: 'VO2max 3x6x40/20',
    minutes: 55,
    load: 72,
    phases: ['BUILD', 'SPECIFIC'],
    coachNote: t('Hohe Zeit bei VO2max ohne die mentale Last langer Intervalle. Gut nach knappem Schlaf.'),
    blocks: [
      warmupBike('15m'),
      repeat(6, [step('40s', '125%', { cadence: '95-105rpm' }), step('20s', '50%')]),
      step('4m', '50%'),
      repeat(6, [step('40s', '125%', { cadence: '95-105rpm' }), step('20s', '50%')]),
      step('4m', '50%'),
      repeat(6, [step('40s', '125%', { cadence: '95-105rpm' }), step('20s', '50%')]),
      cooldownBike('8m', '55%'),
    ],
  },
  {
    id: 'bike-thr-3x12',
    family: 'bike-threshold',
    level: 2,
    sport: 'Ride',
    stimulus: 'THRESHOLD',
    name: t('Schwelle 3x12min'),
    minutes: 74,
    load: 88,
    phases: ['BASE', 'BUILD', 'SPECIFIC'],
    coachNote: t('Brot-und-Butter für {ftp-ziel}. Zielbereich exakt halten, nicht überziehen.'),
    blocks: [
      warmupBike('15m'),
      repeat(3, [step('12m', '97-102%', { cadence: '85-95rpm' }), step('5m', '50%')]),
      cooldownBike('8m', '55%'),
    ],
  },
  {
    id: 'bike-thr-2x20',
    family: 'bike-threshold',
    level: 3,
    sport: 'Ride',
    stimulus: 'THRESHOLD',
    name: t('Schwelle 2x20min'),
    minutes: 78,
    load: 95,
    phases: ['BUILD', 'SPECIFIC'],
    coachNote: t('Der klassische FTP-Test-Vorbereiter. Schaffst du 2x20 bei 100%, ist die FTP reif für ein Update.'),
    blocks: [
      warmupBike('15m'),
      repeat(2, [step('20m', '96-100%', { cadence: '85-95rpm' }), step('8m', '50%')]),
      cooldownBike('7m', '55%'),
    ],
  },
  {
    id: 'bike-ou-4x9',
    sport: 'Ride',
    stimulus: 'THRESHOLD',
    name: 'Over-Under 4x9min',
    minutes: 75,
    load: 92,
    phases: ['SPECIFIC'],
    coachNote: t('Laktat-Toleranz an der Schwelle. Die Unders sind Erholung, nicht Pause — Druck halten.'),
    blocks: [
      warmupBike('15m'),
      repeat(3, [step('2m', '105%'), step('1m', '88%')]),
      step('4m', '50%'),
      repeat(3, [step('2m', '105%'), step('1m', '88%')]),
      step('4m', '50%'),
      repeat(3, [step('2m', '105%'), step('1m', '88%')]),
      step('4m', '50%'),
      repeat(3, [step('2m', '105%'), step('1m', '88%')]),
      cooldownBike('8m', '55%'),
    ],
  },
  {
    id: 'bike-sst-3x12',
    sport: 'Ride',
    stimulus: 'SWEETSPOT',
    name: 'Sweetspot 3x12min',
    minutes: 71,
    load: 78,
    phases: ['BASE', 'BUILD'],
    coachNote: t('Viel aerober Reiz bei geringen Kosten. Die Basis, auf der VO2max später greift.'),
    blocks: [
      warmupBike('12m'),
      repeat(3, [step('12m', '88-93%', { cadence: '85-95rpm' }), step('5m', '55%')]),
      cooldownBike('8m', '55%'),
    ],
  },
  {
    id: 'bike-tempo-2x20',
    sport: 'Ride',
    stimulus: 'TEMPO',
    name: 'Tempo 2x20min',
    minutes: 60,
    load: 62,
    phases: ['BASE', 'RECOVERY', 'TAPER'],
    coachNote: t('Aerober Reiz, der am nächsten Tag nicht in den Beinen sitzt.'),
    blocks: [
      warmupBike('10m'),
      repeat(2, [step('20m', '76-82%', { cadence: '85-95rpm' }), step('5m', '55%')]),
      cooldownBike('5m', '55%'),
    ],
  },
  {
    id: 'bike-thr-short-3x8',
    family: 'bike-threshold',
    level: 1,
    sport: 'Ride',
    stimulus: 'THRESHOLD',
    name: t('Schwelle kompakt 3x8min'),
    minutes: 49,
    load: 62,
    phases: ['BASE', 'BUILD', 'SPECIFIC', 'TAPER'],
    coachNote: t('Der Einstieg in die Schwelle: drei kurze Blöcke an der FTP. Sauber durchgezogen, gibt sie 3x12 frei.'),
    blocks: [
      warmupBike('10m'),
      repeat(3, [step('8m', '98-103%'), step('3m', '50%')]),
      cooldownBike('6m', '55%'),
    ],
  },
  {
    id: 'bike-vo2-short-4x3',
    family: 'bike-vo2',
    level: 1,
    sport: 'Ride',
    stimulus: 'VO2',
    name: t('VO2max kompakt 4x3min'),
    minutes: 42,
    load: 58,
    phases: ['BUILD', 'SPECIFIC', 'TAPER'],
    coachNote: t('Kurz und scharf. Auch in der Taperwoche einsetzbar, um spritzig zu bleiben.'),
    blocks: [
      warmupBike('12m'),
      repeat(4, [step('3m', '112-118%', { cadence: '95-105rpm' }), step('3m', '50%')]),
      cooldownBike('6m', '55%'),
    ],
  },
  {
    id: 'bike-endurance-75',
    sport: 'Ride',
    stimulus: 'ENDURANCE',
    name: t('Grundlage 75min'),
    minutes: 75,
    load: 55,
    phases: ['BASE', 'BUILD', 'SPECIFIC', 'RECOVERY'],
    coachNote: t('Fettstoffwechsel und Kapillarisierung. Auf der Rolle bewusst locker bleiben.'),
    blocks: [
      step('10m', '55%', { label: t('Einfahren') }),
      step('55m', '65-72%', { cadence: '85-95rpm' }),
      cooldownBike('10m', '55%'),
    ],
  },
  {
    id: 'bike-recovery-40',
    sport: 'Ride',
    stimulus: 'RECOVERY',
    name: t('Regeneration 40min'),
    minutes: 40,
    load: 22,
    phases: ['BASE', 'BUILD', 'SPECIFIC', 'TAPER', 'RECOVERY'],
    coachNote: t('Durchblutung ohne Reiz. Wenn es sich anstrengend anfühlt, ist es zu hart.'),
    blocks: [step('40m', '50-58%', { cadence: '85-95rpm' })],
  },
  {
    id: 'bike-long-90',
    family: 'bike-long',
    level: 1,
    sport: 'Ride',
    stimulus: 'LONG',
    name: t('Lange Ausfahrt 90min'),
    minutes: 90,
    load: 70,
    phases: ['BASE', 'BUILD', 'SPECIFIC'],
    coachNote: t('Die Basis, auf der alles andere steht. Durchgehend locker — wer hier drückt, verliert die Einheit am Dienstag.'),
    blocks: [warmupBike('10m'), step('70m', '60-70%'), cooldownBike('10m', '55%')],
  },
  {
    id: 'bike-long-120',
    family: 'bike-long',
    level: 2,
    sport: 'Ride',
    stimulus: 'LONG',
    name: t('Lange Ausfahrt 2h'),
    minutes: 120,
    load: 95,
    phases: ['BASE', 'BUILD', 'SPECIFIC'],
    coachNote: t('Zwei Stunden verlangen eine Verpflegungsstrategie. Trinken und essen ab der ersten halben Stunde, nicht erst bei Hunger.'),
    blocks: [warmupBike('10m'), step('100m', '60-72%'), cooldownBike('10m', '55%')],
  },
  {
    id: 'bike-long-150',
    family: 'bike-long',
    level: 3,
    sport: 'Ride',
    stimulus: 'LONG',
    name: t('Lange Ausfahrt 2,5h mit Schlussteil'),
    minutes: 150,
    load: 120,
    // Ten minutes, not more: at fifteen the session files itself as tempo work.
    phases: ['BASE', 'BUILD', 'SPECIFIC'],
    coachNote: t('Der Schlussteil auf müden Beinen ist der eigentliche Reiz — genau dort entscheidet sich ein langes Rennen.'),
    blocks: [
      warmupBike('10m'),
      step('120m', '60-72%'),
      step('10m', '76-84%', { label: t('Schlussteil auf müden Beinen') }),
      cooldownBike('10m', '55%'),
    ],
  },
])

const RUN: readonly WorkoutTemplate[] = perLang(() => [
  {
    id: 'run-thr-5x1k',
    family: 'run-threshold',
    level: 2,
    sport: 'Run',
    stimulus: 'THRESHOLD',
    name: t('Schwelle 5x1km'),
    minutes: 50,
    load: 65,
    phases: ['BASE', 'BUILD', 'SPECIFIC'],
    coachNote: t('Die wichtigste Einheit für 10k. Kontrolliert schnell, nicht am Limit.'),
    blocks: [
      step('12m', '72-78% Pace', { label: t('Einlaufen') }),
      repeat(5, [step('1km', '100-104% Pace'), step('2m', '62-68% Pace')]),
      cooldownRun('8m', '72% Pace'),
    ],
  },
  {
    id: 'run-cv-4x2k',
    family: 'run-threshold',
    level: 3,
    sport: 'Run',
    stimulus: 'THRESHOLD',
    name: 'Critical Velocity 4x2km',
    minutes: 62,
    load: 78,
    phases: ['BUILD', 'SPECIFIC'],
    coachNote: t('Lange Schwellenintervalle. Direkt übertragbar auf 10k-Renntempo.'),
    blocks: [
      step('12m', '72-78% Pace', { label: t('Einlaufen') }),
      repeat(4, [step('2km', '96-100% Pace'), step('3m', '62% Pace')]),
      cooldownRun('8m', '72% Pace'),
    ],
  },
  {
    id: 'run-vo2-8x800',
    family: 'run-vo2',
    level: 2,
    sport: 'Run',
    stimulus: 'VO2',
    name: 'VO2max 8x800m',
    minutes: 55,
    load: 72,
    phases: ['BUILD', 'SPECIFIC'],
    coachNote: t('Hebt die Decke über dem Renntempo. Erste zwei Wiederholungen bewusst zurückhalten.'),
    blocks: [
      step('15m', '72-78% Pace', { label: t('Einlaufen') }),
      repeat(4, [step('20s', '120% Pace'), step('40s', '50% Pace')]),
      repeat(8, [step('800mtr', '110-115% Pace'), step('2m', '58-64% Pace')]),
      cooldownRun('8m', '72% Pace'),
    ],
  },
  {
    id: 'run-vo2-10x400',
    family: 'run-vo2',
    level: 1,
    sport: 'Run',
    stimulus: 'VO2',
    name: 'VO2max 10x400m',
    minutes: 45,
    load: 60,
    phases: ['BUILD', 'SPECIFIC', 'TAPER'],
    coachNote: t('Kurze, schnelle Reize bei geringer Ermüdung. Ideal in der letzten Woche vor einem Wettkampf.'),
    blocks: [
      step('12m', '72-78% Pace', { label: t('Einlaufen') }),
      repeat(10, [step('400mtr', '118-124% Pace'), step('90s', '58% Pace')]),
      cooldownRun('8m', '72% Pace'),
    ],
  },
  {
    id: 'run-tempo-25',
    sport: 'Run',
    stimulus: 'TEMPO',
    name: t('Tempodauerlauf 25min'),
    minutes: 48,
    load: 58,
    phases: ['BASE', 'BUILD', 'SPECIFIC'],
    coachNote: t('Komfortabel hart, durchgehend. Baut die Schwelle ohne die Kosten von Intervallen.'),
    blocks: [
      step('12m', '72-78% Pace', { label: t('Einlaufen') }),
      step('25m', '92-95% Pace'),
      cooldownRun('8m', '72% Pace'),
    ],
  },
  {
    id: 'run-progression-50',
    sport: 'Run',
    stimulus: 'TEMPO',
    name: t('Steigerungslauf 48min'),
    minutes: 48,
    load: 60,
    phases: ['BASE', 'BUILD'],
    coachNote: t('Drei Blöcke, jeder schneller. Trainiert das Gefühl für gleichmäßig hartes Tempo.'),
    blocks: [
      step('15m', '76% Pace'),
      step('15m', '84% Pace'),
      step('12m', '92-96% Pace'),
      cooldownRun('6m', '72% Pace'),
    ],
  },
  {
    id: 'run-hills-8x20',
    sport: 'Run',
    stimulus: 'NEURO',
    name: t('Hügelsprints 8x20s'),
    minutes: 45,
    load: 45,
    phases: ['BASE', 'BUILD', 'TAPER', 'RECOVERY'],
    coachNote: t('Kraft und Laufökonomie bei minimaler Ermüdung — der günstigste Weg zu schnellerem 10k-Tempo.'),
    blocks: [
      step('15m', '72-78% Pace', { label: t('Einlaufen') }),
      repeat(8, [step('20s', '128-135% Pace'), step('2m', '45-50% Pace')]),
      cooldownRun('10m', '72% Pace'),
    ],
  },
  {
    id: 'run-long-80',
    family: 'run-long',
    level: 1,
    sport: 'Run',
    stimulus: 'LONG',
    name: t('Langer Lauf 80min'),
    minutes: 80,
    load: 78,
    phases: ['BASE', 'BUILD', 'SPECIFIC'],
    coachNote: t('Aerobe Basis. Bei zwei bis drei Einheiten pro Woche die einzige echte Volumenquelle.'),
    blocks: [step('80m', '76-84% Pace')],
  },
  {
    id: 'run-easy-strides',
    sport: 'Run',
    stimulus: 'ENDURANCE',
    name: t('Locker 40min + Steigerungen'),
    minutes: 46,
    load: 40,
    phases: ['BASE', 'BUILD', 'SPECIFIC', 'TAPER', 'RECOVERY'],
    coachNote: t('Locker heißt locker. Die Steigerungen am Ende halten die Beine schnell.'),
    blocks: [
      step('40m', '74-80% Pace'),
      repeat(6, [step('20s', '125-130% Pace'), step('60s', '55% Pace')]),
    ],
  },
  {
    id: 'run-thr-short-3x1k',
    family: 'run-threshold',
    level: 1,
    sport: 'Run',
    stimulus: 'THRESHOLD',
    name: t('Schwelle kompakt 3x1km'),
    minutes: 40,
    load: 48,
    phases: ['BASE', 'BUILD', 'SPECIFIC', 'TAPER'],
    coachNote: t('Die 40-Minuten-Version, wenn der Tag eng ist. Reiz bleibt, Umfang fällt.'),
    blocks: [
      step('10m', '72-78% Pace', { label: t('Einlaufen') }),
      repeat(3, [step('1km', '100-104% Pace'), step('2m', '62-68% Pace')]),
      cooldownRun('6m', '72% Pace'),
    ],
  },
  {
    id: 'run-recovery-30',
    sport: 'Run',
    stimulus: 'RECOVERY',
    name: t('Regenerationslauf 30min'),
    minutes: 30,
    load: 20,
    phases: ['BASE', 'BUILD', 'SPECIFIC', 'TAPER', 'RECOVERY'],
    coachNote: t('Ganz locker, gerne auf weichem Untergrund. Kein Blick auf die Uhr.'),
    blocks: [step('30m', '68-75% Pace')],
  },
  {
    id: 'run-long-100',
    family: 'run-long',
    level: 2,
    sport: 'Run',
    stimulus: 'LONG',
    name: t('Langer Lauf 100min'),
    minutes: 100,
    load: 98,
    phases: ['BASE', 'BUILD', 'SPECIFIC'],
    coachNote: t('Zwanzig Minuten mehr als die Stufe davor. Das Tempo bleibt, die Zeit macht die Arbeit.'),
    blocks: [step('100m', '76-84% Pace')],
  },
  {
    id: 'run-long-120',
    family: 'run-long',
    level: 3,
    sport: 'Run',
    stimulus: 'LONG',
    name: t('Langer Lauf 2h mit schnellem Ende'),
    minutes: 120,
    load: 118,
    phases: ['BASE', 'BUILD', 'SPECIFIC'],
    coachNote: t('Die letzten zehn Minuten zügig, nicht schnell. Wer sie nicht mehr laufen kann, war vorher zu schnell unterwegs.'),
    blocks: [
      step('110m', '76-84% Pace'),
      step('10m', '88-92% Pace', { label: t('Schnelleres Ende') }),
    ],
  },
  {
    id: 'run-racepace-4x15',
    family: 'run-racepace',
    level: 1,
    sport: 'Run',
    stimulus: 'THRESHOLD',
    goalKind: 'raceTime',
    name: t('Renntempo 4x1,5km'),
    minutes: 48,
    load: 62,
    phases: ['BUILD', 'SPECIFIC'],
    coachNote: t('Das Tempo, das am Wettkampftag zählt — einen Tick über der Schwelle, mit kurzen Pausen, damit es sich anfühlt wie das Rennen.'),
    blocks: [
      step('12m', '72-78% Pace', { label: t('Einlaufen') }),
      repeat(4, [step('1.5km', '103-106% Pace'), step('90s', '60-66% Pace')]),
      cooldownRun('8m', '72% Pace'),
    ],
  },
  {
    id: 'run-racepace-3x25',
    family: 'run-racepace',
    level: 2,
    sport: 'Run',
    stimulus: 'THRESHOLD',
    goalKind: 'raceTime',
    name: t('Renntempo 3x2,5km'),
    minutes: 53,
    load: 70,
    phases: ['BUILD', 'SPECIFIC'],
    coachNote: t('Längere Stücke bei gleichem Tempo. Wenn das dritte noch sitzt, sitzt auch das Rennen.'),
    blocks: [
      step('12m', '72-78% Pace', { label: t('Einlaufen') }),
      repeat(3, [step('2.5km', '103-106% Pace'), step('2m', '60-66% Pace')]),
      cooldownRun('8m', '72% Pace'),
    ],
  },
])

/** Pool rests are spent at the wall, not swum slowly: a rest step, not a pace. */
const wallRest = (duration: string): Step => step(duration, REST_TARGET)

const warmupSwim = (duration: string): Step =>
  step(duration, '60-68% Pace', { label: t('Einschwimmen') })

/**
 * Swim targets are percentages of critical swim speed, the pace an athlete can
 * hold for roughly 30 minutes. Technique work carries as much of the adaptation
 * as the intervals do, so every set keeps a drill block.
 */
const SWIM: readonly WorkoutTemplate[] = perLang(() => [
  {
    id: 'swim-thr-10x100',
    family: 'swim-threshold',
    level: 2,
    sport: 'Swim',
    stimulus: 'THRESHOLD',
    name: 'CSS 10x100m',
    minutes: 50,
    load: 62,
    phases: ['BASE', 'BUILD', 'SPECIFIC'],
    coachNote: t('Die Standardeinheit an der kritischen Schwimmgeschwindigkeit. Gleichmäßig, letzte 100 nicht schneller als die erste.'),
    blocks: [
      warmupSwim('300mtr'),
      repeat(4, [step('50mtr', '55-62% Pace', { label: t('Technik') }), wallRest('20s')]),
      repeat(10, [step('100mtr', '98-102% Pace'), wallRest('20s')]),
      cooldownSwim('200mtr', '60% Pace'),
    ],
  },
  {
    id: 'swim-css-5x200',
    family: 'swim-threshold',
    level: 3,
    sport: 'Swim',
    stimulus: 'THRESHOLD',
    name: 'CSS 5x200m',
    minutes: 55,
    load: 70,
    phases: ['BUILD', 'SPECIFIC'],
    coachNote: t('Längere Intervalle, gleicher Reiz. Näher am Renntempo für alles ab 750 m.'),
    blocks: [
      warmupSwim('300mtr'),
      repeat(4, [step('50mtr', '55-62% Pace', { label: t('Technik') }), wallRest('20s')]),
      repeat(5, [step('200mtr', '96-100% Pace'), wallRest('30s')]),
      cooldownSwim('200mtr', '60% Pace'),
    ],
  },
  {
    id: 'swim-vo2-16x50',
    sport: 'Swim',
    stimulus: 'VO2',
    name: 'VO2max 16x50m',
    minutes: 45,
    load: 58,
    phases: ['BUILD', 'SPECIFIC'],
    coachNote: t('Kurz und schnell bei sauberer Technik. Sobald der Zug zerfällt, ist die Serie zu Ende — egal wie viele übrig sind.'),
    blocks: [
      warmupSwim('300mtr'),
      repeat(4, [step('50mtr', '55-62% Pace', { label: t('Technik') }), wallRest('20s')]),
      repeat(16, [step('50mtr', '110-118% Pace'), wallRest('20s')]),
      cooldownSwim('200mtr', '60% Pace'),
    ],
  },
  {
    id: 'swim-tempo-3x400',
    sport: 'Swim',
    stimulus: 'TEMPO',
    name: 'Tempo 3x400m',
    minutes: 50,
    load: 55,
    phases: ['BASE', 'BUILD'],
    coachNote: t('Aerober Block ohne die Kosten harter Intervalle. Gut am Tag nach einer harten Lauf- oder Radeinheit.'),
    blocks: [
      warmupSwim('300mtr'),
      repeat(3, [step('400mtr', '88-93% Pace'), wallRest('45s')]),
      cooldownSwim('200mtr', '60% Pace'),
    ],
  },
  {
    id: 'swim-technique',
    sport: 'Swim',
    stimulus: 'NEURO',
    name: t('Technik 40min'),
    minutes: 40,
    load: 30,
    phases: ['BASE', 'BUILD', 'SPECIFIC', 'TAPER', 'RECOVERY'],
    coachNote: t('Im Schwimmen kommt der Fortschritt aus dem Wasserwiderstand, nicht aus der Kraft. Technik ist hier keine Zusatzeinheit, sondern die eigentliche Arbeit.'),
    blocks: [
      warmupSwim('300mtr'),
      repeat(8, [step('50mtr', '55-62% Pace', { label: t('Technik') }), wallRest('20s')]),
      repeat(8, [step('50mtr', '95-100% Pace', { label: t('Umsetzen') }), wallRest('30s')]),
      cooldownSwim('200mtr', '60% Pace'),
    ],
  },
  {
    id: 'swim-endurance-1500',
    sport: 'Swim',
    stimulus: 'ENDURANCE',
    name: t('Grundlage 1500m'),
    minutes: 45,
    load: 40,
    phases: ['BASE', 'BUILD', 'SPECIFIC', 'RECOVERY'],
    coachNote: t('Durchgehend locker. Auf gleichmäßige Zugfrequenz achten, nicht auf die Uhr.'),
    blocks: [warmupSwim('200mtr'), step('1500mtr', '78-85% Pace'), cooldownSwim('200mtr', '60% Pace')],
  },
  {
    id: 'swim-thr-short-6x100',
    family: 'swim-threshold',
    level: 1,
    sport: 'Swim',
    stimulus: 'THRESHOLD',
    name: t('CSS kompakt 6x100m'),
    minutes: 35,
    load: 45,
    phases: ['BASE', 'BUILD', 'SPECIFIC', 'TAPER'],
    coachNote: t('Die 35-Minuten-Version, wenn die Bahn nur kurz frei ist.'),
    blocks: [
      warmupSwim('200mtr'),
      repeat(6, [step('100mtr', '98-102% Pace'), wallRest('20s')]),
      cooldownSwim('150mtr', '60% Pace'),
    ],
  },
  {
    id: 'swim-recovery-800',
    sport: 'Swim',
    stimulus: 'RECOVERY',
    name: t('Lockeres Schwimmen 800m'),
    minutes: 25,
    load: 18,
    phases: ['BASE', 'BUILD', 'SPECIFIC', 'TAPER', 'RECOVERY'],
    coachNote: t('Regeneration im Wasser entlastet die Beine vollständig — nach harten Lauftagen oft die bessere Wahl als ein Regenerationslauf.'),
    blocks: [step('800mtr', '58-66% Pace')],
  },
])

/**
 * Reference sessions. They never change and never progress, because their whole
 * value is comparability: same work, same targets, and the heart rate needed to
 * hold them tells you more than a fresh threshold test would.
 */
const BENCHMARKS: readonly WorkoutTemplate[] = perLang(() => [
  {
    id: 'test-bike-ftp20',
    sport: 'Ride',
    stimulus: 'THRESHOLD',
    name: t('Standortbestimmung FTP 20min'),
    minutes: 47,
    load: 72,
    benchmark: true,
    measures: 'threshold',
    phases: ['BASE', 'BUILD', 'SPECIFIC', 'TAPER', 'RECOVERY'],
    coachNote:
      t('Ein einziger maximaler Block, gleichmäßig gefahren — nicht die ersten fünf Minuten verheizen. Die FTP sind 95 % der Durchschnittsleistung über die 20 Minuten. Nur so ein Wert nach oben begrenzt die Schätzung; Intervalle können das nicht.'),
    blocks: [
      warmupBike('12m'),
      repeat(3, [step('1m', '105%', { cadence: '95-105rpm' }), step('1m', '50%')]),
      step('3m', '50%'),
      step('20m', '100-108%', { label: t('Maximal, gleichmäßig') }),
      cooldownBike('6m', '55%'),
    ],
  },
  {
    id: 'test-run-thr20',
    sport: 'Run',
    stimulus: 'THRESHOLD',
    name: t('Standortbestimmung Schwelle 20min'),
    minutes: 46,
    load: 70,
    benchmark: true,
    measures: 'threshold',
    phases: ['BASE', 'BUILD', 'SPECIFIC', 'TAPER', 'RECOVERY'],
    coachNote:
      t('Flache Runde, gleichmäßig laufen, nicht die ersten Minuten verschenken. Deine Schwellenpace liegt etwa 5 % über der Durchschnittszeit dieser 20 Minuten — schneller gelaufen heißt also auch: neue Zielpaces für alles danach.'),
    blocks: [
      step('12m', '72-78% Pace', { label: t('Einlaufen') }),
      repeat(3, [step('1m', '105% Pace'), step('1m', '60% Pace')]),
      step('2m', '60% Pace'),
      step('20m', '100-106% Pace', { label: t('Maximal, gleichmäßig') }),
      cooldownRun('6m', '72% Pace'),
    ],
  },
  {
    id: 'test-swim-css',
    sport: 'Swim',
    stimulus: 'THRESHOLD',
    name: t('Standortbestimmung CSS 400/200'),
    minutes: 40,
    load: 50,
    benchmark: true,
    measures: 'threshold',
    phases: ['BASE', 'BUILD', 'SPECIFIC', 'TAPER', 'RECOVERY'],
    coachNote:
      t('Zwei maximale Strecken: erst 400 m, dann nach lockerem Schwimmen 200 m, beide gleichmäßig und so schnell wie möglich. Aus der Zeitdifferenz ergibt sich deine CSS: (Zeit 400 − Zeit 200) ÷ 2 pro 100 m.'),
    blocks: [
      warmupSwim('400mtr'),
      repeat(4, [step('50mtr', '90-100% Pace', { label: t('Steigern') }), wallRest('20s')]),
      step('400mtr', '103-110% Pace', { label: t('Maximal, gleichmäßig') }),
      step('200mtr', '58-66% Pace', { label: t('Locker') }),
      step('200mtr', '106-114% Pace', { label: t('Maximal, gleichmäßig') }),
      cooldownSwim('200mtr', '60% Pace'),
    ],
  },
  {
    id: 'bench-bike-4x4',
    sport: 'Ride',
    stimulus: 'VO2',
    name: t('Formkontrolle Rad 4x4min'),
    minutes: 52,
    load: 68,
    benchmark: true,
    measures: 'vo2',
    phases: ['BASE', 'BUILD', 'SPECIFIC', 'TAPER', 'RECOVERY'],
    coachNote: t('Vergleichseinheit. Immer identisch fahren — gleiche Watt, gleiche Trittfrequenz. Sinkt die Herzfrequenz bei gleicher Leistung, bist du besser geworden.'),
    blocks: [
      warmupBike('15m'),
      repeat(4, [step('4m', '105-110%', { cadence: '90-100rpm' }), step('4m', '50%')]),
      cooldownBike('9m', '55%'),
    ],
  },
  {
    id: 'bench-run-4x4',
    sport: 'Run',
    stimulus: 'VO2',
    name: t('Formkontrolle Lauf 4x4min'),
    measures: 'vo2',
    minutes: 48,
    load: 62,
    benchmark: true,
    phases: ['BASE', 'BUILD', 'SPECIFIC', 'TAPER', 'RECOVERY'],
    coachNote: t('Vergleichseinheit. Gleiche Pace wie beim letzten Mal, nicht schneller. Die Herzfrequenz ist das Ergebnis, nicht die Zeit.'),
    blocks: [
      step('12m', '72-78% Pace', { label: t('Einlaufen') }),
      repeat(4, [step('4m', '104-108% Pace'), step('3m', '62-68% Pace')]),
      cooldownRun('8m', '72% Pace'),
    ],
  },
  {
    id: 'bench-swim-400',
    sport: 'Swim',
    stimulus: 'THRESHOLD',
    name: t('Formkontrolle Schwimmen 400m'),
    minutes: 35,
    load: 45,
    benchmark: true,
    phases: ['BASE', 'BUILD', 'SPECIFIC', 'TAPER', 'RECOVERY'],
    coachNote: t('Vergleichseinheit. 400 m gleichmäßig auf CSS-Tempo, danach dieselbe Auswertung wie bei Rad und Lauf.'),
    blocks: [
      warmupSwim('300mtr'),
      step('400mtr', '98-102% Pace'),
      cooldownSwim('200mtr', '60% Pace'),
    ],
  },
])

export const LIBRARY: readonly WorkoutTemplate[] = perLang(() => [...BIKE, ...RUN, ...SWIM, ...BENCHMARKS])

export const templatesFor = (sport: Sport): readonly WorkoutTemplate[] =>
  LIBRARY.filter((template) => template.sport === sport)

export const findTemplate = (id: string): WorkoutTemplate | undefined =>
  LIBRARY.find((template) => template.id === id)

/** The sustained maximal effort that settles a sport's threshold, where one exists. */
export const thresholdTestFor = (sport: Sport): WorkoutTemplate | undefined =>
  LIBRARY.find(
    (template) =>
      template.benchmark === true && template.sport === sport && template.measures === 'threshold',
  )

const CLASS_BY_STIMULUS: Readonly<Record<Stimulus, IntensityClass>> = {
  VO2: 'hard',
  THRESHOLD: 'hard',
  SWEETSPOT: 'hard',
  TEMPO: 'moderate',
  NEURO: 'moderate',
  LONG: 'moderate',
  ENDURANCE: 'easy',
  RECOVERY: 'easy',
}

export const intensityClass = (stimulus: Stimulus): IntensityClass => CLASS_BY_STIMULUS[stimulus]

/**
 * Which sport carries which stimulus by default. Running is the more specific
 * and more central VO2max stimulus; threshold work is safer and better
 * controlled on the trainer. This is a preference the scoring leans on, never a
 * rule — an athlete who did VO2max on the bike simply moves the rotation on.
 */
const PREFERRED_SPORTS: Partial<Record<Stimulus, readonly Sport[]>> = {
  VO2: ['Run'],
  THRESHOLD: ['Ride', 'Swim'],
  SWEETSPOT: ['Ride'],
  LONG: ['Run', 'Ride'],
  NEURO: ['Swim'],
}

export const isPreferredSport = (stimulus: Stimulus, sport: Sport): boolean =>
  PREFERRED_SPORTS[stimulus]?.includes(sport) ?? false

/**
 * Strength progresses by sessions actually done, not by calendar weeks: someone
 * who skipped a month should not land in the full programme. The intro phase
 * keeps volume low so soreness never reaches the next quality endurance day.
 */
/**
 * Without heavy loads the stimulus has to come from somewhere else: single-leg
 * work halves the resistance needed, slow eccentrics extend time under tension,
 * and plyometrics carry the best evidence for running economy — which is why
 * jumps move from optional extra to core work once weights run out.
 */
const EXERCISES: Readonly<Record<Equipment, { core: readonly StrengthExercise[]; extra: readonly StrengthExercise[] }>> = perLang(() => ({
  gym: {
    core: [
      { name: t('Kniebeuge / Beinpresse'), sets: '4 × 5', load: t('~85 % 1RM') },
      { name: t('Rumänisches Kreuzheben'), sets: '3 × 6', load: 'schwer' },
    ],
    extra: [
      { name: 'Bulgarian Split Squat', sets: t('3 × 6 je Seite'), load: 'schwer' },
      { name: t('Einbeiniges Wadenheben'), sets: '3 × 8', load: 'schwer' },
      { name: t('Rumpf (Plank, Pallof Press)'), sets: t('2 Sätze'), load: '—' },
      { name: t('Vorweg: Hops / Drop Jumps'), sets: '3 × 10', load: t('Körpergewicht') },
    ],
  },
  dumbbells: {
    core: [
      { name: 'Bulgarian Split Squat', sets: t('4 × 6 je Seite'), load: '2 × 10 kg' },
      { name: t('Einbeiniges Kreuzheben'), sets: t('3 × 8 je Seite'), load: '2 × 10 kg' },
    ],
    extra: [
      { name: t('Wadenheben einbeinig, Ferse erhöht'), sets: t('4 × 10 je Seite'), load: '1 × 10 kg' },
      { name: t('Step-up auf hohe Stufe'), sets: t('3 × 8 je Seite'), load: '2 × 10 kg' },
      { name: t('Rumpf (Plank, Pallof Press)'), sets: t('2 Sätze'), load: '—' },
      { name: t('Vorweg: Drop Jumps / Bounding'), sets: '3 × 10', load: t('Körpergewicht') },
    ],
  },
  bodyweight: {
    core: [
      { name: t('Einbeinige Kniebeuge zum Stuhl'), sets: t('4 × 6 je Seite'), load: t('3s abwärts') },
      { name: t('Nordic Hamstring Curl (Füße fixiert)'), sets: '3 × 5', load: t('so langsam wie möglich') },
    ],
    extra: [
      { name: t('Wadenheben einbeinig, Ferse erhöht'), sets: t('4 × 15 je Seite'), load: t('3s abwärts') },
      { name: 'Split-Squat-Isometrie', sets: t('3 × 30s je Seite'), load: t('tiefe Position halten') },
      { name: t('Rumpf (Plank, Pallof Press mit Band)'), sets: t('2 Sätze'), load: '—' },
      { name: t('Vorweg: Drop Jumps / Bounding'), sets: '4 × 10', load: t('Körpergewicht') },
    ],
  },
}))

const EQUIPMENT_NOTE: Readonly<Record<Equipment, string>> = perLang(() => ({
  gym: '',
  dumbbells: t(' Bei leichten Hanteln entsteht der Reiz durch die einbeinige Ausführung — die letzte Wiederholung muss hart sein, sonst geht das Gewicht hoch oder die Stufe höher.'),
  bodyweight: t(' Ohne Zusatzgewicht tragen die langsame Absenkphase und die Sprünge den Reiz. Sprünge immer ausgeruht zu Beginn, nie am Ende der Einheit.'),
}))

const INTRO_SESSIONS = 6
const FULL_SESSIONS = 20

export const strengthPhaseFor = (completed: number): StrengthPhase =>
  completed < INTRO_SESSIONS ? 'intro' : completed < FULL_SESSIONS ? 'full' : 'maintain'

const PHASE_NOTE: Readonly<Record<StrengthPhase, string>> = perLang(() => ({
  intro: t('Einstieg: nur zwei Übungen, moderate Last. Muskelkater darf die nächste Qualitätseinheit nicht treffen.'),
  full: t('Volles Programm, zweimal pro Woche. 2 Wiederholungen in Reserve, kein Muskelversagen — Ziel ist neuromuskuläre Anpassung, nicht Masse.'),
  maintain: t('Erhalt: einmal pro Woche genügt jetzt. Die frei werdende Zeit gehört wieder der Ausdauer.'),
}))

export const strengthSession = (completed: number, equipment: Equipment): StrengthSuggestion => {
  const phase = strengthPhaseFor(completed)
  const { core, extra } = EXERCISES[equipment]
  return {
    name: t('Krafttraining'),
    phase,
    minutes: phase === 'intro' ? 20 : 28,
    note: t`${PHASE_NOTE[phase]}${EQUIPMENT_NOTE[equipment]} Am selben Tag wie die harte Ausdauereinheit — direkt danach oder mindestens 6h später, nie am Tag davor.`,
    exercises: phase === 'intro' ? core : [...core, ...extra],
    completed,
    perWeek: phase === 'maintain' ? 1 : 2,
  }
}

export const flattenBlocks = (blocks: readonly Block[]): readonly Step[] =>
  blocks.flatMap((block) =>
    block.kind === 'step'
      ? [block]
      : Array.from({ length: block.times }, () => block.steps).flat(),
  )
