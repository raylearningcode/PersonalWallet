import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'

const queryClient = new QueryClient()

const rootEl = document.getElementById('root')!

function showBootError(message: string) {
  const safe = message.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
  rootEl.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0a0f0a;color:#e5f5e5;font-family:system-ui,sans-serif;padding:24px;text-align:center">
      <div>
        <h1 style="font-size:1.25rem;font-weight:700;margin:0 0 8px">PersonalWallet could not start</h1>
        <p style="font-size:0.9rem;opacity:0.85;max-width:420px;margin:0 auto;word-break:break-word">${safe}</p>
      </div>
    </div>`
}

// Dynamic import so module-load failures (e.g. missing Supabase config)
// render a readable error instead of a blank screen.
async function boot() {
  try {
    const { App } = await import('./App')
    ReactDOM.createRoot(rootEl).render(
      <React.StrictMode>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </QueryClientProvider>
      </React.StrictMode>,
    )
  } catch (err) {
    console.error('App failed to boot:', err)
    showBootError(err instanceof Error ? err.message : 'Unknown startup error')
  }
}

void boot()
