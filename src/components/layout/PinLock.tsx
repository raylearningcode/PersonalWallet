import { useState, useEffect } from 'react'

export const PIN_STORAGE_KEY = 'finpath_pin'
export const PIN_SESSION_KEY = 'finpath_unlocked'
export const BIOMETRIC_CRED_KEY = 'finpath_biometric_cred_id'

export function hashPin(pin: string) {
  return btoa(pin + ':finpath')
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
  const [digits, setDigits] = useState('')
  const [error, setError] = useState(false)
  const [biometricAvailable, setBiometricAvailable] = useState(false)
  const [biometricLoading, setBiometricLoading] = useState(false)
  const hasBiometricCred = !!localStorage.getItem(BIOMETRIC_CRED_KEY)

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

  const handleBiometric = async () => {
    setBiometricLoading(true)
    const ok = await authenticateBiometric()
    setBiometricLoading(false)
    if (ok) onUnlock()
    else setError(true)
  }

  const press = (d: string) => {
    if (error) { setError(false); return }
    if (digits.length >= 4) return
    const next = digits + d
    setDigits(next)
    if (next.length === 4) {
      const stored = localStorage.getItem(PIN_STORAGE_KEY)
      if (stored === hashPin(next)) {
        onUnlock()
      } else {
        setError(true)
        setTimeout(() => { setDigits(''); setError(false) }, 700)
      }
    }
  }

  const del = () => {
    if (!error) setDigits(prev => prev.slice(0, -1))
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background px-6">
      <p className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">FinPath</p>
      <h1 className="mb-8 text-2xl font-extrabold text-foreground">Enter your PIN</h1>
      <div className="mb-3 flex gap-4">
        {[0, 1, 2, 3].map(i => (
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
        {error && <p className="text-sm font-bold text-[#FF8388]">Incorrect PIN</p>}
      </div>
      <div className="grid w-full max-w-[280px] grid-cols-3 gap-3">
        {(['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'] as const).map((key, i) =>
          key === '' ? <div key={i} /> : (
            <button
              key={key + i}
              type="button"
              onClick={() => key === '⌫' ? del() : press(key)}
              className="flex h-16 items-center justify-center rounded-2xl bg-secondary text-2xl font-extrabold text-foreground transition-all hover:bg-muted active:scale-95"
            >
              {key}
            </button>
          )
        )}
      </div>
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
