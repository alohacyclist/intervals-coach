import type { Bindings, KVNamespace } from './bindings.ts'

/**
 * "Tell me when it opens." The address goes straight to Brevo and is never kept
 * here: Brevo sends the confirmation mail, holds the list, carries the
 * unsubscribe link and keeps the proof of consent a German double opt-in needs.
 */

const BREVO_DOI_URL = 'https://api.brevo.com/v3/contacts/doubleOptinConfirmation'

export type BrevoConfig = {
  readonly apiKey: string
  readonly listId: number
  readonly templateId: number
  /** Where the confirmation link in the mail lands. */
  readonly redirectionUrl: string
}

/** Where a confirmed address is sent back to; the page thanks them. */
export const CONFIRMED_PATH = '/warteliste/bestaetigt'

export const brevoConfig = (env: Bindings, origin: string): BrevoConfig | null => {
  const listId = Number(env.BREVO_LIST_ID)
  const templateId = Number(env.BREVO_DOI_TEMPLATE_ID)
  if (!env.BREVO_API_KEY || !Number.isInteger(listId) || listId <= 0 || !Number.isInteger(templateId) || templateId <= 0) {
    return null
  }
  return { apiKey: env.BREVO_API_KEY, listId, templateId, redirectionUrl: `${origin}${CONFIRMED_PATH}` }
}

/** Deliberately plain: the confirmation mail is the real check that an address exists. */
export const isEmail = (value: string): boolean =>
  value.length <= 254 && /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(value)

export type Outcome = 'sent' | 'failed'

/**
 * Asks Brevo to send the confirmation mail. Only a confirmed address joins the
 * list. An address already on it counts as sent: saying otherwise would tell a
 * stranger who is signed up.
 */
export const requestDoubleOptIn = async (
  config: BrevoConfig,
  email: string,
  send: typeof fetch = fetch,
): Promise<Outcome> => {
  const response = await send(BREVO_DOI_URL, {
    method: 'POST',
    headers: { 'api-key': config.apiKey, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      email,
      includeListIds: [config.listId],
      templateId: config.templateId,
      redirectionUrl: config.redirectionUrl,
    }),
  }).catch(() => null)
  if (!response) return 'failed'
  if (response.ok) return 'sent'
  const body = (await response.json().catch(() => ({}))) as { code?: unknown }
  return body.code === 'duplicate_parameter' ? 'sent' : 'failed'
}

/** Enough for someone who mistyped twice, too few to use the form to mail strangers. */
export const MAX_SIGNUPS = 5
export const SIGNUP_WINDOW_SECONDS = 60 * 60

const key = (client: string): string => `waitlist-attempts:${client}`

/** Counts the attempt and says whether it is still within the allowance. */
export const allowSignup = async (namespace: KVNamespace, client: string): Promise<boolean> => {
  const stored = Number(await namespace.get(key(client), 'text'))
  const count = Number.isFinite(stored) && stored > 0 ? stored : 0
  if (count >= MAX_SIGNUPS) return false
  await namespace.put(key(client), String(count + 1), { expirationTtl: SIGNUP_WINDOW_SECONDS })
  return true
}
