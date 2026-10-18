// The Google tokens a calendar link holds are sealed before they reach the
// database, with a key made from the CALENDAR_TOKEN_KEY setting: a copy of
// the database alone opens nobody's calendar. Each token is bound to the
// person it belongs to, so one cannot be moved to another person's row.
// The token Google sends with each push is kept only as a hash.

const VERSION = 'v1'
const encoder = new TextEncoder()
const keys = new Map<string, Promise<CryptoKey>>()

function keyFor(secret: string): Promise<CryptoKey> {
  let key = keys.get(secret)
  if (!key) {
    key = crypto.subtle
      .importKey('raw', encoder.encode(secret), 'HKDF', false, ['deriveKey'])
      .then((material) =>
        crypto.subtle.deriveKey(
          {
            name: 'HKDF',
            hash: 'SHA-256',
            salt: encoder.encode('todos calendar tokens'),
            info: encoder.encode(VERSION),
          },
          material,
          { name: 'AES-GCM', length: 256 },
          false,
          ['encrypt', 'decrypt'],
        ),
      )
    keys.set(secret, key)
  }
  return key
}

export async function seal(
  secret: string,
  plain: string,
  person: string,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const sealed = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(person) },
    await keyFor(secret),
    encoder.encode(plain),
  )
  return [VERSION, toBase64(iv), toBase64(new Uint8Array(sealed))].join('.')
}

/** Throws if the key is wrong, the text was changed, or it is another person's. */
export async function unseal(
  secret: string,
  sealed: string,
  person: string,
): Promise<string> {
  const [version, iv, data] = sealed.split('.')
  if (version !== VERSION || !iv || !data) throw new Error('not a sealed token')
  const plain = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: fromBase64(iv),
      additionalData: encoder.encode(person),
    },
    await keyFor(secret),
    fromBase64(data),
  )
  return new TextDecoder().decode(plain)
}

/** A random string fit for a URL or a header: `bytes` of randomness. */
export function randomToken(bytes = 32): string {
  return toBase64(crypto.getRandomValues(new Uint8Array(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(token))
  return toBase64(new Uint8Array(digest))
}

/** Whether `token` hashes to `hash`, in time that does not depend on where they differ. */
export async function matchesHash(
  token: string,
  hash: string,
): Promise<boolean> {
  const actual = await hashToken(token)
  if (actual.length !== hash.length) return false
  let difference = 0
  for (let i = 0; i < actual.length; i++) {
    difference |= actual.charCodeAt(i) ^ hash.charCodeAt(i)
  }
  return difference === 0
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}
