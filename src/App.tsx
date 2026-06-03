import { Component, lazy, Suspense, type ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { Dashboard } from '@/pages/Dashboard'
import { AuthPage } from '@/pages/AuthPage'

const Transactions = lazy(() => import('@/pages/Transactions').then(m => ({ default: m.Transactions })))
const Budget = lazy(() => import('@/pages/Budget').then(m => ({ default: m.Budget })))
const Estimation = lazy(() => import('@/pages/Estimation').then(m => ({ default: m.Estimation })))
const Investing = lazy(() => import('@/pages/Investing').then(m => ({ default: m.Investing })))
const Reports = lazy(() => import('@/pages/Reports').then(m => ({ default: m.Reports })))
const Settings = lazy(() => import('@/pages/Settings').then(m => ({ default: m.Settings })))
const Goals = lazy(() => import('@/pages/Goals').then(m => ({ default: m.Goals })))
const Subscriptions = lazy(() => import('@/pages/Subscriptions').then(m => ({ default: m.Subscriptions })))

function PageLoader() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
    </div>
  )
}

class RouteErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) { return { error } }
  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 px-8 text-center">
          <p className="text-sm font-bold text-foreground">This page took too long to load.</p>
          <p className="text-xs text-muted-foreground">Check your connection and try again.</p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              className="rounded-full bg-primary px-5 py-2 text-sm font-bold text-primary-foreground"
            >
              Try again
            </button>
            <a href="/" className="rounded-full border border-border px-5 py-2 text-sm font-bold text-foreground">
              Go home
            </a>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

function Page({ children }: { children: ReactNode }) {
  return (
    <RouteErrorBoundary>
      <Suspense fallback={<PageLoader />}>{children}</Suspense>
    </RouteErrorBoundary>
  )
}

export function App() {
  return (
    <Routes>
      <Route path="auth" element={<AuthPage />} />
      <Route element={<AppLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="transactions" element={<Page><Transactions /></Page>} />
        <Route path="budget" element={<Page><Budget /></Page>} />
        <Route path="estimation" element={<Page><Estimation /></Page>} />
        <Route path="planning" element={<Page><Estimation /></Page>} />
        <Route path="investing" element={<Page><Investing /></Page>} />
        <Route path="reports" element={<Page><Reports /></Page>} />
        <Route path="settings" element={<Page><Settings /></Page>} />
        <Route path="goals" element={<Page><Goals /></Page>} />
        <Route path="subscriptions" element={<Page><Subscriptions /></Page>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
