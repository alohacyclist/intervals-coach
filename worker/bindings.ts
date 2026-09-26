/**
 * Minimal shapes of the Cloudflare runtime objects this Worker touches.
 * Declared locally so the project keeps a single, Node-flavoured type setup.
 */
/** `expirationTtl` is how the retention promise is kept: the store forgets on its own. */
export type KVPutOptions = {
  readonly expirationTtl?: number
  /** Absolute, in Unix seconds — for a write that must not move the expiry. */
  readonly expiration?: number
}

export type KVListResult = {
  readonly keys: readonly { readonly name: string; readonly expiration?: number }[]
  readonly list_complete: boolean
  readonly cursor?: string
}

export type KVNamespace = {
  get(key: string, type: 'text'): Promise<string | null>
  put(key: string, value: string, options?: KVPutOptions): Promise<void>
  delete(key: string): Promise<void>
  list(options: { readonly prefix: string; readonly cursor?: string }): Promise<KVListResult>
}

/** What the cron handler is given besides the bindings. */
export type ExecutionContext = {
  waitUntil(promise: Promise<unknown>): void
}

export type Fetcher = {
  fetch(request: Request): Promise<Response>
}

/** Filled in by Cloudflare through the `version_metadata` binding; absent under tests and `wrangler dev`. */
export type VersionMetadata = {
  readonly id: string
  readonly tag?: string
  readonly timestamp?: string
}

/** Cloudflare's rate limiting binding: counts per key within the period set in wrangler.jsonc. */
export type RateLimiter = {
  limit(options: { readonly key: string }): Promise<{ readonly success: boolean }>
}

export type Bindings = {
  readonly ASSETS: Fetcher
  readonly COACH_CONFIG: KVNamespace
  readonly CF_VERSION_METADATA?: VersionMetadata
  /** Multi user mode: requests per athlete and minute on `/api/*`. */
  readonly API_LIMITER?: RateLimiter

  /** Multi user mode: set all three to enable "sign in with intervals.icu". */
  readonly INTERVALS_CLIENT_ID?: string
  readonly INTERVALS_CLIENT_SECRET?: string
  readonly SESSION_SECRET?: string

  /** Optional in either mode: set both to let athletes connect Strava. */
  readonly STRAVA_CLIENT_ID?: string
  readonly STRAVA_CLIENT_SECRET?: string

  /** Single user mode: a personal API key behind one shared password. */
  readonly INTERVALS_API_KEY?: string
  readonly INTERVALS_ATHLETE_ID?: string
  readonly APP_PASSWORD?: string

  /** Optional in either mode: set all three to open the waitlist on the landing page. */
  readonly BREVO_API_KEY?: string
  readonly BREVO_LIST_ID?: string
  readonly BREVO_DOI_TEMPLATE_ID?: string
}

export type MultiUserBindings = Bindings & {
  readonly INTERVALS_CLIENT_ID: string
  readonly INTERVALS_CLIENT_SECRET: string
  readonly SESSION_SECRET: string
}

export const isMultiUser = (env: Bindings): env is MultiUserBindings =>
  Boolean(env.INTERVALS_CLIENT_ID && env.INTERVALS_CLIENT_SECRET && env.SESSION_SECRET)

export const hasStrava = (env: Bindings): boolean => Boolean(env.STRAVA_CLIENT_ID && env.STRAVA_CLIENT_SECRET)
