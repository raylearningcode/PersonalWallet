import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuthSession, useSignIn, useSignOut, useSignUp } from '@/lib/queries'
import { toast } from 'sonner'

export function Auth() {
  const navigate = useNavigate()
  const { data: session } = useAuthSession()
  const signIn = useSignIn()
  const signUp = useSignUp()
  const signOut = useSignOut()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const formRef = useRef<HTMLDivElement>(null)

  const keepFocusedFieldVisible = () => {
    window.setTimeout(() => formRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 80)
  }

  const handleSignIn = async () => {
    try {
      await signIn.mutateAsync({ email, password })
      toast.success('Signed in')
      navigate(-1)
    } catch {
      toast.error('Sign in failed - check your email and password')
    }
  }

  const handleSignUp = async () => {
    try {
      await signUp.mutateAsync({ email, password })
      toast.success('Account created - check your email to confirm')
    } catch {
      toast.error('Sign up failed')
    }
  }

  const handleSignOut = async () => {
    await signOut.mutateAsync()
    toast.success('Signed out')
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-xl flex-col px-4 py-4 pb-[calc(2rem+env(safe-area-inset-bottom))]">
      <div className="mb-5 flex items-center gap-3">
        <button
          type="button"
          aria-label="Back"
          onClick={() => navigate(-1)}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-secondary text-muted-foreground active:scale-95"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <p className="text-sm font-bold text-muted-foreground">FinPath Account</p>
          <h1 className="text-2xl font-extrabold leading-tight text-foreground">Sync your data</h1>
        </div>
      </div>

      <div className="rounded-[1.5rem] border border-border bg-card p-5 shadow-sm" ref={formRef}>
        <div className="mb-5 flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/15">
            <User className="h-5 w-5 text-primary" />
          </span>
          <div>
            <p className="font-extrabold text-foreground">{session ? 'Account connected' : 'Guest mode'}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {session
                ? 'Your FinPath data can sync across devices.'
                : 'Your guest data stays on this device until you choose to migrate it.'}
            </p>
          </div>
        </div>

        {session ? (
          <div className="space-y-4">
            <div className="rounded-2xl bg-secondary px-4 py-3">
              <p className="text-xs text-muted-foreground">Signed in as</p>
              <p className="mt-0.5 break-words font-bold text-foreground">{session.user.email}</p>
            </div>
            <Button variant="secondary" className="h-12 w-full" onClick={handleSignOut} disabled={signOut.isPending}>
              Sign out
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <Label className="text-sm text-muted-foreground">Email</Label>
              <Input
                aria-label="Auth email"
                className="mt-2 h-12 bg-secondary"
                type="email"
                value={email}
                onFocus={keepFocusedFieldVisible}
                onChange={event => setEmail(event.target.value)}
                placeholder="you@example.com"
              />
            </div>
            <div>
              <Label className="text-sm text-muted-foreground">Password</Label>
              <Input
                aria-label="Auth password"
                className="mt-2 h-12 bg-secondary"
                type="password"
                value={password}
                onFocus={keepFocusedFieldVisible}
                onChange={event => setPassword(event.target.value)}
                onKeyDown={event => event.key === 'Enter' && handleSignIn()}
                placeholder="Password"
              />
            </div>
            <div className="grid gap-2">
              <Button className="h-12 w-full" onClick={handleSignIn} disabled={signIn.isPending || !email || !password}>
                {signIn.isPending ? 'Signing in...' : 'Sign in'}
              </Button>
              <Button variant="secondary" className="h-12 w-full" onClick={handleSignUp} disabled={signUp.isPending || !email || !password}>
                {signUp.isPending ? 'Creating account...' : 'Create account'}
              </Button>
              <Button variant="ghost" className="h-11 w-full" onClick={() => navigate(-1)}>
                Continue as guest
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
