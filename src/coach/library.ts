import type {
  Block,
  IntensityClass,
  Repeat,
  Sport,
  Step,
  Stimulus,
  StrengthSuggestion,
  WorkoutTemplate,
} from './types.ts'

const step = (duration: string, target: string, extra: Partial<Step> = {}): Step => ({
  kind: 'step',
  duration,
  target,
  ...extra,
})

const repeat = (times: number, steps: readonly Step[]): Repeat => ({ kind: 'repeat', times, steps })

const warmupBike = (duration: string): Step =>
  step(duration, 'ramp 50%-72%', { label: 'Einfahren' })

const cooldown = (duration: string, target: string): Step =>
  step(duration, target, { label: 'Ausfahren' })

const BIKE: readonly WorkoutTemplate[] = [
  {
    id: 'bike-vo2-5x4',
    sport: 'Ride',
    stimulus: 'VO2',
    name: 'VO2max 5x4min',
    minutes: 65,
    load: 82,
    phases: ['BUILD', 'SPECIFIC'],
    coachNote: 'Der stärkste Hebel für die FTP, wenn die Grundlage steht. Letztes Intervall darf hart sein, aber vollständig.',
    blocks: [
      warmupBike('15m'),
      repeat(5, [step('4m', '110-115%', { cadence: '90-100rpm' }), step('4m', '50%')]),
      cooldown('10m', '55%'),
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
    coachNote: 'Hohe Zeit bei VO2max ohne die mentale Last langer Intervalle. Gut nach knappem Schlaf.',
    blocks: [
      warmupBike('15m'),
      repeat(6, [step('40s', '125%', { cadence: '95-105rpm' }), step('20s', '50%')]),
      step('4m', '50%'),
      repeat(6, [step('40s', '125%', { cadence: '95-105rpm' }), step('20s', '50%')]),
      step('4m', '50%'),
      repeat(6, [step('40s', '125%', { cadence: '95-105rpm' }), step('20s', '50%')]),
      cooldown('8m', '55%'),
    ],
  },
  {
    id: 'bike-thr-3x12',
    sport: 'Ride',
    stimulus: 'THRESHOLD',
    name: 'Schwelle 3x12min',
    minutes: 74,
    load: 88,
    phases: ['BASE', 'BUILD', 'SPECIFIC'],
    coachNote: 'Brot-und-Butter für FTP 300. Zielbereich exakt halten, nicht überziehen.',
    blocks: [
      warmupBike('15m'),
      repeat(3, [step('12m', '97-102%', { cadence: '85-95rpm' }), step('5m', '50%')]),
      cooldown('8m', '55%'),
    ],
  },
  {
    id: 'bike-thr-2x20',
    sport: 'Ride',
    stimulus: 'THRESHOLD',
    name: 'Schwelle 2x20min',
    minutes: 78,
    load: 95,
    phases: ['BUILD', 'SPECIFIC'],
    coachNote: 'Der klassische FTP-Test-Vorbereiter. Schaffst du 2x20 bei 100%, ist die FTP reif für ein Update.',
    blocks: [
      warmupBike('15m'),
      repeat(2, [step('20m', '96-100%', { cadence: '85-95rpm' }), step('8m', '50%')]),
      cooldown('7m', '55%'),
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
    coachNote: 'Laktat-Toleranz an der Schwelle. Die Unders sind Erholung, nicht Pause — Druck halten.',
    blocks: [
      warmupBike('15m'),
      repeat(3, [step('2m', '105%'), step('1m', '88%')]),
      step('4m', '50%'),
      repeat(3, [step('2m', '105%'), step('1m', '88%')]),
      step('4m', '50%'),
      repeat(3, [step('2m', '105%'), step('1m', '88%')]),
      step('4m', '50%'),
      repeat(3, [step('2m', '105%'), step('1m', '88%')]),
      cooldown('8m', '55%'),
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
    coachNote: 'Viel aerober Reiz bei geringen Kosten. Die Basis, auf der VO2max später greift.',
    blocks: [
      warmupBike('12m'),
      repeat(3, [step('12m', '88-93%', { cadence: '85-95rpm' }), step('5m', '55%')]),
      cooldown('8m', '55%'),
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
    coachNote: 'Aerober Reiz, der am nächsten Tag nicht in den Beinen sitzt.',
    blocks: [
      warmupBike('10m'),
      repeat(2, [step('20m', '76-82%', { cadence: '85-95rpm' }), step('5m', '55%')]),
      cooldown('5m', '55%'),
    ],
  },
  {
    id: 'bike-thr-short-3x8',
    sport: 'Ride',
    stimulus: 'THRESHOLD',
    name: 'Schwelle kompakt 3x8min',
    minutes: 49,
    load: 62,
    phases: ['BASE', 'BUILD', 'SPECIFIC', 'TAPER'],
    coachNote: 'Wenn nur 50 Minuten drin sind: kürzer, dafür einen Tick über FTP.',
    blocks: [
      warmupBike('10m'),
      repeat(3, [step('8m', '98-103%'), step('3m', '50%')]),
      cooldown('6m', '55%'),
    ],
  },
  {
    id: 'bike-vo2-short-4x3',
    sport: 'Ride',
    stimulus: 'VO2',
    name: 'VO2max kompakt 4x3min',
    minutes: 42,
    load: 58,
    phases: ['BUILD', 'SPECIFIC', 'TAPER'],
    coachNote: 'Kurz und scharf. Auch in der Taperwoche einsetzbar, um spritzig zu bleiben.',
    blocks: [
      warmupBike('12m'),
      repeat(4, [step('3m', '112-118%', { cadence: '95-105rpm' }), step('3m', '50%')]),
      cooldown('6m', '55%'),
    ],
  },
  {
    id: 'bike-endurance-75',
    sport: 'Ride',
    stimulus: 'ENDURANCE',
    name: 'Grundlage 75min',
    minutes: 75,
    load: 55,
    phases: ['BASE', 'BUILD', 'SPECIFIC', 'RECOVERY'],
    coachNote: 'Fettstoffwechsel und Kapillarisierung. Auf der Rolle bewusst locker bleiben.',
    blocks: [
      step('10m', '55%', { label: 'Einfahren' }),
      step('55m', '65-72%', { cadence: '85-95rpm' }),
      cooldown('10m', '55%'),
    ],
  },
  {
    id: 'bike-recovery-40',
    sport: 'Ride',
    stimulus: 'RECOVERY',
    name: 'Regeneration 40min',
    minutes: 40,
    load: 22,
    phases: ['BASE', 'BUILD', 'SPECIFIC', 'TAPER', 'RECOVERY'],
    coachNote: 'Durchblutung ohne Reiz. Wenn es sich anstrengend anfühlt, ist es zu hart.',
    blocks: [step('40m', '50-58%', { cadence: '85-95rpm' })],
  },
]

const RUN: readonly WorkoutTemplate[] = [
  {
    id: 'run-thr-5x1k',
    sport: 'Run',
    stimulus: 'THRESHOLD',
    name: 'Schwelle 5x1km',
    minutes: 50,
    load: 65,
    phases: ['BASE', 'BUILD', 'SPECIFIC'],
    coachNote: 'Die wichtigste Einheit für 10k. Kontrolliert schnell, nicht am Limit.',
    blocks: [
      step('12m', '72-78% Pace', { label: 'Einlaufen' }),
      repeat(5, [step('1km', '100-104% Pace'), step('2m', '62-68% Pace')]),
      cooldown('8m', '72% Pace'),
    ],
  },
  {
    id: 'run-cv-4x2k',
    sport: 'Run',
    stimulus: 'THRESHOLD',
    name: 'Critical Velocity 4x2km',
    minutes: 62,
    load: 78,
    phases: ['BUILD', 'SPECIFIC'],
    coachNote: 'Lange Schwellenintervalle. Direkt übertragbar auf 10k-Renntempo.',
    blocks: [
      step('12m', '72-78% Pace', { label: 'Einlaufen' }),
      repeat(4, [step('2km', '96-100% Pace'), step('3m', '62% Pace')]),
      cooldown('8m', '72% Pace'),
    ],
  },
  {
    id: 'run-vo2-8x800',
    sport: 'Run',
    stimulus: 'VO2',
    name: 'VO2max 8x800m',
    minutes: 55,
    load: 72,
    phases: ['BUILD', 'SPECIFIC'],
    coachNote: 'Hebt die Decke über dem Renntempo. Erste zwei Wiederholungen bewusst zurückhalten.',
    blocks: [
      step('15m', '72-78% Pace', { label: 'Einlaufen' }),
      repeat(4, [step('20s', '120% Pace'), step('40s', '50% Pace')]),
      repeat(8, [step('800mtr', '110-115% Pace'), step('2m', '58-64% Pace')]),
      cooldown('8m', '72% Pace'),
    ],
  },
  {
    id: 'run-vo2-10x400',
    sport: 'Run',
    stimulus: 'VO2',
    name: 'VO2max 10x400m',
    minutes: 45,
    load: 60,
    phases: ['SPECIFIC', 'TAPER'],
    coachNote: 'Kurze, schnelle Reize bei geringer Ermüdung. Ideal in der letzten Woche vor einem Wettkampf.',
    blocks: [
      step('12m', '72-78% Pace', { label: 'Einlaufen' }),
      repeat(10, [step('400mtr', '118-124% Pace'), step('90s', '58% Pace')]),
      cooldown('8m', '72% Pace'),
    ],
  },
  {
    id: 'run-tempo-25',
    sport: 'Run',
    stimulus: 'TEMPO',
    name: 'Tempodauerlauf 25min',
    minutes: 48,
    load: 58,
    phases: ['BASE', 'BUILD', 'SPECIFIC'],
    coachNote: 'Komfortabel hart, durchgehend. Baut die Schwelle ohne die Kosten von Intervallen.',
    blocks: [
      step('12m', '72-78% Pace', { label: 'Einlaufen' }),
      step('25m', '92-95% Pace'),
      cooldown('8m', '72% Pace'),
    ],
  },
  {
    id: 'run-progression-50',
    sport: 'Run',
    stimulus: 'TEMPO',
    name: 'Steigerungslauf 45min',
    minutes: 48,
    load: 60,
    phases: ['BASE', 'BUILD'],
    coachNote: 'Drei Blöcke, jeder schneller. Trainiert das Gefühl für gleichmäßig hartes Tempo.',
    blocks: [
      step('15m', '76% Pace'),
      step('15m', '84% Pace'),
      step('12m', '92-96% Pace'),
      cooldown('6m', '72% Pace'),
    ],
  },
  {
    id: 'run-hills-8x20',
    sport: 'Run',
    stimulus: 'NEURO',
    name: 'Hügelsprints 8x20s',
    minutes: 45,
    load: 45,
    phases: ['BASE', 'BUILD', 'TAPER', 'RECOVERY'],
    coachNote: 'Kraft und Laufökonomie bei minimaler Ermüdung — der günstigste Weg zu schnellerem 10k-Tempo.',
    blocks: [
      step('15m', '72-78% Pace', { label: 'Einlaufen' }),
      repeat(8, [step('20s', '128-135% Pace'), step('2m', '45-50% Pace')]),
      cooldown('10m', '72% Pace'),
    ],
  },
  {
    id: 'run-long-80',
    sport: 'Run',
    stimulus: 'LONG',
    name: 'Langer Lauf 80min',
    minutes: 80,
    load: 78,
    phases: ['BASE', 'BUILD', 'SPECIFIC'],
    coachNote: 'Aerobe Basis. Bei zwei bis drei Einheiten pro Woche die einzige echte Volumenquelle.',
    blocks: [step('80m', '76-84% Pace')],
  },
  {
    id: 'run-easy-strides',
    sport: 'Run',
    stimulus: 'ENDURANCE',
    name: 'Locker 40min + Steigerungen',
    minutes: 46,
    load: 40,
    phases: ['BASE', 'BUILD', 'SPECIFIC', 'TAPER', 'RECOVERY'],
    coachNote: 'Locker heißt locker. Die Steigerungen am Ende halten die Beine schnell.',
    blocks: [
      step('40m', '74-80% Pace'),
      repeat(6, [step('20s', '125-130% Pace'), step('60s', '55% Pace')]),
    ],
  },
  {
    id: 'run-thr-short-3x1k',
    sport: 'Run',
    stimulus: 'THRESHOLD',
    name: 'Schwelle kompakt 3x1km',
    minutes: 40,
    load: 48,
    phases: ['BASE', 'BUILD', 'SPECIFIC', 'TAPER'],
    coachNote: 'Die 40-Minuten-Version, wenn der Tag eng ist. Reiz bleibt, Umfang fällt.',
    blocks: [
      step('10m', '72-78% Pace', { label: 'Einlaufen' }),
      repeat(3, [step('1km', '100-104% Pace'), step('2m', '62-68% Pace')]),
      cooldown('6m', '72% Pace'),
    ],
  },
  {
    id: 'run-recovery-30',
    sport: 'Run',
    stimulus: 'RECOVERY',
    name: 'Regenerationslauf 30min',
    minutes: 30,
    load: 20,
    phases: ['BASE', 'BUILD', 'SPECIFIC', 'TAPER', 'RECOVERY'],
    coachNote: 'Ganz locker, gerne auf weichem Untergrund. Kein Blick auf die Uhr.',
    blocks: [step('30m', '68-75% Pace')],
  },
]

export const LIBRARY: readonly WorkoutTemplate[] = [...BIKE, ...RUN]

export const templatesFor = (sport: Sport): readonly WorkoutTemplate[] =>
  LIBRARY.filter((template) => template.sport === sport)

export const findTemplate = (id: string): WorkoutTemplate | undefined =>
  LIBRARY.find((template) => template.id === id)

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
const PREFERRED_SPORT: Partial<Record<Stimulus, Sport>> = {
  VO2: 'Run',
  THRESHOLD: 'Ride',
  SWEETSPOT: 'Ride',
  LONG: 'Run',
}

export const isPreferredSport = (stimulus: Stimulus, sport: Sport): boolean =>
  PREFERRED_SPORT[stimulus] === sport

export const STRENGTH_SESSION: StrengthSuggestion = {
  name: 'Krafttraining',
  minutes: 28,
  note: 'Direkt nach der Ausdauereinheit oder mindestens 6h später — nie am Tag davor. 2 Wiederholungen in Reserve, kein Muskelversagen. Ziel ist neuromuskuläre Anpassung, nicht Masse.',
  exercises: [
    { name: 'Kniebeuge / Beinpresse', sets: '4 × 5', load: '~85 % 1RM' },
    { name: 'Rumänisches Kreuzheben', sets: '3 × 6', load: 'schwer' },
    { name: 'Bulgarian Split Squat', sets: '3 × 6 je Seite', load: 'schwer' },
    { name: 'Einbeiniges Wadenheben', sets: '3 × 8', load: 'schwer' },
    { name: 'Rumpf (Plank, Pallof Press)', sets: '2 Sätze', load: '—' },
    { name: 'Optional vorweg: Hops / Drop Jumps', sets: '3 × 10', load: 'Körpergewicht' },
  ],
}

export const flattenBlocks = (blocks: readonly Block[]): readonly Step[] =>
  blocks.flatMap((block) =>
    block.kind === 'step'
      ? [block]
      : Array.from({ length: block.times }, () => block.steps).flat(),
  )
