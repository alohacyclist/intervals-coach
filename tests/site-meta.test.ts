import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const html = readFileSync(`${root}index.html`, 'utf8')
const manifest = JSON.parse(readFileSync(`${root}public/manifest.webmanifest`, 'utf8')) as {
  name: string
  display: string
  start_url: string
  icons: { src: string; sizes: string }[]
}

const meta = (attribute: 'name' | 'property', key: string): string | undefined =>
  html.match(new RegExp(`${attribute}="${key}"[^>]*content="([^"]+)"`))?.[1] ??
  html.match(new RegExp(`${attribute}="${key}"\\s+content="([^"]+)"`, 's'))?.[1]

describe('index.html', () => {
  it('describes the app for search and link previews', () => {
    expect(html).toMatch(/name="description"\s+content="[^"]{50,}"/)
    for (const key of ['og:title', 'og:description', 'og:image', 'og:url']) {
      expect(meta('property', key), key).toBeTruthy()
    }
    for (const key of ['twitter:card', 'twitter:image']) expect(meta('name', key), key).toBeTruthy()
  })

  it('points previews at an image that is shipped', () => {
    const image = meta('property', 'og:image') ?? ''
    expect(image).toMatch(/^https:\/\//)
    expect(existsSync(`${root}public${new URL(image).pathname}`)).toBe(true)
  })

  it('links the manifest and sets a theme colour', () => {
    expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest" />')
    expect(html).toContain('name="theme-color"')
  })
})

describe('web app manifest', () => {
  it('installs as Formkurve in its own window', () => {
    expect(manifest.name).toBe('Formkurve')
    expect(manifest.display).toBe('standalone')
    expect(manifest.start_url).toBe('/app')
  })

  it('only names icons that exist, including a 512 px one', () => {
    for (const icon of manifest.icons) expect(existsSync(`${root}public${icon.src}`), icon.src).toBe(true)
    expect(manifest.icons.some((icon) => icon.sizes === '512x512')).toBe(true)
  })
})
