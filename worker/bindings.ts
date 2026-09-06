/**
 * Minimal shapes of the Cloudflare runtime objects this Worker touches.
 * Declared locally so the project keeps a single, Node-flavoured type setup.
 */
/** `expirationTtl` is how the retention promise is kept: the store forgets on its own. */
export type KVPutOptions = { readonly expirationTtl?: number }

export type KVNamespace = {
  get(key: string, type: 'text'): Promise<string | null>
  put(key: string, value: string, options?: KVPutOptions): Promise<void>
  delete(key: string): Promise<void>
}

export type Fetcher = {
  fetch(request: Request): Promise<Response>
}

export type Bindings = {
  readonly ASSETS: Fetcher
  readonly COACH_CONFIG: KVNamespace

  /** Multi user mode: set all three to enable "sign in with intervals.icu". */
  readonly INTERVALS_CLIENT_ID?: string
  readonly INTERVALS_CLIENT_SECRET?: string
  readonly SESSION_SECRET?: string

  /** Single user mode: a personal API key behind one shared password. */
  readonly INTERVALS_API_KEY?: string
  readonly INTERVALS_ATHLETE_ID?: string
  readonly APP_PASSWORD?: string
  readonly APP_USER?: string
}

export type MultiUserBindings = Bindings & {
  readonly INTERVALS_CLIENT_ID: string
  readonly INTERVALS_CLIENT_SECRET: string
  readonly SESSION_SECRET: string
}

export const isMultiUser = (env: Bindings): env is MultiUserBindings =>
  Boolean(env.INTERVALS_CLIENT_ID && env.INTERVALS_CLIENT_SECRET && env.SESSION_SECRET)
