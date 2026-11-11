import { describe, expect, it } from 'vitest'
import { EN } from '../src/coach/i18n/en.ts'
import { collectKeys } from '../scripts/i18n-keys.ts'

const usages = collectKeys()
const used = new Set(usages.map((usage) => usage.key))
const gaps = (text: string): readonly string[] => [...new Set(text.match(/\{\d+\}/g) ?? [])].sort()

describe('English catalogue', () => {
  it('knows every sentence the code writes', () => {
    const missing = [...used].filter((key) => !(key in EN))
    expect(missing, 'add these to src/coach/i18n/en.ts').toEqual([])
  })

  it('holds nothing the code no longer writes', () => {
    expect(Object.keys(EN).filter((key) => !used.has(key))).toEqual([])
  })

  it('keeps every value of a sentence, and invents none', () => {
    const wrong = Object.entries(EN).filter(([german, english]) => gaps(german).join() !== gaps(english).join())
    expect(wrong.map(([german]) => german)).toEqual([])
  })

  it('keeps the marker a coach note is filled in at', () => {
    for (const [german, english] of Object.entries(EN)) {
      if (german.includes('{ftp-ziel}')) expect(english).toContain('{ftp-ziel}')
    }
  })
})
