/**
 * Minimal shapes of the Cloudflare runtime objects this Worker touches.
 * Declared locally so the project keeps a single, Node-flavoured type setup.
 */
export type KVNamespace = {
  get(key: string, type: 'text'): Promise<string | null>
  put(key: string, value: string): Promise<void>
}

export type Fetcher = {
  fetch(request: Request): Promise<Response>
}

export type Bindings = {
  readonly ASSETS: Fetcher
  readonly COACH_CONFIG: KVNamespace
  readonly INTERVALS_API_KEY: string
  readonly INTERVALS_ATHLETE_ID: string
  readonly APP_PASSWORD: string
  readonly APP_USER?: string
}
