import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { PasswordLogin } from '../src/ui/PasswordLogin.tsx'
import { inLang } from '../src/coach/lang.ts'

const label = (language: 'de' | 'en', demo: boolean) =>
  inLang(language, () => renderToStaticMarkup(createElement(PasswordLogin, { onDone: () => {}, demo })))
    .match(/<label class="login__field"><span>([^<]+)<\/span>/)?.[1]

describe('the password field', () => {
  it('names the demo password in the language the page speaks', () => {
    expect(label('de', true)).toBe('Demo-Passwort')
    expect(label('en', true)).toBe('Demo password')
    expect(label('en', false)).toBe('Password')
  })
})
