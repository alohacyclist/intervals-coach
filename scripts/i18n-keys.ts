/**
 * Every sentence the code hands to `t`, as the catalogue has to know it. Run it to see
 * what the English catalogue is missing: `npx tsx scripts/i18n-keys.ts`. The test
 * tests/i18n-catalogue.test.ts uses the same list, so a new German sentence without
 * an English one fails the build instead of showing up half translated.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from '@babel/parser'
import { catalogueKey } from '../src/coach/lang.ts'
import { EN } from '../src/coach/i18n/en.ts'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SOURCES = ['src', 'server', 'worker']

type Node = { readonly type: string; readonly [key: string]: unknown }

const isNode = (value: unknown): value is Node =>
  typeof value === 'object' && value !== null && typeof (value as { type?: unknown }).type === 'string'

const filesIn = (directory: string): readonly string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? filesIn(join(directory, entry.name)) : /\.tsx?$/.test(entry.name) ? [join(directory, entry.name)] : [],
  )

const children = (node: Node): readonly Node[] =>
  Object.entries(node).flatMap(([key, value]) =>
    key === 'loc' ? [] : Array.isArray(value) ? value.filter(isNode) : isNode(value) ? [value] : [],
  )

const named = (node: unknown, name: string): boolean => isNode(node) && node.type === 'Identifier' && node['name'] === name

const keysOf = (node: Node): readonly string[] => {
  const below = children(node).flatMap(keysOf)
  if (node.type === 'CallExpression' && named(node['callee'], 't')) {
    const [first] = node['arguments'] as readonly Node[]
    return first?.type === 'StringLiteral' ? [String(first['value']).trim(), ...below] : below
  }
  if (node.type === 'TaggedTemplateExpression' && named(node['tag'], 't')) {
    const quasis = (node['quasi'] as Node)['quasis'] as readonly { readonly value: { readonly cooked: string } }[]
    return [catalogueKey(quasis.map((quasi) => quasi.value.cooked)).trim(), ...below]
  }
  return below
}

export type Usage = { readonly key: string; readonly file: string }

export const collectKeys = (): readonly Usage[] =>
  SOURCES.flatMap((source) => filesIn(join(ROOT, source))).flatMap((file) => {
    // Only a .tsx file may hold markup: in a .ts file `<T>(…)` is a generic, not an element.
    const plugins = file.endsWith('.tsx') ? (['typescript', 'jsx'] as const) : (['typescript'] as const)
    const program = parse(readFileSync(file, 'utf8'), { sourceType: 'module', plugins: [...plugins] }).program
    return keysOf(program as unknown as Node)
      .filter((key) => key !== '')
      .map((key) => ({ key, file: relative(ROOT, file) }))
  })

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const usages = collectKeys()
  const used = new Set(usages.map((usage) => usage.key))
  const missing = [...used].filter((key) => !(key in EN))
  const unused = Object.keys(EN).filter((key) => !used.has(key))
  if (process.argv.includes('--json')) {
    const byFile = new Map<string, string[]>()
    for (const usage of usages) {
      if (usage.key in EN) continue
      const list = byFile.get(usage.file) ?? []
      if (!list.includes(usage.key)) list.push(usage.key)
      byFile.set(usage.file, list)
    }
    console.log(JSON.stringify(Object.fromEntries(byFile), null, 1))
  } else {
    console.log(`${used.size} sentences, ${missing.length} without English, ${unused.length} in the catalogue but unused`)
    for (const key of missing) console.log(`fehlt:     ${key}`)
    for (const key of unused) console.log(`unbenutzt: ${key}`)
  }
}
