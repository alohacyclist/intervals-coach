import { t } from '../coach/lang.ts'
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
    name: t('Fitness (CTL)'),
    what: t('Deine durchschnittliche Trainingsbelastung der letzten etwa sechs Wochen.'),
    why: t('Steigt sie langsam, wirst du belastbarer.'),
  },
  atl: {
    name: t('Ermüdung (ATL)'),
    what: t('Deine durchschnittliche Belastung der letzten etwa sieben Tage.'),
    why: t('Sie zeigt, wie viel frisches Training noch in den Beinen steckt.'),
  },
  tsb: {
    name: t('Form (TSB)'),
    what: t('Fitness minus Ermüdung.'),
    why: t('Im Plus bist du frisch, tief im Minus steigt das Risiko für Überlastung.'),
  },
  ramp: {
    name: t('Rampe'),
    what: t('Wie stark deine Fitness in der letzten Woche gestiegen ist.'),
    why: t('Mehr als etwa +6 pro Woche ist ein Warnsignal für Verletzungen.'),
  },
  tss: {
    name: t('TSS / Load'),
    what: t('Die Belastung einer Einheit aus Dauer und Intensität; eine Stunde an der Schwelle sind etwa 100.'),
    why: t('Daraus rechnet der Plan Fitness, Ermüdung und Form.'),
  },
  ftp: {
    name: 'FTP',
    what: t('Die Leistung in Watt, die du etwa eine Stunde lang halten kannst.'),
    why: t('Alle Wattvorgaben auf dem Rad sind Prozent davon.'),
  },
  thresholdPace: {
    name: t('Schwellenpace'),
    what: t('Das Lauftempo, das du etwa eine Stunde lang halten kannst.'),
    why: t('Alle Pace-Vorgaben beim Laufen richten sich danach.'),
  },
  css: {
    name: 'CSS',
    what: t('Critical Swim Speed: dein Schwellentempo im Wasser pro 100 m.'),
    why: t('Alle Vorgaben beim Schwimmen richten sich danach.'),
  },
  hrv: {
    name: 'HRV',
    what: t('Die Schwankung zwischen deinen Herzschlägen, morgens in Ruhe gemessen.'),
    why: t('Liegt sie deutlich unter deinem Normalwert, bist du noch nicht erholt.'),
  },
}
