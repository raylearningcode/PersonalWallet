import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuthSession, useSignIn, useSignUp } from '@/lib/queries'
import { useKeyboardVisible } from '@/hooks/useKeyboardVisible'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Toaster } from 'sonner'

export function AuthPage() {
  const navigate = useNavigate()
  const { data: session } = useAuthSession()
  const signIn = useSignIn()
  const signUp = useSignUp()
  const keyboardVisible = useKeyboardVisible()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')

  if (session) {
    return <Navigate to="/" replace />
  }

  const handleSignIn = async () => {
    try {
      await signIn.mutateAsync({ email, password })
      toast.success('Logged in')
      navigate('/', { replace: true })
    } catch {
      toast.error('Login failed — check your email and password')
    }
  }

  const handleSignUp = async () => {
    try {
      await signUp.mutateAsync({ email, password })
      toast.success('Account created — check your email if confirmation is required')
      navigate('/', { replace: true })
    } catch {
      toast.error('Sign up failed — try a different email or stronger password')
    }
  }

  return (
    <div
      className="flex min-h-screen flex-col bg-background px-6"
      style={{ paddingBottom: keyboardVisible ? 'env(keyboard-inset-height, 300px)' : 'env(safe-area-inset-bottom, 24px)' }}
    >
      <Toaster richColors position="top-center" />

      {/* Back button */}
      <div className="flex items-center pt-4" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 16px)' }}>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground active:bg-muted"
        >
          ←
        </button>
      </div>

      <div className="flex flex-1 flex-col justify-center">
        {/* Logo / header */}
        <div className="mb-3">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-xl font-extrabold text-primary-foreground">
            F
          </div>
          <h1 className="text-3xl font-extrabold text-foreground">FinPath</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {mode === 'signin' ? 'Sign in to sync your wallets across devices.' : 'Create an account to keep your data safe.'}
          </p>
        </div>

        {/* Form */}
        <div className="space-y-2">
          <div>
            <label className="mb-1.5 block text-sm font-bold text-muted-foreground">Email</label>
            <Input
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="h-12 rounded-2xl bg-secondary text-base"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-bold text-muted-foreground">Password</label>
            <Input
              type="password"
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="h-12 rounded-2xl bg-secondary text-base"
            />
          </div>

          <Button
            className="h-12 w-full rounded-2xl text-base font-extrabold"
            onClick={mode === 'signin' ? handleSignIn : handleSignUp}
            disabled={signIn.isPending || signUp.isPending || !email || !password}
          >
            {mode === 'signin'
              ? (signIn.isPending ? 'Signing in…' : 'Sign in')
              : (signUp.isPending ? 'Creating account…' : 'Create account')}
          </Button>

          <button
            type="button"
            onClick={() => setMode(m => m === 'signin' ? 'signup' : 'signin')}
            className="w-full py-2 text-sm font-bold text-primary"
          >
            {mode === 'signin' ? "Don't have an account? Create one" : 'Already have an account? Sign in'}
          </button>
        </div>
      </div>

      {/* Guest mode */}
      <div className="pb-3 pt-4 text-center">
        <button
          type="button"
          onClick={() => navigate('/', { replace: true })}
          className="text-sm text-muted-foreground underline-offset-2 hover:underline"
        >
          Continue as guest
        </button>
      </div>
    </div>
  )
}
