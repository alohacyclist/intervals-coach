/**
 * The language of everything the athlete reads. German is the language the app is
 * written in: every sentence stands in the code in German, and `t` looks its English
 * counterpart up in a catalogue keyed by that very sentence. So the logic and its
 * tests read as before, and a sentence without a translation stays German rather
 * than turning into a key.
 *
 * Which language applies is asked anew at every call, because a server answers
 * athletes of both languages at once: the browser sets it once per page, the server
 * per request (server/lang.ts).
 */
import { EN } from './i18n/en.ts'

export type Lang = 'de' | 'en'

export const LANGS: readonly Lang[] = ['de', 'en']

export const isLang = (value: unknown): value is Lang => value === 'de' || value === 'en'

let resolver: () => Lang = () => 'de'
/** Set for the length of one synchronous call by `inLang`; wins over the resolver. */
let forced: Lang | null = null

/** Who decides the language: once per program, by the browser or the server. */
export const setLangResolver = (next: () => Lang): void => {
  resolver = next
}

export const lang = (): Lang => forced ?? resolver()

/** Runs `work` in one language, whatever applies around it. Synchronous work only. */
export const inLang = <T>(language: Lang, work: () => T): T => {
  const before = forced
  forced = language
  try {
    return work()
  } finally {
    forced = before
  }
}

/** The locale numbers and dates are written in. */
export const locale = (): 'de-DE' | 'en-GB' => (lang() === 'en' ? 'en-GB' : 'de-DE')

/** A template's fixed parts with numbered gaps: the form a sentence has in the catalogue. */
export const catalogueKey = (parts: readonly string[]): string =>
  parts.reduce((key, part, index) => (index === 0 ? part : `${key}{${index - 1}}${part}`), '')

const fill = (pattern: string, values: readonly unknown[]): string =>
  pattern.replace(/\{(\d+)\}/g, (_match, index: string) => String(values[Number(index)] ?? ''))

/** Space around a sentence belongs to where it stands, not to the sentence: it is kept as written. */
const translate = (text: string): string | undefined => {
  const core = text.trim()
  if (core === '') return undefined
  const found = EN[core]
  if (found === undefined) return undefined
  const start = text.indexOf(core)
  return `${text.slice(0, start)}${found}${text.slice(start + core.length)}`
}

/**
 * The sentence in the athlete's language. Called with a string, or as a tag in front
 * of a template, where the values keep their places even if English orders them differently.
 */
export function t(text: string): string
export function t(parts: TemplateStringsArray, ...values: readonly unknown[]): string
export function t(input: string | TemplateStringsArray, ...values: readonly unknown[]): string {
  if (typeof input === 'string') return lang() === 'en' ? (translate(input) ?? input) : input
  const key = catalogueKey(input)
  const pattern = lang() === 'en' ? (translate(key) ?? key) : key
  return fill(pattern, values)
}

/**
 * A table of words that is written once at the top of a module, yet has to read in
 * the language of whoever asks. It is built once per language on first use, and
 * behaves like the plain object or array it stands for.
 */
export const perLang = <T extends object>(build: () => T): T => {
  const german = inLang('de', build)
  const built: Partial<Record<Lang, T>> = { de: german }
  const current = (): T => {
    const language = lang()
    const known = built[language]
    if (known) return known
    const fresh = inLang(language, build)
    built[language] = fresh
    return fresh
  }
  // The German table is what the stand-in is made of, so it is an array where that is one.
  return new Proxy(german, {
    get: (_target, key) => {
      const source = current()
      return Reflect.get(source, key, source) as unknown
    },
    has: (_target, key) => Reflect.has(current(), key),
    ownKeys: () => Reflect.ownKeys(current()),
    getOwnPropertyDescriptor: (_target, key) => Reflect.getOwnPropertyDescriptor(current(), key),
  })
}

/** For the rare word that is one in German and two in English: "Tempo" is a pace and a zone. */
export const pick = (de: string, en: string): string => (lang() === 'en' ? en : de)
