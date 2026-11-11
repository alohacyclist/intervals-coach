import { describe, expect, it } from 'vitest'
import { catalogueKey, inLang, lang, locale, perLang, pick, t } from '../src/coach/lang.ts'

describe('language', () => {
  it('is German unless something says otherwise', () => {
    expect(lang()).toBe('de')
    expect(t('Ruhetag')).toBe('Ruhetag')
  })

  it('translates inside inLang and restores what applied before, also after a throw', () => {
    expect(inLang('en', () => t('Ruhetag'))).toBe('Rest day')
    expect(() => inLang('en', () => { throw new Error('x') })).toThrow()
    expect(lang()).toBe('de')
    expect(inLang('en', () => inLang('de', () => lang()))).toBe('de')
  })

  it('leaves a sentence without a translation in German', () => {
    expect(inLang('en', () => t('Das steht in keinem Katalog'))).toBe('Das steht in keinem Katalog')
  })

  it('keeps the space around a sentence where it was written', () => {
    expect(inLang('en', () => t(' Ruhetag '))).toBe(' Rest day ')
  })

  it('fills the values of a tagged sentence into their places', () => {
    const count = 3
    expect(t`${count} Tage ohne Katalog`).toBe('3 Tage ohne Katalog')
    expect(catalogueKey(['', ' von ', ' Tagen'])).toBe('{0} von {1} Tagen')
  })

  it('writes numbers in the locale of the language', () => {
    expect(locale()).toBe('de-DE')
    expect(inLang('en', locale)).toBe('en-GB')
    expect(inLang('en', () => pick('Tempo', 'Pace'))).toBe('Pace')
  })
})

describe('a table written once per language', () => {
  const labels = perLang(() => ({ rest: t('Ruhetag'), fixed: 'VO2max' }))
  const list = perLang(() => [{ name: t('Ruhetag') }, { name: 'VO2max' }])

  it('reads in the language of whoever asks', () => {
    expect(labels.rest).toBe('Ruhetag')
    expect(inLang('en', () => labels.rest)).toBe('Rest day')
    expect(inLang('en', () => Object.entries(labels))).toEqual([['rest', 'Rest day'], ['fixed', 'VO2max']])
    expect(inLang('en', () => ({ ...labels }))).toEqual({ rest: 'Rest day', fixed: 'VO2max' })
    expect('rest' in labels).toBe(true)
  })

  it('behaves like the array it stands for', () => {
    expect(Array.isArray(list)).toBe(true)
    expect(list).toHaveLength(2)
    expect(list.map((entry) => entry.name)).toEqual(['Ruhetag', 'VO2max'])
    expect(inLang('en', () => [...list].map((entry) => entry.name))).toEqual(['Rest day', 'VO2max'])
    expect(inLang('en', () => list.find((entry) => entry.name === 'Rest day'))).toBeDefined()
    expect(inLang('en', () => JSON.stringify(list))).toBe('[{"name":"Rest day"},{"name":"VO2max"}]')
  })

  it('hands out the same entries every time within a language', () => {
    expect(list[0]).toBe(list[0])
    expect(inLang('en', () => list[0])).toBe(inLang('en', () => list[0]))
  })
})
