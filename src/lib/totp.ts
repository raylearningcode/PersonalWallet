// Simple TOTP implementation for 2FA

const TOTP_WINDOW = 30 // seconds
const DIGITS = 6

function base32Decode(encoded: string): ArrayBuffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const cleaned = encoded.replace(/=/g, '').toUpperCase()
  let bits = 0
  let value = 0
  const decoded = []

  for (let i = 0; i < cleaned.length; i++) {
    const idx = alphabet.indexOf(cleaned[i])
    if (idx === -1) throw new Error('Invalid character in base32 string')
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      bits -= 8
      decoded.push((value >> bits) & 0xff)
    }
  }
  return new Uint8Array(decoded).buffer
}

export async function generateTOTPSecret(): Promise<string> {
  const bytes = crypto.getRandomValues(new Uint8Array(20))
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let result = ''
  for (let i = 0; i < bytes.length; i++) {
    result += alphabet[bytes[i] % 32]
  }
  return result
}

export async function verifyTOTP(secret: string, token: string): Promise<boolean> {
  try {
    const tokenNum = parseInt(token, 10)
    if (isNaN(tokenNum) || token.length !== DIGITS) return false

    const secretBuffer = base32Decode(secret)
    const now = Math.floor(Date.now() / 1000)

    // Check current and adjacent time windows for tolerance
    for (let offset = -1; offset <= 1; offset++) {
      const counter = Math.floor((now + offset * TOTP_WINDOW) / TOTP_WINDOW)
      const hmac = await computeHMAC(secretBuffer, counter)
      const code = extractCode(hmac)

      if (code === tokenNum) return true
    }

    return false
  } catch (err) {
    console.error('TOTP verification failed:', err)
    return false
  }
}

export function generateTOTPQRCode(secret: string, email: string, issuer = 'FinPath'): string {
  const accountName = encodeURIComponent(email)
  const issuerName = encodeURIComponent(issuer)
  const label = `${issuerName}:${accountName}`
  const params = `secret=${secret}&issuer=${issuerName}`
  const otpauthURL = `otpauth://totp/${label}?${params}`

  return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(otpauthURL)}`
}

async function computeHMAC(secret: ArrayBuffer, counter: number): Promise<Uint8Array> {
  const counterBuffer = new ArrayBuffer(8)
  const counterView = new DataView(counterBuffer)
  counterView.setBigInt64(0, BigInt(counter), false)

  const key = await crypto.subtle.importKey('raw', secret, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'])
  const hmac = await crypto.subtle.sign('HMAC', key, counterBuffer)

  return new Uint8Array(hmac)
}

function extractCode(hmac: Uint8Array): number {
  const offset = hmac[hmac.length - 1] & 0xf
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff)

  return code % Math.pow(10, DIGITS)
}
