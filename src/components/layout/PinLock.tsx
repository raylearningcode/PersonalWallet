import { useState, useEffect, useRef } from 'react'
import { verifyTOTP } from '@/lib/totp'

export const PIN_STORAGE_KEY = 'finpath_pin'
export const PIN_SESSION_KEY = 'finpath_unlocked'
export const BIOMETRIC_CRED_KEY = 'finpath_biometric_cred_id'
export const TOTP_SECRET_KEY = 'finpath_totp_secret'

const MAX_PIN_ATTEMPTS = 5
const PIN_LOCKOUT_MS = 30_000

const PIN_SALT = 'finpath-pin-salt-v1'
const HASH_RE = /^[0-9a-f]{64}$/

export async function hashPin(pin: string): Promise<string> {
  const data = new TextEncoder().encode(`${PIN_SALT}:${pin}`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function isBiometricAvailable(): Promise<boolean> {
  try {
    if (!window.PublicKeyCredential) return false
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
  } catch {
    return false
  }
}

export async function registerBiometric(): Promise<boolean> {
  try {
    const credential = await navigator.credentials.create({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rp: { name: 'FinPath', id: window.location.hostname },
        user: {
          id: crypto.getRandomValues(new Uint8Array(16)),
          name: 'finpath-user',
          displayName: 'FinPath User',
        },
        pubKeyCredParams: [{ alg: -7, type: 'public-key' }, { alg: -257, type: 'public-key' }],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
        },
        timeout: 60000,
      },
    }) as PublicKeyCredential | null
    if (!credential) return false
    const credId = btoa(String.fromCharCode(...new Uint8Array(credential.rawId)))
    localStorage.setItem(BIOMETRIC_CRED_KEY, credId)
    return true
  } catch {
    return false
  }
}

export async function authenticateBiometric(): Promise<boolean> {
  try {
    const storedId = localStorage.getItem(BIOMETRIC_CRED_KEY)
    if (!storedId) return false
    const rawId = Uint8Array.from(atob(storedId), c => c.charCodeAt(0))
    const credential = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [{ type: 'public-key', id: rawId }],
        userVerification: 'required',
        timeout: 60000,
      },
    })
    return !!credential
  } catch {
    return false
  }
}

export function PinLockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [stage, setStage] = useState<'pin' | 'totp'>('pin')
  const [digits, setDigits] = useState('')
  const [error, setError] = useState(false)
  const [biometricAvailable, setBiometricAvailable] = useState(false)
  const [biometricLoading, setBiometricLoading] = useState(false)
  const [lockLeft, setLockLeft] = useState(0)
  const hasBiometricCred = !!localStorage.getItem(BIOMETRIC_CRED_KEY)
  const digitsRef = useRef('')
  const errorRef = useRef(false)
  const errorTimerRef = useRef<number | null>(null)
  const failsRef = useRef(0)
  const lockUntilRef = useRef(0)
  const locked = lockLeft > 0

  // Countdown for the attempt lockout
  useEffect(() => {
    if (!locked) return
    const t = window.setInterval(() => {
      const left = lockUntilRef.current - Date.now()
      setLockLeft(left > 0 ? left : 0)
    }, 400)
    return () => window.clearInterval(t)
  }, [locked])

  useEffect(() => {
    isBiometricAvailable().then(setBiometricAvailable)
  }, [])

  // Auto-prompt biometric if registered
  useEffect(() => {
    if (biometricAvailable && hasBiometricCred) {
      handleBiometric()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [biometricAvailable])

  useEffect(() => {
    return () => {
      if (errorTimerRef.current) window.clearTimeout(errorTimerRef.current)
    }
  }, [])

  const handleUnlock = () => {
    try { sessionStorage.setItem(PIN_SESSION_KEY, '1') } catch { /* ignore */ }
    onUnlock()
  }

  const handleBiometric = async () => {
    setBiometricLoading(true)
    const ok = await authenticateBiometric()
    setBiometricLoading(false)
    if (ok) handleUnlock()
    else setError(true)
  }

  const fail = (kind: 'pin' | 'totp' = 'pin') => {
    // Lockout counts PIN failures only — a wrong authenticator code is not a brute-force signal
    if (kind === 'pin') {
      failsRef.current += 1
      if (failsRef.current >= MAX_PIN_ATTEMPTS) {
        failsRef.current = 0
        lockUntilRef.current = Date.now() + PIN_LOCKOUT_MS
        setLockLeft(PIN_LOCKOUT_MS)
      }
    }
    errorRef.current = true
    setError(true)
    digitsRef.current = ''
    setDigits('')
    if (errorTimerRef.current) window.clearTimeout(errorTimerRef.current)
    errorTimerRef.current = window.setTimeout(() => {
      errorRef.current = false
      setError(false)
      errorTimerRef.current = null
    }, 700)
  }

  const verifyPin = async (entered: string): Promise<boolean> => {
    try {
      const stored = localStorage.getItem(PIN_STORAGE_KEY)
      if (!stored) return false
      if (HASH_RE.test(stored)) return (await hashPin(entered)) === stored
      // Legacy btoa value — verify once via the old comparison, then upgrade in place.
      if (stored === btoa(entered + ':finpath')) {
        localStorage.setItem(PIN_STORAGE_KEY, await hashPin(entered))
        return true
      }
      return false
    } catch {
      return false
    }
  }

  const press = (d: string) => {
    if (locked) return
    // First press after an error resets the entry and registers the digit
    // (instead of being swallowed like before).
    const base = errorRef.current ? '' : digitsRef.current
    if (errorRef.current) {
      errorRef.current = false
      setError(false)
      if (errorTimerRef.current) {
        window.clearTimeout(errorTimerRef.current)
        errorTimerRef.current = null
      }
    }
    const maxLen = stage === 'totp' ? 6 : 4
    if (base.length >= maxLen) return
    const next = base + d
    digitsRef.current = next
    setDigits(next)
    if (next.length === maxLen) {
      if (stage === 'totp') {
        const secret = localStorage.getItem(TOTP_SECRET_KEY)
        verifyTOTP(secret ?? '', next).then(ok => {
          if (ok) handleUnlock()
          else fail('totp')
        })
      } else {
        verifyPin(next).then(ok => {
          if (!ok) { fail('pin'); return }
          // Two-step unlock: PIN first, then authenticator code when TOTP is enabled
          if (localStorage.getItem(TOTP_SECRET_KEY)) {
            setStage('totp')
            digitsRef.current = ''
            setDigits('')
            errorRef.current = false
            setError(false)
          } else {
            handleUnlock()
          }
        })
      }
    }
  }

  const del = () => {
    if (errorRef.current) return
    const next = digitsRef.current.slice(0, -1)
    digitsRef.current = next
    setDigits(next)
  }

  const handlersRef = useRef({ press, del })
  handlersRef.current = { press, del }

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) { handlersRef.current.press(e.key); return }
      if (e.key === 'Backspace') { handlersRef.current.del(); return }
      if (e.key === 'Escape') {
        errorRef.current = false
        setError(false)
        digitsRef.current = ''
        setDigits('')
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background px-6">
      <p className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">FinPath</p>
      <h1 className="text-2xl font-extrabold text-foreground">{stage === 'totp' ? 'Enter authenticator code' : 'Enter your PIN'}</h1>
      {stage === 'totp' && (
        <p className="mb-5 mt-1 text-sm text-muted-foreground">Two-step verification is on — open your authenticator app</p>
      )}
      <div className={`mb-3 flex ${stage === 'totp' ? 'mt-4 gap-3' : 'mt-8 gap-4'}`}>
        {Array.from({ length: stage === 'totp' ? 6 : 4 }).map((_, i) => (
          <div
            key={i}
            className={`h-4 w-4 rounded-full border-2 transition-colors duration-150 ${
              error
                ? 'border-[#FF8388] bg-[#FF8388]'
                : i < digits.length
                  ? 'border-primary bg-primary'
                  : 'border-muted-foreground bg-transparent'
            }`}
          />
        ))}
      </div>
      <div className="mb-6 h-5">
        {locked ? (
          <p className="text-sm font-bold text-[#FFCF73]">Too many attempts — try again in {Math.ceil(lockLeft / 1000)}s</p>
        ) : error ? (
          <p className="text-sm font-bold text-[#FF8388]">{stage === 'totp' ? 'Incorrect code' : 'Incorrect PIN'}</p>
        ) : null}
      </div>
      <div className="grid w-full max-w-[280px] grid-cols-3 gap-3">
        {(['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'] as const).map((key, i) =>
          key === '' ? <div key={i} /> : (
            <button
              key={key + i}
              type="button"
              disabled={locked}
              onClick={() => key === '⌫' ? del() : press(key)}
              className="flex h-16 items-center justify-center rounded-2xl bg-secondary text-2xl font-extrabold text-foreground transition-all hover:bg-muted active:scale-95 disabled:opacity-40 disabled:active:scale-100"
            >
              {key}
            </button>
          )
        )}
      </div>
      {stage === 'totp' && (
        <button
          type="button"
          onClick={() => {
            setStage('pin')
            digitsRef.current = ''
            setDigits('')
            errorRef.current = false
            setError(false)
          }}
          className="mt-4 text-sm font-bold text-muted-foreground transition-colors hover:text-foreground"
        >
          ← Back to PIN
        </button>
      )}
      {biometricAvailable && hasBiometricCred && (
        <button
          type="button"
          onClick={handleBiometric}
          disabled={biometricLoading}
          className="mt-6 flex items-center gap-2 rounded-xl border border-border bg-secondary px-5 py-3 text-sm font-bold text-foreground transition-colors hover:bg-muted disabled:opacity-50"
        >
          {biometricLoading ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          ) : (
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4" />
            </svg>
          )}
          Use biometrics
        </button>
      )}
    </div>
  )
}
