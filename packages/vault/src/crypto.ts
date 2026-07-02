import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12   // 96-bit IV recommended for GCM
const TAG_LENGTH = 16  // 128-bit auth tag

function getKey(): Buffer {
  const raw = process.env['CREDENTIAL_ENCRYPTION_KEY']
  if (!raw) throw new Error('CREDENTIAL_ENCRYPTION_KEY is not set')
  const key = Buffer.from(raw, 'hex')
  if (key.length !== 32) throw new Error('CREDENTIAL_ENCRYPTION_KEY must be 32 bytes (64 hex chars)')
  return key
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Returns a colon-delimited hex string: "iv:authTag:ciphertext"
 */
export function encryptCredential(plaintext: string): string {
  const key = getKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH })

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  return [iv.toString('hex'), authTag.toString('hex'), encrypted.toString('hex')].join(':')
}

/**
 * Decrypts a stored AES-256-GCM value.
 * Expects the format produced by encryptCredential: "iv:authTag:ciphertext"
 */
export function decryptCredential(stored: string): string {
  const parts = stored.split(':')
  if (parts.length !== 3) throw new Error('Invalid encrypted credential format')
  const [ivHex, authTagHex, ciphertextHex] = parts as [string, string, string]

  const key = getKey()
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')
  const ciphertext = Buffer.from(ciphertextHex, 'hex')

  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH })
  decipher.setAuthTag(authTag)

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  return decrypted.toString('utf8')
}

/**
 * Builds a redacted preview for display (last 4 chars visible).
 * Only safe for bearer tokens and API keys — returns null for passwords/oauth.
 */
export function buildPreview(type: string, value: string): string | null {
  const safeTypes = ['bearer', 'api_key']
  if (!safeTypes.includes(type)) return null
  if (value.length < 8) return null
  return `...${value.slice(-4)}`
}
