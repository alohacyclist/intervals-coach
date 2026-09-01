const encoder = new TextEncoder()
const decoder = new TextDecoder()

const toBase64Url = (bytes: Uint8Array<ArrayBuffer>): string =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

// The ArrayBuffer parameter matters: Web Crypto rejects ArrayBufferLike-backed views.
const fromBase64Url = (value: string): Uint8Array<ArrayBuffer> => {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='))
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

const digest = async (secret: string, salt: string): Promise<ArrayBuffer> =>
  crypto.subtle.digest('SHA-256', encoder.encode(`${salt}:${secret}`))

const signingKey = async (secret: string): Promise<CryptoKey> =>
  crypto.subtle.importKey('raw', await digest(secret, 'sign'), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ])

const cipherKey = async (secret: string): Promise<CryptoKey> =>
  crypto.subtle.importKey('raw', await digest(secret, 'cipher'), { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ])

export const sign = async (value: string, secret: string): Promise<string> =>
  toBase64Url(new Uint8Array(await crypto.subtle.sign('HMAC', await signingKey(secret), encoder.encode(value))))

/** Constant time verification — crypto.subtle.verify does the comparison for us. */
export const verify = async (value: string, signature: string, secret: string): Promise<boolean> => {
  try {
    return await crypto.subtle.verify(
      'HMAC',
      await signingKey(secret),
      fromBase64Url(signature),
      encoder.encode(value),
    )
  } catch {
    return false
  }
}

/** Encrypts OAuth tokens before they touch KV, so a KV leak alone is not enough. */
export const encryptJson = async (value: unknown, secret: string): Promise<string> => {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await cipherKey(secret),
    encoder.encode(JSON.stringify(value)),
  )
  return `${toBase64Url(iv)}.${toBase64Url(new Uint8Array(cipher))}`
}

export const decryptJson = async <T>(payload: string, secret: string): Promise<T | null> => {
  const [ivPart, cipherPart] = payload.split('.')
  if (!ivPart || !cipherPart) return null
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64Url(ivPart) },
      await cipherKey(secret),
      fromBase64Url(cipherPart),
    )
    return JSON.parse(decoder.decode(plain)) as T
  } catch {
    return null
  }
}

export const randomToken = (): string => toBase64Url(crypto.getRandomValues(new Uint8Array(24)))

export { toBase64Url, fromBase64Url }
