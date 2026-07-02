// SINGLE SOURCE OF TRUTH for all sensitive field names
// Import this wherever redaction is needed — never hardcode lists elsewhere

export const REDACT_KEYS = [
  'password',
  'token',
  'access_token',
  'refresh_token',
  'secret',
  'ssn',
  'card_number',
  'cvv',
  'authorization',
  'encrypted_value',
  'CREDENTIAL_ENCRYPTION_KEY',
  'STREAM_TOKEN_SECRET',
  'CLERK_SECRET_KEY',
] as const

export type RedactKey = (typeof REDACT_KEYS)[number]

// Pino logger redact paths
export const PINO_REDACT_PATHS = [
  'req.headers.authorization',
  'req.body.password',
  'req.body.token',
  'req.body.secret',
  'req.body.access_token',
  'req.body.refresh_token',
  '*.encrypted_value',
  ...REDACT_KEYS.map((k) => `*.${k}`),
]
