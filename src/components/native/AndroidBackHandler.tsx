import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

interface AndroidBackHandlerProps {
  closeTopSheet: () => boolean
}

export function AndroidBackHandler({ closeTopSheet }: AndroidBackHandlerProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const lastBackRef = useRef(0)

  useEffect(() => {
    if (typeof window === 'undefined') return

    let cleanup: (() => void) | undefined

    async function setup() {
      try {
        const { App: CapApp } = await import('@capacitor/app')
        const { Capacitor } = await import('@capacitor/core')
        if (!Capacitor.isNativePlatform()) return

        const handle = await CapApp.addListener('backButton', ({ canGoBack }) => {
          if (closeTopSheet()) return

          if (canGoBack && location.pathname !== '/') {
            navigate(-1)
            return
          }

          const now = Date.now()
          if (now - lastBackRef.current < 2000) {
            CapApp.exitApp()
          } else {
            lastBackRef.current = now
            toast('Press back again to exit', { duration: 2000 })
          }
        })

        cleanup = () => { handle.remove() }
      } catch {
        // Not running on Capacitor — no-op
      }
    }

    setup()
    return () => { cleanup?.() }
  }, [closeTopSheet, location.pathname, navigate])

  return null
}
