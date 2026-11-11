/**
 * The language of one request. A server answers athletes of both languages at the
 * same moment, so the language cannot be a setting of the program: it travels with
 * the request, through every await, and `t` asks for it where a sentence is written.
 * Outside a request — the scheduled Strava run — German applies.
 */
import { AsyncLocalStorage } from 'node:async_hooks'
import type { Context, Next } from 'hono'
import { isLang, setLangResolver } from '../src/coach/lang.ts'
import type { Lang } from '../src/coach/lang.ts'

const current = new AsyncLocalStorage<Lang>()

setLangResolver(() => current.getStore() ?? 'de')

/** The header the app sends with every request; anything else leaves the answer German. */
export const LANG_HEADER = 'X-Formkurve-Lang'

export const withLang = <T>(language: Lang, work: () => T): T => current.run(language, work)

export const languageMiddleware = (context: Context, next: Next): Promise<void> => {
  const wanted = context.req.header(LANG_HEADER)
  return withLang(isLang(wanted) ? wanted : 'de', next)
}
