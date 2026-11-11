/**
 * The language of this browser. Decided once, before anything is drawn, because the
 * app's tables of words are written when their modules load; a new choice therefore
 * reloads the page. This module has to be the first import of the entry file.
 */
import { isLang, setLangResolver } from '../coach/lang.ts'
import type { Lang } from '../coach/lang.ts'

const STORAGE_KEY = 'coach:lang'

/** Without a choice: German for a German browser, English for every other. */
export const preferredLang = (stored: string | null, browser: readonly string[]): Lang => {
  if (isLang(stored)) return stored
  const first = browser[0]?.toLowerCase() ?? 'de'
  return first.startsWith('de') ? 'de' : 'en'
}

const read = (): Lang => {
  let stored: string | null = null
  try {
    stored = window.localStorage.getItem(STORAGE_KEY)
  } catch {
    // Storage blocked: the browser's language decides.
  }
  return preferredLang(stored, navigator.languages?.length ? navigator.languages : [navigator.language])
}

/** Outside a browser — the tests — nothing is read and nothing is decided: German stays. */
const inBrowser = typeof window !== 'undefined' && typeof document !== 'undefined'

export const LANGUAGE: Lang = inBrowser ? read() : 'de'

if (inBrowser) {
  setLangResolver(() => LANGUAGE)
  document.documentElement.lang = LANGUAGE
}

export const chooseLanguage = (next: Lang): void => {
  if (next === LANGUAGE) return
  try {
    window.localStorage.setItem(STORAGE_KEY, next)
  } catch {
    // Without storage the choice cannot outlive the reload it needs.
    return
  }
  window.location.reload()
}
