/**
 * The training terms the app shows, each in one sentence plus why it matters.
 * Kept short on purpose: it answers "what is that number" on a phone, it is not
 * a lesson in training theory.
 */

export type GlossaryTerm = 'ctl' | 'atl' | 'tsb' | 'ramp' | 'tss' | 'ftp' | 'thresholdPace' | 'css' | 'hrv'

export type GlossaryEntry = {
  readonly name: string
  readonly what: string
  readonly why: string
}

export const GLOSSARY: Readonly<Record<GlossaryTerm, GlossaryEntry>> = {
  ctl: {
    name: 'Fitness (CTL)',
    what: 'Deine durchschnittliche Trainingsbelastung der letzten etwa sechs Wochen.',
    why: 'Steigt sie langsam, wirst du belastbarer.',
  },
  atl: {
    name: 'Ermüdung (ATL)',
    what: 'Deine durchschnittliche Belastung der letzten etwa sieben Tage.',
    why: 'Sie zeigt, wie viel frisches Training noch in den Beinen steckt.',
  },
  tsb: {
    name: 'Form (TSB)',
    what: 'Fitness minus Ermüdung.',
    why: 'Im Plus bist du frisch, tief im Minus steigt das Risiko für Überlastung.',
  },
  ramp: {
    name: 'Rampe',
    what: 'Wie stark deine Fitness in der letzten Woche gestiegen ist.',
    why: 'Mehr als etwa +6 pro Woche ist ein Warnsignal für Verletzungen.',
  },
  tss: {
    name: 'TSS / Load',
    what: 'Die Belastung einer Einheit aus Dauer und Intensität; eine Stunde an der Schwelle sind etwa 100.',
    why: 'Daraus rechnet der Plan Fitness, Ermüdung und Form.',
  },
  ftp: {
    name: 'FTP',
    what: 'Die Leistung in Watt, die du etwa eine Stunde lang halten kannst.',
    why: 'Alle Wattvorgaben auf dem Rad sind Prozent davon.',
  },
  thresholdPace: {
    name: 'Schwellenpace',
    what: 'Das Lauftempo, das du etwa eine Stunde lang halten kannst.',
    why: 'Alle Pace-Vorgaben beim Laufen richten sich danach.',
  },
  css: {
    name: 'CSS',
    what: 'Critical Swim Speed: dein Schwellentempo im Wasser pro 100 m.',
    why: 'Alle Vorgaben beim Schwimmen richten sich danach.',
  },
  hrv: {
    name: 'HRV',
    what: 'Die Schwankung zwischen deinen Herzschlägen, morgens in Ruhe gemessen.',
    why: 'Liegt sie deutlich unter deinem Normalwert, bist du noch nicht erholt.',
  },
}
